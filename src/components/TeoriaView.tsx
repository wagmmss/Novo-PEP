import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Dumbbell,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { FORMACAO_TEORICA_MODULOS, type Central6AnoState } from '../engine/central6ano.ts';
import { formatPrePortaTitle, renderTeoriaMarkdownToHtml } from '../engine/diretrizes.ts';
import {
  DEFAULT_TREINO_EIXO_BY_MOD,
  TREINO_SCENARIO_BY_SLUG,
  countModuleDrills,
  estimateReadingStats,
  extractModuleTreinoTargets,
  extractTeoriaOutline,
  getTeoriaDrillKey,
  searchTeoriaModules,
  stripModuleTitlePrefix,
} from '../engine/teoriaGuias.ts';
import { normalizeSearchText } from '../engine/search.ts';
import { resolveLinksForTeoriaModule } from '../data/clinical_links.ts';
import { HAB_PROTOCOLS } from '../data/protocolsRepo.ts';
import { cockpitStore, type TeoriaModuleStatus } from '../state/store.ts';
import type { TeoriaSubMode, TreinoSectionRoute } from '../state/hashRoute.ts';
import { TreinoClinicoView, type TreinoFocusTarget } from './TreinoClinicoView.tsx';

interface TeoriaViewProps {
  central6Ano: Central6AnoState;
  subMode: TeoriaSubMode;
  selectedModId: string;
  mobileShowDetail: boolean;
  treinoSection: TreinoSectionRoute;
  treinoSlug: string | null;
  mobileTreinoDetail: boolean;
  shortcutsEnabled?: boolean;
  onChangeSubMode: (mode: TeoriaSubMode) => void;
  onSelectModId: (modId: string) => void;
  onBackToList: () => void;
  onChangeTreinoRoute: (sec: TreinoSectionRoute, slug: string | null | undefined, detail: boolean) => void;
  onOpenPrePorta: (habId: string) => void;
  onNotify?: (msg: string) => void;
}

const STATUS_OPTIONS: Array<{ value: TeoriaModuleStatus; label: string }> = [
  { value: 'nao_iniciado', label: 'Não iniciado' },
  { value: 'estudado', label: 'Em andamento' },
  { value: 'dominado', label: 'Dominado' },
];

const STATUS_LABEL_MAP: Record<TeoriaModuleStatus, string> = {
  nao_iniciado: 'Não iniciado',
  estudado: 'Em andamento',
  dominado: 'Dominado',
};

const HAB_BY_ID = new Map(HAB_PROTOCOLS.map((h) => [h.id, h]));
const MAX_COLLAPSED_HABS = 3;

function stripLeadingH1(markdown: string): string {
  return String(markdown || '').replace(/^\s*#\s+[^\n]+\n+/, '');
}

/** Aplica destaque <mark> sem sensibilidade a acentos nos nós de texto de um container. */
function highlightTermInContainer(container: HTMLElement, rawQuery: string): HTMLElement[] {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery || normQuery.length < 2) return [];

  const marks: HTMLElement[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('mark, button, script, style')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    textNodes.push(cur as Text);
  }

  for (const textNode of textNodes) {
    const raw = textNode.nodeValue || '';
    // Mapeia cada caractere normalizado de volta ao índice no texto original
    const normChars: string[] = [];
    const origIdxMap: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const n = raw[i]
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      for (let j = 0; j < n.length; j++) {
        normChars.push(n[j]);
        origIdxMap.push(i);
      }
    }
    const normStr = normChars.join('');
    let searchFrom = 0;
    const ranges: Array<[number, number]> = [];
    while (searchFrom < normStr.length) {
      const found = normStr.indexOf(normQuery, searchFrom);
      if (found === -1) break;
      const startOrig = origIdxMap[found];
      const endNorm = found + normQuery.length - 1;
      const endOrig = origIdxMap[endNorm] + 1;
      ranges.push([startOrig, endOrig]);
      searchFrom = found + normQuery.length;
    }

    if (ranges.length === 0) continue;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) {
        frag.appendChild(document.createTextNode(raw.slice(cursor, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'teoria-search-mark';
      mark.textContent = raw.slice(start, end);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = end;
    }
    if (cursor < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return marks;
}

export function TeoriaView({
  central6Ano,
  subMode,
  selectedModId,
  mobileShowDetail,
  treinoSection,
  treinoSlug,
  mobileTreinoDetail,
  shortcutsEnabled = true,
  onChangeSubMode,
  onSelectModId,
  onBackToList,
  onChangeTreinoRoute,
  onOpenPrePorta,
  onNotify,
}: TeoriaViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | TeoriaModuleStatus>('todos');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [habsExpanded, setHabsExpanded] = useState(false);
  const [allDrillsExpanded, setAllDrillsExpanded] = useState(false);
  const [readProgressPct, setReadProgressPct] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [cameFromTreino, setCameFromTreino] = useState(false);
  const [treinoFocus, setTreinoFocus] = useState<TreinoFocusTarget | null>(null);

  // Busca/destaque dentro do artigo
  const [matchCountInArticle, setMatchCountInArticle] = useState(0);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const marksRef = useRef<HTMLElement[]>([]);

  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const proseContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  const statusById = central6Ano.teoriaStatusById || {};
  const exercisesDone = central6Ano.teoriaExercisesDone || {};

  const getStatus = useCallback(
    (modId: string): TeoriaModuleStatus => {
      const raw = statusById[modId];
      if (raw === 'estudado' || raw === 'dominado') return raw;
      return 'nao_iniciado';
    },
    [statusById]
  );

  const counts = useMemo(() => {
    let dominado = 0;
    let estudado = 0;
    let nao_iniciado = 0;
    for (const mod of FORMACAO_TEORICA_MODULOS) {
      const st = getStatus(mod.id);
      if (st === 'dominado') dominado += 1;
      else if (st === 'estudado') estudado += 1;
      else nao_iniciado += 1;
    }
    return {
      dominado,
      estudado,
      nao_iniciado,
      total: FORMACAO_TEORICA_MODULOS.length,
    };
  }, [getStatus]);

  const searchResults = useMemo(
    () => searchTeoriaModules(FORMACAO_TEORICA_MODULOS, query, statusFilter, getStatus),
    [query, statusFilter, getStatus]
  );

  const activeMod = useMemo(
    () =>
      FORMACAO_TEORICA_MODULOS.find((m) => m.id === selectedModId) ||
      FORMACAO_TEORICA_MODULOS[0],
    [selectedModId]
  );

  const activeModIndex = useMemo(
    () => FORMACAO_TEORICA_MODULOS.findIndex((m) => m.id === activeMod?.id),
    [activeMod?.id]
  );
  const prevMod = activeModIndex > 0 ? FORMACAO_TEORICA_MODULOS[activeModIndex - 1] : null;
  const nextMod =
    activeModIndex >= 0 && activeModIndex < FORMACAO_TEORICA_MODULOS.length - 1
      ? FORMACAO_TEORICA_MODULOS[activeModIndex + 1]
      : null;

  const strippedMarkdown = useMemo(
    () => (activeMod ? stripLeadingH1(activeMod.markdown) : ''),
    [activeMod]
  );

  const readingStats = useMemo(
    () => estimateReadingStats(strippedMarkdown),
    [strippedMarkdown]
  );

  const outline = useMemo(
    () => extractTeoriaOutline(strippedMarkdown),
    [strippedMarkdown]
  );

  const totalDrillsInMod = useMemo(
    () => countModuleDrills(strippedMarkdown),
    [strippedMarkdown]
  );

  const doneDrillsInMod = useMemo(() => {
    if (!activeMod || totalDrillsInMod === 0) return 0;
    let done = 0;
    for (let i = 1; i <= totalDrillsInMod; i++) {
      if (exercisesDone[getTeoriaDrillKey(activeMod.id, i)]) done += 1;
    }
    return done;
  }, [activeMod, totalDrillsInMod, exercisesDone]);

  const moduleTreinoTargets = useMemo(
    () => extractModuleTreinoTargets(strippedMarkdown),
    [strippedMarkdown]
  );

  const linkedHabs = useMemo(() => {
    if (!activeMod) return [];
    const resolved = resolveLinksForTeoriaModule(activeMod.id);
    const mergedIds = Array.from(
      new Set([...(activeMod.relatedHabIds || []), ...resolved.habIds])
    );
    return mergedIds
      .map((id) => HAB_BY_ID.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [activeMod]);

  const renderedHtml = useMemo(() => {
    if (!activeMod) return '';
    return renderTeoriaMarkdownToHtml(strippedMarkdown, {
      linkTreinoSlugs: true,
      includeHeadingIds: true,
    });
  }, [activeMod, strippedMarkdown]);

  const activeStatus: TeoriaModuleStatus = activeMod ? getStatus(activeMod.id) : 'nao_iniciado';

  // Restaura posição de rolagem por módulo na sessão e reseta estado local de expansão
  useEffect(() => {
    setHabsExpanded(false);
    setAllDrillsExpanded(false);
    const el = detailScrollRef.current;
    if (!el || !activeMod) return;
    const savedTop = scrollPositionsRef.current[activeMod.id] || 0;
    el.scrollTo({ top: savedTop, behavior: 'auto' });
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    setReadProgressPct(savedTop > 0 ? Math.min(100, Math.round((savedTop / maxScroll) * 100)) : 0);
    setActiveHeadingId(outline[0]?.id || '');
  }, [activeMod?.id, outline]);

  // Acompanha rolagem: barra de progresso, posição salva na sessão e scroll-spy do Sumário
  const handleDetailScroll = useCallback(() => {
    const el = detailScrollRef.current;
    if (!el || !activeMod) return;
    const top = el.scrollTop;
    scrollPositionsRef.current[activeMod.id] = top;
    const maxScroll = el.scrollHeight - el.clientHeight;
    setReadProgressPct(maxScroll > 20 ? Math.min(100, Math.round((top / maxScroll) * 100)) : 0);

    // Scroll-spy simples sobre os headings do artigo
    const container = proseContainerRef.current;
    if (!container || outline.length === 0) return;
    const containerRect = el.getBoundingClientRect();
    let currentId = outline[0]?.id || '';
    for (const item of outline) {
      const node = container.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`);
      if (!node) continue;
      if (node.getBoundingClientRect().top - containerRect.top <= 110) {
        currentId = item.id;
      } else {
        break;
      }
    }
    setActiveHeadingId(currentId);
  }, [activeMod, outline]);

  // Destaca ocorrências do termo buscado dentro do texto do guia
  useEffect(() => {
    const container = proseContainerRef.current;
    if (!container || subMode !== 'guias') return;

    // Restaura HTML limpo antes de aplicar novos <mark>
    container.innerHTML = renderedHtml;
    marksRef.current = [];

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setMatchCountInArticle(0);
      setActiveMatchIdx(0);
      return;
    }

    const marks = highlightTermInContainer(container, trimmed);
    marksRef.current = marks;
    setMatchCountInArticle(marks.length);
    setActiveMatchIdx(0);
    if (marks[0]) {
      marks[0].classList.add('teoria-search-mark-active');
    }
  }, [renderedHtml, query, subMode]);

  const jumpToMatch = useCallback((direction: 1 | -1) => {
    const marks = marksRef.current;
    if (marks.length === 0) return;
    marks.forEach((m) => m.classList.remove('teoria-search-mark-active'));
    setActiveMatchIdx((prev) => {
      const next = (prev + direction + marks.length) % marks.length;
      const target = marks[next];
      if (target) {
        // Se estiver dentro de um <details> fechado, abre para mostrar o destaque
        const parentDetails = target.closest('details');
        if (parentDetails && !parentDetails.open) parentDetails.open = true;
        target.classList.add('teoria-search-mark-active');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return next;
    });
  }, []);

  const handleToggleAllDrills = useCallback(() => {
    const container = proseContainerRef.current;
    if (!container) return;
    const nextOpen = !allDrillsExpanded;
    const detailsList = container.querySelectorAll<HTMLDetailsElement>('details.guia-drill-details');
    detailsList.forEach((d) => {
      d.open = nextOpen;
    });
    setAllDrillsExpanded(nextOpen);
  }, [allDrillsExpanded]);

  const handleJumpToHeading = useCallback((headingId: string) => {
    const container = proseContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveHeadingId(headingId);
  }, []);

  const handleJumpToTreinoScenario = useCallback(
    (eixo: 'e1' | 'e3' | 'e4', slug?: string) => {
      onChangeTreinoRoute(eixo, slug ?? null, Boolean(slug));
      setTreinoFocus({ eixo, slug, nonce: Date.now() });
      setCameFromTreino(false);
      onChangeSubMode('treino');
      if (slug) {
        const scenario = TREINO_SCENARIO_BY_SLUG.get(slug);
        onNotify?.(`Treino Clínico: ${scenario?.nome || slug}`);
      }
    },
    [onChangeSubMode, onChangeTreinoRoute, onNotify]
  );

  // Delegação de clique dentro do HTML renderizado (chips de cenário do Treino Clínico)
  const handleProseClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const targetEl = e.target as HTMLElement | null;
      const btn = targetEl?.closest<HTMLButtonElement>('button[data-treino-slug]');
      if (!btn) return;
      const slug = btn.dataset.treinoSlug;
      if (!slug) return;
      const scenario = TREINO_SCENARIO_BY_SLUG.get(slug);
      if (!scenario) return;
      handleJumpToTreinoScenario(scenario.eixo, scenario.slug);
    },
    [handleJumpToTreinoScenario]
  );

  // Atalhos de teclado dos Guias Teóricos (/, [, Alt+←/→)
  useEffect(() => {
    if (!shortcutsEnabled || subMode !== 'guias') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const isEditable =
        !!el && (el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));

      if (e.key === '/' && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!sidebarOpen) setSidebarOpen(true);
        window.setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 10);
        return;
      }

      if (e.key === '[' && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft' && prevMod) {
        e.preventDefault();
        onSelectModId(prevMod.id);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight' && nextMod) {
        e.preventDefault();
        onSelectModId(nextMod.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutsEnabled, subMode, sidebarOpen, prevMod, nextMod, onSelectModId]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        setQuery('');
      } else {
        e.currentTarget.blur();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchCountInArticle > 0) {
        jumpToMatch(1);
      } else {
        e.currentTarget.blur();
      }
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchResults.length > 0) {
      e.preventDefault();
      const idx = searchResults.findIndex((r) => r.mod.id === activeMod?.id);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx =
        idx < 0 ? 0 : (idx + step + searchResults.length) % searchResults.length;
      onSelectModId(searchResults[nextIdx].mod.id);
    }
  };

  const handleSetStatus = (modId: string, nextStatus: TeoriaModuleStatus) => {
    cockpitStore.setTeoriaModuleStatus(modId, nextStatus);
    onNotify?.(`Módulo marcado como "${STATUS_LABEL_MAP[nextStatus]}".`);
  };

  const handleToggleDrillDone = (drillIndex: number) => {
    if (!activeMod) return;
    const key = getTeoriaDrillKey(activeMod.id, drillIndex);
    const nowDone = cockpitStore.toggleTeoriaExerciseDone(key);
    onNotify?.(
      nowDone
        ? `Drill ${drillIndex} marcado como praticado.`
        : `Drill ${drillIndex} desmarcado.`
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const visibleHabs = habsExpanded ? linkedHabs : linkedHabs.slice(0, MAX_COLLAPSED_HABS);
  const hiddenHabsCount = Math.max(0, linkedHabs.length - MAX_COLLAPSED_HABS);
  const masteryPct = counts.total > 0 ? Math.round((counts.dominado / counts.total) * 100) : 0;
  const inProgressPct = counts.total > 0 ? Math.round((counts.estudado / counts.total) * 100) : 0;
  const drillsHeading = outline.find((o) => o.level === 2 && /micro-drills/i.test(o.text));
  const defaultTreinoEixo = activeMod ? DEFAULT_TREINO_EIXO_BY_MOD[activeMod.id] || 'e1' : 'e1';

  return (
    <div className="teoria-print-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Switch segmentado discreto: Treino Clínico | Guias Teóricos (9) */}
      <div className="no-print flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-[#FAFAFA] px-4 py-2 dark:border-white/[0.07] dark:bg-[#0F1115]">
        <div
          role="group"
          aria-label="Modo da aba Treino e Teoria"
          className="inline-flex items-center rounded-lg border border-zinc-200/80 bg-zinc-100/80 p-0.5 dark:border-white/[0.07] dark:bg-[#15181F]"
        >
          <button
            type="button"
            onClick={() => {
              setCameFromTreino(false);
              onChangeSubMode('treino');
            }}
            aria-pressed={subMode === 'treino'}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              subMode === 'treino'
                ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#1C2029] dark:text-[#F3F4F6]'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
            }`}
          >
            Treino Clínico
          </button>
          <button
            type="button"
            onClick={() => onChangeSubMode('guias')}
            aria-pressed={subMode === 'guias'}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              subMode === 'guias'
                ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#1C2029] dark:text-[#F3F4F6]'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
            }`}
          >
            Guias Teóricos ({FORMACAO_TEORICA_MODULOS.length})
          </button>
        </div>

        {subMode === 'guias' && cameFromTreino && (
          <button
            type="button"
            onClick={() => {
              setCameFromTreino(false);
              onChangeSubMode('treino');
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/90 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Treino
          </button>
        )}
      </div>

      {/* Mantém TreinoClinicoView montado (hidden) para preservar rascunhos, data simulada e estado ao ir/voltar de Guias */}
      <div className={subMode === 'treino' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
        <TreinoClinicoView
          central6Ano={central6Ano}
          section={treinoSection}
          routeSlug={treinoSlug}
          mobileShowDetail={mobileTreinoDetail}
          onChangeRoute={onChangeTreinoRoute}
          onOpenPrePorta={onOpenPrePorta}
          onNotify={onNotify || (() => {})}
          focusTarget={treinoFocus}
          onConsumeFocusTarget={() => setTreinoFocus(null)}
          onOpenGuiaTeorico={(modId: string) => {
            setCameFromTreino(true);
            onSelectModId(modId);
            onChangeSubMode('guias');
          }}
        />
      </div>

      {subMode === 'guias' && (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115]">
          {/* Coluna Esquerda — Lista de módulos (recolhível em desktop) */}
          <aside
            aria-label="Módulos de formação teórica"
            className={`no-print flex h-full w-full flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:w-[320px] lg:shrink-0 dark:border-white/[0.07] dark:bg-[#0F1115] ${
              mobileShowDetail ? 'hidden' : 'flex'
            } ${sidebarOpen ? 'lg:flex' : 'lg:hidden'}`}
          >
            <div className="space-y-2.5 border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
              <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                  Formação Teórica
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {counts.dominado}/{counts.total} dominados
                  {counts.estudado > 0 ? ` · ${counts.estudado} em and.` : ''}
                </span>
              </div>

              {/* Barra fina de progresso geral dos 9 módulos */}
              <div
                aria-label={`${counts.dominado} de ${counts.total} módulos dominados`}
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/[0.07]"
              >
                <div
                  className="bg-[#0F766E] transition-all duration-300 dark:bg-[#2DD4BF]"
                  style={{ width: `${masteryPct}%` }}
                />
                <div
                  className="bg-amber-400/85 transition-all duration-300 dark:bg-amber-400/75"
                  style={{ width: `${inProgressPct}%` }}
                />
              </div>

              {/* Busca com acento-insensível + texto completo */}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#9CA3AF]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Buscar módulo ou termo..."
                  aria-label="Buscar módulo ou conteúdo teórico"
                  className="w-full rounded-lg border border-zinc-200/90 bg-white py-1.5 pr-8 pl-8 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Limpar filtro de módulos"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] text-zinc-400 lg:inline-block dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#6B7280]">
                    /
                  </kbd>
                )}
              </div>

              {/* Filtros de status com contagem e aria-pressed */}
              <div
                role="group"
                aria-label="Filtrar módulos por status"
                className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-2"
              >
                {(
                  [
                    { id: 'todos', label: 'Todos', count: counts.total },
                    { id: 'nao_iniciado', label: 'Pendentes', count: counts.nao_iniciado },
                    { id: 'estudado', label: 'Andamento', count: counts.estudado },
                    { id: 'dominado', label: 'Dominados', count: counts.dominado },
                  ] as const
                ).map((opt) => {
                  const pressed = statusFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => setStatusFilter(opt.id)}
                      className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        pressed
                          ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                          : 'bg-zinc-100/70 text-zinc-600 hover:bg-zinc-200/70 dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          pressed ? 'opacity-90' : 'text-zinc-400 dark:text-[#6B7280]'
                        }`}
                      >
                        {opt.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-2" aria-label="Lista de módulos teóricos">
              {searchResults.length === 0 ? (
                <div className="space-y-2.5 px-3 py-8 text-center">
                  <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    Nenhum módulo encontrado para os filtros ativos.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setStatusFilter('todos');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {searchResults.map(({ mod, matchKind, snippet, matchCount }) => {
                    const isSelected = activeMod?.id === mod.id;
                    const st = getStatus(mod.id);
                    const modDrillsTotal = countModuleDrills(mod.markdown);
                    let modDrillsDone = 0;
                    for (let i = 1; i <= modDrillsTotal; i++) {
                      if (exercisesDone[getTeoriaDrillKey(mod.id, i)]) modDrillsDone += 1;
                    }
                    return (
                      <li key={mod.id}>
                        <button
                          type="button"
                          aria-current={isSelected ? 'page' : undefined}
                          onClick={() => onSelectModId(mod.id)}
                          className={`w-full rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-teal-50/80 text-zinc-950 ring-1 ring-[#0F766E]/20 dark:bg-teal-500/12 dark:text-[#F3F4F6] dark:ring-[#2DD4BF]/25'
                              : 'text-zinc-700 hover:bg-zinc-100/80 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-medium text-zinc-400 dark:text-[#6B7280]">
                              MÓDULO {mod.num}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                st === 'dominado'
                                  ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                                  : st === 'estudado'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-zinc-400 dark:text-[#6B7280]'
                              }`}
                            >
                              {st === 'dominado' ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    st === 'estudado'
                                      ? 'bg-amber-500 dark:bg-amber-400'
                                      : 'bg-zinc-300 dark:bg-zinc-600'
                                  }`}
                                />
                              )}
                              {STATUS_LABEL_MAP[st]}
                            </span>
                          </div>
                          <div
                            className={`mt-0.5 line-clamp-2 text-sm leading-snug ${
                              isSelected
                                ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]'
                                : 'font-medium'
                            }`}
                          >
                            {mod.shortTitle}
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                            <span className="truncate">{mod.pilar}</span>
                            {modDrillsDone > 0 && (
                              <span className="shrink-0 font-mono text-[10px] text-[#0F766E] dark:text-[#2DD4BF]">
                                {modDrillsDone}/{modDrillsTotal} drills
                              </span>
                            )}
                          </div>
                          {matchKind === 'body' && snippet && (
                            <div className="mt-1.5 rounded border border-amber-200/80 bg-amber-50/70 px-2 py-1 text-[11px] leading-snug text-zinc-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100/85">
                              <span className="mr-1 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                {matchCount}× no texto:
                              </span>
                              <span className="line-clamp-2">{snippet}</span>
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </aside>

          {/* Coluna Direita — Leitura editorial + Barra de progresso + Sumário lateral (xl:) */}
          <main
            ref={detailScrollRef}
            onScroll={handleDetailScroll}
            className={`teoria-print-main relative flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115] ${
              mobileShowDetail ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* Barra de progresso de leitura + mini-toolbar fixa */}
            {activeMod && (
              <div className="no-print sticky top-0 z-20 border-b border-zinc-200/70 bg-[#FAFAFA]/92 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0F1115]/92">
                <div className="h-[2px] w-full bg-zinc-200/60 dark:bg-white/[0.05]">
                  <div
                    className="h-full bg-[#0F766E] transition-[width] duration-150 dark:bg-[#2DD4BF]"
                    style={{ width: `${readProgressPct}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onBackToList}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 lg:hidden dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Módulos
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen((prev) => !prev)}
                      title={sidebarOpen ? 'Recolher lista de módulos ([)' : 'Mostrar lista de módulos ([)'}
                      aria-label={sidebarOpen ? 'Recolher lista de módulos' : 'Expandir lista de módulos'}
                      className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 lg:inline-flex dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                    >
                      {sidebarOpen ? (
                        <PanelLeftClose className="h-3.5 w-3.5" />
                      ) : (
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden xl:inline">
                        {sidebarOpen ? 'Recolher lista' : 'Mostrar módulos'}
                      </span>
                    </button>
                    <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline dark:text-[#6B7280]">
                      Módulo {activeMod.num} · {readProgressPct}% lido
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Navegador de ocorrências quando há busca ativa */}
                    {query.trim().length >= 2 && matchCountInArticle > 0 && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
                        <span className="font-mono tabular-nums">
                          {activeMatchIdx + 1}/{matchCountInArticle}
                        </span>
                        <button
                          type="button"
                          onClick={() => jumpToMatch(-1)}
                          aria-label="Ocorrência anterior no texto"
                          className="rounded p-0.5 hover:bg-amber-200/70 dark:hover:bg-amber-500/25"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => jumpToMatch(1)}
                          aria-label="Próxima ocorrência no texto"
                          className="rounded p-0.5 hover:bg-amber-200/70 dark:hover:bg-amber-500/25"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleJumpToTreinoScenario(
                          moduleTreinoTargets[0]?.eixo || defaultTreinoEixo,
                          moduleTreinoTargets[0]?.slug
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/90 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                    >
                      <Dumbbell className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                      <span className="hidden sm:inline">Praticar no Treino</span>
                      <span className="sm:hidden">Treinar</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      title="Imprimir ou salvar guia em PDF"
                      aria-label="Imprimir guia teórico"
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200/90 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:border-white/[0.15] dark:hover:text-[#F3F4F6]"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeMod && (
              <div className="mx-auto flex max-w-[1160px] items-start gap-8 px-4 py-6 sm:px-8 sm:py-8">
                {/* Artigo principal */}
                <article className="min-w-0 flex-1 max-w-3xl">
                  <header className="border-b border-zinc-200 pb-5 dark:border-white/[0.10]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      <span className="font-mono font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                        Módulo {activeMod.num}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMod.pilar}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="h-3 w-3" />~{readingStats.minutes} min
                      </span>
                      {totalDrillsInMod > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() =>
                              drillsHeading && handleJumpToHeading(drillsHeading.id)
                            }
                            className="font-mono text-[11px] font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                          >
                            {doneDrillsInMod}/{totalDrillsInMod} drills praticados
                          </button>
                        </>
                      )}
                    </div>

                    <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                      {stripModuleTitlePrefix(activeMod.title)}
                    </h1>

                    {/* Controle de status do módulo */}
                    <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div
                        role="group"
                        aria-label="Status do módulo"
                        className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
                      >
                        {STATUS_OPTIONS.map((opt) => {
                          const active = activeStatus === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => handleSetStatus(activeMod.id, opt.value)}
                              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? opt.value === 'estudado'
                                    ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-[#0F1115]'
                                    : 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                  : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Atalhos compactos e sem overflow para cartões Pré-Porta vinculados */}
                    {linkedHabs.length > 0 && (
                      <div className="no-print mt-4 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]">
                            Pré-Porta vinculado ({linkedHabs.length})
                          </span>
                          {hiddenHabsCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setHabsExpanded((prev) => !prev)}
                              aria-expanded={habsExpanded}
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                            >
                              {habsExpanded
                                ? 'Recolher cartões'
                                : hiddenHabsCount === 1
                                  ? 'Ver mais 1 cartão'
                                  : `Ver mais ${hiddenHabsCount} cartões`}
                              {habsExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {visibleHabs.map((hab) => {
                            const formatted = formatPrePortaTitle(hab.title);
                            return (
                              <button
                                key={hab.id}
                                type="button"
                                title={formatted}
                                onClick={() => onOpenPrePorta(hab.id)}
                                className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-left text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                              >
                                <span className="truncate">{formatted}</span>
                                <ArrowUpRight className="h-3 w-3 shrink-0 text-zinc-400" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </header>

                  {/* Corpo editorial renderizado */}
                  <div
                    ref={proseContainerRef}
                    onClick={handleProseClick}
                    className="editorial-prose mt-6"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />

                  {/* Painel de Estudo Ativo — Controle de Micro-Drills */}
                  {totalDrillsInMod > 0 && (
                    <section
                      aria-label="Controle de estudo ativo dos micro-drills"
                      className="no-print mt-8 rounded-xl border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.08] dark:bg-[#15181F]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                            Estudo Ativo · Micro-Drills ({doneDrillsInMod}/{totalDrillsInMod})
                          </h2>
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                            Fale em voz alta antes de abrir o gabarito e marque cada caso concluído.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleAllDrills}
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                        >
                          {allDrillsExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              Recolher todos os gabaritos
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              Expandir todos os gabaritos
                            </>
                          )}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {Array.from({ length: totalDrillsInMod }, (_, i) => i + 1).map((idx) => {
                          const key = getTeoriaDrillKey(activeMod.id, idx);
                          const isDone = Boolean(exercisesDone[key]);
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={isDone}
                              onClick={() => handleToggleDrillDone(idx)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                isDone
                                  ? 'border-[#0F766E]/40 bg-teal-50/90 text-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-teal-500/15 dark:text-[#2DD4BF]'
                                  : 'border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:border-white/[0.18] dark:hover:text-[#F3F4F6]'
                              }`}
                            >
                              {isDone ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 opacity-60" />
                              )}
                              Drill {idx} {isDone ? 'feito' : 'pendente'}
                            </button>
                          );
                        })}
                      </div>

                      {moduleTreinoTargets.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-200/70 pt-3 dark:border-white/[0.07]">
                          <span className="mr-1 text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]">
                            Cenários no Treino Clínico:
                          </span>
                          {moduleTreinoTargets.map((t) => (
                            <button
                              key={t.slug}
                              type="button"
                              onClick={() => handleJumpToTreinoScenario(t.eixo, t.slug)}
                              className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#0F766E]/25 bg-teal-50/70 px-2 py-1 text-xs font-medium text-[#0F766E] transition-colors hover:bg-teal-100/80 dark:border-[#2DD4BF]/25 dark:bg-teal-500/10 dark:text-[#2DD4BF] dark:hover:bg-teal-500/20"
                            >
                              <span className="truncate">{t.nome}</span>
                              <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Rodapé de conclusão + navegação Anterior / Próximo módulo */}
                  <footer className="no-print mt-8 space-y-4 border-t border-zinc-200 pt-6 dark:border-white/[0.10]">
                    {activeStatus !== 'dominado' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50/60 px-4 py-3 dark:border-teal-500/25 dark:bg-teal-500/10">
                        <span className="text-xs font-medium text-zinc-700 dark:text-[#D1D5DB]">
                          Concluiu a leitura e os micro-drills deste módulo?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSetStatus(activeMod.id, 'dominado')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-teal-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Marcar como Dominado
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {prevMod ? (
                        <button
                          type="button"
                          onClick={() => onSelectModId(prevMod.id)}
                          className="group flex items-center gap-3 rounded-xl border border-zinc-200/90 bg-white p-3.5 text-left transition-colors hover:border-[#0F766E]/50 dark:border-white/[0.08] dark:bg-[#15181F] dark:hover:border-[#2DD4BF]/50"
                        >
                          <ArrowLeft className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-[#0F766E] dark:group-hover:text-[#2DD4BF]" />
                          <div className="min-w-0">
                            <div className="font-mono text-[10px] text-zinc-400 uppercase dark:text-[#6B7280]">
                              Módulo {prevMod.num} · Anterior
                            </div>
                            <div className="truncate text-xs font-semibold text-zinc-800 group-hover:text-[#0F766E] dark:text-[#F3F4F6] dark:group-hover:text-[#2DD4BF]">
                              {prevMod.shortTitle}
                            </div>
                          </div>
                        </button>
                      ) : (
                        <div />
                      )}

                      {nextMod && (
                        <button
                          type="button"
                          onClick={() => onSelectModId(nextMod.id)}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-200/90 bg-white p-3.5 text-right transition-colors hover:border-[#0F766E]/50 dark:border-white/[0.08] dark:bg-[#15181F] dark:hover:border-[#2DD4BF]/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[10px] text-zinc-400 uppercase dark:text-[#6B7280]">
                              Próximo · Módulo {nextMod.num}
                            </div>
                            <div className="truncate text-xs font-semibold text-zinc-800 group-hover:text-[#0F766E] dark:text-[#F3F4F6] dark:group-hover:text-[#2DD4BF]">
                              {nextMod.shortTitle}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F766E] dark:group-hover:text-[#2DD4BF]" />
                        </button>
                      )}
                    </div>
                  </footer>
                </article>

                {/* Sumário Lateral Sticky (xl:) */}
                {outline.length > 0 && (
                  <aside
                    aria-label="Sumário do guia"
                    className="no-print sticky top-14 hidden w-[236px] shrink-0 xl:block"
                  >
                    <div className="rounded-xl border border-zinc-200/80 bg-white/80 p-3 dark:border-white/[0.07] dark:bg-[#15181F]/80">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.03em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                          <ListTree className="h-3.5 w-3.5" />
                          Neste guia
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400 dark:text-[#6B7280]">
                          {readProgressPct}%
                        </span>
                      </div>

                      <nav className="max-h-[calc(100dvh-230px)] space-y-0.5 overflow-y-auto pr-1">
                        {outline.map((item) => {
                          const isCurrent = activeHeadingId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleJumpToHeading(item.id)}
                              className={`block w-full rounded-md py-1 text-left text-xs leading-snug transition-colors ${
                                item.level === 3 ? 'pr-2 pl-4 text-[11px]' : 'px-2 font-medium'
                              } ${
                                isCurrent
                                  ? 'bg-teal-50/90 font-semibold text-[#0F766E] dark:bg-teal-500/15 dark:text-[#2DD4BF]'
                                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                              }`}
                            >
                              <span className="line-clamp-2">{item.text}</span>
                            </button>
                          );
                        })}
                      </nav>

                      {totalDrillsInMod > 0 && (
                        <div className="mt-3 border-t border-zinc-200/80 pt-2.5 dark:border-white/[0.07]">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                            <span>Micro-Drills</span>
                            <span className="font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                              {doneDrillsInMod}/{totalDrillsInMod}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleToggleAllDrills}
                            className="mt-1.5 w-full rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                          >
                            {allDrillsExpanded ? 'Recolher gabaritos' : 'Expandir gabaritos'}
                          </button>
                        </div>
                      )}
                    </div>
                  </aside>
                )}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
