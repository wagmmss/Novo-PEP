// ============================================================================
// RENDERIZADOR EDITORIAL DE DIRETRIZES & RACIOCÍNIO CLÍNICO ("POR QUÊ")
// ============================================================================

export function escapeHtml(str: unknown): string {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeInlineLatex(input: string): string {
  let s = input;
  // Desembrulha delimitadores $...$ preservando valores monetários (R$ ...)
  s = s.replace(/(?<!R)\$([^$\n]+)\$/g, '$1');

  // Comandos e símbolos LaTeX comuns (com ou sem $ ao redor)
  s = s
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\pm\b/g, '±')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\^\{\\circ\}|\^\\circ\b/g, '°')
    .replace(/\\%/g, '%')
    .replace(/\\,/g, ' ');

  // Superescritos e subscritos químicos/matemáticos frequentes
  s = s
    .replace(/\^\{2\+\}/g, '²⁺')
    .replace(/\^\{3\+\}/g, '³⁺')
    .replace(/\^2\b|\^\{2\}/g, '²')
    .replace(/\^3\b|\^\{3\}/g, '³')
    .replace(/\^5\b|\^\{5\}/g, '⁵')
    .replace(/_2\b|_\{2\}/g, '₂')
    .replace(/_4\b|_\{4\}/g, '₄');

  // Remove wrappers \text{...}, \mathbf{...}, \mathrm{...} (inclusive aninhados)
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\(?:text|mathbf|mathrm|mathit|textbf)\{([^{}]*)\}/g, '$1');
  }

  // Subscritos textuais como Alb_{Soro} -> Alb (Soro)
  s = s.replace(/_\{([^{}]+)\}/g, ' ($1)');
  s = s.replace(/\^\{([^{}]+)\}/g, '^$1');
  return s;
}

export function formatGuiaInlineHtml(rawStr: unknown): string {
  let s = normalizeInlineLatex(String(rawStr == null ? '' : rawStr));

  const codeTokens: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, codeContent) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code class="guia-inline-code">${escapeHtml(codeContent)}</code>`);
    return `\u0000CODE_${idx}\u0000`;
  });

  s = escapeHtml(s);
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="guia-strong"><em class="guia-em">$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="guia-strong">$1</strong>');
  s = s.replace(/(?<!\w)\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, '<em class="guia-em">$1</em>');
  s = s.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');
  return s;
}

export function classifyGuiaSectionTheme(title: string): { cls: string; tag: string } {
  const t = String(title || '').toLowerCase();
  if (t.includes('proibid') || t.includes('não ') || t.includes('nao ') || t.includes('armadilha') || t.includes('trava') || t.includes('erro') || t.includes('🚫')) {
    return { cls: 'theme-danger', tag: 'Segurança & Travas' };
  }
  if (t.includes('prescrev') || t.includes('farmacolog') || t.includes('antibiót') || t.includes('antibiot') || t.includes('uterotôn') || t.includes('magnésio') || t.includes('suplement') || t.includes('💊') || t.includes('💉')) {
    return { cls: 'theme-pharma', tag: 'Farmacologia & Doses' };
  }
  if (t.includes('tabela') || t.includes('critério') || t.includes('criterio') || t.includes('checklist') || t.includes('cronograma') || t.includes('classifica') || t.includes('interpreta') || t.includes('🧭') || t.includes('🪡') || t.includes('📐')) {
    return { cls: 'theme-criteria', tag: 'Critérios & Decisão' };
  }
  return { cls: 'theme-why', tag: 'Fisiopatologia & Porquê' };
}

export function renderGuiaSectionBodyHtml(bodyText: string): string {
  const lines = String(bodyText || '').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed === '---') {
      i++;
      continue;
    }

    // Subcabeçalho ####
    if (/^#{4,6}\s+/.test(trimmed)) {
      out.push(`<h4 class="guia-subheading">${formatGuiaInlineHtml(trimmed.replace(/^#{4,6}\s+/, ''))}</h4>`);
      i++;
      continue;
    }

    // Tabela Markdown (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .slice(1, -1)
            .split(/(?<!\\)\|/)
            .map((c) => c.replace(/\\\|/g, '|').trim());
        const headerCells = parseRow(tableLines[0]);
        const theadHtml = `<thead><tr>${headerCells.map((h) => `<th>${formatGuiaInlineHtml(h)}</th>`).join('')}</tr></thead>`;
        const bodyRows: string[] = [];
        for (let rIdx = 1; rIdx < tableLines.length; rIdx++) {
          const rowStr = tableLines[rIdx];
          if (/^\|[\s:|-]+\|$/.test(rowStr)) continue;
          const cells = parseRow(rowStr);
          bodyRows.push(`<tr>${cells.map((c) => `<td>${formatGuiaInlineHtml(c)}</td>`).join('')}</tr>`);
        }
        out.push(`<div class="guia-table-wrap"><table class="guia-table">${theadHtml}<tbody>${bodyRows.join('')}</tbody></table></div>`);
        continue;
      }
    }

    // Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      out.push(`<div class="guia-callout">${formatGuiaInlineHtml(quoteLines.join(' '))}</div>`);
      continue;
    }

    // Lista não-ordenada (- ou * no início da linha sem recuo)
    if (/^[-*]\s+/.test(trimmed) && !/^\s{2,}[-*]\s+/.test(rawLine)) {
      const itemsHtml: string[] = [];
      while (i < lines.length) {
        const curRaw = lines[i];
        const curTrim = curRaw.trim();
        if (!curTrim) {
          i++;
          break;
        }
        if (/^[-*]\s+/.test(curTrim) && !/^\s{2,}[-*]\s+/.test(curRaw)) {
          const itemText = formatGuiaInlineHtml(curTrim.replace(/^[-*]\s+/, ''));
          i++;
          const subItems: string[] = [];
          while (i < lines.length && /^\s{2,}(?:[-*]|\d+\.)\s+/.test(lines[i])) {
            subItems.push(`<li class="guia-sublist-item">${formatGuiaInlineHtml(lines[i].trim().replace(/^(?:[-*]|\d+\.)\s+/, ''))}</li>`);
            i++;
          }
          const subHtml = subItems.length > 0 ? `<ul class="guia-sublist">${subItems.join('')}</ul>` : '';
          itemsHtml.push(`<li class="guia-list-item">${itemText}${subHtml}</li>`);
        } else {
          break;
        }
      }
      out.push(`<ul class="guia-list">${itemsHtml.join('')}</ul>`);
      continue;
    }

    // Lista numerada (1. , 2. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const itemsHtml: string[] = [];
      while (i < lines.length) {
        const curRaw = lines[i];
        const curTrim = curRaw.trim();
        if (!curTrim) {
          i++;
          break;
        }
        const numMatch = curTrim.match(/^(\d+)\.\s+(.+)$/);
        if (numMatch && !/^\s{2,}/.test(curRaw)) {
          const itemText = formatGuiaInlineHtml(numMatch[2]);
          i++;
          const subItems: string[] = [];
          while (i < lines.length && /^\s{2,}(?:[-*]|\d+\.)\s+/.test(lines[i])) {
            subItems.push(`<li class="guia-sublist-item">${formatGuiaInlineHtml(lines[i].trim().replace(/^(?:[-*]|\d+\.)\s+/, ''))}</li>`);
            i++;
          }
          const subHtml = subItems.length > 0 ? `<ul class="guia-sublist">${subItems.join('')}</ul>` : '';
          itemsHtml.push(
            `<li class="guia-ol-item"><span class="guia-step-num">${escapeHtml(numMatch[1])}</span><div class="guia-ol-content">${itemText}${subHtml}</div></li>`
          );
        } else {
          break;
        }
      }
      out.push(`<ol class="guia-ol">${itemsHtml.join('')}</ol>`);
      continue;
    }

    // Parágrafo comum
    out.push(`<p class="guia-paragraph">${formatGuiaInlineHtml(trimmed)}</p>`);
    i++;
  }

  return out.join('');
}

// ============================================================================
// RENDERIZADOR MARKDOWN/LATEX UNIFICADO (FORMAÇÃO TEÓRICA & TÉCNICA PROFUNDA)
// ============================================================================

function normalizeTeoriaMathInline(raw: string): string {
  return String(raw || '').replace(/(?<!R)\$([^$\n]+)\$/g, (_, expr: string) =>
    expr
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\times/g, '×')
      .replace(/\\pm/g, '±')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\approx/g, '≈')
      .replace(/\\leq|\\le/g, '≤')
      .replace(/\\geq|\\ge/g, '≥')
      .replace(/\\beta/g, 'β')
      .replace(/\\alpha/g, 'α')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/HCO_3\^-/g, 'HCO₃⁻')
      .replace(/pCO_2/g, 'pCO₂')
      .replace(/Na\^\+/g, 'Na⁺')
      .replace(/Cl\^-/g, 'Cl⁻')
      .replace(/K\^\+/g, 'K⁺')
      .replace(/Mg\^\{?2\+\}?/g, 'Mg²⁺')
      .replace(/Fe\^\{2\+\}/g, 'Fe²⁺')
      .replace(/Fe\^\{3\+\}/g, 'Fe³⁺')
      .replace(/O_2/g, 'O₂')
      .replace(/CO_2/g, 'CO₂')
      .replace(/AG_\{corr\}/g, 'AG_corr')
      .replace(/\{,\}/g, ',')
      .replace(/\\,/g, ' ')
      .replace(/[{}]/g, '')
      .trim()
  );
}

function formatInlineTeoriaMd(text: string): string {
  const codeSpans: string[] = [];
  const protectedRaw = String(text || '').replace(/`([^`]+)`/g, (_, code: string) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `@@TCODE_${idx}@@`;
  });
  const mathClean = normalizeTeoriaMathInline(protectedRaw);
  let html = escapeHtml(mathClean);
  html = html
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, '<em>$1</em>');
  codeSpans.forEach((span, idx) => {
    html = html.replace(`@@TCODE_${idx}@@`, () => span);
  });
  return html;
}

function splitMdTableRow(trimmed: string): string[] {
  const inner = trimmed.slice(1, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\' && inner[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (inner[i] === '|') {
      cells.push(cur);
      cur = '';
    } else {
      cur += inner[i];
    }
  }
  cells.push(cur);
  return cells;
}

function stripHeadingDecorators(text: string): string {
  let clean = String(text || '')
    .replace(/^\*\*([\s\S]+?)\*\*(:?)$/, '$1$2')
    .replace(/^(?:[0-9]\uFE0F?\u20E3|[\p{Extended_Pictographic}\uFE0F\u200D])+\s*/u, '')
    .trim();
  clean = clean.replace(/^\*\*([\s\S]+?)\*\*(:?)$/, '$1$2').trim();
  return clean;
}

function isMostlyUppercaseHeading(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, '').length;
  return upper / letters.length >= 0.65;
}

function extractEditorialSubheading(trimmed: string, nextNonEmptyTrimmed: string): string | null {
  // 1) Cabeçalho numerado que termina em ":" (ex: "1. **OTOSCOPIA SEGURA:**" ou "2. ENQUADRAMENTO CLÍNICO:")
  const numMatch = trimmed.match(/^\d+\.\s+(.+)$/);
  if (numMatch) {
    const rawBody = numMatch[1].trim();
    const unwrapped = rawBody.replace(/^\*\*([^*]+?)\*\*(:?)$/, '$1$2').trim();
    if (unwrapped.endsWith(':') && unwrapped.length <= 140) {
      const withoutColon = unwrapped.slice(0, -1).trim();
      const nextIsList = /^[-*]\s+|^\d+\.\s+/.test(nextNonEmptyTrimmed);
      const isBoldHeader = /^\*\*[^*]+?\*\*:?$/.test(rawBody);
      const isPassoHeader = /^PASSO\s+\d+\b/i.test(withoutColon);
      if (nextIsList || isBoldHeader || isPassoHeader || isMostlyUppercaseHeading(withoutColon)) {
        return stripHeadingDecorators(withoutColon);
      }
    }
    return null;
  }

  // 2) Cabeçalho editorial avulso sem número que termina em ":" (ex: "LABORATÓRIO CRÍTICO DE PLANTÃO:")
  const unwrapped = trimmed.replace(/^\*\*([^*]+?)\*\*(:?)$/, '$1$2').trim();
  if (unwrapped.endsWith(':') && unwrapped.length >= 5 && unwrapped.length <= 120) {
    const withoutColon = unwrapped.slice(0, -1).trim();
    if (/^PASSO\s+\d+\s*[—–-]/i.test(withoutColon) || isMostlyUppercaseHeading(withoutColon)) {
      return stripHeadingDecorators(withoutColon);
    }
  }

  return null;
}

export function renderTeoriaMarkdownToHtml(md: string): string {
  const lines = String(md || '').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let olNextNum = 1;
  let tableRows: string[][] = [];
  let quoteBuffer: string[] = [];

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
      olNextNum = 1;
    }
  };

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    const innerHtml = quoteBuffer.map((q) => formatInlineTeoriaMd(q)).join('<br>');
    out.push(`<blockquote>${innerHtml}</blockquote>`);
    quoteBuffer = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headerCells = tableRows[0] || [];
    const bodyRows = tableRows.slice(2);
    let html = '<div class="mq-table-wrap"><table class="mq-table"><thead><tr>';
    headerCells.forEach((c) => {
      html += `<th>${formatInlineTeoriaMd(c.trim())}</th>`;
    });
    html += '</tr></thead><tbody>';
    bodyRows.forEach((row) => {
      html += '<tr>';
      row.forEach((c) => {
        html += `<td>${formatInlineTeoriaMd(c.trim())}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    out.push(html);
    tableRows = [];
  };

  const findNextNonEmpty = (fromIdx: number): string => {
    for (let j = fromIdx + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t) return t;
    }
    return '';
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const isIndented = /^\s{2,}/.test(raw);

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushQuote();
      closeLists();
      tableRows.push(splitMdTableRow(trimmed));
      continue;
    } else if (tableRows.length > 0) {
      flushTable();
    }

    if (trimmed.startsWith('> ')) {
      closeLists();
      quoteBuffer.push(trimmed.slice(2));
      continue;
    } else if (trimmed === '>') {
      closeLists();
      quoteBuffer.push('');
      continue;
    } else if (quoteBuffer.length > 0) {
      flushQuote();
    }

    if (!trimmed) {
      closeLists();
      continue;
    }
    if (trimmed === '---') {
      closeLists();
      out.push('<hr>');
      continue;
    }
    const detailsOpenMatch = trimmed.match(/^<details>\s*<summary>([\s\S]+?)<\/summary>\s*$/i);
    if (detailsOpenMatch) {
      flushQuote();
      closeLists();
      flushTable();
      out.push(
        `<details class="guia-drill-details my-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-white/[0.08] dark:bg-[#15181F]"><summary class="cursor-pointer select-none text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">${formatInlineTeoriaMd(detailsOpenMatch[1].trim())}</summary><div class="mt-2.5 space-y-2 border-t border-zinc-200/70 pt-2.5 dark:border-white/[0.07]">`
      );
      continue;
    }
    if (/^<\/details>\s*$/i.test(trimmed)) {
      flushQuote();
      closeLists();
      flushTable();
      out.push('</div></details>');
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeLists();
      out.push(`<h1>${formatInlineTeoriaMd(stripHeadingDecorators(trimmed.slice(2)))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeLists();
      out.push(`<h2>${formatInlineTeoriaMd(stripHeadingDecorators(trimmed.slice(3)))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      closeLists();
      out.push(`<h3>${formatInlineTeoriaMd(stripHeadingDecorators(trimmed.slice(4)))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      closeLists();
      out.push(`<h4 class="preporta-subhead">${formatInlineTeoriaMd(stripHeadingDecorators(trimmed.slice(5)))}</h4>`);
      continue;
    }

    // Subtítulo editorial (distingue cabeçalhos como "1. **OTOSCOPIA SEGURA:**" de listas numeradas)
    if (!isIndented) {
      const subhead = extractEditorialSubheading(trimmed, findNextNonEmpty(i));
      if (subhead) {
        closeLists();
        out.push(`<h4 class="preporta-subhead">${formatInlineTeoriaMd(subhead)}</h4>`);
        continue;
      }
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (inOl && isIndented) {
        out.push(
          `<li style="list-style:disc; margin-left:22px;">${formatInlineTeoriaMd(trimmed.replace(/^[-*]\s+/, ''))}</li>`
        );
      } else {
        if (inOl) {
          out.push('</ol>');
          inOl = false;
          olNextNum = 1;
        }
        if (!inUl) {
          out.push('<ul>');
          inUl = true;
        }
        out.push(`<li>${formatInlineTeoriaMd(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      }
    } else if (/^\d+\.\s+/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      const itemNum = numMatch ? Number(numMatch[1]) : 1;
      const itemBody = numMatch ? numMatch[2] : trimmed.replace(/^\d+\.\s+/, '');

      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push(itemNum !== 1 ? `<ol start="${itemNum}">` : '<ol>');
        inOl = true;
        olNextNum = itemNum;
      }
      const liAttr = itemNum !== olNextNum ? ` value="${itemNum}"` : '';
      out.push(`<li${liAttr}>${formatInlineTeoriaMd(itemBody)}</li>`);
      olNextNum = itemNum + 1;
    } else {
      closeLists();
      out.push(`<p>${formatInlineTeoriaMd(trimmed)}</p>`);
    }
  }

  flushQuote();
  closeLists();
  flushTable();
  return out.join('\n');
}

// ============================================================================
// PARSER ESTRUTURADO & FORMATAÇÃO DE TÍTULOS DO PRÉ-PORTA (hab-*)
// ============================================================================

export interface PrePortaParsedSections {
  resumo30s: string;
  mnemonico: string;
  coreografia: string;
  fallback: string;
}

const PRE_PORTA_RESUMO_RE = /^\s*(?:\d+\.\s*)?O QUE N[ÃA]O ESQUECER(?:\s*\([^)]*\))?\s*:?\s*$/i;
const PRE_PORTA_MNEMONICO_RE = /^\s*(?:\d+\.\s*)?MNEM[ÔO]NICO\s*\/\s*REGRA DE OURO\s*:?\s*$/i;
const PRE_PORTA_COREOGRAFIA_RE =
  /^\s*(?:\d+\.\s*)?(?:COREOGRAFIA(?:\s*\/\s*PASSO A PASSO(?:\s+T[ÉE]CNICO)?)?|PASSO A PASSO(?:\s+T[ÉE]CNICO)?)\s*:?\s*$/i;

function cleanDoubleNumberingLine(line: string): string {
  return line
    .replace(/^(\s*)\d+\.\s+(\d+\.\s+)/, '$1$2')
    .replace(/^(\s*)\d+\.\s+(PASSO\s+\d+\b)/i, '$1$2')
    .replace(/^(\s*)\d+\.\s+([A-F]\.\s+)/, '$1$2');
}

/**
 * Divide o campo `pre_porta` em seções editoriais limpas (Resumo 30s, Mnemônico / Regra de Ouro
 * e Coreografia / Passo a Passo), removendo cabeçalhos numerados falsos e numerações duplicadas.
 */
export function parsePrePortaContent(raw: string): PrePortaParsedSections {
  const text = String(raw || '').trim();
  if (!text) {
    return { resumo30s: '', mnemonico: '', coreografia: '', fallback: '' };
  }

  const lines = text.split('\n');
  let activeKey: 'resumo30s' | 'mnemonico' | 'coreografia' | 'fallback' = 'fallback';
  const buckets: Record<'resumo30s' | 'mnemonico' | 'coreografia' | 'fallback', string[]> = {
    resumo30s: [],
    mnemonico: [],
    coreografia: [],
    fallback: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (PRE_PORTA_RESUMO_RE.test(trimmed)) {
      activeKey = 'resumo30s';
      continue;
    }
    if (PRE_PORTA_MNEMONICO_RE.test(trimmed)) {
      activeKey = 'mnemonico';
      continue;
    }
    if (PRE_PORTA_COREOGRAFIA_RE.test(trimmed)) {
      activeKey = 'coreografia';
      continue;
    }
    buckets[activeKey].push(cleanDoubleNumberingLine(line));
  }

  const resumo30s = buckets.resumo30s.join('\n').trim();
  const mnemonico = buckets.mnemonico.join('\n').trim();
  const coreografia = buckets.coreografia.join('\n').trim();
  const fallback = buckets.fallback.join('\n').trim();

  return { resumo30s, mnemonico, coreografia, fallback };
}

/**
 * Remove emojis iniciais e corrige siglas/capitalização nos títulos dos cartões Pré-Porta.
 */
export function formatPrePortaTitle(rawTitle: string): string {
  return String(rawTitle || '')
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')
    .replace(/\bAcog\b/g, 'ACOG')
    .replace(/\boms\b/g, 'OMS')
    .replace(/\bPl\b/g, 'PL')
    .replace(/\bparacentese\b/g, 'Paracentese')
    .replace(/\bNurse\b/g, 'NURSE')
    .replace(/\bTEACH-BACK\b/g, 'Teach-Back')
    .replace(/\btep\b/g, 'TEP')
    .replace(/\bortopedia\b/g, 'Ortopedia')
    .replace(/\bone-minute\b/gi, 'One-Minute')
    .trim();
}

