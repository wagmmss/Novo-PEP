// ============================================================================
// BUSCA LEVE NA REMUME (252 itens) — sem o guia HSL (1,6 MB) do PEP antigo
// ============================================================================

import { REMUME_ITEMS, type RemumeItem } from '../data/remume.ts';

export { REMUME_ITEMS, type RemumeItem };

export function normalizePharmaText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^a-z0-9./%+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Busca por tokens (todos precisam aparecer); prioriza início do nome. */
export function searchRemume(query: string, limit = 8): RemumeItem[] {
  const q = normalizePharmaText(query);
  if (!q) return REMUME_ITEMS.slice(0, limit);
  const tokens = q.split(' ').filter(Boolean);
  const scored: Array<{ item: RemumeItem; score: number }> = [];
  for (const item of REMUME_ITEMS) {
    const norm = normalizePharmaText(item.norm || item.name);
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const idx = norm.indexOf(t);
      if (idx === -1) {
        ok = false;
        break;
      }
      score += idx === 0 ? 20 : /\s/.test(norm[idx - 1] ?? ' ') ? 10 : 4;
    }
    if (!ok) continue;
    if (norm.startsWith(q)) score += 30;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'pt-BR'));
  return scored.slice(0, limit).map((s) => s.item);
}
