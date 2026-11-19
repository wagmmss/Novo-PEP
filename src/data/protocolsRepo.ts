import protocolsPayload from './protocols.generated.json' with { type: 'json' };
import type { ClinicalProtocolItem } from './clinical_data.ts';
import { createClinicalSearchIndex } from '../engine/search.ts';
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
}

export const EMPTY_PATIENT_CONTEXT: PatientContextInput = {
  idade: '',
  pesoKg: '',
  gestante: false,
  igSemanas: '',
};

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
  ALL_PROTOCOLS.map((item) => [String(item.trigger || '').toLowerCase(), item])
);

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
  /^(?:#+\s*|>>\s*)(?:PLANO\s*\/\s*CONDUTA|PLANO\s+TERAPÊUTICO|PLANO|CONDUTA|PRESCRIÇÃO)\b/i;

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
