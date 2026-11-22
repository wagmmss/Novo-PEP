import protocolsPayload from './protocols.generated.json' with { type: 'json' };
import type { ClinicalProtocolItem } from './clinical_data.ts';
import { SEIS_INTERCORRENCIAS_DATA } from './clinical_reference_data.ts';
import { createClinicalSearchIndex } from '../engine/search.ts';
import {
  auditPrescription,
  extractPrescriptionItemsFromText,
  type PrescriptionAuditReport,
} from '../engine/prescriptionGuard.ts';
import { resolveProtocolPharmaHints } from './clinical_links.ts';
import {
  buildClinicalContext,
  validateAgeWeightPlausibility,
  type AgeWeightPlausibilityAlert,
  type ClinicalContext,
} from '../engine/clinicalContext.ts';
import {
  parsePepToAst,
  createAstSelectionState,
  applySmartContextPreselection,
  formatConditionalToggleLabel,
  serializeAstToClinicalText,
  type AstSelectionState,
  type ChoiceGroupNode,
  type PepBlockNode,
  type PepDocumentAst,
  type PepInlineNode,
} from '../engine/pepAst.ts';
import {
  hasEmptyPediatricWeight,
  resolvePediatricDoseFieldValue,
} from '../engine/personalizar.ts';

export interface PatientContextInput {
  idade: string;
  pesoKg: string;
  gestante: boolean;
  igSemanas: string;
  /** Texto livre: "dipirona, penicilina" — alimenta o auditor de prescrição. */
  alergias?: string;
  /** TFG / ClCr informado manualmente (mL/min). */
  clCr?: string;
  /** Creatinina sérica (mg/dL) para cálculo integrado CKD-EPI 2021. */
  creatinina?: string;
  /** Sexo biológico ('F' | 'M') para cálculo integrado CKD-EPI 2021. */
  sexo?: string;
}

export const EMPTY_PATIENT_CONTEXT: PatientContextInput = {
  idade: '',
  pesoKg: '',
  gestante: false,
  igSemanas: '',
  alergias: '',
  clCr: '',
  creatinina: '',
  sexo: '',
};

export function patientContextHasValues(p: PatientContextInput): boolean {
  return Boolean(
    p.idade.trim() ||
      p.pesoKg.trim() ||
      p.gestante ||
      p.igSemanas.trim() ||
      (p.alergias ?? '').trim() ||
      (p.clCr ?? '').trim() ||
      (p.creatinina ?? '').trim()
  );
}

export type PepSectionId = 'evolucao' | 'conduta' | 'receita' | 'orientacoes' | 'geral';

export interface CopyablePepBlock {
  id: PepSectionId;
  title: string;
  text: string;
}

export interface PepSectionToggle {
  kind: 'trava' | 'optional';
  id: string;
  label: string;
  fullLabel: string;
  defaultActive: boolean;
}

export interface PepAstSection {
  id: PepSectionId;
  title: string;
  blockIndices: number[];
  blockIndexSet: Set<number>;
  toggles: PepSectionToggle[];
}

export interface CompiledProtocolView {
  needsWeightPersonalization: boolean;
  clinicalContext: ClinicalContext;
  plausibilityAlert: AgeWeightPlausibilityAlert | null;
  ast: PepDocumentAst;
  initialAstState: AstSelectionState;
  sections: PepAstSection[];
  fullText: string;
  blocks: CopyablePepBlock[];
}

interface RawProtocolsPayload {
  items: ClinicalProtocolItem[];
}

export const ALL_PROTOCOLS: readonly ClinicalProtocolItem[] = (
  protocolsPayload as unknown as RawProtocolsPayload
).items;

export const PEP_PROTOCOLS: readonly ClinicalProtocolItem[] = ALL_PROTOCOLS.filter(
  (item) => item.mod_id !== 'hab'
);

export const HAB_PROTOCOLS: readonly ClinicalProtocolItem[] = ALL_PROTOCOLS.filter(
  (item) => item.mod_id === 'hab'
);

export const PROTOCOL_BY_ID = new Map<string, ClinicalProtocolItem>(
  ALL_PROTOCOLS.map((item) => [item.id, item])
);

export const PROTOCOL_BY_TRIGGER = new Map<string, ClinicalProtocolItem>(
  ALL_PROTOCOLS.flatMap((item) => {
    const trigs = item.all_triggers?.length ? item.all_triggers : [item.trigger];
    return trigs
      .map((t) => String(t || '').trim().toLowerCase())
      .filter(Boolean)
      .flatMap((t) => [
        [t, item] as const,
        [t.replace(/^;/, ''), item] as const,
      ]);
  })
);

/** ID especial da visão "6 Intercorrências de Madrugada" integrada na aba Pré-Porta. */
export const INTERCORRENCIAS_HAB_ID = 'intercorrencias';

/**
 * Resolve um identificador de rota ou favorito (ID numérico "upa-35" ou slug de atalho "sca" / ";sca")
 * para o ID ativo correspondente na aba solicitada.
 */
export function resolveKnownRouteId(tab: 'protocolos' | 'pre-porta', rawId: string): string | null {
  const clean = String(rawId || '').trim();
  if (!clean) return null;
  if (tab === 'pre-porta' && clean.toLowerCase() === INTERCORRENCIAS_HAB_ID) {
    return INTERCORRENCIAS_HAB_ID;
  }
  const byId = PROTOCOL_BY_ID.get(clean);
  if (byId) {
    const valid = tab === 'pre-porta' ? byId.mod_id === 'hab' : byId.mod_id !== 'hab';
    return valid ? byId.id : null;
  }
  const byTrigger = PROTOCOL_BY_TRIGGER.get(clean.toLowerCase());
  if (byTrigger) {
    const valid = tab === 'pre-porta' ? byTrigger.mod_id === 'hab' : byTrigger.mod_id !== 'hab';
    return valid ? byTrigger.id : null;
  }
  return null;
}

export const GLOBAL_SEARCH_INDEX = createClinicalSearchIndex(ALL_PROTOCOLS);

/** Item virtual das 6 Intercorrências de Madrugada para descoberta via Ctrl+K (sem alterar ALL_PROTOCOLS). */
export const INTERCORRENCIAS_VIRTUAL_ITEM: ClinicalProtocolItem = {
  id: INTERCORRENCIAS_HAB_ID,
  mod_id: 'hab',
  module_name: 'Pré-Porta',
  badge: 'INTERCORRÊNCIAS',
  title: 'Guia das 6 Intercorrências de Madrugada',
  trigger: ';intercorrencias',
  all_triggers: [';intercorrencias', ';madrugada', ';5ws'],
  category: 'Enfermaria & Pós-Op',
  hab_category: 'Enfermaria & Pós-Op',
  gravidade: 'critico',
  path: 'pre-porta/intercorrencias',
  anchor: 'Hipotensão · Dispneia · Dor torácica · Oligúria · Febre pós-op (5 Ws) · Hipo/Hiperglicemia',
  pre_porta: SEIS_INTERCORRENCIAS_DATA.map(
    (it) => `${it.titulo} — ${it.checar2m} ${it.causas3} ${it.conduta}`
  ).join('\n'),
  tags_sintomas: [
    'intercorrências de madrugada',
    'madrugada',
    'plantão noturno',
    'enfermaria',
    'pós-operatório',
    'hipotensão enfermaria',
    'dispneia aguda',
    'dessaturação',
    'dor torácica internado',
    'oligúria',
    'bexigoma',
    'sonda obstruída',
    'febre pós-operatória',
    '5 ws',
    'hipoglicemia',
    'hiperglicemia enfermaria',
  ],
  symptom_priority: 95,
};

export const COMMAND_PALETTE_ITEMS: readonly ClinicalProtocolItem[] = [
  ...ALL_PROTOCOLS,
  INTERCORRENCIAS_VIRTUAL_ITEM,
];

export const COMMAND_PALETTE_SEARCH_INDEX = createClinicalSearchIndex(COMMAND_PALETTE_ITEMS);

export const SUBCAT_DISPLAY_MAP: Record<string, string> = {
  'Enfermaria Puerperio': 'Enfermaria / Puerpério',
  'Ambulatorio GO': 'Ambulatório GO',
  'Procedimentos Ambulatoriais': 'Procedimentos Ambulatoriais',
  'Centro Obstetrico Cirurgias': 'Centro Obstétrico e Cirurgias',
  'Emergencias GO': 'Emergências em GO',
  'Triagem e Ficha Mestra': 'Triagem e Ficha Mestra',
  'Infeccoes e Vias Aereas': 'Infecções e Vias Aéreas',
  'Gastrointestinal e Abdominal': 'Gastrointestinal e Abdominal',
  'Cardiovascular e Respiratorio': 'Cardiovascular e Respiratório',
  'Neurologia e Saude Mental': 'Neurologia e Saúde Mental',
  'Nefrologia Urologia e Dermatologia': 'Nefrologia, Urologia e Dermatologia',
  'Emergencias Graves e Procedimentos': 'Emergências Graves e Procedimentos',
  'Admissao e Avaliacao Inicial': 'Admissão e Avaliação Inicial',
  'Evolucao Diaria SOAP': 'Evolução Diária (SOAP)',
  'Passagem de Plantao e Rounds': 'Passagem de Plantão e Rounds',
  'Altas e Desospitalizacao': 'Altas e Desospitalização',
  'Declaracao de Obito e Cuidados': 'Declaração de Óbito e Cuidados',
  'Ficha Mestra e Triagem': 'Ficha Mestra e Triagem',
  'Puericultura e Ambulatorio': 'Puericultura e Ambulatório',
  'Respiratorio e IVAS': 'Respiratório e IVAS',
  'Gastrointestinal e Desidratacao': 'Gastrointestinal e Desidratação',
  'Febre e Infeccoes Sistemicas': 'Febre e Infecções Sistêmicas',
};

export function getSubcategoryLabel(rawSubcat: string): string {
  const clean = String(rawSubcat || '')
    .replace(/^\d+_/, '')
    .replace(/_/g, ' ')
    .trim();
  return SUBCAT_DISPLAY_MAP[clean] || clean || 'Geral';
}

export function walkInlineNodes(
  nodes: readonly PepInlineNode[],
  visitor: (n: PepInlineNode) => void
): void {
  for (const node of nodes) {
    visitor(node);
    if (node.kind === 'optional') {
      walkInlineNodes(node.children, visitor);
    } else if (node.kind === 'choice-group') {
      for (const opt of node.options) {
        walkInlineNodes(opt.children, visitor);
      }
    }
  }
}

export function isBloodTypeChoiceGroup(options: readonly { rawText: string }[]): boolean {
  const normalized = new Set(options.map((o) => o.rawText.trim().toUpperCase()));
  return normalized.has('O+') && normalized.has('A+') && normalized.has('O-');
}

/**
 * Determina se o protocolo exige personalização ponderal/pediátrica automática.
 */
export function protocolRequiresWeightCalculation(item: ClinicalProtocolItem): boolean {
  if (item.mod_id === 'ped') return true;
  const raw = item.pep_body || '';
  if (hasEmptyPediatricWeight(raw)) return true;
  const ast = parsePepToAst(raw, item.id);
  return ast.stats.doseFormulas > 0;
}

const SECTION_TITLES: Record<PepSectionId, string> = {
  evolucao: 'Evolução / Admissão',
  conduta: 'Conduta',
  receita: 'Prescrição / Receita',
  orientacoes: 'Orientações / Alta',
  geral: 'Registro PEP',
};

const RECEITA_BOUNDARY_REGEX =
  /^(?:>>\s*|#+\s*)?(?:RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?|PRESCRIÇÃO\s+DOMICILIAR|PRESCRIÇÃO\s+DE\s+ALTA|PRESCRIÇÃO\s+MÉDICA\s+AMBULATORIAL|PRESCRIÇÃO\s+AMBULATORIAL)\s*:?/i;

const ORIENTACOES_BOUNDARY_REGEX =
  /^(?:>>\s*|#+\s*)?(?:ORIENTAÇÕES|SINAIS DE ALARME|RETORNO IMEDIATO|CUIDADOS DOMICILIARES)\b/i;

const CONDUTA_BOUNDARY_REGEX =
  /^(?:(?:#+\s*|>>\s*)\s*|\d+\.\s*)?(?:5\.\s*AVALIAÇÃO\s*&\s*PLANO\s*\/\s*CONDUTA|(?:PLANO\s*\/\s*CONDUTA|PLANO\s+TERAPÊUTICO|PLANO|CONDUTA|PRESCRIÇÃO(?:\s+HOSPITALAR|\s+INICIAL)?)\s*:?\s*$)/i;

const CONDUTA_HEADING_REGEX =
  /^(?:#+\s*|>>\s*)(?:PLANO\s*\/\s*CONDUTA|PLANO\s+TERAPÊUTICO|PLANO|CONDUTA|PRESCRIÇÃO|DESCRIÇÃO\s+TÉCNICA\s+DO\s+PROCEDIMENTO|PROFILAXIA\s+ANTITETÂNICA)\b/i;

function trimBoundaryEmptyLines(ast: PepDocumentAst, indices: number[]): number[] {
  let start = 0;
  let end = indices.length - 1;
  while (start <= end) {
    const b = ast.blocks[indices[start]];
    if (b.kind === 'paragraph' && b.isEmptyLine) start++;
    else break;
  }
  while (end >= start) {
    const b = ast.blocks[indices[end]];
    if (b.kind === 'paragraph' && b.isEmptyLine) end--;
    else break;
  }
  return indices.slice(start, end + 1);
}

/**
 * Particiona os blocos da AST real em seções editoriais independentes (sem duplicação),
 * extraindo todos os interruptores condicionais e opcionais pertencentes a cada seção.
 */
export function partitionAstIntoSections(
  ast: PepDocumentAst,
  item: Pick<ClinicalProtocolItem, 'has_receita'>
): PepAstSection[] {
  const buckets: Record<PepSectionId, number[]> = {
    evolucao: [],
    conduta: [],
    receita: [],
    orientacoes: [],
    geral: [],
  };

  let currentSection: PepSectionId = 'evolucao';

  for (let i = 0; i < ast.blocks.length; i++) {
    const block = ast.blocks[i];
    const trimmed = block.rawLine.trim();

    if (trimmed) {
      if (RECEITA_BOUNDARY_REGEX.test(trimmed)) {
        currentSection = 'receita';
        // Se for apenas o banner "# RECEITA:" / "RECEITA:", não duplicar o título do cartão no corpo
        if (/^(?:#+\s*|>>\s*)?RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?\s*:?\s*$/i.test(trimmed)) {
          continue;
        }
      } else if (
        ORIENTACOES_BOUNDARY_REGEX.test(trimmed) &&
        (currentSection === 'receita' || currentSection === 'conduta' || currentSection === 'orientacoes')
      ) {
        currentSection = 'orientacoes';
      } else if (
        currentSection === 'evolucao' &&
        !RECEITA_BOUNDARY_REGEX.test(trimmed) &&
        (CONDUTA_BOUNDARY_REGEX.test(trimmed) || CONDUTA_HEADING_REGEX.test(trimmed))
      ) {
        currentSection = 'conduta';
        if (/^(?:#+\s*|>>\s*)?CONDUTA\s*:?\s*$/i.test(trimmed)) {
          continue;
        }
      }
    }

    buckets[currentSection].push(i);
  }

  const orderedIds: PepSectionId[] = ['evolucao', 'conduta', 'receita', 'orientacoes'];
  const sections: PepAstSection[] = [];

  for (const id of orderedIds) {
    if (id === 'receita' && item.has_receita === false && buckets[id].length === 0) {
      continue;
    }
    const trimmedIndices = trimBoundaryEmptyLines(ast, buckets[id]);
    if (trimmedIndices.length === 0) continue;

    const toggles: PepSectionToggle[] = [];
    const seenToggleIds = new Set<string>();

    for (const bi of trimmedIndices) {
      const blk = ast.blocks[bi];
      walkInlineNodes(blk.children, (node) => {
        if (node.kind === 'trava-alert' && !node.isSafetyWarning) {
          if (!seenToggleIds.has(node.id)) {
            seenToggleIds.add(node.id);
            toggles.push({
              kind: 'trava',
              id: node.id,
              label: formatConditionalToggleLabel(node.label),
              fullLabel: node.label,
              defaultActive: !node.defaultExcluded,
            });
          }
        } else if (node.kind === 'optional') {
          if (!seenToggleIds.has(node.id)) {
            seenToggleIds.add(node.id);
            toggles.push({
              kind: 'optional',
              id: node.id,
              label: formatConditionalToggleLabel(node.label),
              fullLabel: node.label,
              defaultActive: node.defaultOpen,
            });
          }
        }
      });
    }

    sections.push({
      id,
      title: SECTION_TITLES[id],
      blockIndices: trimmedIndices,
      blockIndexSet: new Set(trimmedIndices),
      toggles,
    });
  }

  if (sections.length === 0 && ast.blocks.length > 0) {
    const allIndices = trimBoundaryEmptyLines(
      ast,
      ast.blocks.map((_, i) => i)
    );
    if (allIndices.length > 0) {
      sections.push({
        id: 'geral',
        title: SECTION_TITLES.geral,
        blockIndices: allIndices,
        blockIndexSet: new Set(allIndices),
        toggles: [],
      });
    }
  }

  return sections;
}

function renderBlockSelectedContext(block: PepBlockNode | undefined, state: AstSelectionState): string {
  if (!block) return '';
  let out = '';
  for (const node of block.children) {
    if (node.kind === 'text') {
      out += node.value;
    } else if (node.kind === 'choice-group') {
      const sel = state.choiceSelections[node.id] || [];
      const chosen = sel.length > 0 ? sel : node.options.length > 0 ? [0] : [];
      out += chosen
        .map((idx) => node.options[idx]?.rawText || '')
        .filter(Boolean)
        .join(' / ');
    } else if (node.kind === 'inline-input') {
      out += state.inputValues[node.id] || node.origBracket;
    } else if (node.kind === 'trava-alert') {
      out += node.rawBracket;
    } else if (node.kind === 'dose-formula') {
      out += node.raw;
    }
  }
  return out || block.rawLine || '';
}

function parsePediatricAgeParts(rawAge: string): { value: string; unit: 'meses' | 'anos' | null } {
  const clean = String(rawAge || '').trim();
  if (!clean) return { value: '', unit: null };
  const mMatch = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|mes|meses)\b/i);
  if (mMatch) return { value: mMatch[1], unit: 'meses' };
  const aMatch = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:a|ano|anos)\b/i);
  if (aMatch) return { value: aMatch[1], unit: 'anos' };
  return { value: clean, unit: null };
}

/**
 * Sincroniza dados do paciente (idade, peso, alergias, gestante/IG) nos nós não editados manualmente da AST.
 */
export function applyPatientContextToAstState(
  ast: PepDocumentAst,
  baseState: AstSelectionState,
  clinicalContext: ClinicalContext
): AstSelectionState {
  const nextState: AstSelectionState = {
    inputValues: { ...baseState.inputValues },
    choiceSelections: { ...baseState.choiceSelections },
    choiceMultiModes: { ...baseState.choiceMultiModes },
    optionalOpen: { ...baseState.optionalOpen },
    travaExcluded: { ...baseState.travaExcluded },
    checkboxStates: { ...baseState.checkboxStates },
    excludedBlocks: { ...(baseState.excludedBlocks || {}) },
    userEditedNodes: { ...baseState.userEditedNodes },
  };

  // Passo 1: garantir seleções default em choice-groups, sincronizar Alergias e unidade de idade (meses/anos)
  for (const block of ast.blocks) {
    const topNodes = block.children;
    for (let ni = 0; ni < topNodes.length; ni++) {
      const node = topNodes[ni];
      if (node.kind === 'choice-group') {
        const currentSel = nextState.choiceSelections[node.id] || [];
        if (currentSel.length === 0 && node.options.length > 0 && !isBloodTypeChoiceGroup(node.options)) {
          nextState.choiceSelections[node.id] = [0];
        }

        // Sincronizar Alergias da barra do paciente com o grupo "Alergias: [*Nega / Alérgico(a) a: [ ]]"
        if (/\balergia/i.test(node.beforeText) && !nextState.userEditedNodes[node.id]) {
          const allergyOption =
            node.options.find((o) => o.children.some((c) => c.kind === 'inline-input') && /al[eé]rg/i.test(o.rawText)) ||
            node.options.find((o) => o.children.some((c) => c.kind === 'inline-input'));
          const negaOption = node.options.find((o) => /\bnega\b/i.test(o.rawText)) || node.options[0];

          if (clinicalContext.allergiesNormalized.length > 0 && allergyOption) {
            nextState.choiceSelections[node.id] = [allergyOption.index];
            const subInput = allergyOption.children.find((c) => c.kind === 'inline-input');
            if (subInput && !nextState.userEditedNodes[subInput.id]) {
              nextState.inputValues[subInput.id] = clinicalContext.allergiesRaw;
            }
          } else if (clinicalContext.allergiesNormalized.length === 0 && negaOption) {
            nextState.choiceSelections[node.id] = [negaOption.index];
            if (allergyOption) {
              const subInput = allergyOption.children.find((c) => c.kind === 'inline-input');
              if (subInput && !nextState.userEditedNodes[subInput.id]) {
                delete nextState.inputValues[subInput.id];
              }
            }
          }
        }
      }
    }

    // Garantir defaults também em choice-groups aninhados dentro de opcionais
    walkInlineNodes(block.children, (node) => {
      if (node.kind === 'choice-group') {
        const currentSel = nextState.choiceSelections[node.id] || [];
        if (currentSel.length === 0 && node.options.length > 0 && !isBloodTypeChoiceGroup(node.options)) {
          nextState.choiceSelections[node.id] = [0];
        }
      }
    });
  }

  // Passo 2: pré-seleção clínica inteligente (antes do cálculo de doses, para refletir fármaco escolhido)
  applySmartContextPreselection(ast, nextState, clinicalContext);

  // Passo 3: espelhar idade (com unidade meses/anos em pediatria), IG, peso e recalcular doses ponderais
  // usando o texto das escolhas efetivamente selecionadas nas linhas anterior/atual/seguinte.
  let prevEffectiveLine = '';
  for (let bi = 0; bi < ast.blocks.length; bi++) {
    const block = ast.blocks[bi];
    const effectiveLine = renderBlockSelectedContext(block, nextState);
    let nextEffectiveLine = '';
    for (let nb = bi + 1; nb < ast.blocks.length; nb++) {
      const candidate = ast.blocks[nb];
      if (candidate.kind === 'paragraph' && candidate.isEmptyLine) continue;
      if (candidate.kind === 'paragraph' && /^\s+/.test(candidate.rawLine)) {
        nextEffectiveLine = renderBlockSelectedContext(candidate, nextState);
      }
      break;
    }

    // Detectar padrão pediátrico "[ ] [meses / anos]" na linha atual
    const topNodes = block.children;
    const ageUnitGroupByInputId = new Map<string, ChoiceGroupNode>();
    for (let ni = 0; ni < topNodes.length; ni++) {
      const n = topNodes[ni];
      if (n.kind === 'inline-input' && n.mirrorRole === 'idade') {
        const next1 = topNodes[ni + 1];
        const next2 = topNodes[ni + 2];
        const candidateGroup =
          next1?.kind === 'choice-group'
            ? next1
            : next1?.kind === 'text' && next1.value.trim() === '' && next2?.kind === 'choice-group'
              ? next2
              : null;
        if (
          candidateGroup &&
          candidateGroup.options.some((o) => /\bmes(?:es)?\b/i.test(o.rawText)) &&
          candidateGroup.options.some((o) => /\banos?\b/i.test(o.rawText))
        ) {
          ageUnitGroupByInputId.set(n.id, candidateGroup);
        }
      }
    }

    walkInlineNodes(block.children, (node) => {
      if (node.kind !== 'inline-input') return;
      if (nextState.userEditedNodes[node.id]) return;

      // Espelhamento de idade (suportando "3a" -> "3" + "anos" e "8m" -> "8" + "meses")
      if (node.mirrorRole === 'idade') {
        const unitGroup = ageUnitGroupByInputId.get(node.id);
        if (clinicalContext.idadeText) {
          if (unitGroup) {
            const parsed = parsePediatricAgeParts(clinicalContext.idadeText);
            nextState.inputValues[node.id] = parsed.value;
            if (parsed.unit && !nextState.userEditedNodes[unitGroup.id]) {
              const unitOpt = unitGroup.options.find((o) =>
                parsed.unit === 'meses' ? /\bmes(?:es)?\b/i.test(o.rawText) : /\banos?\b/i.test(o.rawText)
              );
              if (unitOpt) {
                nextState.choiceSelections[unitGroup.id] = [unitOpt.index];
              }
            }
          } else {
            nextState.inputValues[node.id] = clinicalContext.idadeText;
          }
        } else {
          delete nextState.inputValues[node.id];
        }
        return;
      }

      // Espelhamento de IG (semanas)
      if (
        node.obstetricRole === 'ig-def-w' ||
        node.obstetricRole === 'ig-dum-w' ||
        node.obstetricRole === 'ig-usg-w'
      ) {
        if (clinicalContext.igWeeks !== null) {
          nextState.inputValues[node.id] = String(Math.floor(clinicalContext.igWeeks));
        } else {
          delete nextState.inputValues[node.id];
        }
        return;
      }

      // Espelhamento de peso e recálculo ponderal inline
      const isWeightSource = node.anthroRole === 'peso' || node.mirrorRole === 'peso';
      if (isWeightSource) {
        if (clinicalContext.weightKg !== null) {
          nextState.inputValues[node.id] = String(clinicalContext.weightKg).replace('.', ',');
        } else {
          delete nextState.inputValues[node.id];
        }
        return;
      }

      if (clinicalContext.weightKg !== null && clinicalContext.weightDoses) {
        const autoDose = resolvePediatricDoseFieldValue({
          isWeightSourceInput: false,
          lineContext: effectiveLine,
          prevLineContext: prevEffectiveLine,
          nextLineContext: nextEffectiveLine,
          beforeText: node.beforeText,
          afterText: node.afterText,
          placeholder: node.placeholder,
          weightKg: clinicalContext.weightKg,
          doses: clinicalContext.weightDoses,
        });
        if (autoDose !== null) {
          nextState.inputValues[node.id] = autoDose;
        }
      } else {
        // Se o peso foi limpo, limpar doses pediátricas auto-preenchidas (preservando defaults fixos)
        const probe = resolvePediatricDoseFieldValue({
          isWeightSourceInput: false,
          lineContext: effectiveLine,
          prevLineContext: prevEffectiveLine,
          nextLineContext: nextEffectiveLine,
          beforeText: node.beforeText,
          afterText: node.afterText,
          placeholder: node.placeholder,
          weightKg: 15,
          doses: buildClinicalContext({ pesoKg: '15' }, { modId: 'ped' }).weightDoses!,
        });
        if (probe !== null) {
          delete nextState.inputValues[node.id];
        }
      }
    });

    if (effectiveLine.trim()) {
      prevEffectiveLine = effectiveLine;
    }
  }

  return nextState;
}

/**
 * Serializa uma seção específica da AST para texto clínico limpo pronto para colar no prontuário.
 */
export function serializeProtocolSection(
  ast: PepDocumentAst,
  state: AstSelectionState,
  clinicalContext: ClinicalContext,
  section: PepAstSection
): string {
  return serializeAstToClinicalText(ast, state, clinicalContext, {
    keepEmptyBrackets: true,
    includeDoseFormulaCalc: true,
    stripSafetyWarnings: section.id === 'receita',
    blockSubsetIndices: section.blockIndexSet,
  }).replace(/\*(\([^*\n]+\)\.?)\*/g, '$1');
}

// ----------------------------------------------------------------------------
// TRAVA DE CÓPIA: auditoria de lacunas antes de copiar Prescrição / Copiar tudo
// ----------------------------------------------------------------------------

const GAP_MARK_INPUT = '⟪GAP_INPUT⟫';
const GAP_MARK_CHOICE = '⟪GAP_CHOICE⟫';
const GAP_MARK_IDENT = '⟪GAP_IDENT⟫';

export interface SectionGapReport {
  /** Campos clínicos inline ([ ], [dose], [...] gotas) ainda vazios nos blocos visíveis da seção. */
  openFields: number;
  /** Campos de identificação vazios (Nome, Idade, Data): só aviso, não bloqueiam. */
  identificationFields: number;
  /** Escolhas [A / B] sem nenhuma opção selecionada (somem do texto copiado). */
  unselectedChoices: number;
  /** Há doses por kg na seção, mas o peso não foi informado (dose não calculada). */
  missingWeightForDoses: boolean;
  /** Total de lacunas que bloqueiam a cópia (exclui identificação). */
  total: number;
}

export const EMPTY_GAP_REPORT: SectionGapReport = {
  openFields: 0,
  identificationFields: 0,
  unselectedChoices: 0,
  missingWeightForDoses: false,
  total: 0,
};

function countOccurrences(text: string, token: string): number {
  if (!token) return 0;
  return text.split(token).length - 1;
}

/**
 * Conta lacunas reais de uma seção a partir do mesmo serializador do texto copiado
 * (respeita opcionais fechados, travas e checkboxes; checkboxes "[ ]" não contam).
 */
export function analyzeSectionGaps(
  ast: PepDocumentAst,
  state: AstSelectionState,
  clinicalContext: ClinicalContext,
  section: PepAstSection
): SectionGapReport {
  const audited = serializeAstToClinicalText(ast, state, clinicalContext, {
    keepEmptyBrackets: true,
    includeDoseFormulaCalc: true,
    blockSubsetIndices: section.blockIndexSet,
    gapMarkers: {
      emptyInput: GAP_MARK_INPUT,
      emptyIdentification: GAP_MARK_IDENT,
      unselectedChoice: GAP_MARK_CHOICE,
    },
  });

  const openFields = countOccurrences(audited, GAP_MARK_INPUT);
  const identificationFields = countOccurrences(audited, GAP_MARK_IDENT);
  const unselectedChoices = countOccurrences(audited, GAP_MARK_CHOICE);

  let hasDoseFormula = false;
  for (const idx of section.blockIndices) {
    const block = ast.blocks[idx];
    if (!block) continue;
    walkInlineNodes(block.children, (n) => {
      if (n.kind === 'dose-formula') hasDoseFormula = true;
    });
    if (hasDoseFormula) break;
  }
  const missingWeightForDoses = hasDoseFormula && !(clinicalContext.weightKg && clinicalContext.weightKg > 0);

  return {
    openFields,
    identificationFields,
    unselectedChoices,
    missingWeightForDoses,
    total: openFields + unselectedChoices + (missingWeightForDoses ? 1 : 0),
  };
}

// ----------------------------------------------------------------------------
// AUDITOR DE PRESCRIÇÃO (alergia, função renal, gestação, teto, contraindicação do protocolo)
// ----------------------------------------------------------------------------

export interface ProtocolPrescriptionAudit {
  /** Itens da Prescrição/Receita: alertas "block" daqui travam a cópia. */
  receita: PrescriptionAuditReport | null;
  /** Itens da Conduta (planos condicionais): exibidos só como aviso. */
  conduta: PrescriptionAuditReport | null;
}

export function auditProtocolPrescription(
  item: ClinicalProtocolItem,
  sectionTexts: Partial<Record<PepSectionId, string>>,
  clinicalContext: ClinicalContext
): ProtocolPrescriptionAudit {
  const hints = resolveProtocolPharmaHints(item);
  const triggerLower = String(item.trigger || '').toLowerCase();
  const isDeliveryPostpartumRx = triggerLower === ';cesarea' || triggerLower === ';pn-eutocico';
  const run = (zone: 'receita' | 'conduta'): PrescriptionAuditReport | null => {
    const text = sectionTexts[zone];
    if (!text || !text.trim()) return null;
    const items = extractPrescriptionItemsFromText(text, { defaultZone: zone }).map((it) => ({
      ...it,
      scope: zone,
      postpartumScenario: it.postpartumScenario || (zone === 'receita' && isDeliveryPostpartumRx),
    }));
    if (items.length === 0) return null;
    return auditPrescription(items, clinicalContext, hints);
  };
  return { receita: run('receita'), conduta: run('conduta') };
}

/**
 * Para texto editado livremente (textarea): conta colchetes vazios "[ ]" / "[___]"
 * que não são checkbox de início de linha.
 */
export function countOpenBracketsInFreeText(text: string): number {
  let count = 0;
  for (const line of String(text || '').split('\n')) {
    const withoutCheckbox = line.replace(/^\s*(?:[-*]\s+)?\[(?: |x|X)\]\s/, '');
    const matches = withoutCheckbox.match(/\[(?:\s*|_+)\]/g);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Compila o protocolo completo em AST particionada + estado inicial + blocos copiáveis sincronizados.
 */
export function compileProtocolForDisplay(
  item: ClinicalProtocolItem,
  patient: PatientContextInput
): CompiledProtocolView {
  const rawPep = item.pep_body || '';
  const ast = parsePepToAst(rawPep, item.id);
  const needsWeightPersonalization =
    item.mod_id === 'ped' || hasEmptyPediatricWeight(rawPep) || ast.stats.doseFormulas > 0;

  const clinicalContext = buildClinicalContext(
    {
      idade: patient.idade,
      pesoKg: patient.pesoKg,
      gestante: patient.gestante,
      igSemanas: patient.igSemanas,
      alergias: patient.alergias ?? '',
      clCr: patient.clCr ?? '',
      creatinina: patient.creatinina ?? '',
      sexo: patient.sexo ?? '',
    },
    {
      modId: item.mod_id,
      trigger: item.trigger,
      category: item.category,
    }
  );

  const plausibilityAlert = validateAgeWeightPlausibility(
    clinicalContext.ageYears,
    clinicalContext.weightKg
  );

  const baseState = createAstSelectionState(ast, clinicalContext);
  const initialAstState = applyPatientContextToAstState(ast, baseState, clinicalContext);
  const sections = partitionAstIntoSections(ast, item);

  const blocks: CopyablePepBlock[] = sections
    .map((sec) => ({
      id: sec.id,
      title: sec.title,
      text: serializeProtocolSection(ast, initialAstState, clinicalContext, sec),
    }))
    .filter((b) => b.text.trim().length > 0);

  return {
    needsWeightPersonalization,
    clinicalContext,
    plausibilityAlert,
    ast,
    initialAstState,
    sections,
    fullText: blocks.map((b) => b.text).join('\n\n'),
    blocks,
  };
}

export interface GuiaSection {
  title: string;
  body: string;
}

export function splitGuiaIntoSections(guiaBody: string): GuiaSection[] {
  const raw = String(guiaBody || '').trim();
  if (!raw) return [];

  const parts = raw.split(/^###\s+/m).filter((s) => s.trim().length > 0);
  if (parts.length === 1 && !raw.startsWith('###')) {
    return [{ title: 'Fundamentação Clínica', body: raw }];
  }

  return parts.map((chunk) => {
    const firstNewline = chunk.indexOf('\n');
    if (firstNewline === -1) {
      return { title: chunk.trim(), body: '' };
    }
    return {
      title: chunk.slice(0, firstNewline).trim(),
      body: chunk.slice(firstNewline + 1).trim(),
    };
  });
}
