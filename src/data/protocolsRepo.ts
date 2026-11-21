import protocolsPayload from './protocols.generated.json' with { type: 'json' };
import type { ClinicalProtocolItem } from './clinical_data.ts';
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

/**
 * Sincroniza dados do paciente (idade, peso, gestante/IG) nos nós não editados manualmente da AST.
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
    userEditedNodes: { ...baseState.userEditedNodes },
  };

  let prevLineContext = '';
  for (const block of ast.blocks) {
    const lineContext = block.rawLine || '';
    walkInlineNodes(block.children, (node) => {
      if (node.kind === 'inline-input') {
        if (nextState.userEditedNodes[node.id]) return;

        // Espelhamento de idade
        if (node.mirrorRole === 'idade') {
          if (clinicalContext.idadeText) {
            nextState.inputValues[node.id] = clinicalContext.idadeText;
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
            lineContext,
            prevLineContext,
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
            lineContext,
            prevLineContext,
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
      } else if (node.kind === 'choice-group') {
        const currentSel = nextState.choiceSelections[node.id] || [];
        if (currentSel.length === 0 && node.options.length > 0) {
          if (!isBloodTypeChoiceGroup(node.options)) {
            nextState.choiceSelections[node.id] = [0];
          }
        }
      }
    });

    if (lineContext.trim()) {
      prevLineContext = lineContext;
    }
  }

  applySmartContextPreselection(ast, nextState, clinicalContext);
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
  const run = (zone: 'receita' | 'conduta'): PrescriptionAuditReport | null => {
    const text = sectionTexts[zone];
    if (!text || !text.trim()) return null;
    const items = extractPrescriptionItemsFromText(text, { defaultZone: zone }).map((it) => ({
      ...it,
      scope: zone,
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
