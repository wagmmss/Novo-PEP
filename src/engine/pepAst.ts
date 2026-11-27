// ============================================================================
// PARSER AST ÚNICO DO PEP (src/engine/pepAst.ts)
// Fonte única da verdade para:
//   1. Renderização DOM interativa (src/ui/pep/pepAstRenderer.ts)
//   2. Serialização de texto clínico limpo para cópia (src/ui/pep/pepCopyEngine.ts)
//   3. Cálculo inline em tempo real de fórmulas ponderais (DoseFormulaNode)
//   4. Pré-seleção clínica inteligente por idade, gestação e TFG/ClCr
// ============================================================================

import {
  getUnifiedDrugSpecByKey,
  matchUnifiedDrugInClause,
  resolveDrugCeilingForContext,
  type PediatricAgeCeiling,
  type UnifiedDrugDoseSpec,
} from '../data/farmacos.ts';
import {
  formatMultiChoices,
  inferVitalSignRole,
  isConditionalDefaultOffBracket,
  isContraindicationWarningBracket,
  isInternalInstructionBracket,
  isSecondaryOptionBracket,
  parseBalancedBrackets,
  parseChoiceGroupToken,
} from './personalizar.ts';
import type { ClinicalContext } from './clinicalContext.ts';

// ----------------------------------------------------------------------------
// CONTRATOS TIPADOS DA AST (PepAstNode)
// ----------------------------------------------------------------------------

export interface TextNode {
  kind: 'text';
  id: string;
  value: string;
}

export interface InlineInputNode {
  kind: 'inline-input';
  id: string;
  origBracket: string;
  inner: string;
  placeholder: string;
  defaultValue: string;
  isEmpty: boolean;
  isSubInput: boolean;
  maskType?: 'date-full' | 'date-short' | 'time';
  obstetricRole?: 'dum' | 'dpp' | 'ig-dum-w' | 'ig-dum-d' | 'ig-usg-w' | 'ig-usg-d' | 'ig-def-w' | 'ig-def-d';
  anthroRole?: 'peso' | 'altura' | 'imc';
  vitalRole?: string;
  mirrorRole?: 'nome' | 'idade' | 'peso';
  usgRole?: 'usg-date' | 'usg-w' | 'usg-d' | 'usg-ccn';
  beforeText: string;
  afterText: string;
}

export type DoseFormulaUnit =
  | 'mg/kg/dia'
  | 'mg/kg/dose'
  | 'mg/kg/min'
  | 'mL/kg'
  | 'mL/kg/h'
  | 'mL/kg/dia'
  | 'gotas/kg'
  | 'mcg/kg'
  | 'mcg/kg/min'
  | 'UI/kg/h'
  | 'UI/kg/dia'
  | 'g/kg';

export interface DoseFormulaNode {
  kind: 'dose-formula';
  id: string;
  raw: string;
  canonicalKey?: string;
  drugHint: string;
  dosePerKgMin: number;
  dosePerKgMax?: number;
  unit: DoseFormulaUnit;
  /** Teto adulto inferido pelo fármaco ou texto adjacente */
  maxAdultValue?: number;
  maxAdultUnit?: 'mg/dia' | 'mg/dose' | 'mL' | 'gotas';
  /** Tetos condicionais por idade (ex.: Prednisolona <2a 20 mg, 2-5a 30 mg, >5a 40 mg) */
  ageCeilings?: PediatricAgeCeiling[];
  /** Número de tomadas diárias se o contexto mencionar (ex: 8/8h -> 3) */
  dosesPerDay?: number;
}

export interface ChoiceOptionAst {
  id: string;
  index: number;
  rawText: string;
  isDefault: boolean;
  isUsgOption: boolean;
  children: Array<TextNode | InlineInputNode>;
}

export interface ChoiceGroupNode {
  kind: 'choice-group';
  id: string;
  isExplicitMulti: boolean;
  isLikelyMulti: boolean;
  hasDefault: boolean;
  beforeText: string;
  options: ChoiceOptionAst[];
}

export interface OptionalNode {
  kind: 'optional';
  id: string;
  label: string;
  defaultOpen: boolean;
  needsLeadingSpace: boolean;
  children: PepInlineNode[];
}

export interface TravaAlertNode {
  kind: 'trava-alert';
  id: string;
  rawBracket: string;
  label: string;
  severity: 'danger' | 'conditional' | 'option-group';
  isSafetyWarning: boolean;
  isSecondaryOption: boolean;
  isOptionGroupItem: boolean;
  defaultExcluded: boolean;
}

export type PepInlineNode =
  | TextNode
  | InlineInputNode
  | DoseFormulaNode
  | ChoiceGroupNode
  | OptionalNode
  | TravaAlertNode;

export interface HeadingNode {
  kind: 'heading';
  id: string;
  lineIndex: number;
  level: 1 | 2 | 3;
  isSubheading: boolean;
  isDocBanner: boolean;
  isObjectiveSection: boolean;
  rawLine: string;
  cleanTitle: string;
  children: PepInlineNode[];
}

export interface ParagraphNode {
  kind: 'paragraph';
  id: string;
  lineIndex: number;
  rawLine: string;
  indent: string;
  isEmptyLine: boolean;
  isMetaLine: boolean;
  checkbox?: {
    checked: boolean;
    prefix: string;
  };
  isSecondaryBlockStart: boolean;
  isConditionalBlockHeader: boolean;
  children: PepInlineNode[];
}

export type PepBlockNode = HeadingNode | ParagraphNode;
export type PepAstNode = PepBlockNode | PepInlineNode;

export interface PepDocumentAst {
  cacheKey: string;
  protocolId: string;
  rawHash: string;
  blocks: PepBlockNode[];
  stats: {
    headings: number;
    paragraphs: number;
    choiceGroups: number;
    optionals: number;
    inputs: number;
    doseFormulas: number;
    travaAlerts: number;
  };
}

export interface EvaluatedDoseFormula {
  formattedBadge: string;
  plainText: string;
  minTotal: number;
  maxTotal?: number;
  unitLabel: string;
  ceilingHit: boolean;
  perDoseText?: string;
  /** false quando há contraindicação ponderal/etária (ex.: Dipirona < 5 kg ou Ibuprofeno < 7 kg) */
  allowed?: boolean;
  contraindicationReason?: string;
}

export interface AstSelectionState {
  inputValues: Record<string, string>;
  /** Mapa choiceGroupId -> índices das opções selecionadas */
  choiceSelections: Record<string, number[]>;
  /** Mapa choiceGroupId -> modo multi ativo */
  choiceMultiModes: Record<string, boolean>;
  /** Mapa optionalId -> está aberto/incluído */
  optionalOpen: Record<string, boolean>;
  /** Mapa travaAlertId -> está excluído/suspenso */
  travaExcluded: Record<string, boolean>;
  /** Mapa blockId -> checkbox marcado */
  checkboxStates: Record<string, boolean>;
  /** Mapa blockId -> item numerado excluído manualmente pelo usuário (ex.: retirar fármaco da receita em 1 clique) */
  excludedBlocks?: Record<string, boolean>;
  /** IDs de nós explicitamente alterados pelo usuário (nunca sobrescritos por pré-seleção automática) */
  userEditedNodes: Record<string, boolean>;
}

export interface SerializeAstOptions {
  keepEmptyBrackets?: boolean;
  includeDoseFormulaCalc?: boolean;
  /** Quando true, omite avisos de contraindicação [NÃO PRESCREVER SE...] do texto copiado (ex.: receita para o paciente). */
  stripSafetyWarnings?: boolean;
  blockSubsetIndices?: Set<number>;
  /**
   * Marcadores de auditoria (uso interno da trava de cópia): quando definidos,
   * campos inline vazios e escolhas sem seleção são emitidos com estes tokens
   * para contagem exata de lacunas. Nunca usar no texto copiado.
   */
  gapMarkers?: { emptyInput: string; emptyIdentification: string; unselectedChoice: string };
}

/**
 * Campo com valor sugerido já legível no texto copiado (ex.: "[3 a 5] mL", "[1 a 2]", "[1.000 mg]")
 * ou rótulo em caixa alta.
 * Na trava de cópia é tratado como preenchido.
 */
export function isSuggestedValueInput(node: InlineInputNode): boolean {
  if (isIdentificationInput(node)) return false;
  if (node.vitalRole) return false;
  const ph = (node.placeholder || '').trim();
  // Rótulos em CAIXA ALTA entre colchetes ("[MEDICAÇÃO SINTOMÁTICA E SUPORTE]") são cabeçalhos, não lacunas
  if (ph.length >= 6 && /[A-ZÀ-Ý]/.test(ph) && !/[a-zà-ÿ]/.test(ph)) return true;
  // Nunca isentar dose fixa solta logo após "Dar/Administrar/Aplicar [N]" antes de gotas/mL/mg
  if (/^\s*(?:dar|administrar|aplicar)\s*$/i.test(node.beforeText) && /^\d+(?:[.,]\d+)?$/i.test(ph)) {
    return false;
  }
  return /^\d[\d.,]*(?:\s*(?:a|-|–|ou)\s*\d[\d.,]*)?(?:\s*(?:mg|mcg|g|ml|gotas?|cp|comprimidos?|ui|h|dias?))?$/i.test(ph);
}

/**
 * Campos de identificação (Nome, Idade, Data) que o PEP institucional costuma preencher sozinho.
 * Na trava de cópia geram apenas aviso, nunca bloqueio.
 */
export function isIdentificationInput(node: InlineInputNode): boolean {
  if (node.mirrorRole === 'nome' || node.mirrorRole === 'idade') return true;
  if (node.maskType === 'date-full' || node.maskType === 'date-short' || node.maskType === 'time') return true;
  return /^(?:nome|leito|registro|prontu[aá]rio|dd\/mm|mm\/aaaa|hh:mm)/i.test((node.placeholder || '').trim());
}

// ----------------------------------------------------------------------------
// HELPERS DETERMINÍSTICOS DE CLASSIFICAÇÃO E INFERÊNCIA
// ----------------------------------------------------------------------------

function computeShortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isLikelyMultiGroup(beforeText: string, options: string[]): boolean {
  const bef = String(beforeText || '').toLowerCase();
  const joined = options.join(' ').toLowerCase();
  if (
    bef.includes('comorbidade') ||
    bef.includes('antecedente') ||
    bef.includes('hábito') ||
    bef.includes('fator') ||
    bef.includes('sintoma') ||
    bef.includes('queixa') ||
    bef.includes('medicaç') ||
    bef.includes('exame') ||
    bef.includes('solicitaç')
  ) {
    return true;
  }
  if (joined.includes('outros') && (joined.includes('nega') || joined.includes('hígid'))) {
    return true;
  }
  return false;
}

export function inferSmartPlaceholder(inner: string, beforeText: string, afterText: string): string {
  const cleanInner = inner.trim();
  if (cleanInner && cleanInner !== '+/-') {
    return cleanInner.replace(/:\s*$/, '');
  }
  const bef = (beforeText || '').trim();
  const aft = (afterText || '').trim();

  if (/G$/i.test(bef)) return 'G';
  if (/P$/i.test(bef)) return 'P';
  if (/PN\s*$/i.test(bef)) return 'PN';
  if (/PC\s*$/i.test(bef)) return 'PC';
  if (/A$/i.test(bef)) return 'A';
  if (/DUM:\s*$/i.test(bef)) return 'sem';
  if (/s$/i.test(bef) && /^d\b/i.test(aft)) return 'd';
  if (/^s\[/i.test(aft) || /^s\b/i.test(aft) || /^semanas/i.test(aft)) return 'sem';
  if (/^dias/i.test(aft) || /^d\b/i.test(aft)) return 'dias';
  if (/CCN\s+de\s*$/i.test(bef) || /^mm\b/i.test(aft)) return 'mm';
  if (/Peso[^:]*:\s*$/i.test(bef)) return 'kg';
  if (/Altura:\s*$/i.test(bef)) return 'm';
  if (/IMC:\s*$/i.test(bef)) return 'IMC';
  if (/AU:\s*$/i.test(bef) || /^cm\b/i.test(aft)) return 'cm';
  if (/BCF[^:]*:\s*$/i.test(bef) || /^bpm\b/i.test(aft)) return 'bpm';
  if (/PA[^:]*:\s*$/i.test(bef)) return 'PAS';
  if (/x$/i.test(bef) && /^mmHg/i.test(aft)) return 'PAD';
  if (/FC:\s*$/i.test(bef)) return 'bpm';
  if (/FR:\s*$/i.test(bef)) return 'irpm';
  if (/SpO2:\s*$/i.test(bef)) return '%';
  if (/Tax[^:]*:\s*$/i.test(bef)) return '°C';
  if (/Leito[^:]*:\s*$/i.test(bef)) return 'Leito';
  if (/Profissão:\s*$/i.test(bef)) return 'Profissão';
  if (/Lote[^:]*:\s*$/i.test(bef)) return 'Lote';
  if (/Leucócitos:\s*$/i.test(bef)) return '/mm³';
  if (/PCR:\s*$/i.test(bef)) return 'mg/L';
  if (/Hb[^:]*:\s*$/i.test(bef)) return 'g/dL';
  if (/PFE:\s*$/i.test(bef) || /^g\b/i.test(aft)) return 'g';
  if (cleanInner === '+/-') return '+/- kg';
  return '...';
}

function inferChoiceSubInputPlaceholder(
  subInner: string,
  bef: string,
  aft: string,
  groupBeforeText: string
): string {
  if (subInner && subInner !== '+/-') {
    return inferSmartPlaceholder(subInner, bef, aft);
  }
  const gBef = String(groupBeforeText || '').toLowerCase();
  if (!bef.trim()) {
    if (gBef.includes('comorbidade')) return 'Outra...';
    if (gBef.includes('alergia')) return 'Alérgica a...';
    if (gBef.includes('sorologia')) return 'Outro resultado...';
    if (gBef.includes('planejamento')) return 'Outro método...';
    return 'Digitar...';
  }
  return inferSmartPlaceholder(subInner, bef, aft);
}

function inferInputMetadata(
  inner: string,
  beforeText: string,
  afterText: string,
  lineContext: string,
  nextBracketInner?: string
): Pick<InlineInputNode, 'maskType' | 'obstetricRole' | 'anthroRole' | 'vitalRole' | 'mirrorRole'> {
  const cleanInner = inner.trim();
  const lowLine = (lineContext || '').toLowerCase();
  const lowBefore = (beforeText || '').toLowerCase();

  let maskType: InlineInputNode['maskType'];
  if (/^DD\/MM\/AAAA$/i.test(cleanInner)) maskType = 'date-full';
  else if (/^DD\/MM$/i.test(cleanInner)) maskType = 'date-short';
  else if (/^HH:MM$/i.test(cleanInner)) maskType = 'time';

  let obstetricRole: InlineInputNode['obstetricRole'];
  if (maskType === 'date-full') {
    if (/\bdum\b/.test(lowBefore) || (/\bdum\b/.test(lowLine) && !/\bdpp\b/.test(lowBefore))) {
      obstetricRole = 'dum';
    } else if (/\bdpp\b/.test(lowBefore)) {
      obstetricRole = 'dpp';
    }
  } else {
    const isWeeks = /^s\[|^s\b|^semanas/i.test(afterText.trim());
    const isDays = /s$/i.test(beforeText.trim()) && /^d\b/i.test(afterText.trim());
    if (isWeeks || isDays) {
      if (lowLine.includes('ig cronológica') || lowLine.includes('ig dum') || lowBefore.includes('dum:')) {
        obstetricRole = isWeeks ? 'ig-dum-w' : 'ig-dum-d';
      } else if (lowLine.includes('ig usg') || lowBefore.includes('usg:')) {
        obstetricRole = isWeeks ? 'ig-usg-w' : 'ig-usg-d';
      } else if (lowLine.includes('ig definitiva') || lowLine.includes('ig:') || lowLine.includes('ig hoje')) {
        obstetricRole = isWeeks ? 'ig-def-w' : 'ig-def-d';
      }
    }
  }

  const hasWeightFormulaNoise = /[x*\/+=]|\d/i.test(cleanInner);
  let anthroRole: InlineInputNode['anthroRole'];
  if (!hasWeightFormulaNoise && (/peso[^:]*:\s*$/i.test(beforeText) || /^peso(?:\s+(?:atual|kg|em\s+kg))?$/i.test(cleanInner))) {
    anthroRole = 'peso';
  } else if (/altura:\s*$/i.test(beforeText) || /^altura$/i.test(cleanInner)) {
    anthroRole = 'altura';
  } else if (/imc:\s*$/i.test(beforeText) || /^imc$/i.test(cleanInner)) {
    anthroRole = 'imc';
  }

  const nextIsAgeUnit = Boolean(
    nextBracketInner &&
      /(?:mes(?:es)?|anos?)\s*\/\s*(?:anos?|mes(?:es)?)/i.test(nextBracketInner) &&
      afterText.trim() === ''
  );

  let mirrorRole: InlineInputNode['mirrorRole'];
  if (/^nome$/i.test(cleanInner) || /(?:paciente|nome)\s*:\s*$/i.test(beforeText)) {
    mirrorRole = 'nome';
  } else if (
    /^idade$/i.test(cleanInner) ||
    /\bidade\s*:\s*$/i.test(beforeText) ||
    (cleanInner === '' && nextIsAgeUnit && /\bid\s*:/i.test(lowLine))
  ) {
    mirrorRole = 'idade';
  } else if (anthroRole === 'peso') {
    mirrorRole = 'peso';
  }

  const vitalRole = inferVitalSignRole(beforeText, afterText, cleanInner) || undefined;

  return { maskType, obstetricRole, anthroRole, vitalRole, mirrorRole };
}

// ----------------------------------------------------------------------------
// DETECÇÃO DE FÓRMULAS PONDERAIS INLINE (DoseFormulaNode)
// ----------------------------------------------------------------------------

interface AdultCeilingHint {
  pattern: RegExp;
  drugHint: string;
  maxAdultDayMg?: number;
  maxAdultDoseMg?: number;
  maxAdultMl?: number;
  maxAdultGotas?: number;
}

const DOSE_NUMBER_TOKEN = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';

const DOSE_FORMULA_REGEX = new RegExp(
  `(${DOSE_NUMBER_TOKEN}(?:\\s*(?:[-–a]|até)\\s*${DOSE_NUMBER_TOKEN})?)\\s*` +
    `(mg\\/kg\\/(?:dia|dose|min)|mg\\/kg|mL\\/kg\\/(?:h|hora|dia)|ml\\/kg\\/(?:h|hora|dia)|mL\\/kg|ml\\/kg|gotas?\\/kg|mcg\\/kg\\/(?:min|h|hora)|mcg\\/kg|UI\\/kg\\/(?:dia|h|hora)|g\\/kg)(?![\\/\\wÀ-ÿ])`,
  'gi'
);

function parsePtBrDoseNumber(raw: string): number {
  const s = String(raw || '').trim();
  if (!s) return Number.NaN;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) {
    return Number.parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return Number.parseFloat(s.replace(',', '.'));
}

function inferDosesPerDayFromClause(clauseText: string): number | undefined {
  const m = clauseText.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*h\b/i);
  if (m) {
    const h = Number.parseInt(m[1], 10);
    if (h > 0 && h <= 24) return Math.round(24 / h);
  }
  const mem = clauseText.match(/\bde\s+(\d{1,2})\s+em\s+\d{1,2}\s*horas?\b/i);
  if (mem) {
    const h = Number.parseInt(mem[1], 10);
    if (h > 0 && h <= 24) return Math.round(24 / h);
  }
  const mx = clauseText.match(/\b(\d)\s*x\s*(?:\/|\s*ao\s*)?dia\b/i);
  if (mx) {
    const n = Number.parseInt(mx[1], 10);
    if (n >= 1 && n <= 6) return n;
  }
  if (/\bdose\s+[úu]nica\s+di[aá]ria\b/i.test(clauseText)) return 1;
  return undefined;
}

const COMBO_JOINERS_PROTECTED_RE =
  /\b(?:amoxicilina|sulfametoxazol|ampicilina|piperacilina|trimetoprima|clavulanat|tazobactam|sulbactam)\b/i;

function isDrugSplitBoundary(buf: string, idx: number): 'back-sep' | 'fwd-sep' | null {
  const ch = buf[idx];
  if (ch === ';' || ch === '|') return 'back-sep';
  if (ch === '+') {
    const around = buf.slice(Math.max(0, idx - 22), Math.min(buf.length, idx + 22));
    if (!COMBO_JOINERS_PROTECTED_RE.test(around)) {
      return 'back-sep';
    }
  }
  return null;
}

function isolateClauseAroundFormula(
  text: string,
  matchStart: number,
  matchEnd: number,
  lineContext: string
): { before: string; after: string; hadExplicitClauseBreakBefore: boolean } {
  // Retrocede até um delimitador real de cláusula/fármaco
  let cStart = 0;
  let hadExplicitBreak = false;
  for (let i = matchStart - 1; i >= 0; i--) {
    if (isDrugSplitBoundary(text, i)) {
      cStart = i + 1;
      hadExplicitBreak = true;
      break;
    }
    // Quebra em " OU " / " ou "
    if (
      (text[i] === ' ' || text[i] === '(') &&
      /^(?:ou)\b/i.test(text.slice(i + 1, Math.min(text.length, i + 4))) &&
      (i + 3 >= text.length || /[\s:;,)]/.test(text[i + 3]))
    ) {
      cStart = i + 3;
      hadExplicitBreak = true;
      break;
    }
    // Parêntese de abertura com "+ " ou "ou " logo dentro: "(+ Oxacilina..." / "(ou Claritromicina..."
    if (text[i] === '(' && /^\s*(?:\+|ou\b)/i.test(text.slice(i + 1, matchStart))) {
      cStart = i + 1;
      hadExplicitBreak = true;
      break;
    }
    // Fim de frase ". " ou "! " (não abreviatura tipo "EV." ou "máx." ou decimal)
    if (text[i] === '!' || (text[i] === '.' && text[i + 1] === ' ' && !/\b(?:m[aá]x|obs|aprox|min|seg|sol)\s*$/i.test(text.slice(Math.max(0, i - 6), i)))) {
      cStart = i + 1;
      hadExplicitBreak = true;
      break;
    }
  }

  // Se o texto antes dentro da cláusula começa após aviso negativo ("EVITAR ..."), descartar o aviso
  let rawBefore = text.slice(cStart, matchStart);
  const negAlertMatch = rawBefore.match(/.*?\b(?:EVITAR|PROIBIR|NUNCA(?:\s+USAR)?|CONTRAINDICAD[OA])\b[^.;!]*?(?:[!.;]|\be\b)\s*/i);
  if (negAlertMatch) {
    rawBefore = rawBefore.slice(negAlertMatch[0].length);
    hadExplicitBreak = true;
  }

  // Avança até o fim da cláusula do fármaco atual
  let cEnd = text.length;
  let parenDepth = 0;
  for (let i = matchEnd; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      const lookahead = text.slice(i + 1, Math.min(text.length, i + 48));
      // Parêntese que abre outro fármaco ou alerta de contraindicação interrompe a cláusula
      if (/^\s*(?:\+|ou\b|aten[çc][aã]o\s*:|evitar\b|nunca\b|proibir\b)/i.test(lookahead)) {
        cEnd = i;
        break;
      }
      parenDepth++;
    } else if (ch === ')') {
      if (parenDepth === 0) {
        cEnd = i;
        break;
      }
      parenDepth--;
    } else if (parenDepth === 0) {
      const boundary = isDrugSplitBoundary(text, i);
      if (boundary) {
        const afterSep = text.slice(i + 1, Math.min(text.length, i + 45));
        const isSameFormulaQualifier =
          text[i] === ';' &&
          /^\s*(?:dose\s+)?(?:m[aá]x(?:imo|\.)?|teto\b|dividid|fracionad|em\s+\d+\s*(?:doses?|tomadas?)|at[eé]\s+\d|\d+\s*\/\s*\d+\s*h\b|de\s+\d+\s+em\s+\d+)/i.test(
            afterSep
          );
        if (!isSameFormulaQualifier) {
          cEnd = i;
          break;
        }
      }
      if (
        (ch === ' ' || ch === ';') &&
        /^ou\b/i.test(text.slice(i + 1, Math.min(text.length, i + 4))) &&
        (i + 3 >= text.length || /[\s:;,()]/.test(text[i + 3]))
      ) {
        cEnd = i;
        break;
      }
      if (ch === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
        const beforeDot = text.slice(Math.max(matchEnd, i - 5), i);
        if (!/\bm[aá]x$/i.test(beforeDot)) {
          cEnd = i;
          break;
        }
      }
    }
  }

  // Caso o token começou após um colchete/input e não teve separador, buscar prefixo imediato no lineContext
  if (!hadExplicitBreak && cStart === 0 && !matchUnifiedDrugInClause(rawBefore, '') && lineContext && lineContext !== text) {
    const tokPos = lineContext.indexOf(text);
    if (tokPos > 0) {
      const prefix = lineContext.slice(Math.max(0, tokPos - 120), tokPos);
      const splitPrefix = prefix.split(/[;|!]|\s+\+\s+|\s+ou\s+/i).pop() || '';
      rawBefore = `${splitPrefix}${rawBefore}`;
    }
  }

  return {
    before: rawBefore,
    after: text.slice(matchEnd, cEnd),
    hadExplicitClauseBreakBefore: hadExplicitBreak,
  };
}

function normalizeFormulaUnit(unitRaw: string): DoseFormulaUnit {
  const u = unitRaw.toLowerCase().replace('/hora', '/h');
  if (u === 'mg/kg/dia') return 'mg/kg/dia';
  if (u === 'mg/kg/dose' || u === 'mg/kg') return 'mg/kg/dose';
  if (u === 'mg/kg/min') return 'mg/kg/min';
  if (u === 'ml/kg') return 'mL/kg';
  if (u === 'ml/kg/h') return 'mL/kg/h';
  if (u === 'ml/kg/dia') return 'mL/kg/dia';
  if (u === 'mcg/kg/min') return 'mcg/kg/min';
  if (u === 'mcg/kg' || u === 'mcg/kg/h') return 'mcg/kg';
  if (u === 'ui/kg/h') return 'UI/kg/h';
  if (u === 'ui/kg/dia') return 'UI/kg/dia';
  if (u === 'g/kg') return 'g/kg';
  return 'gotas/kg';
}

function splitTextWithDoseFormulas(
  text: string,
  lineContext: string,
  nextId: (prefix: string) => string,
  inheritedDrugSpec?: UnifiedDrugDoseSpec | null
): Array<TextNode | DoseFormulaNode> {
  if (!text) return [];
  DOSE_FORMULA_REGEX.lastIndex = 0;
  if (!DOSE_FORMULA_REGEX.test(text)) {
    return [{ kind: 'text', id: nextId('txt'), value: text }];
  }

  const out: Array<TextNode | DoseFormulaNode> = [];
  DOSE_FORMULA_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const isPediatricContextLine =
    /\b(?:pedi[aá]tr|crian[çc]a|lactente|gotas\/kg|gotas|1\s*gota\/kg)\b/i.test(lineContext) ||
    Boolean(inheritedDrugSpec);

  while ((match = DOSE_FORMULA_REGEX.exec(text)) !== null) {
    const start = match.index;
    const rawMatch = match[0];
    const end = start + rawMatch.length;
    if (start > lastIndex) {
      out.push({ kind: 'text', id: nextId('txt'), value: text.slice(lastIndex, start) });
    }

    const numPart = match[1];
    const unit = normalizeFormulaUnit(match[2]);
    const nums = numPart
      .split(/\s*(?:[-–a]|até)\s*/i)
      .map(parsePtBrDoseNumber)
      .filter((n) => Number.isFinite(n) && n > 0);

    const { before: clauseBefore, after: clauseAfter } = isolateClauseAroundFormula(
      text,
      start,
      end,
      lineContext
    );

    const clauseSpec =
      matchUnifiedDrugInClause(clauseBefore, clauseAfter) || inheritedDrugSpec || null;

    const dosesPerDay =
      unit === 'mg/kg/dia' || unit === 'mL/kg/dia' || unit === 'UI/kg/dia'
        ? inferDosesPerDayFromClause(`${clauseBefore} ${clauseAfter}`)
        : undefined;

    let maxAdultValue: number | undefined;
    let maxAdultUnit: DoseFormulaNode['maxAdultUnit'];
    let ageCeilings: PediatricAgeCeiling[] | undefined;

    // 1) Teto explícito na cláusula imediata após a fórmula (ordem: gotas? antes de g, com fronteira \b)
    // Ignorar teto condicional por idade quando há múltiplas faixas ("em < 2 anos... em > 5 anos")
    const afterWindow = clauseAfter.slice(0, 95);
    const hasAgeQualifiedMax = /(?:m[aá]x\.?(?:imo)?|teto)\s*(?:de|:)?\s*[^;\n)]*\b(?:em\s*(?:<|<=|>=|>|\d)|anos?|mes(?:es)?)\b/i.test(
      afterWindow
    );

    if (hasAgeQualifiedMax) {
      // Extrai múltiplas faixas etárias explícitas, se existirem (ex.: Pediatria Asma / Convulsão Febril)
      const bandMatches = Array.from(
        afterWindow.matchAll(
          new RegExp(
            `(?:m[aá]x(?:imo|\\.)?|teto)?\\s*(${DOSE_NUMBER_TOKEN})\\s*(gotas?|mg|ml|g)\\b\\s*(?:em|para)?\\s*(?:(<|<=|>=|>)?\\s*(\\d+)(?:\\s*[-–a]\\s*(\\d+))?\\s*anos?)`,
            'gi'
          )
        )
      );
      if (bandMatches.length >= 2) {
        const parsedBands: PediatricAgeCeiling[] = [];
        for (const bm of bandMatches) {
          const valRaw = parsePtBrDoseNumber(bm[1]);
          const uRaw = bm[2].toLowerCase();
          const mgVal = uRaw === 'g' ? valRaw * 1000 : valRaw;
          const op = (bm[3] || '').trim();
          const a1 = Number.parseInt(bm[4], 10);
          const a2 = bm[5] ? Number.parseInt(bm[5], 10) : undefined;
          const cutoff = a2 !== undefined ? a2 + 0.01 : op === '<' ? a1 : op.startsWith('>') ? 18 : a1 + 1;
          parsedBands.push(
            unit === 'mg/kg/dia'
              ? { maxAgeYearsExclusive: cutoff, maxDailyMg: mgVal }
              : { maxAgeYearsExclusive: cutoff, maxSingleMg: mgVal }
          );
        }
        if (parsedBands.length > 0) {
          ageCeilings = parsedBands;
          const topBandVal = Math.max(
            ...parsedBands.map((b) => b.maxDailyMg ?? b.maxSingleMg ?? 0)
          );
          if (topBandVal > 0) {
            maxAdultValue = topBandVal;
            maxAdultUnit = unit === 'mg/kg/dia' ? 'mg/dia' : 'mg/dose';
          }
        }
      }
    } else {
      const explicitMax = afterWindow.match(
        new RegExp(
          `(?:m[aá]x(?:imo|\\.)?|teto)\\s*(?:de|:)?\\s*(?:${DOSE_NUMBER_TOKEN}\\s*(?:a|[-–])\\s*)?(${DOSE_NUMBER_TOKEN})\\s*(gotas?|mg|ml|g)\\b`,
          'i'
        )
      );
      if (explicitMax) {
        const parsedMax = parsePtBrDoseNumber(explicitMax[1]);
        const mUnit = explicitMax[2].toLowerCase();
        if (Number.isFinite(parsedMax) && parsedMax > 0) {
          if (mUnit === 'g') {
            maxAdultValue = parsedMax * 1000;
            maxAdultUnit = unit === 'mg/kg/dia' ? 'mg/dia' : 'mg/dose';
          } else if (mUnit === 'mg') {
            maxAdultValue = parsedMax;
            maxAdultUnit = unit === 'mg/kg/dia' ? 'mg/dia' : 'mg/dose';
          } else if (mUnit === 'ml') {
            maxAdultValue = parsedMax;
            maxAdultUnit = 'mL';
          } else {
            maxAdultValue = parsedMax;
            maxAdultUnit = 'gotas';
          }
        }
      }
    }

    // 2) Fallback para fonte única farmacológica (apenas unidade compatível, nunca volume genérico para taxas)
    if (maxAdultValue === undefined && clauseSpec) {
      if (clauseSpec.pediatricAgeCeilings && !ageCeilings) {
        ageCeilings = clauseSpec.pediatricAgeCeilings;
      }
      if (unit === 'mg/kg/dia') {
        const c = resolveDrugCeilingForContext(clauseSpec, {
          unitKind: 'dayMg',
          isPediatric: isPediatricContextLine,
        });
        if (c) {
          maxAdultValue = c;
          maxAdultUnit = 'mg/dia';
        }
      } else if (unit === 'mg/kg/dose') {
        const c = resolveDrugCeilingForContext(clauseSpec, {
          unitKind: 'doseMg',
          isPediatric: isPediatricContextLine,
        });
        if (c) {
          maxAdultValue = c;
          maxAdultUnit = 'mg/dose';
        }
      } else if (unit === 'mL/kg') {
        const c = resolveDrugCeilingForContext(clauseSpec, { unitKind: 'ml' });
        if (c) {
          maxAdultValue = c;
          maxAdultUnit = 'mL';
        }
      } else if (unit === 'gotas/kg') {
        const c = resolveDrugCeilingForContext(clauseSpec, { unitKind: 'gotas' });
        if (c) {
          maxAdultValue = c;
          maxAdultUnit = 'gotas';
        }
      }
    }

    if (nums.length > 0) {
      out.push({
        kind: 'dose-formula',
        id: nextId('dose'),
        raw: rawMatch,
        canonicalKey: clauseSpec?.canonicalKey,
        drugHint: clauseSpec?.drugHint || '',
        dosePerKgMin: nums[0],
        dosePerKgMax: nums.length > 1 ? nums[1] : undefined,
        unit,
        maxAdultValue,
        maxAdultUnit,
        ageCeilings,
        dosesPerDay,
      });
    } else {
      out.push({ kind: 'text', id: nextId('txt'), value: rawMatch });
    }

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    out.push({ kind: 'text', id: nextId('txt'), value: text.slice(lastIndex) });
  }

  return out;
}

/**
 * Calcula em tempo real o valor de um DoseFormulaNode dado o peso do paciente,
 * respeitando restrições ponderais/etárias e tetos da fonte única.
 */
export function evaluateDoseFormula(
  node: DoseFormulaNode,
  weightKg: number | null,
  ageYears: number | null = null
): EvaluatedDoseFormula | null {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  if (node.canonicalKey) {
    const spec = getUnifiedDrugSpecByKey(node.canonicalKey);
    const minWeightFail = spec.minWeightKg !== undefined && weightKg < spec.minWeightKg;
    const minAgeFail =
      spec.minAgeMonths !== undefined && ageYears !== null && ageYears * 12 < spec.minAgeMonths;
    if (minWeightFail || minAgeFail) {
      const reason = spec.restrictionReason || `Evitar em < ${spec.minWeightKg} kg`;
      return {
        formattedBadge: reason,
        plainText: reason.toUpperCase(),
        minTotal: 0,
        unitLabel: node.unit,
        ceilingHit: false,
        allowed: false,
        contraindicationReason: reason,
      };
    }
  }

  const rawMin = node.dosePerKgMin * weightKg;
  const rawMax = node.dosePerKgMax !== undefined ? node.dosePerKgMax * weightKg : undefined;

  let activeCeiling = node.maxAdultValue;
  if (ageYears !== null && node.ageCeilings?.length) {
    for (const band of node.ageCeilings) {
      if (ageYears < band.maxAgeYearsExclusive) {
        if (node.unit === 'mg/kg/dia' && band.maxDailyMg !== undefined) {
          activeCeiling = band.maxDailyMg;
          break;
        }
        if (node.unit === 'mg/kg/dose' && band.maxSingleMg !== undefined) {
          activeCeiling = band.maxSingleMg;
          break;
        }
      }
    }
  }

  let ceilingHit = false;
  let effMin = rawMin;
  let effMax = rawMax;

  if (activeCeiling !== undefined && activeCeiling > 0) {
    if (effMin >= activeCeiling) {
      effMin = activeCeiling;
      ceilingHit = true;
    }
    if (effMax !== undefined && effMax >= activeCeiling) {
      effMax = activeCeiling;
      ceilingHit = true;
    }
    if (effMax !== undefined && effMin === effMax) {
      effMax = undefined;
    }
  }

  const fmt = (n: number): string => {
    if (n >= 100) return String(Math.round(n));
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  };

  const UNIT_LABELS: Record<DoseFormulaUnit, string> = {
    'mg/kg/dia': 'mg/dia',
    'mg/kg/dose': 'mg/dose',
    'mg/kg/min': 'mg/min',
    'mL/kg': 'mL',
    'mL/kg/h': 'mL/h',
    'mL/kg/dia': 'mL/dia',
    'gotas/kg': 'gotas',
    'mcg/kg': 'mcg',
    'mcg/kg/min': 'mcg/min',
    'UI/kg/h': 'UI/h',
    'UI/kg/dia': 'UI/dia',
    'g/kg': 'g',
  };
  const unitLabel = UNIT_LABELS[node.unit];

  const valStr = effMax !== undefined ? `${fmt(effMin)}–${fmt(effMax)}` : fmt(effMin);
  let perDoseText: string | undefined;
  const perDoseUnit =
    node.unit === 'mg/kg/dia'
      ? 'mg/tomada'
      : node.unit === 'mL/kg/dia'
        ? 'mL/tomada'
        : node.unit === 'UI/kg/dia'
          ? 'UI/tomada'
          : undefined;
  if (perDoseUnit && node.dosesPerDay && node.dosesPerDay > 1) {
    const perMin = effMin / node.dosesPerDay;
    const perMax = effMax !== undefined ? effMax / node.dosesPerDay : undefined;
    perDoseText =
      perMax !== undefined
        ? `${fmt(perMin)}–${fmt(perMax)} ${perDoseUnit}`
        : `${fmt(perMin)} ${perDoseUnit}`;
  }

  const ceilingTag = ceilingHit ? ' · teto' : '';
  const perDoseSuffix = perDoseText ? ` (${perDoseText})` : '';
  return {
    formattedBadge: `≈ ${valStr} ${unitLabel}${perDoseSuffix}${ceilingTag}`,
    plainText: `${valStr} ${unitLabel}${perDoseSuffix}${ceilingHit ? ' [teto]' : ''}`,
    minTotal: Math.round(effMin * 10) / 10,
    maxTotal: effMax !== undefined ? Math.round(effMax * 10) / 10 : undefined,
    unitLabel,
    ceilingHit,
    perDoseText,
    allowed: true,
  };
}

// ----------------------------------------------------------------------------
// PARSER PRINCIPAL (COM CACHE DETERMINÍSTICO)
// ----------------------------------------------------------------------------

const AST_CACHE_MAX = 220;
const astCache = new Map<string, PepDocumentAst>();

export function clearPepAstCache(): void {
  astCache.clear();
}

export function parsePepToAst(rawPepBody: string, protocolId = 'pep'): PepDocumentAst {
  const normalizedRaw = String(rawPepBody || '').replace(/\r\n/g, '\n');
  const rawHash = computeShortHash(normalizedRaw);
  const cacheKey = `${protocolId}::${rawHash}::${normalizedRaw.length}`;

  const cached = astCache.get(cacheKey);
  if (cached) return cached;

  let nodeSeq = 0;
  const nextId = (prefix: string): string => `${prefix}-${++nodeSeq}`;

  const stats = {
    headings: 0,
    paragraphs: 0,
    choiceGroups: 0,
    optionals: 0,
    inputs: 0,
    doseFormulas: 0,
    travaAlerts: 0,
  };

  const parseChoiceOptionChildren = (
    optText: string,
    groupBeforeText: string,
    isUsgOption: boolean
  ): Array<TextNode | InlineInputNode> => {
    const subTokens = parseBalancedBrackets(optText);
    const out: Array<TextNode | InlineInputNode> = [];
    let usgSubIdx = 0;

    subTokens.forEach((st, stIdx) => {
      if (st.type === 'text') {
        if (st.raw) out.push({ kind: 'text', id: nextId('otxt'), value: st.raw });
        return;
      }
      const subInner = (st.inner || '').trim();
      const bef = stIdx > 0 && subTokens[stIdx - 1].type === 'text' ? subTokens[stIdx - 1].raw : '';
      const aft =
        stIdx + 1 < subTokens.length && subTokens[stIdx + 1].type === 'text' ? subTokens[stIdx + 1].raw : '';

      let maskType: InlineInputNode['maskType'];
      if (/^DD\/MM\/AAAA$/i.test(subInner)) maskType = 'date-full';
      else if (/^DD\/MM$/i.test(subInner)) maskType = 'date-short';
      else if (/^HH:MM$/i.test(subInner)) maskType = 'time';

      let usgRole: InlineInputNode['usgRole'];
      if (isUsgOption) {
        if (/^DD\/MM\/AAAA$/i.test(subInner)) usgRole = 'usg-date';
        else if (/CCN\s+de\s*$/i.test(bef) || /^mm\b/i.test(aft)) usgRole = 'usg-ccn';
        else if (usgSubIdx === 0 || /^s\[|^s\b/i.test(aft)) {
          usgRole = 'usg-w';
          usgSubIdx = 1;
        } else {
          usgRole = 'usg-d';
          usgSubIdx = 2;
        }
      }

      stats.inputs++;
      out.push({
        kind: 'inline-input',
        id: nextId('sub'),
        origBracket: st.raw,
        inner: subInner,
        placeholder: inferChoiceSubInputPlaceholder(subInner, bef, aft, groupBeforeText),
        defaultValue: '',
        isEmpty: subInner === '' || /^_+$/.test(subInner),
        isSubInput: true,
        maskType,
        usgRole,
        beforeText: bef,
        afterText: aft,
      });
    });

    return out;
  };

  const parseInlineString = (
    str: string,
    lineContext: string,
    isFirstLineStart: boolean,
    inheritedDrugSpec: UnifiedDrugDoseSpec | null = null
  ): PepInlineNode[] => {
    const tokens = parseBalancedBrackets(str);
    const nodes: PepInlineNode[] = [];

    tokens.forEach((tok, tokIdx) => {
      if (tok.type === 'text') {
        const textSegments = splitTextWithDoseFormulas(tok.raw, lineContext, nextId, inheritedDrugSpec);
        for (const seg of textSegments) {
          if (seg.kind === 'dose-formula') stats.doseFormulas++;
          nodes.push(seg);
        }
        return;
      }

      const inner = (tok.inner || '').trim();
      const beforeText = tokIdx > 0 && tokens[tokIdx - 1].type === 'text' ? tokens[tokIdx - 1].raw : '';
      const afterText =
        tokIdx + 1 < tokens.length && tokens[tokIdx + 1].type === 'text' ? tokens[tokIdx + 1].raw : '';

      // 1A. Bloco opcional inline [? Rótulo :: Conteúdo]
      const optMatch = inner.match(/^\?\s*([^:]+)::\s*([\s\S]+)$/);
      if (optMatch) {
        const optLabel = optMatch[1].trim();
        const optContentRaw = optMatch[2].trim();
        const needsLeadingSpace = beforeText.length > 0 && !/[\s(\[{/]$/.test(beforeText);
        stats.optionals++;
        nodes.push({
          kind: 'optional',
          id: nextId('opt'),
          label: optLabel,
          defaultOpen: false,
          needsLeadingSpace,
          children: parseInlineString(optContentRaw, lineContext, false, inheritedDrugSpec),
        });
        return;
      }

      // 1B. Trava / Instrução condicional / Opção secundária
      if (isInternalInstructionBracket(inner)) {
        const isSafetyWarning = isContraindicationWarningBracket(inner);
        const isSecondaryOption = isSecondaryOptionBracket(inner);
        const isOptionGroupItem =
          isFirstLineStart &&
          /^(?:OPÇÃO|MODALIDADE|1ª\s*ESCOLHA|2ª\s*ESCOLHA|3ª\s*ESCOLHA|OU\s+2ª)/i.test(inner);
        stats.travaAlerts++;
        nodes.push({
          kind: 'trava-alert',
          id: nextId('trava'),
          rawBracket: tok.raw,
          label: inner,
          severity: isSafetyWarning ? 'danger' : isOptionGroupItem ? 'option-group' : 'conditional',
          isSafetyWarning,
          isSecondaryOption,
          isOptionGroupItem,
          defaultExcluded: isConditionalDefaultOffBracket(inner),
        });
        return;
      }

      // 2. Grupo de escolhas ([*Opção A / Opção B] ou [+ Opção 1 / Opção 2])
      const parsedGroup = parseChoiceGroupToken(inner);
      if (parsedGroup.options.length > 1) {
        const likelyMulti = parsedGroup.isExplicitMulti || isLikelyMultiGroup(beforeText, parsedGroup.options.map((o) => o.text));
        stats.choiceGroups++;
        const options: ChoiceOptionAst[] = parsedGroup.options.map((opt, idx) => {
          const isUsgOption = /\busg\b/i.test(opt.text) && /\[/.test(opt.text);
          return {
            id: nextId('optitem'),
            index: idx,
            rawText: opt.text,
            isDefault: opt.isDefault,
            isUsgOption,
            children: parseChoiceOptionChildren(opt.text, beforeText, isUsgOption),
          };
        });
        nodes.push({
          kind: 'choice-group',
          id: nextId('cg'),
          isExplicitMulti: parsedGroup.isExplicitMulti,
          isLikelyMulti: likelyMulti,
          hasDefault: parsedGroup.hasDefault,
          beforeText,
          options,
        });
        return;
      }

      // 3. Campo editável inline
      const nextBracketToken =
        tokIdx + 1 < tokens.length && tokens[tokIdx + 1].type === 'bracket'
          ? tokens[tokIdx + 1]
          : tokIdx + 2 < tokens.length &&
              tokens[tokIdx + 1].type === 'text' &&
              tokens[tokIdx + 1].raw.trim() === '' &&
              tokens[tokIdx + 2].type === 'bracket'
            ? tokens[tokIdx + 2]
            : undefined;
      const meta = inferInputMetadata(inner, beforeText, afterText, lineContext, nextBracketToken?.inner);
      const isEmpty = inner === '' || /^_+$/.test(inner);
      const smartPh =
        isEmpty && meta.mirrorRole === 'idade' ? 'Idade' : inferSmartPlaceholder(inner, beforeText, afterText);
      stats.inputs++;
      nodes.push({
        kind: 'inline-input',
        id: nextId('inp'),
        origBracket: tok.raw,
        inner,
        placeholder: smartPh,
        defaultValue: '',
        isEmpty,
        isSubInput: false,
        ...meta,
        beforeText,
        afterText,
      });
    });

    return nodes;
  };

  const lines = normalizedRaw.split('\n');
  const blocks: PepBlockNode[] = [];
  let activeRxItemSpec: UnifiedDrugDoseSpec | null = null;

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    if (trimmed === '') {
      activeRxItemSpec = null;
      stats.paragraphs++;
      blocks.push({
        kind: 'paragraph',
        id: nextId('blk'),
        lineIndex,
        rawLine: line,
        indent: '',
        isEmptyLine: true,
        isMetaLine: false,
        isSecondaryBlockStart: false,
        isConditionalBlockHeader: false,
        children: [],
      });
      return;
    }

    const isDocBanner = /^#{4,6}\s+.*#{4,6}$/.test(trimmed);
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    const subMatch = trimmed.match(/^>>\s*(.+)$/);

    if (isDocBanner || hMatch || subMatch) {
      activeRxItemSpec = null;
      const cleanTitle = isDocBanner
        ? trimmed.replace(/^#{4,6}\s*(.*?)\s*#{4,6}$/, '$1').trim()
        : hMatch
          ? hMatch[2].trim()
          : (subMatch ? subMatch[1].trim() : trimmed);
      const level: 1 | 2 | 3 = isDocBanner ? 1 : hMatch ? (Math.min(3, hMatch[1].length) as 1 | 2 | 3) : 3;
      const isSubheading = Boolean(subMatch);
      const isObjectiveSection = !isDocBanner && /^#{1,3}\s+(?:OBJETIVO|EXAME\s+F[ÍI]SICO)/i.test(trimmed);
      const children = parseInlineString(cleanTitle, line, true, null);

      stats.headings++;
      blocks.push({
        kind: 'heading',
        id: nextId('hdr'),
        lineIndex,
        level,
        isSubheading,
        isDocBanner,
        isObjectiveSection,
        rawLine: line,
        cleanTitle,
        children,
      });
      return;
    }

    // Parágrafo / linha de conteúdo
    let workingLine = line;
    let checkbox: ParagraphNode['checkbox'];
    const checkboxMatch = workingLine.match(/^(\s*(?:[-*]|\d+\.)\s+)\[([ xX]?)\]\s+(.*)$/);
    if (checkboxMatch) {
      checkbox = {
        prefix: checkboxMatch[1],
        checked: checkboxMatch[2].toLowerCase() === 'x',
      };
      workingLine = checkboxMatch[3];
    }

    if (indent === '' && /^\d+[.)]\s+/.test(trimmed)) {
      activeRxItemSpec = matchUnifiedDrugInClause(workingLine, '');
    } else if (indent === '' && !/^(?:Dar|Administrar|Aplicar|Oferecer)\b/i.test(trimmed)) {
      const ownSpec = matchUnifiedDrugInClause(workingLine, '');
      if (ownSpec) activeRxItemSpec = ownSpec;
      else if (/^(?:USO\s+|ORIENTAÇÕES|SINAIS\s+DE\s+ALARME|RETORNO)/i.test(trimmed)) activeRxItemSpec = null;
    }

    const inheritedForLine =
      indent.length >= 2 || /^(?:Dar|Administrar|Aplicar)\b/i.test(trimmed) ? activeRxItemSpec : null;

    const children = parseInlineString(workingLine, line, true, inheritedForLine);
    const firstTrava = children.find((c): c is TravaAlertNode => c.kind === 'trava-alert');
    const afterBracketRemainder = workingLine.replace(/^\s*(?:\d+[.)]\s+|[-*]\s+)?\[[^\]]+\]\s*:?\s*/, '').trim();
    const isBlockSectionStart = Boolean(
      firstTrava &&
        !firstTrava.isSafetyWarning &&
        (trimmed.startsWith('[') || /^>>\s*\[/.test(trimmed)) &&
        // Só trata como cabeçalho multi-linha se termina em ':' / título sem texto corrido comum
        (afterBracketRemainder === '' || /^[A-ZÀ-Ý0-9\s()—–/-]+:\s*$/.test(afterBracketRemainder))
    );
    const isSecondaryBlockStart = Boolean(firstTrava?.isSecondaryOption && isBlockSectionStart);
    const isConditionalBlockHeader = isBlockSectionStart;

    const isMetaLine = /^(?:PACIENTE:|CID-10:|DATA:|ATENDIMENTO:)/i.test(trimmed);

    stats.paragraphs++;
    blocks.push({
      kind: 'paragraph',
      id: nextId('blk'),
      lineIndex,
      rawLine: line,
      indent,
      isEmptyLine: false,
      isMetaLine,
      checkbox,
      isSecondaryBlockStart,
      isConditionalBlockHeader,
      children,
    });
  });

  const ast: PepDocumentAst = {
    cacheKey,
    protocolId,
    rawHash,
    blocks,
    stats,
  };

  if (astCache.size >= AST_CACHE_MAX) {
    const oldestKey = astCache.keys().next().value;
    if (oldestKey) astCache.delete(oldestKey);
  }
  astCache.set(cacheKey, ast);

  return ast;
}

// ----------------------------------------------------------------------------
// ESTADO REATIVO & PRÉ-SELEÇÃO CLÍNICA INTELIGENTE
// ----------------------------------------------------------------------------

function scoreChoiceOptionForContext(optText: string, ctx: ClinicalContext): number {
  const norm = normalizeForMatch(optText);
  let score = 0;

  if (ctx.isPediatric) {
    if (/\b(pediatr|crianca|suspensao|gotas|xarope|solucao oral|mg\/kg)\b/.test(norm)) score += 3;
    if (/\b(adulto|comprimido 875|ciprofloxac|doxiciclin)\b/.test(norm)) score -= 3;
  }

  if (ctx.isPregnant) {
    if (/\b(gestant|gravida|cefalexin|metildopa|paracetamol|amoxicilin|azitromicin)\b/.test(norm)) score += 4;
    if (/\b(ciprofloxac|levofloxac|doxiciclin|ibuprofen|diclofenaco|cetoprofeno|nimesulida|enalapril|losartana|valproat|varfarina|fluconazol)\b/.test(norm)) {
      score -= 5;
    }
  }

  if (ctx.effectiveGfrMlMin !== null && ctx.effectiveGfrMlMin < 45) {
    if (/\b(ajuste renal|drc|paracetamol|ceftriaxona|azitromicin)\b/.test(norm)) score += 3;
    if (/\b(ibuprofen|diclofenaco|cetoprofeno|nimesulida|metformina|nitrofurantoina|gentamicina)\b/.test(norm)) {
      score -= 4;
    }
  }

  if (ctx.allergiesNormalized.length > 0) {
    const hasPenAllergy = ctx.allergiesNormalized.some((a) => a.includes('penicil') || a.includes('amoxicil'));
    const hasDipAllergy = ctx.allergiesNormalized.some((a) => a.includes('dipiron'));
    const hasAineAllergy = ctx.allergiesNormalized.some((a) => a.includes('aine') || a.includes('ibuprof') || a.includes('aas'));

    if (hasPenAllergy) {
      if (/\b(amoxicilin|penicilin|ampicilin)\b/.test(norm)) score -= 6;
      if (/\b(azitromicin|claritromicin|clindamicin|alergi)\b/.test(norm)) score += 4;
    }
    if (hasDipAllergy) {
      if (/\bdipiron\b/.test(norm)) score -= 6;
      if (/\bparacetamol\b/.test(norm)) score += 4;
    }
    if (hasAineAllergy) {
      if (/\b(ibuprofen|diclofenaco|cetoprofeno|nimesulida|naproxeno|aas)\b/.test(norm)) score -= 6;
      if (/\b(paracetamol|dipiron)\b/.test(norm)) score += 2;
    }
  }

  return score;
}

function walkInlineNodes(nodes: readonly PepInlineNode[], visitor: (node: PepInlineNode) => void): void {
  for (const node of nodes) {
    visitor(node);
    if (node.kind === 'optional') {
      walkInlineNodes(node.children, visitor);
    } else if (node.kind === 'choice-group') {
      for (const opt of node.options) {
        for (const ch of opt.children) {
          visitor(ch);
        }
      }
    }
  }
}

/**
 * Cria o estado inicial da AST com defaults + pré-seleção clínica inteligente.
 */
export function createAstSelectionState(
  ast: PepDocumentAst,
  context?: ClinicalContext | null
): AstSelectionState {
  const state: AstSelectionState = {
    inputValues: {},
    choiceSelections: {},
    choiceMultiModes: {},
    optionalOpen: {},
    travaExcluded: {},
    checkboxStates: {},
    excludedBlocks: {},
    userEditedNodes: {},
  };

  for (const block of ast.blocks) {
    if (block.kind === 'paragraph' && block.checkbox) {
      state.checkboxStates[block.id] = block.checkbox.checked;
    }

    walkInlineNodes(block.children, (node) => {
      if (node.kind === 'inline-input') {
        if (node.mirrorRole === 'nome' && context?.nome) {
          state.inputValues[node.id] = context.nome;
        } else if (node.mirrorRole === 'idade' && context?.idadeText) {
          state.inputValues[node.id] = context.idadeText;
        } else if (node.mirrorRole === 'peso' && context?.weightKg !== null && context?.weightKg !== undefined) {
          state.inputValues[node.id] = String(context.weightKg).replace('.', ',');
        } else if (node.defaultValue) {
          state.inputValues[node.id] = node.defaultValue;
        }
      } else if (node.kind === 'optional') {
        state.optionalOpen[node.id] = node.defaultOpen;
      } else if (node.kind === 'trava-alert') {
        state.travaExcluded[node.id] = node.defaultExcluded;
      } else if (node.kind === 'choice-group') {
        state.choiceMultiModes[node.id] = node.isLikelyMulti;
        const defaultIndices = node.options.filter((o) => o.isDefault).map((o) => o.index);
        if (defaultIndices.length > 0) {
          state.choiceSelections[node.id] = defaultIndices;
        } else {
          state.choiceSelections[node.id] = [];
        }
      }
    });
  }

  if (context) {
    applySmartContextPreselection(ast, state, context);
  }

  return state;
}

/**
 * Aplica pré-seleção inteligente nos nós ainda NÃO editados manualmente pelo usuário.
 * Retorna quantidade de grupos/campos atualizados automaticamente.
 */
export function applySmartContextPreselection(
  ast: PepDocumentAst,
  state: AstSelectionState,
  context: ClinicalContext
): number {
  let updated = 0;

  for (const block of ast.blocks) {
    walkInlineNodes(block.children, (node) => {
      if (state.userEditedNodes[node.id]) return;

      if (node.kind === 'inline-input') {
        if (node.mirrorRole === 'nome' && context.nome && !state.inputValues[node.id]) {
          state.inputValues[node.id] = context.nome;
          updated++;
        } else if (node.mirrorRole === 'idade' && context.idadeText && !state.inputValues[node.id]) {
          state.inputValues[node.id] = context.idadeText;
          updated++;
        } else if (node.mirrorRole === 'peso' && context.weightKg !== null && !state.inputValues[node.id]) {
          state.inputValues[node.id] = String(context.weightKg).replace('.', ',');
          updated++;
        }
        return;
      }

      if (node.kind === 'choice-group' && !node.isLikelyMulti) {
        const scored = node.options.map((opt) => ({
          idx: opt.index,
          score: scoreChoiceOptionForContext(opt.rawText, context),
          isDefault: opt.isDefault,
        }));
        const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);
        const worst = scored.reduce((a, b) => (b.score < a.score ? b : a), scored[0]);

        // Só intervém se houver diferenciação clínica real entre opções
        if (best && worst && best.score > worst.score && (best.score > 0 || worst.score < 0)) {
          const current = state.choiceSelections[node.id] || [];
          const currentIsPenalized = current.some((ci) => {
            const found = scored.find((s) => s.idx === ci);
            return found ? found.score < 0 : false;
          });
          if (current.length === 0 || currentIsPenalized || best.score >= 3) {
            if (current.length !== 1 || current[0] !== best.idx) {
              state.choiceSelections[node.id] = [best.idx];
              updated++;
            }
          }
        }
      }
    });
  }

  return updated;
}

// ----------------------------------------------------------------------------
// SANITIZAÇÃO CLÍNICA & SERIALIZAÇÃO ÚNICA A PARTIR DA AST
// ----------------------------------------------------------------------------

/**
 * Remove tokens Markdown/LaTeX residuais e pontuação órfã de uma linha já compilada.
 */
export function cleanClinicalTextLine(rawLine: string): string {
  let line = String(rawLine || '');

  // Remove formatação Markdown inline (**negrito**, *(itálico)*, `código`)
  line = line
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*\(([^*\n)]+)\)\*/g, '($1)')
    .replace(/`([^`\n]+)`/g, '$1');

  // Remove tokens LaTeX ($...$, \rightarrow, \ge, \le, \pm, \times, \approx)
  line = line
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\ge(?:q)?\b/g, '≥')
    .replace(/\\le(?:q)?\b/g, '≤')
    .replace(/\\pm\b/g, '±')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\mu\b/g, 'µ')
    .replace(/\\(?:text|mathrm)\{([^}]+)\}/g, '$1');

  // Preserva indentação inicial e limpa múltiplos espaços internos (sem quebrar separadores --)
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  let content = line.slice(indent.length);

  // Remove pontuação órfã e conectores "+" duplicados/pendentes deixados por omissão de opcionais ou chips removidos
  content = content
    .replace(/\+\s*\+/g, '+')
    .replace(/\s+\+\s*([.,;:]|$)/g, '$1')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])\s*\./g, '.')
    .replace(/:\s*:\s*/g, ': ')
    .replace(/,\s*,+/g, ',')
    .replace(/\.\s*\.(?!\.)/g, '.')
    .replace(/^(\s*(?:\d+\.|[-*])\s*)[:\-–]\s*/, '$1')
    .replace(/^[:\-–]\s+/, '')
    .replace(/\s{2,}(?!--)/g, ' ')
    .trimEnd();

  // Linha composta apenas de pontuação órfã ou numeração sem conteúdo (ex: "." ou ":" ou "2." ou "2.:")
  if (/^[.,;:–\-]+$/.test(content.trim()) || /^\d+[.)]\s*[:\-–.]*$/.test(content.trim())) {
    return '';
  }

  return content ? indent + content : '';
}

export interface AstDisplayLayout {
  excludedBlocks: Set<number>;
  hiddenWrapperBlocks: Set<number>;
  promotedNumberedBlocks: Set<number>;
  promotedContinuationBlocks: Set<number>;
  renumberedByBlockIndex: Map<number, number>;
}

/**
 * Formata o texto interno de um bracket condicional/opcional para exibição curta em interruptor editorial.
 */
export function formatConditionalToggleLabel(rawLabel: string): string {
  let clean = String(rawLabel || '')
    .trim()
    .replace(/^se\s+/i, '')
    .replace(/\s+/g, ' ');

  if (!clean) return 'Opcional';

  // Normaliza tudo-maiúsculas em formato legível mantendo siglas clínicas comuns
  const letters = clean.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upperLetters = letters.replace(/[^A-ZÀ-Ý]/g, '');
  if (letters.length >= 6 && upperLetters.length / letters.length > 0.78) {
    clean = clean.toLowerCase().replace(/(^|[\s(/—–-])([a-zà-ÿ])/g, (_m, sep, ch) => `${sep}${ch.toUpperCase()}`);
    clean = clean.replace(
      /\b(Aas|Uti|Upa|Iot|Tev|Iam|Avc|Pcr|Rn|Rh|Ig|Ev|Im|Vo|Sc|Sf|Dmg|Hag|Itu|Drc|Has|Dm2|Hiv|Vdrl|Tsh|Dpa|Egb|St)\b/g,
      (m) => m.toUpperCase()
    );
  } else {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  // Remove instruções muito longas após travessão longo se já houver rótulo claro antes
  const dashIdx = clean.indexOf(' — ');
  if (dashIdx >= 14 && clean.length > 46) {
    clean = clean.slice(0, dashIdx).trim();
  }

  if (clean.length > 48) {
    clean = `${clean.slice(0, 45).trimEnd()}…`;
  }
  return clean;
}

/**
 * Verifica se um bloco de parágrafo é apenas um cabeçalho/invólucro condicional (ex: "2. [Se risco...]:" ou "[OPÇÃO A]:")
 * sem conteúdo clínico próprio na mesma linha.
 */
function isPureConditionalWrapperBlock(block: ParagraphNode): boolean {
  const hasConditionalTrava = block.children.some(
    (c) => c.kind === 'trava-alert' && !c.isSafetyWarning
  );
  if (!hasConditionalTrava) return false;

  for (const child of block.children) {
    if (child.kind === 'trava-alert' && !child.isSafetyWarning) continue;
    if (child.kind !== 'text') return false;
    const stripped = child.value
      .replace(/^\s*(?:\d+[.)]|[-*])\s*/, '')
      .replace(/[:\-–.\s]+/g, '')
      .trim();
    if (stripped.length > 0) return false;
  }

  return true;
}

/**
 * Calcula quais blocos devem ser omitidos por efeito de blocos condicionais/secundários excluídos.
 */
export function computeExcludedBlockIndices(
  ast: PepDocumentAst,
  state: AstSelectionState,
  options?: { forSerialization?: boolean }
): Set<number> {
  const excluded = new Set<number>();
  const forSerialization = Boolean(options?.forSerialization);
  let skipMode: 'none' | 'item' | 'bullet-item' | 'block' = 'none';
  let skipBaseIndent = 0;

  for (let i = 0; i < ast.blocks.length; i++) {
    const block = ast.blocks[i];

    if (skipMode === 'item') {
      if (
        block.kind === 'paragraph' &&
        !block.isEmptyLine &&
        /^\s+/.test(block.rawLine) &&
        !/^\s*(?:\d+\.|#+|>>)\s+/.test(block.rawLine)
      ) {
        excluded.add(i);
        continue;
      }
      skipMode = 'none';
    } else if (skipMode === 'bullet-item') {
      if (
        block.kind === 'paragraph' &&
        !block.isEmptyLine &&
        block.indent.length > skipBaseIndent
      ) {
        excluded.add(i);
        continue;
      }
      skipMode = 'none';
    } else if (skipMode === 'block') {
      const trimmed = block.rawLine.trim();
      if (
        block.kind === 'heading' ||
        (block.kind === 'paragraph' && block.isEmptyLine) ||
        block.isConditionalBlockHeader ||
        block.isSecondaryBlockStart ||
        /^(?:>>\s*)?\[(?:OPÇÃO|MODALIDADE|1ª\s*ESCOLHA|2ª\s*ESCOLHA|OU\s+2ª|SE\b|CEN[AÁ]RIO|PLANO)/i.test(trimmed) ||
        /^(?:USO\s+|ORIENTAÇÕES|SINAIS DE ALARME)/i.test(trimmed)
      ) {
        skipMode = 'none';
      } else {
        excluded.add(i);
        continue;
      }
    }

    if (block.kind === 'paragraph') {
      if (state.excludedBlocks?.[block.id]) {
        excluded.add(i);
        const trimmed = block.rawLine.trim();
        if (/^\d+[.)]\s+/.test(trimmed)) {
          skipMode = 'item';
        } else if (/^[-*]\s+/.test(trimmed)) {
          skipMode = 'bullet-item';
          skipBaseIndent = block.indent.length;
        }
        continue;
      }
      // Na UI os checkboxes "[ ]" devem permanecer visíveis/clicáveis; omitimos somente ao serializar para o PEP
      if (forSerialization && block.checkbox && state.checkboxStates[block.id] === false) {
        excluded.add(i);
        continue;
      }
      const firstTravaIdx = block.children.findIndex((c) => c.kind === 'trava-alert');
      const firstTrava = firstTravaIdx >= 0 ? (block.children[firstTravaIdx] as TravaAlertNode) : undefined;
      const isLeadingTrava =
        firstTravaIdx >= 0 &&
        block.children
          .slice(0, firstTravaIdx)
          .every(
            (c) =>
              c.kind === 'text' &&
              /^[\s\d.)\-*•[\]xX]*$/.test(c.value)
          );
      if (
        firstTrava &&
        state.travaExcluded[firstTrava.id] &&
        (isLeadingTrava || block.isConditionalBlockHeader || block.isSecondaryBlockStart)
      ) {
        excluded.add(i);
        const trimmed = block.rawLine.trim();
        if (/^\d+[.)]\s+/.test(trimmed)) {
          skipMode = 'item';
        } else if (/^[-*]\s+/.test(trimmed)) {
          skipMode = 'bullet-item';
          skipBaseIndent = block.indent.length;
        } else if (block.isConditionalBlockHeader || block.isSecondaryBlockStart) {
          skipMode = 'block';
        }
      }
    }
  }

  return excluded;
}

const SECTION_RESET_LINE_REGEX =
  /^(?:USO\s+[A-ZÀ-Ý\s/]+|CONDUTA(?:\s+HOSPITALAR[^:]*)?|RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?|PRESCRIÇÃO(?:\s+DOMICILIAR|\s+DE\s+ALTA|\s+MÉDICA[^:]*)?|ORIENTAÇÕES[^:]*|SINAIS DE ALARME[^:]*|IDENTIFICAÇÃO|QP|HMA|EXAME FÍSICO|AVALIAÇÃO|PLANO)\s*:?\s*$/i;

/**
 * Calcula layout determinístico compartilhado entre o renderizador React e o serializador de texto:
 * - Omite blocos condicionais desligados
 * - Remove linhas-invólucro vazias (evitando "2.:" órfão) promovendo seus subitens a itens numerados
 * - Renumera sequencialmente (1, 2, 3, 4...) todos os itens numerados visíveis
 */
export function computeAstDisplayLayout(
  ast: PepDocumentAst,
  state: AstSelectionState,
  blockSubsetIndices?: Set<number>,
  options?: { forSerialization?: boolean }
): AstDisplayLayout {
  const excludedBlocks = computeExcludedBlockIndices(ast, state, options);
  const hiddenWrapperBlocks = new Set<number>();
  const promotedNumberedBlocks = new Set<number>();
  const promotedContinuationBlocks = new Set<number>();
  const renumberedByBlockIndex = new Map<number, number>();

  // 1) Identificar cabeçalhos-invólucro condicionais ativos e promover seus subitens
  for (let i = 0; i < ast.blocks.length; i++) {
    if (blockSubsetIndices && !blockSubsetIndices.has(i)) continue;
    if (excludedBlocks.has(i)) continue;

    const block = ast.blocks[i];
    if (block.kind !== 'paragraph' || block.isEmptyLine) continue;
    if (!isPureConditionalWrapperBlock(block)) continue;

    const trimmed = block.rawLine.trim();
    const isTopNumberedWrapper = block.indent === '' && /^\d+[.)]\s+/.test(trimmed);

    // Verifica se há linhas filhas indentadas logo abaixo
    const childIndices: number[] = [];
    for (let j = i + 1; j < ast.blocks.length; j++) {
      if (blockSubsetIndices && !blockSubsetIndices.has(j)) break;
      const next = ast.blocks[j];
      if (next.kind !== 'paragraph' || next.isEmptyLine) break;
      if (next.indent.length <= block.indent.length) break;
      if (!excludedBlocks.has(j)) {
        childIndices.push(j);
      }
    }

    if (isTopNumberedWrapper) {
      hiddenWrapperBlocks.add(i);
      if (childIndices.length > 0) {
        const firstChild = ast.blocks[childIndices[0]] as ParagraphNode;
        const firstChildIndent = firstChild.indent.length;
        const usesBullets = /^[-*]\s+/.test(firstChild.rawLine.trim());

        if (usesBullets) {
          for (const ci of childIndices) {
            const cb = ast.blocks[ci] as ParagraphNode;
            if (cb.indent.length === firstChildIndent && /^[-*]\s+/.test(cb.rawLine.trim())) {
              promotedNumberedBlocks.add(ci);
            } else {
              promotedContinuationBlocks.add(ci);
            }
          }
        } else {
          promotedNumberedBlocks.add(childIndices[0]);
          for (let k = 1; k < childIndices.length; k++) {
            promotedContinuationBlocks.add(childIndices[k]);
          }
        }
      }
    } else if (childIndices.length > 0 || trimmed.startsWith('[')) {
      // Wrapper não numerado (ex.: "[OPÇÃO A — CANDIDÍASE]:" ou "   - [OPÇÃO 1 — ...]:")
      hiddenWrapperBlocks.add(i);
    }
  }

  // 2) Renumeração sequencial limpa (1, 2, 3, 4...) nos itens visíveis de cada lista numerada
  let seq = 0;
  for (let i = 0; i < ast.blocks.length; i++) {
    if (blockSubsetIndices && !blockSubsetIndices.has(i)) continue;
    if (excludedBlocks.has(i) || hiddenWrapperBlocks.has(i)) continue;

    const block = ast.blocks[i];
    if (block.kind === 'heading') {
      seq = 0;
      continue;
    }

    if (block.isEmptyLine) {
      continue;
    }

    const trimmed = block.rawLine.trim();
    if (SECTION_RESET_LINE_REGEX.test(trimmed)) {
      seq = 0;
      continue;
    }

    const isPromoted = promotedNumberedBlocks.has(i);
    const isTopLevelNumbered = block.indent === '' && /^\d+[.)]\s+/.test(trimmed);

    if (isPromoted || isTopLevelNumbered) {
      seq += 1;
      renumberedByBlockIndex.set(i, seq);
      continue;
    }

    // Linhas indentadas (posologia, sub-bullets) preservam a sequência; texto de nível raiz quebra a lista
    if (block.indent === '' && !promotedContinuationBlocks.has(i)) {
      seq = 0;
    }
  }

  return {
    excludedBlocks,
    hiddenWrapperBlocks,
    promotedNumberedBlocks,
    promotedContinuationBlocks,
    renumberedByBlockIndex,
  };
}

/**
 * Serializa a AST + Estado em texto clínico limpo pronto para o prontuário eletrônico.
 * REGRA DE OURO: Renderização DOM e texto copiado derivam desta mesma AST.
 */
export function serializeAstToClinicalText(
  ast: PepDocumentAst,
  state: AstSelectionState,
  context?: ClinicalContext | null,
  options?: SerializeAstOptions
): string {
  const keepEmpty = options?.keepEmptyBrackets !== undefined ? options.keepEmptyBrackets : true;
  const includeDoseCalc = options?.includeDoseFormulaCalc !== undefined ? options.includeDoseFormulaCalc : true;
  const stripSafetyWarnings = Boolean(options?.stripSafetyWarnings);
  const subset = options?.blockSubsetIndices;
  const gapMarkers = options?.gapMarkers;
  const layout = computeAstDisplayLayout(ast, state, subset, { forSerialization: true });

  const serializeInput = (node: InlineInputNode): string => {
    const val = (state.inputValues[node.id] || '').trim();
    if (val) return val;
    if (gapMarkers) {
      if (isIdentificationInput(node)) return gapMarkers.emptyIdentification;
      if (!isSuggestedValueInput(node)) return gapMarkers.emptyInput;
    }
    if (!keepEmpty) return '___';
    if (node.origBracket && !/^\[(?: |_+)\]$/.test(node.origBracket)) {
      return node.origBracket;
    }
    return '[ ]';
  };

  const serializeChoiceOption = (opt: ChoiceOptionAst): string => {
    let out = '';
    for (const ch of opt.children) {
      if (ch.kind === 'text') out += ch.value;
      else out += serializeInput(ch);
    }
    return out.trim();
  };

  const serializeInlineList = (nodes: readonly PepInlineNode[]): string => {
    let out = '';
    let justOmittedTrava = false;

    for (const node of nodes) {
      if (node.kind === 'text') {
        let txt = node.value;
        if (justOmittedTrava) {
          txt = txt.replace(/^[:\-–]\s*/, '');
          justOmittedTrava = false;
        }
        out += txt;
        continue;
      }

      if (node.kind === 'trava-alert') {
        if (node.isSafetyWarning && !stripSafetyWarnings && !state.travaExcluded[node.id]) {
          justOmittedTrava = false;
          out += node.rawBracket;
        } else {
          justOmittedTrava = true;
        }
        continue;
      }

      justOmittedTrava = false;

      if (node.kind === 'inline-input') {
        out += serializeInput(node);
        continue;
      }

      if (node.kind === 'dose-formula') {
        const evalDose = includeDoseCalc
          ? evaluateDoseFormula(node, context?.weightKg ?? null, context?.ageYears ?? null)
          : null;
        if (evalDose) {
          out += `${node.raw} (${evalDose.plainText})`;
        } else {
          out += node.raw;
        }
        continue;
      }

      if (node.kind === 'choice-group') {
        const selectedIndices = state.choiceSelections[node.id] || [];
        if (selectedIndices.length > 0) {
          const texts = selectedIndices
            .map((idx) => node.options[idx])
            .filter(Boolean)
            .map((opt) => serializeChoiceOption(opt));
          out += formatMultiChoices(texts);
        } else if (gapMarkers) {
          out += gapMarkers.unselectedChoice;
        }
        continue;
      }

      if (node.kind === 'optional') {
        if (!state.optionalOpen[node.id]) continue;
        let sub = serializeInlineList(node.children);
        if (node.needsLeadingSpace && out && !/[\s(\[{/]$/.test(out) && sub && !/^\s/.test(sub)) {
          sub = ' ' + sub;
        } else if (out.endsWith(' ') && sub.startsWith(' ')) {
          sub = sub.slice(1);
        }
        out += sub;
      }
    }

    return out;
  };

  const outLines: string[] = [];

  for (let i = 0; i < ast.blocks.length; i++) {
    if (subset && !subset.has(i)) continue;
    if (layout.excludedBlocks.has(i) || layout.hiddenWrapperBlocks.has(i)) continue;

    const block = ast.blocks[i];
    if (block.kind === 'paragraph' && block.isEmptyLine) {
      outLines.push('');
      continue;
    }

    if (block.kind === 'heading') {
      const rendered = cleanClinicalTextLine(serializeInlineList(block.children));
      if (rendered) outLines.push(rendered);
      continue;
    }

    let lineText = '';
    if (block.checkbox) {
      const isChecked = state.checkboxStates[block.id] ?? block.checkbox.checked;
      lineText += `${block.checkbox.prefix}${isChecked ? '[x] ' : '[ ] '}`;
    }
    lineText += serializeInlineList(block.children);

    let cleaned = cleanClinicalTextLine(lineText);
    if (!cleaned && block.rawLine.trim().length > 0) {
      // Linha que só continha trava/opcional desligado — omitir para não criar lacuna fantasma
      continue;
    }

    const assignedNum = layout.renumberedByBlockIndex.get(i);
    if (assignedNum !== undefined) {
      if (layout.promotedNumberedBlocks.has(i)) {
        cleaned = `${assignedNum}. ${cleaned.replace(/^\s*(?:[-*]\s+)?/, '')}`;
      } else {
        cleaned = cleaned.replace(/^\d+[.)]\s+/, `${assignedNum}. `);
      }
    } else if (layout.promotedContinuationBlocks.has(i)) {
      cleaned = `   ${cleaned.trimStart()}`;
    }

    outLines.push(cleaned);
  }

  return outLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
