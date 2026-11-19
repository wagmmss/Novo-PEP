// ============================================================================
// HELPERS PUROS DE PERSONALIZAÇÃO INLINE DO PEP
// (Exclusão mútua em multi-escolha, placeholders redundantes e formatação limpa)
// ============================================================================

const EXCLUDING_CHOICE_REGEX =
  /^(?:h[íi]gid[oa](?:\b|$)|nega(?:\b|$)|nenhum[ao]?(?:\b|$)|sem\s+(?:comorbidades|alergias|antecedentes|queixas|altera[çc][õo]es|intercorr[êe]ncias|uso|achados|medica[çc][õo]es|doen[çc]as|patologias)\b|ausentes?(?:\b|$)|n[aã]o\s+(?:possui|refere|apresenta|usa|tem)\b)/i;

function normalizeChoiceLabel(rawText: string): string {
  return String(rawText || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^[\[\(\s]+|[\]\)\s]+$/g, '')
    .trim();
}

/**
 * Identifica se uma opção de escolha clínica é semanticamente excludente/negativa
 * (ex: "Hígida", "Nega", "Nenhuma", "Sem comorbidades", "Nega alergias").
 */
export function isExcludingChoiceOption(rawText: string): boolean {
  const clean = normalizeChoiceLabel(rawText);
  if (!clean) return false;
  return EXCLUDING_CHOICE_REGEX.test(clean);
}

/**
 * Resolve o próximo conjunto de índices selecionados em um grupo multi-escolha,
 * garantindo exclusão mútua automática entre opções excludentes ("Hígida", "Nega")
 * e demais opções clínicas positivas.
 */
export function resolveMultiChoiceSelection(
  options: ReadonlyArray<{ index: number; rawText: string }>,
  currentIndices: readonly number[],
  toggledIdx: number
): number[] {
  const exists = currentIndices.includes(toggledIdx);
  if (exists) {
    return currentIndices.filter((i) => i !== toggledIdx);
  }

  const byIndex = new Map(options.map((o) => [o.index, o]));
  const toggledOpt = byIndex.get(toggledIdx);
  if (!toggledOpt) {
    return [...currentIndices, toggledIdx].sort((a, b) => a - b);
  }

  if (isExcludingChoiceOption(toggledOpt.rawText)) {
    return [toggledIdx];
  }

  const filtered = currentIndices.filter((idx) => {
    const opt = byIndex.get(idx);
    return !opt || !isExcludingChoiceOption(opt.rawText);
  });

  return [...filtered, toggledIdx].sort((a, b) => a - b);
}

/**
 * Evita repetição visual do tipo "G G", "P P", "A A" quando o placeholder da lacuna
 * apenas repete a letra ou rótulo imediatamente anterior no texto.
 */
export function resolveInlinePlaceholder(placeholder: string, beforeText: string): string {
  const cleanPlaceholder = String(placeholder || '').trim();
  if (!cleanPlaceholder || cleanPlaceholder === '...') return '_';

  const trimmedBefore = String(beforeText || '').trimEnd();
  if (!trimmedBefore) return cleanPlaceholder;

  // Extrai o último token alfanumérico imediatamente antes da lacuna (ignorando ":" ou "/" no final)
  const trailingMatch = trimmedBefore.match(/([A-Za-zÀ-ÿ0-9]+)\s*[:\/\-]?\s*$/);
  if (trailingMatch) {
    const prevToken = trailingMatch[1];
    if (prevToken.toLowerCase() === cleanPlaceholder.toLowerCase()) {
      return '_';
    }
  }

  return cleanPlaceholder;
}
