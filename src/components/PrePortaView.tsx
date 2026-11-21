import { useEffect, useMemo, useRef, useState } from 'react';
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
  FileText,
  Plus,
  RotateCcw,
  Search,
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
} from '../data/protocolsRepo.ts';
import { FORMACAO_TEORICA_MODULOS } from '../engine/central6ano.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import {
  formatPrePortaTitle,
  parsePrePortaContent,
  renderTeoriaMarkdownToHtml,
} from '../engine/diretrizes.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
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
  habChecklists: Record<string, Record<string, boolean>>;
  onSelectHab: (id: string) => void;
  onBackToList: () => void;
  onOpenQuickCapture: (req: QuickCaptureRequest) => void;
  onOpenProtocol?: (protocolId: string) => void;
  onOpenTeoria?: (modId: string) => void;
  onNotify?: (msg: string) => void;
}

function stripLeadingEmoji(text: string): string {
  return String(text || '')
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')
    .trim();
}

function stripMermaidBlocks(md: string): string {
  return String(md || '').replace(/```mermaid[\s\S]*?```/gi, '').trim();
}

function cleanChecklistText(text: string): string {
  return String(text || '')
    .replace(/^\[CR[IÍ]TICO\]\s*/i, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function cleanInlineCode(text: string): string {
  return String(text || '').replace(/`([^`]+)`/g, '$1').trim();
}

export function PrePortaView({
  selectedId,
  mobileShowDetail,
  habChecklists,
  onSelectHab,
  onBackToList,
  onOpenQuickCapture,
  onOpenProtocol,
  onOpenTeoria,
  onNotify,
}: PrePortaViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const [techniqueLoading, setTechniqueLoading] = useState(false);
  const [techniquePayload, setTechniquePayload] = useState<DeepTechniquePayload | null>(null);
  const [copiedPepSnippet, setCopiedPepSnippet] = useState(false);

  const isIntercorrenciasSelected = selectedId === INTERCORRENCIAS_HAB_ID;

  const activeHab = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId && selectedId !== INTERCORRENCIAS_HAB_ID) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id === 'hab') return found;
    }
    return HAB_PROTOCOLS[0];
  }, [selectedId]);

  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTechniqueOpen(false);
    setCopiedPepSnippet(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeHab.id, isIntercorrenciasSelected]);

  const filteredHabs = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return HAB_PROTOCOLS;
    return searchClinicalProtocols(GLOBAL_SEARCH_INDEX, HAB_PROTOCOLS, q, HAB_PROTOCOLS.length).map(
      (r) => r.item
    );
  }, [searchQuery]);

  const showIntercorrenciasInSidebar = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    if ('intercorrencias intercorrências madrugada plantão enfermaria 5 ws'.includes(q)) return true;
    return SEIS_INTERCORRENCIAS_DATA.some(
      (it) =>
        it.titulo.toLowerCase().includes(q) ||
        it.causas3.toLowerCase().includes(q) ||
        it.conduta.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const checks = habChecklists[activeHab.id] || {};
  const checklistSections = activeHab.checklist_sections || [];
  const totalCheckItems = checklistSections.reduce((acc, s) => acc + s.items.length, 0);
  const checkedCount = checklistSections.reduce(
    (acc, s) => acc + s.items.filter((it) => Boolean(checks[it.id])).length,
    0
  );
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

  const activeHabDisplayTitle = useMemo(
    () => formatPrePortaTitle(activeHab.title),
    [activeHab.title]
  );

  const habLinks = useMemo(() => {
    const resolved = resolveLinksForPrePorta(activeHab.id);
    const teoriaModules = resolved.teoriaModIds
      .map((id) => FORMACAO_TEORICA_MODULOS.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    const pepProtocols = resolved.pepTriggers
      .map((trig) => PROTOCOL_BY_TRIGGER.get(trig.toLowerCase()))
      .filter((p): p is ClinicalProtocolItem => Boolean(p))
      .slice(0, 6);
    return { teoriaModules, pepProtocols };
  }, [activeHab.id]);

  const handleCopyPepSnippet = async () => {
    if (!activeHab.pep_body) return;
    const ok = await copyToClipboard(activeHab.pep_body);
    if (ok) {
      setCopiedPepSnippet(true);
      onNotify?.('Texto pronto copiado para o PEP.');
      window.setTimeout(() => setCopiedPepSnippet(false), 1800);
    }
  };

  const handleToggleTechnique = async () => {
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
  };

  const matchedGuides = useMemo(() => {
    if (!techniquePayload) return [];
    const guideIds = techniquePayload.byHabId[activeHab.id] || [];
    const byId = new Map(techniquePayload.guides.map((g) => [g.id, g]));
    return guideIds.map((gid) => byId.get(gid)).filter((g): g is DeepTechniqueGuide => Boolean(g));
  }, [techniquePayload, activeHab.id]);

  return (
    <div className="mx-auto flex min-h-0 flex-1 w-full overflow-hidden">
      {/* COLUNA ESQUERDA: Lista dos 22 Cartões Pré-Porta + 6 Intercorrências */}
      <aside
        aria-label="Lista de cartões Pré-Porta"
        className={`${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        } h-full w-full shrink-0 flex-col border-r border-zinc-200/80 bg-white lg:w-[320px] dark:border-white/[0.07] dark:bg-[#12151B]`}
      >
        <div className="border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#6B7280]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar exame, intercorrência ou habilidade..."
              aria-label="Filtrar cartões Pré-Porta"
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] py-1.5 pr-7 pl-8 text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
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
        </div>

        <div className="border-b border-zinc-200/70 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/[0.06] dark:text-[#9CA3AF]">
          {filteredHabs.length} {filteredHabs.length === 1 ? 'cartão Pré-Porta' : 'cartões Pré-Porta'} · 6 Intercorrências
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
              <span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                6
              </span>
            </button>
          )}

          {filteredHabs.map((item) => {
            const isSelected = !isIntercorrenciasSelected && item.id === activeHab.id;
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
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                    <span className="truncate">{item.hab_category || item.category}</span>
                    {item.time_goal && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[10px]">{item.time_goal}</span>
                      </>
                    )}
                  </div>
                </div>
                {itemDone > 0 && itemTotal > 0 && (
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                    {itemDone}/{itemTotal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* COLUNA DIREITA: Cartão Unificado Pré-Porta OU Guia das 6 Intercorrências */}
      <main
        ref={mainRef}
        className={`${
          mobileShowDetail ? 'block' : 'hidden lg:block'
        } h-full flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]`}
      >
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-7">
          <div className="mb-3 lg:hidden">
            <button
              type="button"
              onClick={onBackToList}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Pré-Porta
            </button>
          </div>

          {isIntercorrenciasSelected ? (
            <div>
              <header className="border-b border-zinc-200/80 pb-5 dark:border-white/[0.07]">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                  <span className="font-medium text-amber-800 dark:text-amber-300">
                    Enfermaria &amp; Pós-Operatório
                  </span>
                  <span>·</span>
                  <span className="font-mono text-[11px]">Resposta rápida em 2 min</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
                  <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                    Guia das 6 Intercorrências de Madrugada
                  </h1>
                  {onOpenTeoria && (
                    <button
                      type="button"
                      onClick={() => onOpenTeoria('mod-06')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                      Teoria M06: Prescrição &amp; Intercorrências
                      <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-[#9CA3AF]">
                  Roteiro de bolso à beira-leito para chamados da enfermagem no plantão noturno: o que avaliar nos primeiros 2 minutos, as 3 causas fatais que precisam ser afastadas e a conduta imediata segura.
                </p>
              </header>

              <div className="mt-6 space-y-5 pb-8">
                {SEIS_INTERCORRENCIAS_DATA.map((item) => {
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
                      aria-label={item.titulo}
                      className="rounded-xl border border-zinc-200 border-l-[3px] border-l-amber-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-amber-400 dark:bg-[#15181F]"
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
                                className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-zinc-200/80 bg-[#FAFAFA] px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                              >
                                <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                                <span className="truncate">{p.title}</span>
                              </button>
                            ))}
                          {linkedHabs.map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => onSelectHab(h.id)}
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

          {/* Cabeçalho Unificado */}
          <header className="border-b border-zinc-200/80 pb-5 dark:border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
              <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                {activeHab.hab_category || activeHab.category}
              </span>
              {activeHab.time_goal && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[11px]">{activeHab.time_goal}</span>
                </>
              )}
              {activeHab.anchor && (
                <>
                  <span>·</span>
                  <span className="truncate">{activeHab.anchor}</span>
                </>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                {activeHabDisplayTitle}
              </h1>

              <button
                type="button"
                onClick={() =>
                  onOpenQuickCapture({
                    kind: 'logbook',
                    defaultTitle: activeHabDisplayTitle,
                  })
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
              >
                <Plus className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                Registrar no Logbook
              </button>
            </div>

            {(habLinks.teoriaModules.length > 0 || habLinks.pepProtocols.length > 0) && (
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                {onOpenTeoria &&
                  habLinks.teoriaModules.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => onOpenTeoria(mod.id)}
                      title={`Abrir Formação Teórica: ${mod.title}`}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200/80 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                    >
                      <BookOpen className="h-3 w-3 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                      <span>
                        Teoria M{mod.num}: {mod.shortTitle}
                      </span>
                      <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                    </button>
                  ))}
                {onOpenProtocol &&
                  habLinks.pepProtocols.slice(0, 4).map((proto) => (
                    <button
                      key={proto.id}
                      type="button"
                      onClick={() => onOpenProtocol(proto.id)}
                      title={`Abrir Protocolo PEP: ${proto.title}`}
                      className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-zinc-200/80 bg-white px-2 py-1 text-xs font-medium text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:border-white/[0.15] dark:hover:text-[#F3F4F6]"
                    >
                      <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span className="truncate">{proto.title}</span>
                    </button>
                  ))}
              </div>
            )}
          </header>

          {/* 1. RESUMO 30s (O que não esquecer — cabeçalho tonalizado Teal) */}
          {(parsedPrePorta.resumo30s || parsedPrePorta.fallback) && (
            <section
              className="mt-6 rounded-xl border border-zinc-200 border-l-[3px] border-l-teal-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-teal-400 dark:bg-[#15181F]"
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

          {/* 2. MNEMÔNICO / REGRA DE OURO (faixa discreta com borda esquerda Teal) */}
          {parsedPrePorta.mnemonico && (
            <section className="mt-6" aria-label="Mnemônico e Regra de Ouro">
              <div className="rounded-xl border border-zinc-200 border-l-[3px] border-l-[#0F766E] bg-teal-50/40 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-white/[0.10] dark:border-l-[#2DD4BF] dark:bg-[#171B24]">
                <h2 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-[#0F766E] uppercase dark:text-[#2DD4BF]">
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

          {/* 3. COREOGRAFIA / PASSO A PASSO TÉCNICO */}
          {parsedPrePorta.coreografia && (
            <section className="mt-6" aria-label="Coreografia e passo a passo técnico">
              <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-zinc-950 uppercase dark:text-white">
                Coreografia · Passo a Passo
              </h2>
              <div
                className="editorial-prose rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
                dangerouslySetInnerHTML={{
                  __html: renderTeoriaMarkdownToHtml(parsedPrePorta.coreografia),
                }}
              />
            </section>
          )}

          {/* 4. CHECKLIST MARCÁVEL (cabeçalho tonalizado Azul — persistido em localStorage) */}
          {checklistSections.length > 0 && (
            <section
              className="mt-7 rounded-xl border border-zinc-200 border-l-[3px] border-l-sky-500 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-sky-400 dark:bg-[#15181F]"
              aria-label="Checklist de execução"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-tr-[11px] border-b border-zinc-200/80 bg-sky-500/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
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
                {checkedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {uncheckedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenQuickCapture({
                            kind: 'ponto_cego',
                            defaultTitle: `${activeHabDisplayTitle} (${uncheckedItems.length} pendente${uncheckedItems.length > 1 ? 's' : ''})`,
                            defaultNota: `Itens esquecidos no checklist: ${uncheckedItems.slice(0, 4).join('; ')}`,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50/80 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                      >
                        <Plus className="h-3 w-3" />
                        Salvar {uncheckedItems.length} pendente{uncheckedItems.length > 1 ? 's' : ''} no Ponto Cego
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cockpitStore.resetHabChecklist(activeHab.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar marcações
                    </button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
                {checklistSections.map((sec) => (
                  <div key={sec.title} className="p-4">
                    {sec.title && (
                      <h3 className="mb-2.5 text-xs font-semibold text-zinc-950 dark:text-white">
                        {stripLeadingEmoji(sec.title)}
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {sec.items.map((it) => {
                        const checked = Boolean(checks[it.id]);
                        return (
                          <li key={it.id}>
                            <label className="relative flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                              <span
                                className={`relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                  checked
                                    ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                    : 'border-zinc-300 bg-white dark:border-white/[0.18] dark:bg-[#0F1115]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    cockpitStore.toggleHabChecklistItem(activeHab.id, it.id)
                                  }
                                  className="sr-only"
                                />
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
                                  <span className="mr-1.5 font-mono text-[11px] font-semibold text-red-700 uppercase dark:text-red-400">
                                    [Crítico]
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
            </section>
          )}

          {/* 5. COMO REGISTRAR NO PRONTUÁRIO (Texto Pronto copiável da Seção 5 do cartão) */}
          {activeHab.pep_body && (
            <section
              className="mt-7 rounded-xl border border-zinc-200 border-l-[3px] border-l-[#0F766E] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:border-l-[#2DD4BF] dark:bg-[#15181F]"
              aria-label="Como registrar no prontuário"
            >
              <div className="flex items-center justify-between gap-2 rounded-tr-[11px] border-b border-zinc-200/80 bg-teal-500/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                  <h2 className="text-xs font-semibold tracking-wide text-[#0F766E] uppercase dark:text-[#2DD4BF]">
                    Como registrar no prontuário · Texto pronto
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyPepSnippet()}
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
              <pre className="overflow-x-auto p-4 font-sans text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-[#D1D5DB]">
                {activeHab.pep_body}
              </pre>
            </section>
          )}

          {/* 6. ARMADILHAS CRÍTICAS (cabeçalho tonalizado Âmbar/Vermelho suave com ícone) */}
          {activeHab.pitfalls && activeHab.pitfalls.length > 0 && (
            <section
              className="mt-7 rounded-xl border border-amber-300/80 border-l-[3px] border-l-amber-500 bg-amber-50/35 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-amber-500/30 dark:border-l-amber-400 dark:bg-amber-950/15"
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
                    <div className="font-semibold text-zinc-950 dark:text-white">
                      {cleanInlineCode(stripLeadingEmoji(pitfall.title))}
                    </div>
                    {pitfall.detail && (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                        {cleanInlineCode(pitfall.detail)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6. TÉCNICA COMPLETA (card neutro elevado, carregado sob demanda) */}
          <section className="mt-7 mb-8 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]">
            <button
              type="button"
              onClick={handleToggleTechnique}
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
                  Carregamento sob demanda
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
                            {stripLeadingEmoji(guide.title)}
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
                                {stripLeadingEmoji(sec.title)}
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
