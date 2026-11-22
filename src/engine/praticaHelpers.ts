// ============================================================================
// HELPERS PUROS — LOGBOOK 3x & PONTOS CEGOS (FILTROS, D2 INTELIGENTE, LINKS E EXPORT)
// ============================================================================

import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import {
  ARQUETIPOS_E3,
  CENARIOS_E4,
  QUEIXAS_E1,
  RODIZIOS_TREINO,
  type Eixo,
} from '../data/treino_clinico_data.ts';
import {
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  RODIZIOS_6ANO,
  type Central6AnoState,
  type LogbookProcedureGoal,
  type ProcedureProgress,
} from './central6ano.ts';
import { normalizeSearchText } from './search.ts';
import { findCatalogItem } from './treinoClinico.ts';

export type LogbookStageFilter =
  | 'todos'
  | 'faltam_3x'
  | 'em_treino'
  | 'concluidos_3x'
  | 'com_historico';

export type BlindSpotStatusFilter = 'pendentes' | 'resolvidos' | 'todos';

export const LOGBOOK_STAGE_FILTERS: ReadonlyArray<{
  id: LogbookStageFilter;
  label: string;
}> = [
  { id: 'todos', label: 'Todos' },
  { id: 'faltam_3x', label: 'Faltam 3x' },
  { id: 'em_treino', label: 'Em treino' },
  { id: 'concluidos_3x', label: 'Concluídos 3x' },
  { id: 'com_historico', label: 'Com histórico' },
];

const RODIZIO_NAME_BY_ID = new Map<string, string>(
  RODIZIOS_6ANO.map((r) => [r.id, r.nome])
);

const STOPWORDS = new Set([
  'para', 'como', 'qual', 'quais', 'quando', 'onde', 'porque', 'sobre', 'entre',
  'com', 'sem', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'por', 'que',
  'nao', 'mais', 'menos', 'fazer', 'revisar', 'protocolo', 'caso', 'duvida',
  'paciente', 'conduta', 'manejo', 'tratamento', 'diagnostico', 'criterios',
  'criterio', 'aguda', 'agudo', 'grave', 'crise', 'sindrome', 'doenca', 'clinica',
  'clinico', 'clinicos', 'clinicas', 'sinais', 'sinal', 'esquema', 'usar',
  'exame', 'dose', 'ataque', 'manutencao', 'revisao', 'anki', 'cards', 'flashcards',
  'estudo', 'ativo', 'cpf', 'removido', 'anonimizado', 'prontuario',
]);

function tokenizeClinical(text: string): string[] {
  const withoutRedactions = text.replace(/\[[^\]]+\]/g, ' ');
  return normalizeSearchText(withoutRedactions)
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok));
}

/**
 * Remove duplicação legada de papel no início da nota (ex.: "Supervisionado · nota"
 * ou "Supervisionado" quando papel === "Supervisionado") e o texto artificial antigo.
 */
export function cleanLogbookNoteDisplay(note: string | undefined, papel?: string): string {
  const raw = String(note || '').trim();
  if (!raw) return '';
  if (raw === 'Registro rápido à beira-leito.') return '';

  const p = String(papel || '').trim();
  if (p) {
    const pNorm = normalizeSearchText(p);
    const rawNorm = normalizeSearchText(raw);
    if (rawNorm === pNorm) return '';
    const prefixRegex = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·\\-—:]\\s*`, 'i');
    const stripped = raw.replace(prefixRegex, '').trim();
    if (stripped !== raw) return stripped;
  }
  return raw;
}

/**
 * Remove a frase genérica artificial que versões antigas injetavam quando a dúvida ficava vazia.
 */
export function cleanBlindSpotDuvidaDisplay(duvida: string | undefined): string {
  const raw = String(duvida || '').trim();
  if (!raw) return '';
  if (raw === 'Revisar conduta e critérios diagnósticos no estudo ativo.') return '';
  return raw;
}

/**
 * Filtra os procedimentos da matriz do Logbook 3x com busca tolerante a acentos,
 * filtro por área/rodízio e filtro por estágio de autonomia.
 */
export function filterLogbookProcedures(
  procedures: readonly LogbookProcedureGoal[],
  progressByProcId: ReadonlyMap<string, ProcedureProgress>,
  historyCountByProcId: ReadonlyMap<string, number>,
  opts: {
    query: string;
    rodizioFilter: string;
    stageFilter: LogbookStageFilter;
  }
): LogbookProcedureGoal[] {
  const qNorm = normalizeSearchText(opts.query);
  const tokens = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];

  return procedures.filter((proc) => {
    if (opts.rodizioFilter !== 'todos' && proc.rodizioId !== opts.rodizioFilter) {
      return false;
    }

    const prog = progressByProcId.get(proc.id);
    const histCount = historyCountByProcId.get(proc.id) || 0;

    if (opts.stageFilter === 'faltam_3x' && prog?.rule3xDone) return false;
    if (opts.stageFilter === 'concluidos_3x' && !prog?.rule3xDone) return false;
    if (
      opts.stageFilter === 'em_treino' &&
      prog?.stage !== 'em_treino' &&
      prog?.stage !== 'exposicao'
    ) {
      return false;
    }
    if (opts.stageFilter === 'com_historico' && histCount === 0) return false;

    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText(`${proc.nome} ${proc.rodizioNome} ${proc.id}`);
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export type BlindSpotEntry = NonNullable<Central6AnoState['logbookEntries']>[number];

/**
 * Filtra Pontos Cegos por status, rodízio e busca tolerante a acentos em título,
 * dúvida, ação de revisão e nome do rodízio.
 */
export function filterBlindSpots(
  spots: readonly BlindSpotEntry[],
  opts: {
    statusFilter: BlindSpotStatusFilter;
    rodizioFilter: string;
    query: string;
  }
): BlindSpotEntry[] {
  const qNorm = normalizeSearchText(opts.query);
  const tokens = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];

  return spots.filter((item) => {
    const isResolved = item.status === 'resolvido';
    if (opts.statusFilter === 'pendentes' && isResolved) return false;
    if (opts.statusFilter === 'resolvidos' && !isResolved) return false;
    if (opts.rodizioFilter !== 'todos' && item.rodizio !== opts.rodizioFilter) return false;

    if (tokens.length === 0) return true;
    const rodNome = RODIZIO_NAME_BY_ID.get(item.rodizio) || item.rodizio || '';
    const duvidaClean = cleanBlindSpotDuvidaDisplay(item.aprendizado);
    const haystack = normalizeSearchText(
      `${item.titulo} ${duvidaClean} ${item.gatilhoCorrecao || ''} ${rodNome}`
    );
    return tokens.every((tok) => haystack.includes(tok));
  });
}

// ============================================================================
// INFERÊNCIA INTELIGENTE DE SLUG & EIXO PARA O PROMPT D2 (ESTEIRA v3.1)
// ============================================================================

interface CatalogSignalRule {
  slug: string;
  eixo: Eixo;
  keywords: readonly string[];
}

const D2_SIGNAL_RULES: readonly CatalogSignalRule[] = [
  {
    slug: 'e4-gestante-grave',
    eixo: 'E4',
    keywords: [
      'pre-eclampsia', 'preeclampsia', 'eclampsia', 'magnesio', 'mgso4', 'pritchard',
      'zuspan', 'hellp', 'hpp', 'hemorragia pos-parto', 'dpp', 'placenta previa',
      'puerpera', 'gestante grave', 'obstetricia', 'parto', 'cesarea', 'uterotonico',
    ],
  },
  {
    slug: 'go-aguda',
    eixo: 'E1',
    keywords: [
      'gestante', 'gestacao', 'prenatal', 'pre-natal', 'abortamento', 'ectopica',
      'dip', 'sangramento vaginal', 'corrimento', 'rpmo', 'tpp', 'mastite', 'endometrite',
      'ginecologia', 'especular', 'implanon', 'diu',
    ],
  },
  {
    slug: 'e4-va-insuf-resp',
    eixo: 'E4',
    keywords: [
      'intubacao', 'iot', 'sri', 'sequencia rapida', 'via aerea', 'ventilacao mecanica',
      'laringoscopia', 'anafilaxia', 'estridor', 'insuficiencia respiratoria', 'asma grave',
      'broncoespasmo grave', 'edemagudo', 'eap', 'bvm',
    ],
  },
  {
    slug: 'e4-arritmia-pcr',
    eixo: 'E4',
    keywords: [
      'pcr', 'parada', 'acls', 'fv', 'tv', 'bradiarritmia', 'taquiarritmia',
      'cardioversao', 'desfibrilacao', 'marcapasso', 'amiodarona', 'adenosina',
      'fibrilacao atrial', 'bloqueio av', 'bav',
    ],
  },
  {
    slug: 'e4-crianca-grave',
    eixo: 'E4',
    keywords: [
      'vpp neonatal', 'sala de parto', 'reanimacao neonatal', 'lactente grave',
      'crianca grave', 'choque pediatrico', 'convulsao febril', 'sepse neonatal',
    ],
  },
  {
    slug: 'e4-trauma-hemorragia',
    eixo: 'E4',
    keywords: [
      'atls', 'politrauma', 'hemorragia', 'choque hemorragico', 'dreno de torax',
      'pneumotorax hipertensivo', 'tamponamento', 'fratura exposta', 'acido tranexamico',
    ],
  },
  {
    slug: 'dor-toracica',
    eixo: 'E1',
    keywords: [
      'dor toracica', 'sca', 'iam', 'infarto', 'supra', 'troponina', 'angina',
      'disseccao', 'pericardite', 'tep', 'ecg',
    ],
  },
  {
    slug: 'dispneia-adulto',
    eixo: 'E1',
    keywords: [
      'dispneia', 'asma', 'dpoc', 'pneumonia', 'pac', 'derrame pleural',
      'toracocentese', 'sibilancia', 'gasometria', 'hipoxemia', 'saturacao',
    ],
  },
  {
    slug: 'dispneia-crianca',
    eixo: 'E1',
    keywords: [
      'bronquiolite', 'bva', 'crupe', 'laringite', 'chiado', 'crianca', 'pediatria',
      'pediatrica', 'lactente',
    ],
  },
  {
    slug: 'febre-crianca',
    eixo: 'E1',
    keywords: ['febre sem foco', 'exantema', 'kawasaki', 'lactente febril', 'otite pediatrica'],
  },
  {
    slug: 'dor-abdominal',
    eixo: 'E1',
    keywords: [
      'abdome agudo', 'apendicite', 'colecistite', 'pancreatite', 'obstrucao intestinal',
      'paracentese', 'ascite', 'pbe', 'hda', 'hemorragia digestiva', 'ulcera', 'dispepsia',
    ],
  },
  {
    slug: 'cefaleia',
    eixo: 'E1',
    keywords: ['cefaleia', 'enxaqueca', 'meningite', 'hsa', 'puncao lombar', 'liquor'],
  },
  {
    slug: 'tontura-sincope',
    eixo: 'E1',
    keywords: ['vertigem', 'hints', 'labirintite', 'sincope', 'tontura', 'nistagmo'],
  },
  {
    slug: 'febre-adulto',
    eixo: 'E1',
    keywords: ['sepse', 'choque septico', 'dengue', 'arbovirose', 'febre', 'antibiotico', 'celulite', 'erisipela'],
  },
  {
    slug: 'vomitos-diarreia',
    eixo: 'E1',
    keywords: ['geca', 'gastroenterite', 'diarreia', 'vomito', 'desidratacao', 'sro', 'plano b', 'plano c'],
  },
  {
    slug: 'lombalgia',
    eixo: 'E1',
    keywords: ['lombalgia', 'ciatalgia', 'cauda equina', 'lasegue', 'hernia de disco', 'gota', 'artrite'],
  },
  {
    slug: 'disuria-urinario',
    eixo: 'E1',
    keywords: ['itu', 'cistite', 'pielonefrite', 'nefrolitiase', 'colica renal', 'disuria', 'uretrite', 'oliguria', 'svd'],
  },
  {
    slug: 'ivas-orl-olho',
    eixo: 'E1',
    keywords: [
      'otite', 'otoscopia', 'sinusite', 'amigdalite', 'faringite', 'conjuntivite',
      'olho vermelho', 'fluoresceina', 'epistaxe', 'tamponamento nasal', 'cerume',
    ],
  },
  {
    slug: 'pele-tvp-alergia',
    eixo: 'E1',
    keywords: ['tvp', 'wells', 'urticaria', 'alergia', 'herpes zoster', 'escabiose', 'abscesso', 'queimadura', 'peconhento'],
  },
  {
    slug: 'ferida-trauma-leve',
    eixo: 'E1',
    keywords: ['sutura', 'lidocaina', 'anestesia local', 'bloqueio digital', 'tetano', 'raiva', 'ferida', 'curativo'],
  },
  {
    slug: 'pa-elevada',
    eixo: 'E1',
    keywords: ['crise hipertensiva', 'emergencia hipertensiva', 'urgencia hipertensiva', 'nitroprussiato', 'hipertensao'],
  },
  {
    slug: 'sensorio-focal-glicemia',
    eixo: 'E1',
    keywords: [
      'avc', 'ait', 'nihss', 'trombolise', 'cetoacidose', 'cad', 'ehh', 'insulina',
      'hipoglicemia', 'hiperglicemia', 'hipercalemia', 'hiponatremia', 'delirium',
      'glasgow', 'coma', 'convulsao',
    ],
  },
  {
    slug: 'agitacao-intox-abstinencia',
    eixo: 'E1',
    keywords: ['intoxicacao', 'abstinencia', 'agitacao', 'surto', 'haloperidol', 'carvao ativado', 'flumazenil', 'naloxona'],
  },
  {
    slug: 'e3-pediatria-ponderal',
    eixo: 'E3',
    keywords: ['dose ponderal', 'mg/kg', 'gotas/kg', 'teto adulto', 'prescricao pediatrica'],
  },
  {
    slug: 'e3-ev-alto-risco',
    eixo: 'E3',
    keywords: ['noradrenalina', 'droga vasoativa', 'potassio ev', 'kcl', 'insulina em bomba', 'sbar'],
  },
];

export interface InferredD2Target {
  eixo: Eixo;
  slug: string;
  nome: string;
  inferredFromText: boolean;
}

/**
 * Infere o eixo e slug mais coerentes da Esteira v3.1 com base no texto do Ponto Cego
 * (título + dúvida + ação de revisão), com fallback seguro para o rodízio informado.
 */
export function inferBestD2TargetForBlindSpot(item: {
  titulo: string;
  rodizio: string;
  aprendizado?: string;
  gatilhoCorrecao?: string;
}): InferredD2Target {
  const fullText = normalizeSearchText(
    `${item.titulo} ${cleanBlindSpotDuvidaDisplay(item.aprendizado)} ${item.gatilhoCorrecao || ''}`
  );

  // 1) Regras clínicas de alta precisão (match por termo exato/subcadeia normalizada)
  let bestRule: { slug: string; eixo: Eixo; score: number } | null = null;
  for (const rule of D2_SIGNAL_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      const kwNorm = normalizeSearchText(kw);
      if (kwNorm && fullText.includes(kwNorm)) {
        // Termos compostos ganham peso maior que siglas curtas
        score += kwNorm.includes(' ') ? 4 : kwNorm.length >= 5 ? 3 : 2;
      }
    }
    if (score > 0 && (!bestRule || score > bestRule.score)) {
      bestRule = { slug: rule.slug, eixo: rule.eixo, score };
    }
  }

  if (bestRule) {
    const found = findCatalogItem(bestRule.slug);
    if (found) {
      return {
        eixo: found.eixo,
        slug: found.slug,
        nome: found.nome,
        inferredFromText: true,
      };
    }
  }

  // 2) Match léxico direto contra todos os itens do catálogo (E1 + E3 + E4)
  const tokens = tokenizeClinical(fullText);
  if (tokens.length > 0) {
    const allItems = [...QUEIXAS_E1, ...ARQUETIPOS_E3, ...CENARIOS_E4];
    let bestCatalog: { item: (typeof allItems)[number]; score: number } | null = null;
    for (const cat of allItems) {
      const catText = normalizeSearchText(`${cat.nome} ${cat.slug.replace(/-/g, ' ')}`);
      let score = 0;
      for (const tok of tokens) {
        if (catText.includes(tok)) score += tok.length >= 5 ? 2 : 1;
      }
      if (score > 0 && (!bestCatalog || score > bestCatalog.score)) {
        bestCatalog = { item: cat, score };
      }
    }
    if (bestCatalog && bestCatalog.score >= 2) {
      return {
        eixo: bestCatalog.item.eixo,
        slug: bestCatalog.item.slug,
        nome: bestCatalog.item.nome,
        inferredFromText: true,
      };
    }
  }

  // 3) Fallback pelo rodízio (somente se nenhum termo clínico casou)
  const alvos = RODIZIOS_TREINO[item.rodizio]?.alvos || [];
  for (const slug of alvos) {
    const found = findCatalogItem(slug);
    if (found) {
      return {
        eixo: found.eixo,
        slug: found.slug,
        nome: found.nome,
        inferredFromText: false,
      };
    }
  }

  const fallback = findCatalogItem('dor-toracica') || QUEIXAS_E1[0];
  return {
    eixo: fallback.eixo,
    slug: fallback.slug,
    nome: fallback.nome,
    inferredFromText: false,
  };
}

/**
 * Sugere até `maxProtocols` protocolos PEP e `maxHabs` cartões Pré-Porta
 * diretamente relacionados ao texto de um Ponto Cego.
 */
export function findRelatedClinicalLinksForBlindSpot(
  item: { titulo: string; aprendizado?: string; gatilhoCorrecao?: string },
  allProtocols: readonly ClinicalProtocolItem[],
  opts: { maxProtocols?: number; maxHabs?: number } = {}
): { protocols: ClinicalProtocolItem[]; habs: ClinicalProtocolItem[] } {
  const maxProtocols = opts.maxProtocols ?? 2;
  const maxHabs = opts.maxHabs ?? 1;

  const queryTokens = tokenizeClinical(
    `${item.titulo} ${cleanBlindSpotDuvidaDisplay(item.aprendizado)} ${item.gatilhoCorrecao || ''}`
  );
  if (queryTokens.length === 0) return { protocols: [], habs: [] };

  const scoredPep: Array<{ proto: ClinicalProtocolItem; score: number }> = [];
  const scoredHab: Array<{ proto: ClinicalProtocolItem; score: number }> = [];

  for (const proto of allProtocols) {
    const titleNorm = normalizeSearchText(proto.title);
    const triggerNorm = normalizeSearchText(proto.trigger || '');
    const tagsNorm = normalizeSearchText((proto.tags_sintomas || []).join(' '));

    let score = 0;
    for (const tok of queryTokens) {
      if (titleNorm.includes(tok)) {
        score += tok.length >= 6 ? 4 : 3;
      } else if (triggerNorm.includes(tok) || tagsNorm.includes(tok)) {
        score += 2;
      }
    }

    if (score < 3) continue;
    if (proto.mod_id === 'hab') {
      scoredHab.push({ proto, score });
    } else {
      scoredPep.push({ proto, score });
    }
  }

  scoredPep.sort((a, b) => b.score - a.score);
  scoredHab.sort((a, b) => b.score - a.score);

  return {
    protocols: scoredPep.slice(0, maxProtocols).map((s) => s.proto),
    habs: scoredHab.slice(0, maxHabs).map((s) => s.proto),
  };
}

// ============================================================================
// EXPORTAÇÕES MARKDOWN CONSISTENTES COM FILTROS ATIVOS
// ============================================================================

export function buildLogbookMarkdownExport(opts: {
  procedures: readonly LogbookProcedureGoal[];
  progressByProcId: ReadonlyMap<string, ProcedureProgress>;
  summary: {
    completed3x: number;
    autonomousCount: number;
    totalProcedures: number;
    totalExecutions: number;
  };
  filterDescription?: string;
}): string {
  const lines: string[] = [
    '# Logbook de Procedimentos Manuais — 6º Ano',
    '',
    `Placar geral (Regra 3x): ${opts.summary.completed3x}/${opts.summary.totalProcedures} · Autônomos: ${opts.summary.autonomousCount} · Execuções reais: ${opts.summary.totalExecutions}`,
  ];

  if (opts.filterDescription) {
    lines.push(
      `Recorte filtrado: ${opts.filterDescription} (${opts.procedures.length} de ${opts.summary.totalProcedures} procedimentos)`
    );
  }
  lines.push('');

  for (const proc of opts.procedures) {
    const prog = opts.progressByProcId.get(proc.id);
    if (!prog) continue;
    const done = prog.rule3xDone ? 'x' : ' ';
    const detail = [
      prog.obsCount > 0 ? `Obs ${prog.obsCount}` : '',
      prog.auxCount > 0 ? `Aux ${prog.auxCount}` : '',
      prog.supCount > 0 ? `Sup ${prog.supCount}` : '',
      prog.autCount > 0 ? `Aut ${prog.autCount}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      `- [${done}] **${proc.nome}** (${proc.rodizioNome}) — ${prog.stageLabel}${detail ? ` · ${detail}` : ''}`
    );
  }

  return lines.join('\n');
}

export function buildBlindSpotsMarkdownExport(opts: {
  spots: readonly BlindSpotEntry[];
  pendingCount: number;
  resolvedCount: number;
  filterDescription?: string;
}): string {
  const lines: string[] = [
    '# Pontos Cegos — 6º Ano',
    '',
    `Pendentes: ${opts.pendingCount} · Resolvidos: ${opts.resolvedCount}`,
  ];
  if (opts.filterDescription) {
    lines.push(`Recorte filtrado: ${opts.filterDescription} (${opts.spots.length} itens)`);
  }
  lines.push('');

  for (const item of opts.spots) {
    const done = item.status === 'resolvido';
    const rodNome = RODIZIO_NAME_BY_ID.get(item.rodizio) || item.rodizio;
    const parts = String(item.dateIso || '').split('-');
    const datePt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.dateIso || '—';
    lines.push(`- [${done ? 'x' : ' '}] **${item.titulo}** (${rodNome}, ${datePt})`);
    const duvidaClean = cleanBlindSpotDuvidaDisplay(item.aprendizado);
    if (duvidaClean) lines.push(`  - Dúvida: ${duvidaClean}`);
    if (item.gatilhoCorrecao) lines.push(`  - Revisão: ${item.gatilhoCorrecao}`);
  }

  return lines.join('\n');
}

/**
 * Calcula quantos procedimentos já concluíram a Regra 3x em cada área/rodízio da matriz.
 */
export function computeRodizioCompletionCounts(
  progressByProcId: ReadonlyMap<string, ProcedureProgress>
): Map<string, { done3x: number; total: number }> {
  const map = new Map<string, { done3x: number; total: number }>();
  for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
    const cur = map.get(proc.rodizioId) || { done3x: 0, total: 0 };
    cur.total += 1;
    if (progressByProcId.get(proc.id)?.rule3xDone) {
      cur.done3x += 1;
    }
    map.set(proc.rodizioId, cur);
  }
  return map;
}
