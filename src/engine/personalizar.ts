// ============================================================================
// MOTOR INTERATIVO PEP v3.1 (Personalizar com Sub-Inputs, Cache de Sessão,
// Sanitização Clínica Zero-Placeholder, Detecção de Lacunas, Sinais Vitais
// Compostos, Cópia Granular por Seção, Cálculo Ponderal Inline, Nägele e IMC)
// ============================================================================

import {
  getUnifiedDrugSpecByKey,
  matchUnifiedDrugInClause,
  resolveDrugCeilingForContext,
} from '../data/farmacos.ts';

export interface BracketToken {
  type: 'text' | 'bracket';
  raw: string;
  inner?: string;
}

export interface PediatricDoseBadgeItem {
  drug: string;
  doseRule: string;
  formattedDose: string;
  maxAdultCeiling: string;
  ceilingHit: boolean;
  badge: string;
  allowed: boolean;
  note?: string;
}

export interface WeightDoseSummary {
  weightKg: number;
  dipironaAllowed: boolean;
  dipironaGotas: number;
  dipironaMlSolucao: string;
  dipironaMg: number;
  paracetamolGotas: number;
  paracetamolMg: number;
  ibuprofenoAllowed: boolean;
  ibuprofenoGotas100: number;
  ibuprofenoGotas50: number;
  ibuprofenoMg: number;
  ondansetronaMg: string;
  ondansetronaMlEv: string;
  amoxi50Ml8h: string;
  amoxi90Ml12h: string;
  prednisolonaMlDia: string;
  prednisolonaMgDia: number;
  dexametasonaCrupeMg: string;
  midazolamImEvMg: string;
  items: PediatricDoseBadgeItem[];
}

export type PowerActionId = 1 | 2 | 3 | 4 | 5;

export interface PowerActionOutput {
  actionId: PowerActionId;
  label: string;
  text: string;
  pendingGaps: PendingGapsReport;
}

export interface PendingGapsReport {
  totalGaps: number;
  total: number;
  emptyBrackets: number;
  blankBrackets: number;
  namedPlaceholders: number;
  unresolvedChoices: number;
  samples: string[];
}

export interface ExtractedProtocolBodies {
  pep_body: string;
  evolucao_body: string;
  conduta_body: string;
  receita_body: string;
  receita_meds_body: string;
  orientacoes_body: string;
}

export interface SanitizePepOptions {
  keepEmptyBrackets?: boolean;
  stripMarkdownHeaders?: boolean;
}

export function parseBalancedBrackets(str: string): BracketToken[] {
  const tokens: BracketToken[] = [];
  let i = 0;
  let textStart = 0;
  const n = str.length;

  while (i < n) {
    if (str[i] === '[') {
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (str[j] === '[') depth++;
        else if (str[j] === ']') depth--;
        j++;
      }
      if (depth === 0) {
        if (i > textStart) {
          tokens.push({ type: 'text', raw: str.slice(textStart, i) });
        }
        const rawBracket = str.slice(i, j);
        const inner = str.slice(i + 1, j - 1);
        tokens.push({ type: 'bracket', raw: rawBracket, inner });
        i = j;
        textStart = i;
        continue;
      }
    }
    i++;
  }
  if (textStart < n) {
    tokens.push({ type: 'text', raw: str.slice(textStart) });
  }
  return tokens;
}

export function isContraindicationWarningBracket(inner: string): boolean {
  const trimmed = String(inner || '').trim();
  if (!trimmed) return false;
  return /^(?:NÃO\s+PRESCREVER|CONTRAINDICAD|EVITAR\s+SE)/i.test(trimmed);
}

export function isInternalInstructionBracket(inner: string): boolean {
  const trimmed = String(inner || '').trim();
  if (!trimmed) return false;
  if (/^\?\s*[^:]+::/i.test(trimmed)) return true;
  return /^(?:SE\s+|Se\s+|Opcional\b|A\s+critério\b|Caso\s+|Conforme\s+|OPÇÃO\s+|MODALIDADE\s+|1ª\s*ESCOLHA|2ª\s*ESCOLHA|3ª\s*ESCOLHA|OU(?:\s|$)|Escolha\s+|NÃO\s+PRESCREVER|CONTRAINDICAD|EVITAR\s+SE|ATENÇÃO\b|ALERTA\b|NOTA\b|OBS\b)/i.test(trimmed);
}

export function isSecondaryOptionBracket(inner: string): boolean {
  const trimmed = String(inner || '').trim();
  return /^(?:OPÇÃO\s+(?:[2-9]|[B-Z]\b|ALTERNATIVA\b)|MODALIDADE\s+(?:[2-9]|[B-Z]\b)|2ª\s*ESCOLHA|3ª\s*ESCOLHA|OU(?:\s|$)|SE\s+(?:ALERGIA|ALÉRGIC|HISTÓRICO\s+DE\s+ANAFILAXIA|USO\s+DE\s+ANTIBIÓTICO\s+RECENTE|FALHA|INTOLERÂNCIA|SUSPEITA\s+DE\s+MRSA))/i.test(trimmed);
}

/**
 * Cláusulas explicitamente opcionais ou restritas a subgrupos específicos de risco
 * (ex.: mãe Rh negativo, alto risco de TEV, constipação) que devem iniciar desligadas
 * na UI para evitar prescrição indevida por omissão, podendo ser ativadas com 1 clique.
 */
export function isConditionalDefaultOffBracket(inner: string): boolean {
  const trimmed = String(inner || '').trim();
  if (isSecondaryOptionBracket(trimmed)) return true;
  if (isContraindicationWarningBracket(trimmed)) return false;
  if (/^(?:ATENÇÃO|ALERTA|NOTA|OBS)\b/i.test(trimmed)) return false;
  // Todo bloco condicional seletivo ([Se ...], [Caso ...], [Quando ...], [Opcional ...]) inicia OFF
  // para evitar afirmar fatos/condutas condicionais sem confirmação clínica do médico.
  return /^(?:Opcional\b|Se\s+|Caso\s+|Quando\s+|Em\s+caso\s+|Suspeita\s+)/i.test(trimmed);
}

export interface ParsedChoiceGroup {
  isExplicitMulti: boolean;
  hasDefault: boolean;
  options: Array<{ text: string; isDefault: boolean }>;
}

export function formatMultiChoices(selected: string[]): string {
  const clean = selected.map(s => s.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

const UNIT_RATIO_SLASH_RE =
  /\b(mg|mcg|µg|ug|g|UI|mEq|mmol)\s+\/\s+(\d*(?:[.,]\d+)?\s*(?:mL|ml|L|kg|dia|h|min|gota|gotas|dose|jato|puff))\b/gi;

function splitTopLevelChoices(inner: string): string[] {
  let trimmed = inner.trim();
  if (/^(?:DD\/MM\/AAAA|DD\/MM|MM\/AAAA|HH:MM)$/i.test(trimmed)) {
    return [trimmed];
  }
  if (isInternalInstructionBracket(trimmed)) {
    return [trimmed];
  }

  if (trimmed.startsWith('+ ')) {
    trimmed = trimmed.slice(2).trim();
  }

  // Protege razões de concentração/posologia com espaços ao redor da barra
  // (ex.: "400 mg / 5 mL" -> "400 mg/5 mL") para que não sejam partidas como opções distintas.
  trimmed = trimmed.replace(UNIT_RATIO_SLASH_RE, '$1/$2');

  const parts: string[] = [];
  let bDepth = 0;
  let pDepth = 0;
  let curStart = 0;
  const n = trimmed.length;

  for (let i = 0; i < n; i++) {
    const ch = trimmed[i];
    if (ch === '[') bDepth++;
    else if (ch === ']' && bDepth > 0) bDepth--;
    else if (ch === '(') pDepth++;
    else if (ch === ')' && pDepth > 0) pDepth--;

    if (bDepth === 0 && pDepth === 0) {
      if (trimmed.slice(i, i + 3) === ' / ' || trimmed.slice(i, i + 3) === ' | ') {
        parts.push(trimmed.slice(curStart, i).trim());
        curStart = i + 3;
        i += 2;
      }
    }
  }
  parts.push(trimmed.slice(curStart).trim());

  const filtered = parts.filter(Boolean);
  if (filtered.length > 1) return filtered;

  if (/^[a-zA-ZÀ-ÿ]{4,}\/[a-zA-ZÀ-ÿ]{4,}$/.test(trimmed)) {
    return trimmed.split('/');
  }

  return [trimmed];
}

export function parseChoiceGroupToken(inner: string): ParsedChoiceGroup {
  const trimmed = String(inner || '').trim();
  const isExplicitMulti = trimmed.startsWith('+ ');
  const rawOptions = splitTopLevelChoices(trimmed);
  let hasDefault = false;
  const options = rawOptions.map(opt => {
    const isDef = /^\*(?!\*)/.test(opt);
    if (isDef) hasDefault = true;
    return {
      text: isDef ? opt.slice(1).trim() : opt,
      isDefault: isDef
    };
  });
  return { isExplicitMulti, hasDefault, options };
}

export function sanitizePepOutput(rawText: string, opts?: SanitizePepOptions): string {
  const keepEmpty = opts && opts.keepEmptyBrackets !== undefined ? opts.keepEmptyBrackets : true;
  const stripMd = opts && opts.stripMarkdownHeaders !== undefined ? opts.stripMarkdownHeaders : true;

  const cleanedRaw = String(rawText || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*\(([^*\n)]+)\)\*/g, '($1)');
  const lines = cleanedRaw.replace(/\r\n/g, '\n').split('\n');
  const outLines: string[] = [];
  let skipSecondaryMode: 'none' | 'block' | 'item' = 'none';

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const trimmedRaw = rawLine.trim();

    if (skipSecondaryMode === 'item') {
      if (trimmedRaw && /^\s+/.test(rawLine) && !/^\s*(?:\d+\.|[-*]|#+|>>)\s+/.test(rawLine)) {
        continue;
      }
      skipSecondaryMode = 'none';
    } else if (skipSecondaryMode === 'block') {
      if (
        !trimmedRaw ||
        /^#+/.test(trimmedRaw) ||
        /^>>/.test(trimmedRaw) ||
        /^(?:>>\s*)?\[(?:OPÇÃO|MODALIDADE|1ª\s*ESCOLHA|2ª\s*ESCOLHA|OU\s+2ª)/i.test(trimmedRaw) ||
        /^(?:USO\s+|ORIENTAÇÕES|SINAIS DE ALARME)/i.test(trimmedRaw)
      ) {
        skipSecondaryMode = 'none';
      } else {
        continue;
      }
    }

    // Se a linha inicia um bloco ou item de 2ª/3ª opção no texto bruto, omitir
    const tokens = parseBalancedBrackets(rawLine);
    const firstBracket = tokens.find(t => t.type === 'bracket');
    if (
      firstBracket &&
      firstBracket.inner &&
      isSecondaryOptionBracket(firstBracket.inner)
    ) {
      if (/^\d+\.\s*\[/.test(trimmedRaw)) {
        skipSecondaryMode = 'item';
        continue;
      }
      if (trimmedRaw.startsWith('[') || /^>>\s*\[/.test(trimmedRaw)) {
        skipSecondaryMode = 'block';
        continue;
      }
    }

    let builtLine = '';
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok.type === 'text') {
        builtLine += tok.raw;
      } else {
        const inner = (tok.inner || '').trim();
        // Preservar checkboxes de passos clínicos "- [x] " ou "- [ ] " no início da linha
        if (
          t === 1 &&
          (inner === 'x' || inner === 'X' || inner === '') &&
          /^\s*(?:[-*]|\d+\.)\s+$/.test(tokens[0].raw)
        ) {
          builtLine += tok.raw;
          continue;
        }

        // Preservar travas clínicas de contraindicação ([NÃO PRESCREVER...], [CONTRAINDICADO...])
        // para impedir que um fármaco contraindicado vá para a receita sem o alerta
        if (isContraindicationWarningBracket(inner)) {
          builtLine += tok.raw;
          continue;
        }

        // Remover rótulos de instrução interna ([Se ...], [Opcional...], [OPÇÃO 1...], [? ... :: ...])
        if (isInternalInstructionBracket(inner)) {
          continue;
        }

        if (inner === '') {
          builtLine += keepEmpty ? '[ ]' : '___';
        } else {
          const parsedGroup = parseChoiceGroupToken(inner);
          if (parsedGroup.options.length >= 2 && parsedGroup.hasDefault) {
            const defaults = parsedGroup.options.filter(o => o.isDefault).map(o => o.text);
            builtLine += formatMultiChoices(defaults);
          } else {
            builtLine += tok.raw;
          }
        }
      }
    }

    if (stripMd) {
      // Limpar wrappers ###### TÍTULO ###### -> TÍTULO
      builtLine = builtLine.replace(/^#{2,6}\s*(.*?)\s*#{2,6}$/, '$1');
      // Limpar prefixo de seção "# SEÇÃO:" -> "SEÇÃO:" e ">> SUBSEÇÃO:" -> "SUBSEÇÃO:"
      builtLine = builtLine.replace(/^#{1,6}\s+/, '');
      builtLine = builtLine.replace(/^>>\s*/, '');
    }

    // Limpar tokens LaTeX residuais ($...$, \rightarrow, \ge, \le, \pm, \times)
    builtLine = builtLine
      .replace(/\$([^$\n]+)\$/g, '$1')
      .replace(/\\rightarrow|\\to\b/g, '→')
      .replace(/\\ge(?:q)?\b/g, '≥')
      .replace(/\\le(?:q)?\b/g, '≤')
      .replace(/\\pm\b/g, '±')
      .replace(/\\times\b/g, '×')
      .replace(/\\approx\b/g, '≈');

    // Limpar dois-pontos ou hifens órfãos deixados após remoção de [Se ...] no início de item numerado/lista
    builtLine = builtLine.replace(/^(\s*(?:\d+\.|[-*])\s*)[:\-–]\s+/, '$1');
    builtLine = builtLine.replace(/^[:\-–]\s+/, '');
    // Limpar espaços múltiplos antes de traços de receita ou pontuação, preservando indentação inicial
    const leadingIndentMatch = builtLine.match(/^(\s*)/);
    const leadingIndent = leadingIndentMatch ? leadingIndentMatch[1] : '';
    const contentPart = builtLine
      .slice(leadingIndent.length)
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/([,;:])\s*\./g, '.')
      .replace(/\s{2,}(?!--)/g, ' ')
      .trimEnd();

    // Se a linha inteira era apenas um cabeçalho [OPÇÃO 1...] ou pontuação órfã sem texto residual, pular
    if ((!contentPart || /^[.,;:–\-]+$/.test(contentPart.trim())) && trimmedRaw.length > 0) {
      continue;
    }

    outLines.push(contentPart ? leadingIndent + contentPart : '');
  }

  return outLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectPendingGaps(text: string): PendingGapsReport {
  const lines = String(text || '').split('\n');
  let emptyBrackets = 0;
  let namedPlaceholders = 0;
  let unresolvedChoices = 0;
  const samples: string[] = [];

  const pushSample = (s: string) => {
    if (samples.length < 4 && !samples.includes(s)) {
      samples.push(s);
    }
  };

  for (const line of lines) {
    // Contar ___ explícitos quando vazios foram convertidos para ___
    const underscoreMatches = line.match(/\b___+\b/g);
    if (underscoreMatches) {
      emptyBrackets += underscoreMatches.length;
      pushSample('___');
    }

    const tokens = parseBalancedBrackets(line);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type !== 'bracket') continue;
      const inner = (tok.inner || '').trim();

      // Ignorar checkbox de lista "- [x] " ou "- [ ] " no início da linha
      if (
        i === 1 &&
        (inner === 'x' || inner === 'X' || inner === '') &&
        /^\s*(?:[-*]|\d+\.)\s+$/.test(tokens[0].raw)
      ) {
        continue;
      }

      if (isInternalInstructionBracket(inner)) {
        continue;
      }

      if (inner === '' || /^_+$/.test(inner)) {
        emptyBrackets++;
        pushSample('[ ]');
        continue;
      }

      if (
        /^(?:Nome|Idade|Profissão|Dr\(a\)\.?|Procedimento|Hospital|Leito|Peso|Altura|IMC|\+\/-|DD\/MM\/AAAA|DD\/MM|HH:MM|indicação)$/i.test(
          inner
        )
      ) {
        namedPlaceholders++;
        pushSample(`[${inner}]`);
        continue;
      }

      const parsedGroup = parseChoiceGroupToken(inner);
      if (parsedGroup.options.length >= 2) {
        if (!parsedGroup.hasDefault) {
          unresolvedChoices++;
          const preview = inner.length > 24 ? inner.slice(0, 22) + '…' : inner;
          pushSample(`[${preview}]`);
        }
      }
    }
  }

  const totalGaps = emptyBrackets + namedPlaceholders + unresolvedChoices;
  return {
    totalGaps,
    total: totalGaps,
    emptyBrackets,
    blankBrackets: emptyBrackets,
    namedPlaceholders,
    unresolvedChoices,
    samples
  };
}

export const ORIENTACOES_HEADER_REGEX =
  /^(?:>>\s*|#+\s*)?(?:ORIENTAÇÕES|SINAIS DE ALARME|RETORNO IMEDIATO|CUIDADOS DOMICILIARES)/i;

export function extractBodiesFromCustomPep(
  customPep: string,
  item?: { evolucao_body?: string; conduta_body?: string; receita_body?: string; has_receita?: boolean } | null,
  sanitizeOpts?: SanitizePepOptions
): ExtractedProtocolBodies {
  const raw = String(customPep || '');

  // Localizar início da Conduta / Plano (ancorado em cabeçalho estrutural para não truncar texto narrativo como "Plano de parto:")
  const condRegex =
    /^((?:(?:#+\s*|>>\s*)\s*|\d+\.\s*)?(?:5\.\s*AVALIAÇÃO\s*&\s*PLANO\s*\/\s*CONDUTA[^\n]*\n)?(?:(?:#+\s*|>>\s*)\s*(?:PLANO\s*\/\s*CONDUTA|PLANO\s+TERAPÊUTICO|PLANO|CONDUTA|PRESCRIÇÃO)\b|(?:PLANO\s*\/\s*CONDUTA|PLANO\s+TERAPÊUTICO|CONDUTA|PRESCRIÇÃO)\s*:?\s*(?:\n|$))[\s\S]*)$/im;
  const condMatch = raw.match(condRegex);

  let rawEvolucao = raw;
  let rawConduta = item?.conduta_body || raw;

  if (condMatch && condMatch.index !== undefined) {
    rawEvolucao = raw.slice(0, condMatch.index).trim();
    rawConduta = (condMatch[1] || condMatch[0] || '').trim();
  } else if (item?.evolucao_body) {
    rawEvolucao = item.evolucao_body;
  }

  // Localizar início da Receita / Prescrição Domiciliar (sem contaminar com rawConduta quando inexistente)
  const recRegex = /(?:>>\s*|#+\s*|^)(?:RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?|PRESCRIÇÃO DOMICILIAR|PRESCRIÇÃO DE ALTA|RECEITA DE ALTA|PRESCRIÇÃO MÉDICA AMBULATORIAL|PRESCRIÇÃO AMBULATORIAL)\s*:?[^\n]*\n([\s\S]*)$/im;
  const recMatch = raw.match(recRegex);
  const explicitReceita = recMatch
    ? (recMatch[1] || '').trim()
    : (item && item.has_receita === false)
      ? ''
      : String(item?.receita_body || '').replace(
          /^(?:>>\s*|#+\s*)(?:RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?|PRESCRIÇÃO DOMICILIAR|PRESCRIÇÃO DE ALTA|RECEITA DE ALTA|PRESCRIÇÃO MÉDICA AMBULATORIAL|PRESCRIÇÃO AMBULATORIAL)\s*:?[^\n]*\n?/i,
          ''
        ).trim();
  const rawReceita = explicitReceita;

  // Localizar bloco de Orientações de Alta / Sinais de Alarme / Retorno Imediato / Cuidados Domiciliares
  const oriRegex = /^((?:>>\s*|#+\s*)?(?:ORIENTAÇÕES|SINAIS DE ALARME|RETORNO IMEDIATO|CUIDADOS DOMICILIARES)[^\n]*\n[\s\S]*)$/im;
  const oriMatch = raw.match(oriRegex);
  const rawOrientacoes = oriMatch ? (oriMatch[1] || oriMatch[0] || '').trim() : '';

  const recOriMatch = rawReceita.match(oriRegex);
  const rawReceitaMedsOnly =
    recOriMatch && recOriMatch.index !== undefined
      ? rawReceita.slice(0, recOriMatch.index).trim()
      : rawReceita;

  return {
    pep_body: sanitizePepOutput(raw, sanitizeOpts),
    evolucao_body: sanitizePepOutput(rawEvolucao, sanitizeOpts),
    conduta_body: sanitizePepOutput(rawConduta, sanitizeOpts),
    receita_body: sanitizePepOutput(rawReceita, sanitizeOpts),
    receita_meds_body: sanitizePepOutput(rawReceitaMedsOnly, sanitizeOpts),
    orientacoes_body: rawOrientacoes ? sanitizePepOutput(rawOrientacoes, sanitizeOpts) : ''
  };
}

export function inferVitalSignRole(
  inner: string,
  beforeText: string,
  afterText?: string
): 'pa-composta' | 'pas' | 'pad' | 'fc' | 'bcf' | 'fr' | 'spo2' | 'tax' | 'hgt' | null {
  const trimmed = String(inner || '').trim();
  const bef = String(beforeText || '').trim();
  const aft = String(afterText || '').trim();

  if (/PA(?:\s*\([^)]*\))?\s*:?\s*$/i.test(bef)) {
    if (/^\s*[x/]\s*(?:\[|\d)/i.test(aft) || /^[x/]$/i.test(aft)) return 'pas';
    return 'pa-composta';
  }
  if (/^\d{2,3}\s*[x/]\s*\d{2,3}$/i.test(trimmed)) {
    return 'pa-composta';
  }
  if (/(?:[x/]|\bPA\s*:?\s*\d{2,3}\s*[x/])\s*$/i.test(bef) && (/^mmHg/i.test(aft) || aft === '')) return 'pad';
  if (/BCF[^:]*:\s*$/i.test(bef)) return 'bcf';
  if (/\bFC\s*:?\s*$/i.test(bef)) return 'fc';
  if (/\bFR\s*:?\s*$/i.test(bef)) return 'fr';
  if (/\b(?:SpO2|SatO2)\s*:?\s*$/i.test(bef)) return 'spo2';
  if (/\b(?:Tax|Temp(?:eratura)?)\b[^:]*:\s*$/i.test(bef)) return 'tax';
  if (/\b(?:HGT|DX|Glicemia\s+capilar)\b[^:]*:\s*$/i.test(bef)) return 'hgt';
  return null;
}

export function getNormalVitalDefaults(modId?: string): Record<string, string> {
  const mod = String(modId || 'upa').toLowerCase();
  const isGo = mod === 'go';
  const isPed = mod === 'ped';

  return {
    'pa-composta': isGo ? '110x70' : isPed ? '95x60' : '120x80',
    pas: isGo ? '110' : isPed ? '95' : '120',
    pad: isGo ? '70' : isPed ? '60' : '80',
    fc: isPed ? '110' : isGo ? '80' : '76',
    bcf: '142',
    fr: isPed ? '28' : '16',
    spo2: '98',
    tax: '36,5',
    hgt: '92'
  };
}

export function computeWeightBasedDoses(
  weightKg: number,
  ageYears: number | null = null
): WeightDoseSummary | null {
  if (!Number.isFinite(weightKg) || weightKg < 2 || weightKg > 150) return null;

  const dip = getUnifiedDrugSpecByKey('dipirona');
  const pcm = getUnifiedDrugSpecByKey('paracetamol');
  const ibu = getUnifiedDrugSpecByKey('ibuprofeno');
  const onda = getUnifiedDrugSpecByKey('ondansetrona');
  const amox = getUnifiedDrugSpecByKey('amoxicilina');
  const pred = getUnifiedDrugSpecByKey('prednisolona');
  const dexa = getUnifiedDrugSpecByKey('dexametasona');
  const mid = getUnifiedDrugSpecByKey('midazolam');

  const dipironaAllowed =
    weightKg >= (dip.minWeightKg ?? 5) &&
    (ageYears === null || ageYears * 12 >= (dip.minAgeMonths ?? 3));
  const dipMaxMg = dip.maxAdultDoseMg ?? 1000;
  const dipMaxGotas = dip.maxAdultGotas ?? 40;
  const dipironaMg = dipironaAllowed ? Math.min(dipMaxMg, Math.round(weightKg * 20)) : 0;
  const dipironaGotas = dipironaAllowed
    ? Math.min(dipMaxGotas, Math.round(dipironaMg / (dip.dropsMgPerDrop ?? 25)))
    : 0;
  const dipSolConc = dip.oralSolMgPerMl ?? 50;
  const dipironaMlSolucao = dipironaAllowed
    ? Math.min(dipMaxMg / dipSolConc, dipironaMg / dipSolConc).toFixed(1).replace('.', ',')
    : '0,0';

  // Paracetamol 200 mg/mL (gotejador de referência 15 gts/mL ≈ 13,3 mg/gt => 13 mg/kg/dose ≈ 1 gota/kg, teto 750 mg / 50 gotas)
  const pcmMaxMg = pcm.maxPediatricDoseMg ?? 750;
  const pcmMaxGotas = pcm.maxAdultGotas ?? 50;
  const paracetamolMg = Math.min(pcmMaxMg, Math.round(weightKg * 13));
  const paracetamolGotas = Math.min(pcmMaxGotas, Math.round(weightKg));
  const paracetamolCeilingHit = weightKg * 13 >= pcmMaxMg || weightKg >= pcmMaxGotas;

  const ibuprofenoAllowed =
    weightKg >= (ibu.minWeightKg ?? 7) &&
    (ageYears === null || ageYears * 12 >= (ibu.minAgeMonths ?? 6));
  const ibuMaxMg = ibu.maxPediatricDoseMg ?? 400;
  const ibuMaxGotas = ibu.maxAdultGotas ?? 40;
  const ibuprofenoMg = ibuprofenoAllowed ? Math.min(ibuMaxMg, Math.round(weightKg * 10)) : 0;
  const ibuprofenoGotas100 = ibuprofenoAllowed
    ? Math.min(ibuMaxGotas, Math.round(ibuprofenoMg / (ibu.dropsMgPerDrop ?? 10)))
    : 0;
  const ibuprofenoGotas50 = ibuprofenoAllowed ? Math.min(ibuMaxGotas * 2, Math.round(ibuprofenoMg / 5)) : 0;

  const ondaMaxMg = onda.maxAdultDoseMg ?? 8;
  const ondaMgVal = Math.min(ondaMaxMg, weightKg * 0.15);
  const ondansetronaMg = ondaMgVal.toFixed(1).replace('.', ',');
  const ondaInjConc = onda.injMgPerMl ?? 2;
  const ondansetronaMlEv = (ondaMgVal / ondaInjConc).toFixed(1).replace('.', ',');

  // Amoxicilina 250 mg/5 mL (50 mg/mL): 50 mg/kg/dia 8/8h => teto 500 mg/dose = 10 mL
  const amox50MaxDoseMg = 500;
  const amoxi50Ml8hVal = Math.min(amox50MaxDoseMg / 50, weightKg / 3);
  const amoxi50Ml8h = amoxi50Ml8hVal.toFixed(1).replace('.', ',');
  const amoxi50CeilingHit = weightKg / 3 >= amox50MaxDoseMg / 50;

  // Amoxicilina 400 mg/5 mL (80 mg/mL): 90 mg/kg/dia 12/12h => teto 1000 mg/dose = 12,5 mL
  const amox90MaxDoseMg = amox.maxAdultDoseMg ?? 1000;
  const amoxi90Ml12hVal = Math.min(amox90MaxDoseMg / 80, (weightKg * 90) / 160);
  const amoxi90Ml12h = amoxi90Ml12hVal.toFixed(1).replace('.', ',');
  const amoxi90CeilingHit = (weightKg * 90) / 160 >= amox90MaxDoseMg / 80;

  const predMaxMg = resolveDrugCeilingForContext(pred, {
    unitKind: 'dayMg',
    ageYears,
    isPediatric: true,
  }) ?? 40;
  const predConc = pred.oralSolMgPerMl ?? 3;
  const prednisolonaMgDia = Math.min(predMaxMg, Math.round(weightKg * 1));
  const prednisolonaMlDia = Math.min(predMaxMg / predConc, weightKg / predConc).toFixed(1).replace('.', ',');

  const dexaMaxMg = dexa.maxAdultDoseMg ?? 10;
  const dexametasonaCrupeMg = Math.min(dexaMaxMg, weightKg * 0.6).toFixed(1).replace('.', ',');
  const midMaxMg = mid.maxAdultDoseMg ?? 10;
  const midazolamImEvMg = Math.min(midMaxMg, weightKg * 0.2).toFixed(1).replace('.', ',');

  const items: PediatricDoseBadgeItem[] = [
    {
      drug: 'Dipirona (gotas 500 mg/mL = 20 gts/mL | sol. oral 50 mg/mL)',
      doseRule: '20 mg/kg/dose (0,8 gt/kg)',
      formattedDose: dipironaAllowed
        ? `${dipironaMg} mg (${dipironaGotas} gts 500mg/mL | ${dipironaMlSolucao} mL sol. oral 50mg/mL)`
        : (dip.restrictionReason || 'Contraindicado (< 5 kg)'),
      maxAdultCeiling: `${dipMaxMg} mg (${dipMaxGotas} gts / ${dipMaxMg / dipSolConc} mL sol. ${dipSolConc}mg/mL)`,
      ceilingHit: dipironaAllowed && weightKg * 20 >= dipMaxMg,
      badge: !dipironaAllowed
        ? (dip.restrictionReason || 'Contraindicado (< 5 kg)')
        : weightKg * 20 >= dipMaxMg
          ? `Teto adulto (${dipMaxMg} mg)`
          : 'Dose ponderal',
      allowed: dipironaAllowed,
      note: dipironaAllowed ? undefined : dip.restrictionReason,
    },
    {
      drug: 'Paracetamol (200 mg/mL ≈ 15 gts/mL · 13,3 mg/gt)',
      doseRule: '13 mg/kg/dose (1 gt/kg)',
      formattedDose: `${paracetamolMg} mg (${paracetamolGotas} gts)`,
      maxAdultCeiling: `${pcmMaxMg} mg (${pcmMaxGotas} gts)`,
      ceilingHit: paracetamolCeilingHit,
      badge: paracetamolCeilingHit ? `Teto (${pcmMaxGotas} gts / ${pcmMaxMg} mg)` : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Ibuprofeno (100 mg/mL = 10 gts/mL)',
      doseRule: '10 mg/kg/dose (1 gt/kg)',
      formattedDose: ibuprofenoAllowed
        ? `${ibuprofenoMg} mg (${ibuprofenoGotas100} gts 100mg/mL)`
        : (ibu.restrictionReason || 'Evitar (< 6 meses / < 7 kg)'),
      maxAdultCeiling: `${ibuMaxMg} mg (${ibuMaxGotas} gts)`,
      ceilingHit: ibuprofenoAllowed && weightKg * 10 >= ibuMaxMg,
      badge: !ibuprofenoAllowed
        ? 'Evitar (< 7 kg)'
        : weightKg * 10 >= ibuMaxMg
          ? `Teto (${ibuMaxMg} mg)`
          : 'Dose ponderal',
      allowed: ibuprofenoAllowed,
      note: ibuprofenoAllowed ? undefined : ibu.restrictionReason,
    },
    {
      drug: 'Ondansetrona EV (2 mg/mL) / VO',
      doseRule: '0,15 mg/kg/dose',
      formattedDose: `${ondansetronaMg} mg (${ondansetronaMlEv} mL EV [2 mg/mL])`,
      maxAdultCeiling: `${ondaMaxMg} mg (${ondaMaxMg / ondaInjConc} mL EV)`,
      ceilingHit: weightKg * 0.15 >= ondaMaxMg,
      badge: weightKg * 0.15 >= ondaMaxMg ? `Teto adulto (${ondaMaxMg} mg)` : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Amoxicilina 250 mg/5 mL (50 mg/kg/dia)',
      doseRule: '50 mg/kg/dia divididos 8/8h',
      formattedDose: `${amoxi50Ml8h} mL 8/8h`,
      maxAdultCeiling: '500 mg 8/8h (10 mL)',
      ceilingHit: amoxi50CeilingHit,
      badge: amoxi50CeilingHit ? 'Teto adulto (500 mg/dose)' : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Amoxicilina 400 mg/5 mL (90 mg/kg/dia)',
      doseRule: '90 mg/kg/dia divididos 12/12h',
      formattedDose: `${amoxi90Ml12h} mL 12/12h`,
      maxAdultCeiling: `${amox90MaxDoseMg} mg 12/12h (${amox90MaxDoseMg / 80} mL)`,
      ceilingHit: amoxi90CeilingHit,
      badge: amoxi90CeilingHit ? `Teto adulto (${amox90MaxDoseMg} mg/dose)` : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Prednisolona 3 mg/mL',
      doseRule: '1 mg/kg/dia',
      formattedDose: `${prednisolonaMgDia} mg/dia (${prednisolonaMlDia} mL/dia)`,
      maxAdultCeiling: `${predMaxMg} mg/dia (${(predMaxMg / predConc).toFixed(1).replace('.', ',')} mL)`,
      ceilingHit: weightKg >= predMaxMg,
      badge: weightKg >= predMaxMg ? `Teto (${predMaxMg} mg/dia)` : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Dexametasona (Crupe)',
      doseRule: '0,6 mg/kg dose única',
      formattedDose: `${dexametasonaCrupeMg} mg`,
      maxAdultCeiling: `${dexaMaxMg} mg`,
      ceilingHit: weightKg * 0.6 >= dexaMaxMg,
      badge: weightKg * 0.6 >= dexaMaxMg ? `Teto adulto (${dexaMaxMg} mg)` : 'Dose ponderal',
      allowed: true,
    },
    {
      drug: 'Midazolam (Crise Convulsiva)',
      doseRule: '0,2 mg/kg IM/IN (EV: 0,1–0,2 mg/kg)',
      formattedDose: `${midazolamImEvMg} mg`,
      maxAdultCeiling: `${midMaxMg} mg`,
      ceilingHit: weightKg * 0.2 >= midMaxMg,
      badge: weightKg * 0.2 >= midMaxMg ? `Teto adulto (${midMaxMg} mg)` : 'Dose ponderal',
      allowed: true,
    },
  ];

  return {
    weightKg,
    dipironaAllowed,
    dipironaGotas,
    dipironaMlSolucao,
    dipironaMg,
    paracetamolGotas,
    paracetamolMg,
    ibuprofenoAllowed,
    ibuprofenoGotas100,
    ibuprofenoGotas50,
    ibuprofenoMg,
    ondansetronaMg,
    ondansetronaMlEv,
    amoxi50Ml8h,
    amoxi90Ml12h,
    prednisolonaMlDia,
    prednisolonaMgDia,
    dexametasonaCrupeMg,
    midazolamImEvMg,
    items,
  };
}

export interface PediatricDoseFieldContext {
  isWeightSourceInput: boolean;
  lineContext: string;
  prevLineContext: string;
  /** Linha seguinte (ex.: linha de conferência "dose de 50 mg/kg/dia") com escolhas ativas resolvidas. */
  nextLineContext?: string;
  beforeText: string;
  afterText: string;
  placeholder: string;
  weightKg: number;
  ageYears?: number | null;
  sectionId?: string;
  doses: WeightDoseSummary;
}

/**
 * Resolve o valor numérico/textual de um campo inline de prescrição pediátrica a partir do contexto da linha.
 * Retorna null quando o campo não corresponde a nenhuma regra ponderal automática.
 */
export function resolvePediatricDoseFieldValue(ctx: PediatricDoseFieldContext): string | null {
  const lineCtx = ctx.lineContext.toLowerCase();
  const prevCtx = ctx.prevLineContext.toLowerCase();
  const nextCtx = (ctx.nextLineContext || '').toLowerCase();
  const combined = `${prevCtx} ${lineCtx} ${nextCtx}`;
  const ph = ctx.placeholder.toLowerCase();
  const beforeTxt = ctx.beforeText.toLowerCase();
  const afterTxt = ctx.afterText.toLowerCase();
  const { doses, weightKg, ageYears = null } = ctx;

  // Campo de conferência de peso ("pelo peso de [ ] kg"), nunca sobrescrever Peso Prévio/Habitual/Nascimento nem perda ponderal
  if (
    !ctx.isWeightSourceInput &&
    (/^\s*kg\b/i.test(afterTxt) || /^kg$/i.test(ph)) &&
    (lineCtx.includes('peso') || beforeTxt.includes('peso')) &&
    !/\bpeso\s+(?:pr[eé]vio|habitual|anterior|ao\s+nascer|nascimento)\b/i.test(lineCtx) &&
    !/\bperda\s+de\b/i.test(beforeTxt)
  ) {
    return String(weightKg).replace('.', ',');
  }

  // Nunca autopreencher doses medicamentosas em HMA / Evolução / Exame Físico (ex.: "em casa recebeu dipirona [ ] gotas")
  if (ctx.sectionId && ctx.sectionId !== 'receita' && ctx.sectionId !== 'conduta') {
    return null;
  }

  // Gotas: identificar fármaco principal da cláusula/linha atual sem cair em alternativa "(ou Paracetamol...)"
  if (/^\s*gotas?\b/i.test(afterTxt.trimStart()) || ph.includes('gota')) {
    const stripAltTail = (s: string) =>
      s
        .replace(/\(\s*(?:ou|alternativa)\b[^)]*\)/gi, ' ')
        .split(/\s+ou\s+/i)[0]
        .trim();
    const lineSpec = matchUnifiedDrugInClause(beforeTxt, afterTxt);
    const activeSpec =
      lineSpec ||
      matchUnifiedDrugInClause(stripAltTail(lineCtx), '') ||
      matchUnifiedDrugInClause(stripAltTail(prevCtx), '');
    if (!activeSpec) return null;

    // Respeitar teto explícito citado na própria linha/título (ex.: "máx 35 gotas" em ped-78/85/86)
    const expMaxMatch = `${lineCtx} ${prevCtx}`.match(/m[aá]x\.?\s*(?:de\s*)?(?:\d+\s*(?:a|[-–])\s*)?(\d+)\s*gotas?\b/i);
    const explicitMaxGotas = expMaxMatch ? Number.parseInt(expMaxMatch[1], 10) : Number.POSITIVE_INFINITY;

    if (activeSpec.canonicalKey === 'dipirona') {
      if (!doses.dipironaAllowed) return null;
      return String(Math.min(doses.dipironaGotas, explicitMaxGotas));
    }
    if (activeSpec.canonicalKey === 'paracetamol') {
      return String(Math.min(doses.paracetamolGotas, explicitMaxGotas));
    }
    if (activeSpec.canonicalKey === 'ibuprofeno') {
      if (!doses.ibuprofenoAllowed) return null;
      return String(Math.min(doses.ibuprofenoGotas100, explicitMaxGotas));
    }
    return null;
  }

  const unitAfter = afterTxt.trimStart();
  const wantsMl = /^ml\b/i.test(unitAfter) || ph === 'ml';
  const wantsMg = /^mg\b/i.test(unitAfter) || ph === 'mg';

  // Amoxicilina e Amoxicilina + Clavulanato: suporta 45, 50, 90 mg/kg/dia explícitos sem chutar 90 para 45
  if (wantsMl && /\bamoxicilina\b/i.test(combined)) {
    const has400 = /\b400\b|80\s*mg\/ml/.test(prevCtx) || /\b400\b|80\s*mg\/ml/.test(lineCtx);
    const has250 = /\b250\b|50\s*mg\/ml/.test(prevCtx) || /\b250\b|50\s*mg\/ml/.test(lineCtx);
    const has12h = /12\s*em\s*12|12\/12/.test(lineCtx) || /12\s*em\s*12|12\/12/.test(prevCtx);
    const has8h = /8\s*em\s*8|8\/8/.test(lineCtx) || /8\s*em\s*8|8\/8/.test(prevCtx);
    const isClav = /\bclavulanat/i.test(combined);

    const mgPerMl = has400 && !has250 ? 80 : has250 && !has400 ? 50 : has12h && !has8h ? 80 : 50;
    const dosesPerDay = has12h && !has8h ? 2 : has8h && !has12h ? 3 : mgPerMl === 80 ? 2 : 3;

    // Captura dose diária explícita única (ex.: "45 mg/kg/dia", "50 mg/kg/dia", "90 mg/kg/dia")
    const rangeExplicit = /\b\d+\s*(?:[-–/]|a|ou)\s*\d+\s*mg\/kg\/dia\b/.test(combined);
    const singleExplicitMatch = combined.match(/\b(\d+(?:[.,]\d+)?)\s*mg\/kg\/dia\b/);

    let mgPerKgDay: number | null = null;
    if (!rangeExplicit && singleExplicitMatch) {
      mgPerKgDay = Number.parseFloat(singleExplicitMatch[1].replace(',', '.'));
    } else if (/\b90\s*mg\/kg\/dia\b/.test(combined) && !/\b50\s*\/\s*90\b/.test(combined)) {
      mgPerKgDay = 90;
    } else if (/\b50\s*mg\/kg\/dia\b/.test(combined) && !/\b50\s*\/\s*90\b/.test(combined)) {
      mgPerKgDay = 50;
    } else if (!isClav && !rangeExplicit) {
      mgPerKgDay = mgPerMl === 80 ? 90 : 50;
    }

    if (mgPerKgDay === null || !Number.isFinite(mgPerKgDay) || mgPerKgDay <= 0) {
      return null;
    }

    // Teto adulto por tomada: 1000 mg (12/12h ou >= 80 mg/kg/dia); 500 mg (50 mg/kg/dia 8/8h)
    const maxMgPerDose = dosesPerDay === 2 || mgPerKgDay >= 80 ? 1000 : 500;
    const mgPerDose = Math.min(maxMgPerDose, (weightKg * mgPerKgDay) / dosesPerDay);
    const mlPerDose = mgPerDose / mgPerMl;
    return mlPerDose.toFixed(1).replace('.', ',');
  }

  // Cefalexina 250 mg/5 mL (50 mg/mL), ex.: ped-88 (60 mg/kg/dia 6/6h)
  if (wantsMl && /\bcefalexina\b/i.test(combined)) {
    const has250 = /\b250\b|50\s*mg\/ml/.test(prevCtx) || /\b250\b|50\s*mg\/ml/.test(lineCtx);
    const has500 = /\b500\b|100\s*mg\/ml/.test(prevCtx) || /\b500\b|100\s*mg\/ml/.test(lineCtx);
    const doseMatch = `${lineCtx} ${nextCtx}`.match(/\b(\d+(?:[.,]\d+)?)\s*mg\/kg\/dia\b/);
    if ((has250 || has500) && doseMatch) {
      const mgPerMl = has500 && !has250 ? 100 : 50;
      const mgPerKgDay = Number.parseFloat(doseMatch[1].replace(',', '.'));
      const dosesPerDay = /6\s*em\s*6|6\/6/.test(lineCtx) ? 4 : /8\s*em\s*8|8\/8/.test(lineCtx) ? 3 : 4;
      const mgPerDose = Math.min(1000, (weightKg * mgPerKgDay) / dosesPerDay);
      return (mgPerDose / mgPerMl).toFixed(1).replace('.', ',');
    }
    return null;
  }

  // Dexclorfeniramina 0,4 mg/mL: 0,25 mL/kg/dia dividido de 8/8h (teto 1,25–2,5 mL/dose conforme idade)
  if (wantsMl && /\bdexclorfeniramina\b/i.test(combined)) {
    const mlMatch = lineCtx.match(/(\d+(?:[.,]\d+)?)\s*ml\/kg\/dia\b/);
    const mlPerKgDay = mlMatch ? Number.parseFloat(mlMatch[1].replace(',', '.')) : 0.25;
    const dosesPerDay = /8\s*em\s*8|8\/8/.test(lineCtx) ? 3 : 3;
    const predMaxMlDose = ageYears !== null && ageYears >= 6 ? 5 : 2.5;
    const mlPerDose = Math.min(predMaxMlDose, (weightKg * mlPerKgDay) / dosesPerDay);
    return mlPerDose.toFixed(1).replace('.', ',');
  }

  // Prednisolona 3 mg/mL: priorizar estritamente a unidade do próprio campo antes do parêntese explicativo
  if (/\bprednisolona\b/i.test(combined) && (wantsMl || wantsMg)) {
    const pred = getUnifiedDrugSpecByKey('prednisolona');
    const predMaxMg =
      resolveDrugCeilingForContext(pred, {
        unitKind: 'dayMg',
        ageYears,
        isPediatric: true,
      }) ?? 40;
    const mgDia = Math.min(predMaxMg, Math.round(weightKg * 1));
    const mlDia = Math.min(predMaxMg / 3, weightKg / 3).toFixed(1).replace('.', ',');
    if (wantsMl) return mlDia;
    if (wantsMg) return String(mgDia);
  }

  if (/\bondansetrona\b/i.test(combined) && (wantsMl || wantsMg)) {
    return wantsMl ? doses.ondansetronaMlEv : doses.ondansetronaMg;
  }

  if (/\bdexametasona\b/i.test(combined) && wantsMg) {
    return doses.dexametasonaCrupeMg;
  }

  return null;
}

export function hasEmptyPediatricWeight(text: string): boolean {
  return /Peso:\s*\[\s*\]\s*kg/i.test(String(text || ''));
}

export function resolvePowerActionText(
  actionId: PowerActionId,
  customPep: string,
  item?: { evolucao_body?: string; conduta_body?: string; receita_body?: string; has_receita?: boolean } | null,
  options?: { medsOnly?: boolean; sanitizeOpts?: SanitizePepOptions }
): PowerActionOutput {
  const bodies = extractBodiesFromCustomPep(customPep, item, options?.sanitizeOpts);
  let label = 'Tudo';
  let text = bodies.pep_body;

  switch (actionId) {
    case 1:
      label = 'Tudo';
      text = bodies.pep_body;
      break;
    case 2:
      label = 'Evolução';
      text = bodies.evolucao_body;
      break;
    case 3:
      label = 'Conduta';
      text = bodies.conduta_body;
      break;
    case 4:
      label = options?.medsOnly ? 'Receita (Só Meds)' : 'Receita';
      text = options?.medsOnly ? bodies.receita_meds_body : bodies.receita_body;
      break;
    case 5:
      label = 'Orientações';
      text = bodies.orientacoes_body;
      break;
    default: {
      const _exhaustive: never = actionId;
      throw new Error(`PowerAction desconhecida: ${String(_exhaustive)}`);
    }
  }

  return {
    actionId,
    label,
    text,
    pendingGaps: detectPendingGaps(text),
  };
}

// ============================================================================
// MODO EDIÇÃO LIVRE UNIDIRECIONAL (COM TRAVA DE FONTE DA VERDADE & UNDO STACK)
// ============================================================================
export interface FreeEditSessionState {
  active: boolean;
  initialText: string;
  currentText: string;
  dirty: boolean;
  undoStack: string[];
  confirmingDiscard: boolean;
}

export function createFreeEditState(initialCompiledText: string): FreeEditSessionState {
  const cleanInitial = String(initialCompiledText || '');
  return {
    active: true,
    initialText: cleanInitial,
    currentText: cleanInitial,
    dirty: false,
    undoStack: [cleanInitial],
    confirmingDiscard: false
  };
}

export function pushFreeEditSnapshot(state: FreeEditSessionState, nextText: string): FreeEditSessionState {
  const text = String(nextText ?? '');
  if (text === state.currentText) return state;
  const nextStack = [...state.undoStack, text];
  if (nextStack.length > 40) {
    nextStack.shift();
  }
  return {
    ...state,
    currentText: text,
    dirty: text !== state.initialText,
    undoStack: nextStack,
    confirmingDiscard: false
  };
}

export function undoFreeEditSnapshot(state: FreeEditSessionState): FreeEditSessionState {
  if (!state.undoStack || state.undoStack.length <= 1) {
    return {
      ...state,
      currentText: state.initialText,
      dirty: false,
      confirmingDiscard: false
    };
  }
  const nextStack = state.undoStack.slice(0, -1);
  const prevText = nextStack[nextStack.length - 1];
  return {
    ...state,
    currentText: prevText,
    dirty: prevText !== state.initialText,
    undoStack: nextStack,
    confirmingDiscard: false
  };
}

