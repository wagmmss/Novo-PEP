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
  serializeAstToClinicalText,
  type PepInlineNode,
} from '../engine/pepAst.ts';
import {
  extractBodiesFromCustomPep,
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

export interface CopyablePepBlock {
  id: 'evolucao' | 'conduta' | 'receita' | 'orientacoes' | 'geral';
  title: string;
  text: string;
}

export interface CompiledProtocolView {
  needsWeightPersonalization: boolean;
  clinicalContext: ClinicalContext;
  plausibilityAlert: AgeWeightPlausibilityAlert | null;
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

function walkInlineNodes(nodes: readonly PepInlineNode[], visitor: (n: PepInlineNode) => void): void {
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

function isBloodTypeChoiceGroup(options: readonly { rawText: string }[]): boolean {
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

/**
 * Compila o texto do PEP em prosa clínica limpa pronta para cópia,
 * aplicando dinamicamente idade, peso (doses ponderais + teto adulto) e gestação/IG.
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

  const state = createAstSelectionState(ast, clinicalContext);

  // 1) Injetar IG semanas e cálculos ponderais inline em campos de dose pediátrica
  let prevLineContext = '';
  for (const block of ast.blocks) {
    const lineContext = block.rawLine || '';
    walkInlineNodes(block.children, (node) => {
      if (node.kind === 'inline-input') {
        if (
          clinicalContext.igWeeks !== null &&
          (node.obstetricRole === 'ig-def-w' ||
            node.obstetricRole === 'ig-dum-w' ||
            node.obstetricRole === 'ig-usg-w')
        ) {
          state.inputValues[node.id] = String(Math.floor(clinicalContext.igWeeks));
          return;
        }

        if (clinicalContext.weightKg !== null && clinicalContext.weightDoses) {
          const isWeightSource = node.anthroRole === 'peso' || node.mirrorRole === 'peso';
          if (isWeightSource) {
            state.inputValues[node.id] = String(clinicalContext.weightKg).replace('.', ',');
          } else {
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
              state.inputValues[node.id] = autoDose;
            }
          }
        }
      } else if (node.kind === 'choice-group') {
        const currentSel = state.choiceSelections[node.id] || [];
        if (currentSel.length === 0 && node.options.length > 0) {
          // Nunca fabricar tipagem sanguínea; para demais grupos sem * default, usa a 1ª redação clínica padrão
          if (!isBloodTypeChoiceGroup(node.options)) {
            state.choiceSelections[node.id] = [0];
          }
        }
      }
    });
    if (lineContext.trim()) {
      prevLineContext = lineContext;
    }
  }

  // 2) Serializar AST para texto clínico limpo
  const compiledRaw = serializeAstToClinicalText(ast, state, clinicalContext, {
    keepEmptyBrackets: true,
    includeDoseFormulaCalc: true,
  }).replace(/\*(\([^*\n]+\)\.?)\*/g, '$1');

  const bodies = extractBodiesFromCustomPep(compiledRaw, {
    has_receita: item.has_receita,
  });

  // 3) Montar blocos copiáveis sem duplicação de texto entre Conduta, Receita e Orientações
  const blocks = splitIntoCleanBlocks(bodies);

  return {
    needsWeightPersonalization,
    clinicalContext,
    plausibilityAlert,
    fullText: blocks.map((b) => b.text).join('\n\n'),
    blocks,
  };
}

function trimSectionOverlap(source: string, markerRegex: RegExp): string {
  const m = source.match(markerRegex);
  if (!m || m.index === undefined) return source.trim();
  return source.slice(0, m.index).trim();
}

function splitIntoCleanBlocks(bodies: ReturnType<typeof extractBodiesFromCustomPep>): CopyablePepBlock[] {
  const blocks: CopyablePepBlock[] = [];

  const evolucao = bodies.evolucao_body.trim();
  const hasReceita = Boolean(bodies.receita_body.trim());
  const hasOrientacoes = Boolean(bodies.orientacoes_body.trim());

  const receitaMarker =
    /^(?:RECEITA(?:\s+DE\s+ALTA|\s+MÉDICA)?|PRESCRIÇÃO DOMICILIAR|PRESCRIÇÃO DE ALTA|PRESCRIÇÃO MÉDICA AMBULATORIAL|PRESCRIÇÃO AMBULATORIAL)\s*:?/im;
  const orientacoesMarker =
    /^(?:ORIENTAÇÕES|SINAIS DE ALARME|RETORNO IMEDIATO|CUIDADOS DOMICILIARES)/im;

  let conduta = bodies.conduta_body.trim();
  if (conduta && conduta === evolucao) {
    conduta = '';
  }
  if (conduta && hasReceita) {
    conduta = trimSectionOverlap(conduta, receitaMarker);
  }
  if (conduta && hasOrientacoes) {
    conduta = trimSectionOverlap(conduta, orientacoesMarker);
  }

  const receita = (hasOrientacoes ? bodies.receita_meds_body : bodies.receita_body).trim();
  const orientacoes = bodies.orientacoes_body.trim();

  if (evolucao) {
    blocks.push({
      id: 'evolucao',
      title: 'Evolução / Admissão',
      text: evolucao,
    });
  }
  if (conduta) {
    blocks.push({
      id: 'conduta',
      title: 'Conduta',
      text: conduta,
    });
  }
  if (receita) {
    blocks.push({
      id: 'receita',
      title: 'Prescrição / Receita',
      text: receita,
    });
  }
  if (orientacoes) {
    blocks.push({
      id: 'orientacoes',
      title: 'Orientações / Alta',
      text: orientacoes,
    });
  }

  if (blocks.length === 0 && bodies.pep_body.trim()) {
    blocks.push({
      id: 'geral',
      title: 'Registro PEP',
      text: bodies.pep_body.trim(),
    });
  }

  return blocks;
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
