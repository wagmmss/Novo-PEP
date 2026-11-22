// ============================================================================
// MOTOR PURO DE GUIAS TEÓRICOS (BUSCA, SUMÁRIO, LEITURA, LINKS & DRILLS)
// ============================================================================

import type { TeoriaModuloItem } from '../data/formacao_teorica_data.ts';
import { ARQUETIPOS_E3, CENARIOS_E4, QUEIXAS_E1 } from '../data/treino_clinico_data.ts';
import { normalizeSearchText } from './search.ts';

export type TeoriaStatus = 'nao_iniciado' | 'estudado' | 'dominado';

export interface TeoriaOutlineItem {
  id: string;
  level: 2 | 3;
  text: string;
}

export interface TeoriaTreinoTarget {
  slug: string;
  eixo: 'e1' | 'e3' | 'e4';
  nome: string;
}

export interface TeoriaSearchMatch {
  mod: TeoriaModuloItem;
  matchKind: 'meta' | 'body' | null;
  snippet: string | null;
  matchCount: number;
}

// Mapa de cenários do Treino Clínico para ponte direta Guia <-> Treino
export const TREINO_SCENARIO_BY_SLUG: ReadonlyMap<string, TeoriaTreinoTarget> = new Map<
  string,
  TeoriaTreinoTarget
>([
  ...QUEIXAS_E1.map((q) => [q.slug, { slug: q.slug, eixo: 'e1' as const, nome: q.nome }] as const),
  ...ARQUETIPOS_E3.map((a) => [a.slug, { slug: a.slug, eixo: 'e3' as const, nome: a.nome }] as const),
  ...CENARIOS_E4.map((c) => [c.slug, { slug: c.slug, eixo: 'e4' as const, nome: c.nome }] as const),
]);

// Eixo padrão do Treino Clínico sugerido para cada módulo teórico
export const DEFAULT_TREINO_EIXO_BY_MOD: Record<string, 'e1' | 'e3' | 'e4'> = {
  'mod-01': 'e1',
  'mod-02': 'e1',
  'mod-03': 'e1',
  'mod-04': 'e1',
  'mod-05': 'e1',
  'mod-06': 'e3',
  'mod-07': 'e4',
  'mod-08': 'e4',
  'mod-09': 'e3',
};

/** Remove o prefixo redundante "Módulo XX — " do título principal (já exibido no eyebrow). */
export function stripModuleTitlePrefix(title: string): string {
  return String(title || '')
    .replace(/^\s*M[óo]dulo\s+\d+\s*[—–-]\s*/i, '')
    .trim();
}

/** Padroniza o cabeçalho confuso "4. 3 Micro-Drills Ativos de Voz Alta" em todos os módulos. */
export function normalizeTeoriaHeadingText(text: string): string {
  const cleaned = String(text || '').trim();
  if (/^4\.\s*3\s+Micro-Drills\s+Ativos\s+de\s+Voz\s+Alta$/i.test(cleaned)) {
    return '4. Micro-Drills Ativos de Voz Alta (3 casos)';
  }
  return cleaned;
}

/** Gera slug estável para âncoras de <h2> e <h3> nos Guias Teóricos. */
export function slugifyTeoriaHeading(rawText: string): string {
  const plain = String(rawText || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  const base = normalizeSearchText(plain)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'secao';
}

/** Remove marcação inline simples para exibição limpa no Sumário (TOC). */
export function stripInlineMarkdownForLabel(rawText: string): string {
  return String(rawText || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Extrai o sumário (H2 e H3) com os mesmos IDs gerados por renderTeoriaMarkdownToHtml. */
export function extractTeoriaOutline(markdown: string): TeoriaOutlineItem[] {
  const lines = String(markdown || '').split('\n');
  const items: TeoriaOutlineItem[] = [];
  const usedIds = new Map<string, number>();

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    let level: 2 | 3 | null = null;
    let body = '';

    if (trimmed.startsWith('## ')) {
      level = 2;
      body = normalizeTeoriaHeadingText(trimmed.slice(3));
    } else if (trimmed.startsWith('### ')) {
      level = 3;
      body = normalizeTeoriaHeadingText(trimmed.slice(4));
    }

    if (!level) continue;
    const label = stripInlineMarkdownForLabel(body);
    if (!label) continue;

    const baseId = slugifyTeoriaHeading(label);
    const seen = usedIds.get(baseId) || 0;
    usedIds.set(baseId, seen + 1);
    const id = seen === 0 ? `sec-${baseId}` : `sec-${baseId}-${seen + 1}`;

    items.push({ id, level, text: label });
  }

  return items;
}

/** Estima contagem de palavras e tempo de leitura (~200 palavras/min para texto técnico denso). */
export function estimateReadingStats(markdown: string): { words: number; minutes: number } {
  const plain = String(markdown || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`|>-]/g, ' ')
    .trim();
  const words = plain ? plain.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return { words, minutes };
}

/** Formata URLs cruas em rótulos curtos e legíveis para links clicáveis. */
export function formatExternalUrlLabel(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (host === 'doi.org') return 'DOI';
    if (host === 'pubmed.ncbi.nlm.nih.gov') {
      const pmid = parsed.pathname.replace(/\//g, '');
      return pmid ? `PubMed ${pmid}` : 'PubMed';
    }
    if (host === 'ncbi.nlm.nih.gov') return 'NCBI / NLM';
    if (host === 'vitaltalk.org') return 'VitalTalk';
    if (host === 'ahrq.gov') return 'AHRQ Teach-Back';
    if (host === 'academic.oup.com') return 'OUP · Oncologist';
    if (host === 'escholarship.org') return 'Project BETA';
    if (host === 'cssrs.columbia.edu') return 'Columbia C-SSRS';
    if (host === 'vortexapproach.org') return 'Vortex Approach';
    if (host === 'bvsms.saude.gov.br') {
      if (pathname.includes('2048')) return 'MS · Portaria 2048';
      return 'BVS / Ministério da Saúde';
    }
    if (host === 'who.int') return 'OMS (WHO)';
    return host;
  } catch {
    return url.slice(0, 32);
  }
}

/** Chave persistida no cockpitStore (teoriaExercisesDone) para cada micro-drill. */
export function getTeoriaDrillKey(modId: string, drillIndex: number): string {
  return `${modId}:drill-${drillIndex}`;
}

/** Conta quantos micro-drills (<details>) existem em um módulo teórico. */
export function countModuleDrills(markdown: string): number {
  return (String(markdown || '').match(/<details\b/gi) || []).length;
}

/** Extrai cenários específicos do Treino Clínico referenciados no texto do módulo. */
export function extractModuleTreinoTargets(markdown: string): TeoriaTreinoTarget[] {
  const text = String(markdown || '');
  const found: TeoriaTreinoTarget[] = [];
  const seen = new Set<string>();
  const codeRe = /`([a-z0-9-]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    const target = TREINO_SCENARIO_BY_SLUG.get(slug);
    if (target) {
      seen.add(slug);
      found.push(target);
    }
  }
  return found;
}

function buildBodySnippet(markdown: string, normQuery: string): { snippet: string; matchCount: number } {
  const plain = String(markdown || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*`|>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normPlain = normalizeSearchText(plain);

  // Conta ocorrências aproximadas sem acento
  let count = 0;
  let pos = 0;
  while (normQuery && (pos = normPlain.indexOf(normQuery, pos)) !== -1) {
    count += 1;
    pos += normQuery.length;
  }

  // Encontra o primeiro trecho no texto original
  const firstIdx = normPlain.indexOf(normQuery);
  if (firstIdx < 0) return { snippet: '', matchCount: 0 };

  const start = Math.max(0, firstIdx - 38);
  const end = Math.min(plain.length, firstIdx + normQuery.length + 68);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';
  return {
    snippet: `${prefix}${plain.slice(start, end).trim()}${suffix}`,
    matchCount: Math.max(1, count),
  };
}

/**
 * Filtra e ranqueia os módulos teóricos sem sensibilidade a acentos,
 * buscando tanto em metadados (título, pilar, número) quanto no corpo completo do guia.
 */
export function searchTeoriaModules(
  modules: readonly TeoriaModuloItem[],
  query: string,
  statusFilter: 'todos' | TeoriaStatus,
  getStatus: (modId: string) => TeoriaStatus
): TeoriaSearchMatch[] {
  const normQ = normalizeSearchText(query);
  const tokens = normQ ? normQ.split(/\s+/).filter(Boolean) : [];

  const metaMatches: TeoriaSearchMatch[] = [];
  const bodyMatches: TeoriaSearchMatch[] = [];

  for (const mod of modules) {
    if (statusFilter !== 'todos' && getStatus(mod.id) !== statusFilter) continue;
    if (tokens.length === 0) {
      metaMatches.push({ mod, matchKind: null, snippet: null, matchCount: 0 });
      continue;
    }

    const metaHaystack = normalizeSearchText(
      `${mod.num} modulo ${mod.num} ${mod.title} ${mod.shortTitle} ${mod.pilar}`
    );
    const matchesMeta = tokens.every((tk) => metaHaystack.includes(tk));

    const bodyHaystack = normalizeSearchText(mod.markdown);
    const matchesBody = tokens.every((tk) => bodyHaystack.includes(tk));

    if (matchesMeta) {
      const { matchCount } = buildBodySnippet(mod.markdown, normQ);
      metaMatches.push({ mod, matchKind: 'meta', snippet: null, matchCount });
    } else if (matchesBody) {
      const primaryToken = normQ.includes(' ')
        ? bodyHaystack.includes(normQ)
          ? normQ
          : tokens[0]
        : normQ;
      const { snippet, matchCount } = buildBodySnippet(mod.markdown, primaryToken);
      bodyMatches.push({ mod, matchKind: 'body', snippet: snippet || null, matchCount });
    }
  }

  return [...metaMatches, ...bodyMatches];
}
