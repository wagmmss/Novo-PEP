import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit3,
  FileText,
  Filter,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react';
import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import { resolveLinksForPrePorta } from '../data/clinical_links.ts';
import { SEIS_INTERCORRENCIAS_DATA } from '../data/clinical_reference_data.ts';
import {
  GLOBAL_SEARCH_INDEX,
  HAB_PROTOCOLS,
  INTERCORRENCIAS_HAB_ID,
  PROTOCOL_BY_ID,
  PROTOCOL_BY_TRIGGER,
  type PepAstSection,
} from '../data/protocolsRepo.ts';
import { FORMACAO_TEORICA_MODULOS } from '../engine/central6ano.ts';
import { buildClinicalContext } from '../engine/clinicalContext.ts';
import {
  cleanHeadingText,
  formatCompactProtocolTitle,
  formatInlineClinicalHtml,
  formatPrePortaTitle,
  parsePrePortaContent,
  renderTeoriaMarkdownToHtml,
} from '../engine/diretrizes.ts';
import {
  createAstSelectionState,
  parsePepToAst,
  serializeAstToClinicalText,
  type AstSelectionState,
  type ChoiceGroupNode,
  type InlineInputNode,
} from '../engine/pepAst.ts';
import {
  HAB_CATEGORY_FILTERS,
  INTERCORRENCIA_SHORT_LABELS,
  buildPendingPontoCegoNote,
  filterIntercorrencias,
  type HabCategoryFilterId,
} from '../engine/prePortaHelpers.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { PepBlockRenderer } from './PepBlockRenderer.tsx';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

const INTERCORRENCIA_LINKS: Record<
  string,
  { pepTriggers: string[]; habIds: string[] }
> = {
  '1': { pepTriggers: [';sepse', ';tvp-tep'], habIds: ['hab-18'] },
  '2': { pepTriggers: [';eap', ';dpoc', ';asma'], habIds: ['hab-6', 'hab-14'] },
  '3': { pepTriggers: [';sca', ';tvp-tep'], habIds: ['hab-12', 'hab-5'] },
  '4': { pepTriggers: [';sepse', ';enf-evo-clin'], habIds: ['hab-19'] },
  '5': { pepTriggers: [';enf-evo-po', ';itu', ';pneumonia'], habIds: ['hab-2'] },
  '6': { pepTriggers: [';enf-insulina', ';cad'], habIds: ['hab-14', 'hab-17'] },
};

interface DeepTechniqueSection {
  title: string;
  body: string;
}

interface DeepTechniqueGuide {
  id: string;
  title: string;
  category: string;
  sourcePath: string;
  sections: DeepTechniqueSection[];
  rawMarkdown?: string;
}

interface DeepTechniquePayload {
  version: number;
  guideCount: number;
  guides: DeepTechniqueGuide[];
  byHabId: Record<string, string[]>;
}

interface PrePortaViewProps {
  selectedId: string | null;
  mobileShowDetail: boolean;
  favoriteIds: readonly string[];
  habChecklists: Record<string, Record<string, boolean>>;
  onSelectHab: (id: string) => void;
  onBackToList: () => void;
  onOpenQuickCapture: (req: QuickCaptureRequest) => void;
  onOpenProtocol?: (protocolId: string) => void;
  onOpenTeoria?: (modId: string) => void;
  onNotify?: (msg: string) => void;
  shortcutsEnabled?: boolean;
}

type ViewDensityMode = 'porta' | 'completo';

function stripMermaidBlocks(md: string): string {
  return String(md || '').replace(/```mermaid[\s\S]*?```/gi, '').trim();
}

function cleanChecklistText(text: string): string {
  return String(text || '')
    .replace(/^\[CR[IÍ]TICO\]\s*/i, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

const EMPTY_CLINICAL_CONTEXT = buildClinicalContext({}, { modId: 'hab' });

export function PrePortaView({
  selectedId,
  mobileShowDetail,
  favoriteIds,
  habChecklists,
  onSelectHab,
  onBackToList,
  onOpenQuickCapture,
  onOpenProtocol,
  onOpenTeoria,
  onNotify,
  shortcutsEnabled = true,
}: PrePortaViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<HabCategoryFilterId>('todos');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [viewMode, setViewMode] = useState<ViewDensityMode>('porta');
  const [coreografiaExpanded, setCoreografiaExpanded] = useState(false);
  const [onlyCriticalChecklist, setOnlyCriticalChecklist] = useState(false);
  const [showAllRelatedPeps, setShowAllRelatedPeps] = useState(false);

  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const [techniqueLoading, setTechniqueLoading] = useState(false);
  const [techniquePayload, setTechniquePayload] = useState<DeepTechniquePayload | null>(null);
  const [copiedPepSnippet, setCopiedPepSnippet] = useState(false);
  const [pepFreeEditMode, setPepFreeEditMode] = useState(false);
  const [pepFreeEditText, setPepFreeEditText] = useState('');

  const mainRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const isIntercorrenciasSelected = selectedId === INTERCORRENCIAS_HAB_ID;

  const activeHab = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId && selectedId !== INTERCORRENCIAS_HAB_ID) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id === 'hab') return found;
    }
    return HAB_PROTOCOLS[0];
  }, [selectedId]);

  const activeHabDisplayTitle = useMemo(
    () => formatPrePortaTitle(activeHab.title),
    [activeHab.title]
  );

  // AST interativa para o bloco "Como registrar no prontuário"
  const pepAstBundle = useMemo(() => {
    const raw = activeHab.pep_body || '';
    if (!raw.trim()) return null;
    const ast = parsePepToAst(raw, `preporta:${activeHab.id}`);
    const initialState = createAstSelectionState(ast, EMPTY_CLINICAL_CONTEXT);
    const blockIndices = ast.blocks.map((_, idx) => idx);
    const section: PepAstSection = {
      id: 'geral',
      title: 'Registro no Prontuário',
      blockIndices,
      blockIndexSet: new Set(blockIndices),
      toggles: [],
    };
    return { ast, initialState, section };
  }, [activeHab.id, activeHab.pep_body]);

  const [pepAstState, setPepAstState] = useState<AstSelectionState | null>(null);

  useEffect(() => {
    setPepAstState(pepAstBundle ? pepAstBundle.initialState : null);
    setPepFreeEditMode(false);
    setPepFreeEditText('');
    setTechniqueOpen(false);
    setCopiedPepSnippet(false);
    setCoreografiaExpanded(false);
    setOnlyCriticalChecklist(false);
    setShowAllRelatedPeps(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeHab.id, isIntercorrenciasSelected, pepAstBundle]);

  const effectivePepAstState = pepAstState ?? pepAstBundle?.initialState ?? null;

  const currentPepText = useMemo(() => {
    if (pepFreeEditMode) return pepFreeEditText;
    if (!pepAstBundle || !effectivePepAstState) return activeHab.pep_body || '';
    return serializeAstToClinicalText(
      pepAstBundle.ast,
      effectivePepAstState,
      EMPTY_CLINICAL_CONTEXT,
      { keepEmptyBrackets: true, includeDoseFormulaCalc: true }
    );
  }, [pepFreeEditMode, pepFreeEditText, pepAstBundle, effectivePepAstState, activeHab.pep_body]);

  const pepHasEdits = useMemo(() => {
    if (pepFreeEditMode) return pepFreeEditText !== (activeHab.pep_body || '');
    if (!effectivePepAstState) return false;
    return Object.values(effectivePepAstState.inputValues).some((v) => v.trim().length > 0);
  }, [pepFreeEditMode, pepFreeEditText, activeHab.pep_body, effectivePepAstState]);

  const handlePepInputChange = useCallback((node: InlineInputNode, value: string) => {
    setPepAstState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        inputValues: { ...prev.inputValues, [node.id]: value },
        userEditedNodes: { ...prev.userEditedNodes, [node.id]: true },
      };
    });
  }, []);

  const handlePepChoiceSelect = useCallback((group: ChoiceGroupNode, nextIndices: number[]) => {
    setPepAstState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        choiceSelections: { ...prev.choiceSelections, [group.id]: nextIndices },
        userEditedNodes: { ...prev.userEditedNodes, [group.id]: true },
      };
    });
  }, []);

  const handlePepToggleTrava = useCallback((travaId: string) => {
    setPepAstState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        travaExcluded: { ...prev.travaExcluded, [travaId]: !prev.travaExcluded[travaId] },
      };
    });
  }, []);

  const handlePepToggleOptional = useCallback((optionalId: string) => {
    setPepAstState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        optionalOpen: { ...prev.optionalOpen, [optionalId]: !prev.optionalOpen[optionalId] },
      };
    });
  }, []);

  const handlePepToggleCheckbox = useCallback((blockId: string) => {
    setPepAstState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkboxStates: { ...prev.checkboxStates, [blockId]: !prev.checkboxStates[blockId] },
      };
    });
  }, []);

  const handleResetPepFields = useCallback(() => {
    if (pepAstBundle) {
      setPepAstState(pepAstBundle.initialState);
    }
    setPepFreeEditMode(false);
    setPepFreeEditText('');
    onNotify?.('Campos do registro restaurados.');
  }, [pepAstBundle, onNotify]);

  // Filtro da sidebar (busca + categoria + favoritos)
  const intercorrenciasMatch = useMemo(
    () => filterIntercorrencias(SEIS_INTERCORRENCIAS_DATA, searchQuery),
    [searchQuery]
  );

  const showIntercorrenciasInSidebar = useMemo(() => {
    if (categoryFilter !== 'todos' && categoryFilter !== 'Emergência & Procedimentos') {
      return false;
    }
    if (onlyFavorites && !favoriteSet.has(INTERCORRENCIAS_HAB_ID)) {
      return false;
    }
    return intercorrenciasMatch.visibleInSidebar;
  }, [categoryFilter, onlyFavorites, favoriteSet, intercorrenciasMatch.visibleInSidebar]);

  const filteredHabs = useMemo(() => {
    const q = searchQuery.trim();
    let list = q
      ? searchClinicalProtocols(GLOBAL_SEARCH_INDEX, HAB_PROTOCOLS, q, HAB_PROTOCOLS.length).map(
          (r) => r.item
        )
      : [...HAB_PROTOCOLS];

    if (categoryFilter !== 'todos') {
      list = list.filter((item) => (item.hab_category || item.category) === categoryFilter);
    }
    if (onlyFavorites) {
      list = list.filter((item) => favoriteSet.has(item.id));
    }
    return list;
  }, [searchQuery, categoryFilter, onlyFavorites, favoriteSet]);

  // Lista plana navegável por teclado (↑ / ↓ no campo de filtro)
  const navigableIds = useMemo(() => {
    const ids: string[] = [];
    if (showIntercorrenciasInSidebar) ids.push(INTERCORRENCIAS_HAB_ID);
    for (const h of filteredHabs) ids.push(h.id);
    return ids;
  }, [showIntercorrenciasInSidebar, filteredHabs]);

  const habFavoriteCount = useMemo(
    () =>
      HAB_PROTOCOLS.filter((h) => favoriteSet.has(h.id)).length +
      (favoriteSet.has(INTERCORRENCIAS_HAB_ID) ? 1 : 0),
    [favoriteSet]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || categoryFilter !== 'todos' || onlyFavorites;

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter('todos');
    setOnlyFavorites(false);
  }, []);

  // Dados derivados do cartão ativo
  const checks = habChecklists[activeHab.id] || {};
  const checklistSections = activeHab.checklist_sections || [];
  const totalCheckItems = checklistSections.reduce((acc, s) => acc + s.items.length, 0);
  const criticalCheckCount = checklistSections.reduce(
    (acc, s) => acc + s.items.filter((it) => Boolean(it.critical)).length,
    0
  );
  const checkedCount = checklistSections.reduce(
    (acc, s) => acc + s.items.filter((it) => Boolean(checks[it.id])).length,
    0
  );
  const checkProgressPct =
    totalCheckItems > 0 ? Math.round((checkedCount / totalCheckItems) * 100) : 0;

  const visibleChecklistSections = useMemo(() => {
    if (!onlyCriticalChecklist) return checklistSections;
    return checklistSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => Boolean(it.critical)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [checklistSections, onlyCriticalChecklist]);

  const uncheckedItems = useMemo(
    () =>
      checklistSections.flatMap((s) =>
        s.items.filter((it) => !checks[it.id]).map((it) => cleanChecklistText(it.text))
      ),
    [checklistSections, checks]
  );

  const parsedPrePorta = useMemo(
    () => parsePrePortaContent(activeHab.pre_porta || ''),
    [activeHab.pre_porta]
  );

  const habLinks = useMemo(() => {
    const resolved = resolveLinksForPrePorta(activeHab.id);
    const teoriaModules = resolved.teoriaModIds
      .map((id) => FORMACAO_TEORICA_MODULOS.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    const pepProtocols = resolved.pepTriggers
      .map((trig) => PROTOCOL_BY_TRIGGER.get(trig.toLowerCase()))
      .filter((p): p is ClinicalProtocolItem => Boolean(p));
    return { teoriaModules, pepProtocols };
  }, [activeHab.id]);

  const totalRelatedCount = habLinks.teoriaModules.length + habLinks.pepProtocols.length;

  const handleCopyPepSnippet = useCallback(async () => {
    if (!currentPepText.trim()) return;
    const ok = await copyToClipboard(currentPepText);
    if (ok) {
      setCopiedPepSnippet(true);
      onNotify?.('Texto do registro copiado para o PEP.');
      window.setTimeout(() => setCopiedPepSnippet(false), 1800);
    }
  }, [currentPepText, onNotify]);

  const handleToggleTechnique = useCallback(async () => {
    const nextOpen = !techniqueOpen;
    setTechniqueOpen(nextOpen);
    if (nextOpen && !techniquePayload) {
      setTechniqueLoading(true);
      try {
        const mod = await import('../data/tecnica_profunda.generated.json');
        setTechniquePayload(mod.default as unknown as DeepTechniquePayload);
      } finally {
        setTechniqueLoading(false);
      }
    }
  }, [techniqueOpen, techniquePayload]);

  const matchedGuides = useMemo(() => {
    if (!techniquePayload) return [];
    const guideIds = techniquePayload.byHabId[activeHab.id] || [];
    const byId = new Map(techniquePayload.guides.map((g) => [g.id, g]));
    return guideIds.map((gid) => byId.get(gid)).filter((g): g is DeepTechniqueGuide => Boolean(g));
  }, [techniquePayload, activeHab.id]);

  const scrollToSection = useCallback(
    (sectionId: string, opts?: { expandCoreografia?: boolean; openTechnique?: boolean }) => {
      if (opts?.expandCoreografia && viewMode === 'porta' && !coreografiaExpanded) {
        setCoreografiaExpanded(true);
      }
      if (opts?.openTechnique && !techniqueOpen) {
        void handleToggleTechnique();
      }
      window.requestAnimationFrame(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [viewMode, coreografiaExpanded, techniqueOpen, handleToggleTechnique]
  );

  // Atalhos de teclado da aba Pré-Porta: "/" busca, "C" copiar registro, "M" alternar modo 30s/Completo
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      if (e.key === '/') {
        e.preventDefault();
        setSidebarCollapsed(false);
        window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
        return;
      }

      if (!isIntercorrenciasSelected && e.key.toLowerCase() === 'c' && activeHab.pep_body) {
        e.preventDefault();
        void handleCopyPepSnippet();
        return;
      }

      if (!isIntercorrenciasSelected && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const next: ViewDensityMode = viewMode === 'porta' ? 'completo' : 'porta';
        setViewMode(next);
        onNotify?.(next === 'porta' ? 'Modo 30s Porta ativado.' : 'Modo Completo ativado.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcutsEnabled,
    isIntercorrenciasSelected,
    activeHab.pep_body,
    viewMode,
    handleCopyPepSnippet,
    onNotify,
  ]);

  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (searchQuery) {
        e.preventDefault();
        setSearchQuery('');
      } else {
        e.currentTarget.blur();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (navigableIds.length === 0) return;
      e.preventDefault();
      const currentKey = isIntercorrenciasSelected ? INTERCORRENCIAS_HAB_ID : activeHab.id;
      const curIdx = navigableIds.indexOf(currentKey);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx =
        curIdx === -1
          ? delta > 0
            ? 0
            : navigableIds.length - 1
          : (curIdx + delta + navigableIds.length) % navigableIds.length;
      onSelectHab(navigableIds[nextIdx]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
      mainRef.current?.focus();
    }
  };

  const isCoreografiaVisible = viewMode === 'completo' || coreografiaExpanded;
  const activeFavoriteId = isIntercorrenciasSelected ? INTERCORRENCIAS_HAB_ID : activeHab.id;
  const isActiveFavorited = favoriteSet.has(activeFavoriteId);

  const visibleIntercorrencias = intercorrenciasMatch.items.length > 0
    ? intercorrenciasMatch.items
    : SEIS_INTERCORRENCIAS_DATA;

  const sidebarCounterText = useMemo(() => {
    const cardsLabel = `${filteredHabs.length} ${filteredHabs.length === 1 ? 'cartão' : 'cartões'}`;
    if (!showIntercorrenciasInSidebar) {
      return filteredHabs.length === 0 ? '0 resultados' : cardsLabel;
    }
    const interCount = intercorrenciasMatch.items.length;
    const interLabel =
      intercorrenciasMatch.isFilteredSubset && searchQuery.trim()
        ? `${interCount}/6 Intercorrências`
        : '6 Intercorrências';
    return `${cardsLabel} · ${interLabel}`;
  }, [
    filteredHabs.length,
    showIntercorrenciasInSidebar,
    intercorrenciasMatch.items.length,
    intercorrenciasMatch.isFilteredSubset,
    searchQuery,
  ]);

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden">
      {/* COLUNA ESQUERDA: Lista dos 22 Cartões Pré-Porta + 6 Intercorrências */}
      <aside
        aria-label="Lista de cartões Pré-Porta"
        className={`${
          mobileShowDetail
            ? 'hidden'
            : 'flex'
        } ${
          sidebarCollapsed ? 'lg:hidden' : 'lg:flex'
        } h-full w-full shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:w-[320px] dark:border-white/[0.07] dark:bg-[#12151B]`}
      >
        {/* Barra de busca + favoritos + recolher */}
        <div className="space-y-2 border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#6B7280]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                placeholder="Filtrar cartão...  ( / )"
                aria-label="Filtrar cartões Pré-Porta"
                className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] py-1.5 pr-7 pl-8 text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:text-[#F3F4F6]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOnlyFavorites((v) => !v)}
              aria-pressed={onlyFavorites}
              aria-label="Filtrar cartões Pré-Porta favoritos"
              title={
                habFavoriteCount > 0
                  ? `Filtrar favoritos (${habFavoriteCount})`
                  : 'Nenhum cartão favoritado ainda'
              }
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                onlyFavorites
                  ? 'border-amber-400/80 bg-amber-50 text-amber-600 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'border-zinc-200/90 bg-[#FAFAFA] text-zinc-500 hover:text-zinc-900 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Recolher barra lateral"
              title="Recolher barra lateral"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-[#FAFAFA] text-zinc-500 transition-colors hover:text-zinc-900 lg:inline-flex dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filtros de categoria */}
          <div
            role="group"
            aria-label="Filtrar por categoria Pré-Porta"
            className="flex flex-wrap gap-1"
          >
            {HAB_CATEGORY_FILTERS.map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={active}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                      : 'bg-zinc-100/90 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900 dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                  }`}
                >
                  {cat.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de contagem dinâmica */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200/70 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/[0.06] dark:text-[#9CA3AF]">
          <span>{sidebarCounterText}</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {showIntercorrenciasInSidebar && (
            <button
              type="button"
              onClick={() => onSelectHab(INTERCORRENCIAS_HAB_ID)}
              className={`flex w-full items-start justify-between gap-2 border-b border-l-[3px] px-3 py-2.5 text-left transition-colors ${
                isIntercorrenciasSelected
                  ? 'border-b-zinc-200/80 border-l-amber-500 bg-amber-500/[0.09] text-zinc-950 dark:border-b-white/[0.06] dark:border-l-amber-400 dark:bg-amber-400/[0.10] dark:text-white'
                  : 'border-b-zinc-200/70 border-l-amber-500/70 bg-amber-50/30 text-zinc-800 hover:bg-amber-500/[0.08] dark:border-b-white/[0.06] dark:border-l-amber-400/70 dark:bg-amber-500/[0.04] dark:text-[#F3F4F6] dark:hover:bg-amber-400/[0.09]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`flex items-center gap-1.5 text-[13px] leading-snug ${
                    isIntercorrenciasSelected
                      ? 'font-semibold text-amber-800 dark:text-amber-300'
                      : 'font-semibold text-zinc-900 dark:text-[#F3F4F6]'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="truncate">6 Intercorrências de Madrugada</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                  <span>Enfermaria &amp; Pós-Op</span>
                  <span>·</span>
                  <span className="font-mono text-[10px]">Checar em 2 min</span>
                </div>
              </div>
              <div className="mt-0.5 flex shrink-0 items-center gap-1">
                {favoriteSet.has(INTERCORRENCIAS_HAB_ID) && (
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                )}
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                  {intercorrenciasMatch.isFilteredSubset && searchQuery.trim()
                    ? `${intercorrenciasMatch.items.length}/6`
                    : '6'}
                </span>
              </div>
            </button>
          )}

          {filteredHabs.map((item) => {
            const isSelected = !isIntercorrenciasSelected && item.id === activeHab.id;
            const isFav = favoriteSet.has(item.id);
            const itemChecks = habChecklists[item.id] || {};
            const itemTotal = (item.checklist_sections || []).reduce((a, s) => a + s.items.length, 0);
            const itemDone = (item.checklist_sections || []).reduce(
              (a, s) => a + s.items.filter((it) => Boolean(itemChecks[it.id])).length,
              0
            );

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectHab(item.id)}
                className={`flex w-full items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 text-left transition-colors dark:border-white/[0.04] ${
                  isSelected
                    ? 'bg-[#0F766E]/[0.08] text-zinc-950 dark:bg-[#2DD4BF]/[0.09] dark:text-[#F3F4F6]'
                    : 'text-zinc-700 hover:bg-zinc-100/70 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`line-clamp-2 text-[13px] leading-snug ${
                      isSelected ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]' : 'font-medium'
                    }`}
                  >
                    {formatPrePortaTitle(item.title)}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                    {item.hab_category || item.category}
                  </div>
                </div>
                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  {isFav && (
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                  )}
                  {itemDone > 0 && itemTotal > 0 && (
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        itemDone === itemTotal
                          ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                          : 'text-[#0F766E] dark:text-[#2DD4BF]'
                      }`}
                    >
                      {itemDone}/{itemTotal}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredHabs.length === 0 && !showIntercorrenciasInSidebar && (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <Search className="mb-2 h-5 w-5 text-zinc-300 dark:text-zinc-600" />
              <p className="text-xs font-medium text-zinc-700 dark:text-[#D1D5DB]">
                Nenhum cartão encontrado
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                {onlyFavorites
                  ? 'Nenhum favorito corresponde aos filtros ativos.'
                  : `Sem correspondências para “${searchQuery.trim() || categoryFilter}”.`}
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-[#0F766E] transition-colors hover:border-[#0F766E]/40 dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#2DD4BF]"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* COLUNA DIREITA: Cartão Unificado Pré-Porta OU Guia das 6 Intercorrências */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className={`${
          mobileShowDetail ? 'block' : 'hidden lg:block'
        } h-full flex-1 overflow-y-auto bg-[#FAFAFA] outline-none dark:bg-[#0F1115]`}
      >
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-8 sm:py-6">
          {/* Barra superior de navegação auxiliar (Voltar no mobile / Expandir sidebar no desktop) */}
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBackToList}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 lg:hidden dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Pré-Porta
              </button>
              {sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Expandir barra lateral"
                  className="hidden items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 lg:inline-flex dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                  Lista Pré-Porta
                </button>
              )}
            </div>
          </div>

          {isIntercorrenciasSelected ? (
            <div>
              <header className="border-b border-zinc-200/80 pb-4 dark:border-white/[0.07]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      Enfermaria &amp; Pós-Operatório
                    </span>
                    <span>·</span>
                    <span className="font-mono text-[11px]">Resposta rápida em 2 min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const added = cockpitStore.toggleFavorite(INTERCORRENCIAS_HAB_ID);
                        onNotify?.(
                          added ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.'
                        );
                      }}
                      aria-pressed={isActiveFavorited}
                      aria-label={isActiveFavorited ? 'Remover dos favoritos' : 'Favoritar guia'}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                        isActiveFavorited
                          ? 'border-amber-400/80 bg-amber-50 text-amber-600 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${isActiveFavorited ? 'fill-current' : ''}`} />
                    </button>
                    {onOpenTeoria && (
                      <button
                        type="button"
                        onClick={() => onOpenTeoria('mod-06')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                        <span>Teoria M06</span>
                        <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                      </button>
                    )}
                  </div>
                </div>

                <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                  Guia das 6 Intercorrências de Madrugada
                </h1>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-[#9CA3AF]">
                  Roteiro de bolso à beira-leito para chamados da enfermagem: o que avaliar nos
                  primeiros 2 minutos, as 3 causas fatais e a conduta imediata segura.
                </p>
              </header>

              {/* Barra sticky de salto rápido entre as 6 intercorrências */}
              <nav
                aria-label="Navegação rápida das 6 intercorrências"
                className="sticky top-0 z-10 -mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200/70 bg-[#FAFAFA]/95 px-4 py-2 backdrop-blur-xs sm:-mx-8 sm:px-8 dark:border-white/[0.06] dark:bg-[#0F1115]/95"
              >
                {visibleIntercorrencias.map((it) => (
                  <button
                    key={it.num}
                    type="button"
                    onClick={() => scrollToSection(`intercorrencia-${it.num}`)}
                    className="shrink-0 rounded-md border border-zinc-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-amber-800 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-amber-400/60 dark:hover:text-amber-300"
                  >
                    {INTERCORRENCIA_SHORT_LABELS[it.num] || `#${it.num}`}
                  </button>
                ))}
              </nav>

              {intercorrenciasMatch.isFilteredSubset && searchQuery.trim() && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <span>
                    Mostrando {visibleIntercorrencias.length} de 6 intercorrências para “
                    {searchQuery.trim()}”.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="font-semibold underline underline-offset-2"
                  >
                    Ver todas as 6
                  </button>
                </div>
              )}

              <div className="mt-5 space-y-5 pb-8">
                {visibleIntercorrencias.map((item) => {
                  const links = INTERCORRENCIA_LINKS[item.num] || { pepTriggers: [], habIds: [] };
                  const linkedPeps = links.pepTriggers
                    .map((t) => PROTOCOL_BY_TRIGGER.get(t))
                    .filter((p): p is ClinicalProtocolItem => Boolean(p));
                  const linkedHabs = links.habIds
                    .map((id) => PROTOCOL_BY_ID.get(id))
                    .filter((h): h is ClinicalProtocolItem => Boolean(h));

                  return (
                    <section
                      key={item.num}
                      id={`intercorrencia-${item.num}`}
                      aria-label={item.titulo}
                      className="scroll-mt-14 rounded-xl border border-zinc-200 border-l-[3px] border-l-amber-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-amber-400 dark:bg-[#15181F]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-tr-[11px] border-b border-zinc-200/80 bg-amber-500/[0.07] px-4 py-2.5 dark:border-white/[0.08]">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-xs font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200">
                            {item.num}
                          </span>
                          <h2 className="text-sm font-bold text-zinc-950 dark:text-white">
                            {item.titulo}
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenQuickCapture({
                              kind: 'ponto_cego',
                              defaultTitle: `Intercorrência #${item.num}: ${item.titulo}`,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                        >
                          <Plus className="h-3 w-3" />
                          Ponto Cego
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-400">
                            1. Checar em 2 min
                          </div>
                          <p className="text-[13px] leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                            {item.checar2m}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">
                            2. 3 Causas Fatais
                          </div>
                          <p className="text-[13px] font-medium leading-relaxed text-zinc-900 dark:text-[#F3F4F6]">
                            {item.causas3}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold tracking-wide text-[#0F766E] uppercase dark:text-[#2DD4BF]">
                            3. Conduta Segura
                          </div>
                          <p className="text-[13px] leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                            {item.conduta}
                          </p>
                        </div>
                      </div>

                      {(linkedPeps.length > 0 || linkedHabs.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-4 py-2.5 dark:border-white/[0.06]">
                          <span className="mr-1 text-[11px] text-zinc-400 dark:text-[#6B7280]">
                            Abrir protocolo:
                          </span>
                          {onOpenProtocol &&
                            linkedPeps.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => onOpenProtocol(p.id)}
                                title={p.title}
                                className="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-zinc-200/80 bg-[#FAFAFA] px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                              >
                                <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                                <span className="truncate">
                                  {formatCompactProtocolTitle(p.title)}
                                </span>
                              </button>
                            ))}
                          {linkedHabs.map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => onSelectHab(h.id)}
                              title={formatPrePortaTitle(h.title)}
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200/80 bg-teal-50/50 px-2 py-0.5 text-[11px] font-medium text-[#0F766E] transition-colors hover:bg-teal-100/70 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-[#2DD4BF]"
                            >
                              <Zap className="h-3 w-3 shrink-0" />
                              <span>{formatPrePortaTitle(h.title).split('(')[0].trim()}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho enxuto — Resumo 30s imediatamente acima da dobra no desktop e mobile */}
              <header className="border-b border-zinc-200/80 pb-4 dark:border-white/[0.07]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                    {activeHab.hab_category || activeHab.category}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Modo 30s Porta vs Completo */}
                    <div
                      role="group"
                      aria-label="Modo de leitura do cartão"
                      className="inline-flex items-center rounded-lg border border-zinc-200/90 bg-zinc-100/80 p-0.5 dark:border-white/[0.08] dark:bg-[#15181F]"
                    >
                      <button
                        type="button"
                        onClick={() => setViewMode('porta')}
                        aria-pressed={viewMode === 'porta'}
                        title="Exibe foco imediato de 30s com Coreografia recolhível (atalho: M)"
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                          viewMode === 'porta'
                            ? 'bg-white text-[#0F766E] shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-[#1C2029] dark:text-[#2DD4BF]'
                            : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        30s Porta
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('completo')}
                        aria-pressed={viewMode === 'completo'}
                        title="Exibe todas as seções abertas para revisão completa (atalho: M)"
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                          viewMode === 'completo'
                            ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-[#1C2029] dark:text-white'
                            : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        Completo
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const added = cockpitStore.toggleFavorite(activeHab.id);
                        onNotify?.(
                          added ? 'Cartão adicionado aos favoritos.' : 'Cartão removido dos favoritos.'
                        );
                      }}
                      aria-pressed={isActiveFavorited}
                      aria-label={isActiveFavorited ? 'Remover cartão dos favoritos' : 'Favoritar cartão'}
                      title={isActiveFavorited ? 'Remover dos favoritos' : 'Fixar nos favoritos'}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                        isActiveFavorited
                          ? 'border-amber-400/80 bg-amber-50 text-amber-600 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${isActiveFavorited ? 'fill-current' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenQuickCapture({
                          kind: 'logbook',
                          defaultTitle: activeHabDisplayTitle,
                          defaultHabId: activeHab.id,
                        })
                      }
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                      <span>Logbook</span>
                    </button>
                  </div>
                </div>

                <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                  {activeHabDisplayTitle}
                </h1>

                {activeHab.anchor && (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-[#9CA3AF]">
                    {activeHab.anchor}
                  </p>
                )}
              </header>

              {/* Barra sticky de salto rápido entre seções */}
              <nav
                aria-label="Seções do cartão Pré-Porta"
                className="sticky top-0 z-10 -mx-4 mt-2.5 flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200/70 bg-[#FAFAFA]/95 px-4 py-2 backdrop-blur-xs sm:-mx-8 sm:px-8 dark:border-white/[0.06] dark:bg-[#0F1115]/95"
              >
                {(parsedPrePorta.resumo30s || parsedPrePorta.fallback) && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-resumo')}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                  >
                    Resumo 30s
                  </button>
                )}
                {parsedPrePorta.coreografia && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-coreografia', { expandCoreografia: true })}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                  >
                    Coreografia
                  </button>
                )}
                {checklistSections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-checklist')}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-sky-400 hover:text-sky-700 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-sky-400/60 dark:hover:text-sky-300"
                  >
                    Checklist{' '}
                    <span className="font-mono text-[10px] opacity-80">
                      {checkedCount}/{totalCheckItems}
                    </span>
                  </button>
                )}
                {activeHab.pep_body && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-prontuario')}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                  >
                    Prontuário
                  </button>
                )}
                {activeHab.pitfalls && activeHab.pitfalls.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-armadilhas')}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-amber-800 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-amber-400/60 dark:hover:text-amber-300"
                  >
                    Armadilhas
                  </button>
                )}
                {totalRelatedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-relacionados')}
                    className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                  >
                    Relacionados ({totalRelatedCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => scrollToSection('sec-tecnica', { openTechnique: true })}
                  className="shrink-0 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                >
                  Técnica
                </button>
              </nav>

              {/* 1. RESUMO 30s */}
              {(parsedPrePorta.resumo30s || parsedPrePorta.fallback) && (
                <section
                  id="sec-resumo"
                  className="mt-4 scroll-mt-14 rounded-xl border border-zinc-200 border-l-[3px] border-l-teal-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-teal-400 dark:bg-[#15181F]"
                  aria-label="Resumo 30 segundos"
                >
                  <div className="flex items-center gap-2 rounded-tr-[11px] border-b border-zinc-200/80 bg-teal-500/[0.07] px-4 py-2.5 dark:border-white/[0.08]">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                    <h2 className="text-xs font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-400">
                      Resumo 30s · O que não esquecer
                    </h2>
                  </div>
                  <div
                    className="editorial-prose p-5"
                    dangerouslySetInnerHTML={{
                      __html: renderTeoriaMarkdownToHtml(
                        parsedPrePorta.resumo30s || parsedPrePorta.fallback
                      ),
                    }}
                  />
                </section>
              )}

              {/* 2. MNEMÔNICO / REGRA DE OURO */}
              {parsedPrePorta.mnemonico && (
                <section
                  id="sec-mnemonico"
                  className="mt-5 scroll-mt-14"
                  aria-label="Mnemônico e Regra de Ouro"
                >
                  <div className="rounded-xl border border-zinc-200 border-l-[3px] border-l-[#0F766E] bg-teal-50/40 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-white/[0.10] dark:border-l-[#2DD4BF] dark:bg-[#171B24]">
                    <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-[#0F766E] uppercase dark:text-[#2DD4BF]">
                      Mnemônico · Regra de Ouro
                    </h2>
                    <div
                      className="editorial-prose"
                      dangerouslySetInnerHTML={{
                        __html: renderTeoriaMarkdownToHtml(parsedPrePorta.mnemonico),
                      }}
                    />
                  </div>
                </section>
              )}

              {/* 3. COREOGRAFIA / PASSO A PASSO TÉCNICO (recolhível no Modo 30s Porta) */}
              {parsedPrePorta.coreografia && (
                <section
                  id="sec-coreografia"
                  className="mt-5 scroll-mt-14 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
                  aria-label="Coreografia e passo a passo técnico"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === 'completo') {
                        setViewMode('porta');
                        setCoreografiaExpanded(false);
                      } else {
                        setCoreografiaExpanded((v) => !v);
                      }
                    }}
                    aria-expanded={isCoreografiaVisible}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04] ${
                      isCoreografiaVisible
                        ? 'rounded-t-[11px] border-b border-zinc-200/80 dark:border-white/[0.08]'
                        : 'rounded-[11px]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xs font-semibold tracking-wide text-zinc-950 uppercase dark:text-white">
                        Coreografia · Passo a Passo
                      </h2>
                      {!isCoreografiaVisible && (
                        <span className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                          Recolhida no modo 30s Porta · clique para abrir
                        </span>
                      )}
                    </div>
                    {isCoreografiaVisible ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    )}
                  </button>

                  {isCoreografiaVisible && (
                    <div
                      className="editorial-prose p-5"
                      dangerouslySetInnerHTML={{
                        __html: renderTeoriaMarkdownToHtml(parsedPrePorta.coreografia),
                      }}
                    />
                  )}
                </section>
              )}

              {/* 4. CHECKLIST MARCÁVEL (com barra de progresso, filtro "Só críticos", foco acessível e CTA Logbook) */}
              {checklistSections.length > 0 && (
                <section
                  id="sec-checklist"
                  className="mt-6 scroll-mt-14 overflow-hidden rounded-xl border border-zinc-200 border-l-[3px] border-l-sky-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-sky-400 dark:bg-[#15181F]"
                  aria-label="Checklist de execução"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 bg-sky-500/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-400" />
                      <h2 className="text-xs font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-400">
                        Checklist
                      </h2>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                          checkedCount === totalCheckItems && totalCheckItems > 0
                            ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                            : 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300'
                        }`}
                      >
                        {checkedCount}/{totalCheckItems}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {criticalCheckCount > 0 && criticalCheckCount < totalCheckItems && (
                        <button
                          type="button"
                          onClick={() => setOnlyCriticalChecklist((v) => !v)}
                          aria-pressed={onlyCriticalChecklist}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                            onlyCriticalChecklist
                              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300'
                              : 'border-zinc-200/80 bg-white text-zinc-600 hover:text-zinc-900 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:text-white'
                          }`}
                        >
                          <Filter className="h-3 w-3" />
                          Só críticos ({criticalCheckCount})
                        </button>
                      )}
                      {checkedCount > 0 && uncheckedItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenQuickCapture({
                              kind: 'ponto_cego',
                              defaultTitle: `${activeHabDisplayTitle} (${uncheckedItems.length} pendente${uncheckedItems.length > 1 ? 's' : ''})`,
                              defaultNota: buildPendingPontoCegoNote(uncheckedItems),
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50/80 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                        >
                          <Plus className="h-3 w-3" />
                          Salvar {uncheckedItems.length} pendente
                          {uncheckedItems.length > 1 ? 's' : ''} no Ponto Cego
                        </button>
                      )}
                      {checkedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => cockpitStore.resetHabChecklist(activeHab.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Barra de progresso fina */}
                  <div className="h-1 w-full bg-zinc-100 dark:bg-white/[0.05]">
                    <div
                      className={`h-full transition-all duration-200 ${
                        checkProgressPct === 100
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-sky-500 dark:bg-sky-400'
                      }`}
                      style={{ width: `${checkProgressPct}%` }}
                    />
                  </div>

                  <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
                    {visibleChecklistSections.map((sec) => (
                      <div key={sec.title} className="p-4">
                        {sec.title && (
                          <h3 className="mb-2.5 text-xs font-semibold text-zinc-950 dark:text-white">
                            {cleanHeadingText(sec.title)}
                          </h3>
                        )}
                        <ul className="space-y-2">
                          {sec.items.map((it) => {
                            const checked = Boolean(checks[it.id]);
                            return (
                              <li key={it.id}>
                                <label className="relative flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      cockpitStore.toggleHabChecklistItem(activeHab.id, it.id)
                                    }
                                    className="peer sr-only"
                                  />
                                  <span
                                    aria-hidden="true"
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#0F766E] peer-focus-visible:ring-offset-1 dark:peer-focus-visible:ring-[#2DD4BF] dark:peer-focus-visible:ring-offset-[#15181F] ${
                                      checked
                                        ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                        : 'border-zinc-300 bg-white dark:border-white/[0.18] dark:bg-[#0F1115]'
                                    }`}
                                  >
                                    {checked && <Check className="h-3 w-3 stroke-[2.75]" />}
                                  </span>
                                  <span
                                    className={`flex-1 ${
                                      checked
                                        ? 'text-zinc-400 line-through dark:text-[#6B7280]'
                                        : 'text-zinc-800 dark:text-[#F3F4F6]'
                                    }`}
                                  >
                                    {it.critical && (
                                      <span
                                        className={`mr-1.5 font-mono text-[11px] font-semibold uppercase ${
                                          checked
                                            ? 'text-zinc-400 dark:text-[#6B7280]'
                                            : 'text-red-700 dark:text-red-400'
                                        }`}
                                      >
                                        [Crítico]{' '}
                                      </span>
                                    )}
                                    {cleanChecklistText(it.text)}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* CTA contextual ao concluir 100% do checklist */}
                  {checkedCount === totalCheckItems && totalCheckItems > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/80 bg-emerald-50/70 px-4 py-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                      <span className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
                        Checklist 100% concluído! Deseja registrar esta prática no Logbook?
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenQuickCapture({
                            kind: 'logbook',
                            defaultTitle: activeHabDisplayTitle,
                            defaultHabId: activeHab.id,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-400 dark:text-[#0F1115] dark:hover:bg-emerald-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar no Logbook
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* 5. COMO REGISTRAR NO PRONTUÁRIO (Campos inline preenchíveis + edição livre + cópia) */}
              {activeHab.pep_body && (
                <section
                  id="sec-prontuario"
                  className="mt-6 scroll-mt-14 rounded-xl border border-zinc-200 border-l-[3px] border-l-[#0F766E] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-[#2DD4BF] dark:bg-[#15181F]"
                  aria-label="Como registrar no prontuário"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-tr-[11px] border-b border-zinc-200/80 bg-teal-500/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                      <h2 className="text-xs font-semibold tracking-wide text-[#0F766E] uppercase dark:text-[#2DD4BF]">
                        Como registrar no prontuário · Preencher &amp; copiar
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {pepHasEdits && (
                        <button
                          type="button"
                          onClick={handleResetPepFields}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Limpar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (!pepFreeEditMode) {
                            setPepFreeEditText(currentPepText);
                            setPepFreeEditMode(true);
                          } else {
                            setPepFreeEditMode(false);
                          }
                        }}
                        aria-pressed={pepFreeEditMode}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          pepFreeEditMode
                            ? 'border-[#0F766E]/40 bg-teal-50 text-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-teal-500/15 dark:text-[#2DD4BF]'
                            : 'border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB]'
                        }`}
                      >
                        <Edit3 className="h-3 w-3" />
                        {pepFreeEditMode ? 'Campos' : 'Editar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyPepSnippet()}
                        title="Copiar registro para o prontuário (atalho: C)"
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          copiedPepSnippet
                            ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                            : 'border border-zinc-200/90 bg-white text-zinc-700 hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]'
                        }`}
                      >
                        {copiedPepSnippet ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar registro
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-4" data-pep-document="true">
                    {pepFreeEditMode ? (
                      <textarea
                        value={pepFreeEditText}
                        onChange={(e) => setPepFreeEditText(e.target.value)}
                        rows={8}
                        aria-label="Editar texto do registro no prontuário"
                        className="w-full rounded-lg border border-zinc-200 bg-[#FAFAFA] p-3 font-sans text-[13.5px] leading-relaxed text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                      />
                    ) : pepAstBundle && effectivePepAstState ? (
                      <PepBlockRenderer
                        ast={pepAstBundle.ast}
                        section={pepAstBundle.section}
                        state={effectivePepAstState}
                        clinicalContext={EMPTY_CLINICAL_CONTEXT}
                        onInputChange={handlePepInputChange}
                        onChoiceSelect={handlePepChoiceSelect}
                        onToggleTrava={handlePepToggleTrava}
                        onToggleOptional={handlePepToggleOptional}
                        onToggleCheckbox={handlePepToggleCheckbox}
                      />
                    ) : (
                      <pre className="overflow-x-auto font-sans text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-[#D1D5DB]">
                        {activeHab.pep_body}
                      </pre>
                    )}
                  </div>
                </section>
              )}

              {/* 6. ARMADILHAS CRÍTICAS (com renderização de links Markdown e código inline) */}
              {activeHab.pitfalls && activeHab.pitfalls.length > 0 && (
                <section
                  id="sec-armadilhas"
                  className="mt-6 scroll-mt-14 rounded-xl border border-amber-300/80 border-l-[3px] border-l-amber-500 bg-amber-50/35 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-amber-500/30 dark:border-l-amber-400 dark:bg-amber-950/15"
                  aria-label="Armadilhas críticas"
                >
                  <div className="flex items-center gap-2 rounded-tr-[11px] border-b border-amber-200/80 bg-amber-500/[0.10] px-4 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/[0.12]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                    <h2 className="text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
                      Armadilhas críticas
                    </h2>
                  </div>
                  <div className="divide-y divide-amber-200/70 dark:divide-amber-500/20">
                    {activeHab.pitfalls.map((pitfall, idx) => (
                      <div key={`${idx}-${pitfall.title}`} className="px-4 py-3 text-sm">
                        <div
                          className="font-semibold text-zinc-950 dark:text-white"
                          dangerouslySetInnerHTML={{
                            __html: formatInlineClinicalHtml(cleanHeadingText(pitfall.title)),
                          }}
                        />
                        {pitfall.detail && (
                          <p
                            className="mt-0.5 text-[13px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]"
                            dangerouslySetInnerHTML={{
                              __html: formatInlineClinicalHtml(pitfall.detail),
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 7. TEORIA & PROTOCOLOS PEP RELACIONADOS (nomes clínicos compactos + "+N mais") */}
              {totalRelatedCount > 0 && (
                <section
                  id="sec-relacionados"
                  className="mt-6 scroll-mt-14 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
                  aria-label="Teoria e protocolos relacionados"
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-[#9CA3AF]">
                      Teoria &amp; Protocolos PEP relacionados
                    </h2>
                    <span className="font-mono text-[11px] text-zinc-400 dark:text-[#6B7280]">
                      {totalRelatedCount} {totalRelatedCount === 1 ? 'vínculo' : 'vínculos'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {onOpenTeoria &&
                      habLinks.teoriaModules.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => onOpenTeoria(mod.id)}
                          title={`Abrir Formação Teórica: ${mod.title}`}
                          className="inline-flex items-center gap-1 rounded-md border border-teal-200/80 bg-teal-50/50 px-2.5 py-1 text-xs font-medium text-[#0F766E] transition-colors hover:border-[#0F766E]/50 hover:bg-teal-50 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-[#2DD4BF] dark:hover:bg-teal-500/15"
                        >
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span>
                            Teoria M{mod.num}: {mod.shortTitle}
                          </span>
                          <ArrowUpRight className="h-3 w-3 opacity-70" />
                        </button>
                      ))}

                    {onOpenProtocol &&
                      (showAllRelatedPeps
                        ? habLinks.pepProtocols
                        : habLinks.pepProtocols.slice(0, 6)
                      ).map((proto) => (
                        <button
                          key={proto.id}
                          type="button"
                          onClick={() => onOpenProtocol(proto.id)}
                          title={`Abrir Protocolo PEP: ${proto.title}`}
                          className="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-zinc-200/80 bg-[#FAFAFA] px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                        >
                          <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                          <span className="truncate">
                            {formatCompactProtocolTitle(proto.title)}
                          </span>
                        </button>
                      ))}

                    {onOpenProtocol && habLinks.pepProtocols.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setShowAllRelatedPeps((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-[#0F766E] hover:text-[#0F766E] dark:border-white/[0.15] dark:text-[#9CA3AF] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
                      >
                        {showAllRelatedPeps
                          ? 'Mostrar menos'
                          : `+${habLinks.pepProtocols.length - 6} protocolos`}
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* 8. TÉCNICA COMPLETA (carregamento sob demanda, títulos e LaTeX higienizados) */}
              <section
                id="sec-tecnica"
                className="mt-6 mb-8 scroll-mt-14 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
              >
                <button
                  type="button"
                  onClick={() => void handleToggleTechnique()}
                  aria-expanded={techniqueOpen}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] ${
                    techniqueOpen
                      ? 'rounded-t-[11px] border-b border-zinc-200/80 bg-zinc-100/75 dark:border-white/[0.08] dark:bg-white/[0.04]'
                      : 'rounded-[11px] bg-zinc-100/60 dark:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                    <span className="font-display text-sm font-semibold text-zinc-950 dark:text-white">
                      Técnica completa
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      Aprofundamento sob demanda
                    </span>
                  </div>
                  {techniqueOpen ? (
                    <ChevronDown className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                  )}
                </button>

                {techniqueOpen && (
                  <div className="p-5">
                    {techniqueLoading ? (
                      <div className="py-6 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                        Carregando guia de técnica completa...
                      </div>
                    ) : matchedGuides.length === 0 ? (
                      <div className="py-4 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                        Nenhum guia complementar vinculado a este cartão.
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {matchedGuides.map((guide) => (
                          <article key={guide.id} className="space-y-4">
                            <div className="border-b border-zinc-200 pb-2 dark:border-white/[0.10]">
                              <h3 className="text-base font-bold text-zinc-950 dark:text-white">
                                {cleanHeadingText(guide.title)}
                              </h3>
                              <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                                {guide.category}
                              </p>
                            </div>

                            {guide.sections.map((sec, idx) => {
                              const cleanBody = stripMermaidBlocks(sec.body);
                              if (!cleanBody) return null;
                              return (
                                <div key={`${guide.id}-${idx}`} className="space-y-1.5">
                                  <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">
                                    {cleanHeadingText(sec.title)}
                                  </h4>
                                  <div
                                    className="editorial-prose"
                                    dangerouslySetInnerHTML={{
                                      __html: renderTeoriaMarkdownToHtml(cleanBody),
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
