// ============================================================================
// HELPERS PUROS DA ABA PRÉ-PORTA (FILTROS, INTERCORRÊNCIAS E PONTO CEGO)
// ============================================================================

import type { IntercorrenciaItem } from '../data/clinical_reference_data.ts';
import { normalizeSearchText } from './search.ts';

export type HabCategoryFilterId =
  | 'todos'
  | 'Entrevista & Comunicação'
  | 'Exame Físico & Semiologia'
  | 'Raciocínio & Segurança Clínica'
  | 'Exames & Diagnóstico'
  | 'Emergência & Procedimentos';

export const HAB_CATEGORY_FILTERS: ReadonlyArray<{
  id: HabCategoryFilterId;
  shortLabel: string;
}> = [
  { id: 'todos', shortLabel: 'Todos' },
  { id: 'Entrevista & Comunicação', shortLabel: 'Entrevista' },
  { id: 'Exame Físico & Semiologia', shortLabel: 'Exame Físico' },
  { id: 'Raciocínio & Segurança Clínica', shortLabel: 'Raciocínio' },
  { id: 'Exames & Diagnóstico', shortLabel: 'Exames' },
  { id: 'Emergência & Procedimentos', shortLabel: 'Emergência' },
];

export const INTERCORRENCIA_SHORT_LABELS: Record<string, string> = {
  '1': '1. Hipotensão',
  '2': '2. Dispneia',
  '3': '3. Dor Torácica',
  '4': '4. Oligúria',
  '5': '5. Febre (5 Ws)',
  '6': '6. Glicemia',
};

const INTERCORRENCIAS_GENERAL_KEYWORDS = normalizeSearchText(
  'intercorrencias intercorrências madrugada plantao plantão noturno enfermaria pos-op pos operatorio 5 ws'
);

export interface FilteredIntercorrenciasResult {
  visibleInSidebar: boolean;
  isFilteredSubset: boolean;
  items: readonly IntercorrenciaItem[];
}

/**
 * Filtra as 6 Intercorrências de Madrugada com normalização de acentos (NFD)
 * em título, checar2m, causas3, conduta e termos gerais de plantão noturno.
 */
export function filterIntercorrencias(
  allItems: readonly IntercorrenciaItem[],
  query: string
): FilteredIntercorrenciasResult {
  const qNorm = normalizeSearchText(query);
  if (!qNorm) {
    return { visibleInSidebar: true, isFilteredSubset: false, items: allItems };
  }

  const tokens = qNorm.split(/\s+/).filter(Boolean);
  const matchedItems = allItems.filter((it) => {
    const haystack = normalizeSearchText(
      `${it.num} ${it.titulo} ${it.checar2m} ${it.causas3} ${it.conduta}`
    );
    return tokens.every((tok) => haystack.includes(tok));
  });

  if (matchedItems.length > 0) {
    return {
      visibleInSidebar: true,
      isFilteredSubset: matchedItems.length < allItems.length,
      items: matchedItems,
    };
  }

  if (tokens.every((tok) => INTERCORRENCIAS_GENERAL_KEYWORDS.includes(tok))) {
    return { visibleInSidebar: true, isFilteredSubset: false, items: allItems };
  }

  return { visibleInSidebar: false, isFilteredSubset: true, items: [] };
}

/**
 * Monta nota completa e transparente para salvar itens pendentes no Ponto Cego
 * (evita truncamento silencioso quando há mais de 6 itens pendentes).
 */
export function buildPendingPontoCegoNote(uncheckedItems: readonly string[], maxListed = 6): string {
  const clean = uncheckedItems.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length <= maxListed) {
    return `Itens pendentes no checklist: ${clean.join('; ')}.`;
  }
  const head = clean.slice(0, maxListed).join('; ');
  const remaining = clean.length - maxListed;
  return `Itens pendentes no checklist: ${head} (+${remaining} ${remaining === 1 ? 'outro' : 'outros'}).`;
}
