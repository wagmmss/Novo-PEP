import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import { GLOBAL_SEARCH_INDEX, HAB_PROTOCOLS, PROTOCOL_BY_ID } from '../data/protocolsRepo.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import {
  formatPrePortaTitle,
  parsePrePortaContent,
  renderTeoriaMarkdownToHtml,
} from '../engine/diretrizes.ts';
import { cockpitStore } from '../state/store.ts';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

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
  rawMarkdown: string;
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
}: PrePortaViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const [techniqueLoading, setTechniqueLoading] = useState(false);
  const [techniquePayload, setTechniquePayload] = useState<DeepTechniquePayload | null>(null);

  const activeHab = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id === 'hab') return found;
    }
    return HAB_PROTOCOLS[0];
  }, [selectedId]);

  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTechniqueOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeHab.id]);

  const filteredHabs = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return HAB_PROTOCOLS;
    return searchClinicalProtocols(GLOBAL_SEARCH_INDEX, HAB_PROTOCOLS, q, HAB_PROTOCOLS.length).map(
      (r) => r.item
    );
  }, [searchQuery]);

  const checks = habChecklists[activeHab.id] || {};
  const checklistSections = activeHab.checklist_sections || [];
  const totalCheckItems = checklistSections.reduce((acc, s) => acc + s.items.length, 0);
  const checkedCount = checklistSections.reduce(
    (acc, s) => acc + s.items.filter((it) => Boolean(checks[it.id])).length,
    0
  );

  const parsedPrePorta = useMemo(
    () => parsePrePortaContent(activeHab.pre_porta || ''),
    [activeHab.pre_porta]
  );

  const activeHabDisplayTitle = useMemo(
    () => formatPrePortaTitle(activeHab.title),
    [activeHab.title]
  );

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
    <div className="mx-auto flex h-[calc(100vh-3.25rem)] w-full overflow-hidden">
      {/* COLUNA ESQUERDA: Lista dos 22 Cartões Pré-Porta */}
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
              placeholder="Buscar exame, procedimento ou habilidade..."
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
          {filteredHabs.length} {filteredHabs.length === 1 ? 'cartão Pré-Porta' : 'cartões Pré-Porta'}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredHabs.map((item) => {
            const isSelected = item.id === activeHab.id;
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

      {/* COLUNA DIREITA: Cartão Unificado Pré-Porta */}
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
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-[#F3F4F6]">
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
              >
                <Plus className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                Registrar no Logbook
              </button>
            </div>
          </header>

          {/* 1. RESUMO 30s (O que não esquecer) */}
          {(parsedPrePorta.resumo30s || parsedPrePorta.fallback) && (
            <section className="mt-6" aria-label="Resumo 30 segundos">
              <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Resumo 30s · O que não esquecer
              </h2>
              <div
                className="editorial-prose rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
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
              <div className="rounded-xl border border-zinc-200/80 border-l-2 border-l-[#0F766E] bg-teal-50/40 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-white/[0.07] dark:border-l-[#2DD4BF] dark:bg-[#171B24]">
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
              <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Coreografia · Passo a Passo
              </h2>
              <div
                className="editorial-prose rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
                dangerouslySetInnerHTML={{
                  __html: renderTeoriaMarkdownToHtml(parsedPrePorta.coreografia),
                }}
              />
            </section>
          )}

          {/* 2. CHECKLIST MARCÁVEL (persistido em localStorage) */}
          {checklistSections.length > 0 && (
            <section className="mt-7" aria-label="Checklist de execução">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-[#9CA3AF]">
                    Checklist
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                    {checkedCount}/{totalCheckItems}
                  </span>
                </div>
                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => cockpitStore.resetHabChecklist(activeHab.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Limpar marcações
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {checklistSections.map((sec) => (
                  <div
                    key={sec.title}
                    className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
                  >
                    {sec.title && (
                      <h3 className="mb-2.5 text-xs font-semibold text-zinc-700 dark:text-[#D1D5DB]">
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

          {/* 3. ARMADILHAS CRÍTICAS (destaque sutil exclusivo para segurança clínica) */}
          {activeHab.pitfalls && activeHab.pitfalls.length > 0 && (
            <section className="mt-7" aria-label="Armadilhas críticas">
              <div className="mb-2.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                <h2 className="text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-400">
                  Armadilhas críticas
                </h2>
              </div>
              <div className="divide-y divide-amber-200/70 rounded-xl border border-amber-200/90 bg-amber-50/45 dark:divide-amber-900/40 dark:border-amber-900/50 dark:bg-amber-950/20">
                {activeHab.pitfalls.map((pitfall, idx) => (
                  <div key={`${idx}-${pitfall.title}`} className="px-4 py-3 text-sm">
                    <div className="font-semibold text-zinc-900 dark:text-[#F3F4F6]">
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

          {/* 4. TÉCNICA COMPLETA (Carregada sob demanda em disclosure fechado por padrão) */}
          <section className="mt-8 border-t border-zinc-200/80 pt-5 pb-8 dark:border-white/[0.07]">
            <button
              type="button"
              onClick={handleToggleTechnique}
              aria-expanded={techniqueOpen}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-100/80 dark:hover:bg-[#1C2029]"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                <span className="font-display text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                  Técnica completa
                </span>
                <span className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                  Carregamento sob demanda
                </span>
              </div>
              {techniqueOpen ? (
                <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-[#6B7280]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-[#6B7280]" />
              )}
            </button>

            {techniqueOpen && (
              <div className="mt-4 px-2">
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
                        <div className="border-b border-zinc-200/80 pb-2 dark:border-white/[0.07]">
                          <h3 className="text-base font-bold text-zinc-950 dark:text-[#F3F4F6]">
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
                              <h4 className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
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
        </div>
      </main>
    </div>
  );
}
