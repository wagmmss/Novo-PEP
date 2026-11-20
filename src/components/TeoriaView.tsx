import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import { FORMACAO_TEORICA_MODULOS, type Central6AnoState } from '../engine/central6ano.ts';
import { renderTeoriaMarkdownToHtml } from '../engine/diretrizes.ts';
import { resolveLinksForTeoriaModule } from '../data/clinical_links.ts';
import { HAB_PROTOCOLS } from '../data/protocolsRepo.ts';
import { cockpitStore, type TeoriaModuleStatus } from '../state/store.ts';

interface TeoriaViewProps {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
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

function stripLeadingH1(markdown: string): string {
  return String(markdown || '').replace(/^\s*#\s+[^\n]+\n+/, '');
}

export function TeoriaView({ central6Ano, onOpenPrePorta }: TeoriaViewProps) {
  const [selectedModId, setSelectedModId] = useState<string>(
    FORMACAO_TEORICA_MODULOS[0]?.id || 'mod-01'
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | TeoriaModuleStatus>('todos');
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  const statusById = central6Ano.teoriaStatusById || {};

  const getStatus = (modId: string): TeoriaModuleStatus => {
    const raw = statusById[modId];
    if (raw === 'estudado' || raw === 'dominado') return raw;
    return 'nao_iniciado';
  };

  const counts = useMemo(() => {
    let dominado = 0;
    let estudado = 0;
    for (const mod of FORMACAO_TEORICA_MODULOS) {
      const st = getStatus(mod.id);
      if (st === 'dominado') dominado += 1;
      else if (st === 'estudado') estudado += 1;
    }
    return { dominado, estudado, total: FORMACAO_TEORICA_MODULOS.length };
  }, [statusById]);

  const filteredModules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORMACAO_TEORICA_MODULOS.filter((mod) => {
      const st = getStatus(mod.id);
      if (statusFilter !== 'todos' && st !== statusFilter) return false;
      if (!q) return true;
      return (
        mod.title.toLowerCase().includes(q) ||
        mod.shortTitle.toLowerCase().includes(q) ||
        mod.pilar.toLowerCase().includes(q) ||
        mod.num.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter, statusById]);

  const activeMod = useMemo(
    () =>
      FORMACAO_TEORICA_MODULOS.find((m) => m.id === selectedModId) ||
      FORMACAO_TEORICA_MODULOS[0],
    [selectedModId]
  );

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeMod?.id]);

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
    return renderTeoriaMarkdownToHtml(stripLeadingH1(activeMod.markdown));
  }, [activeMod]);

  const activeStatus: TeoriaModuleStatus = activeMod ? getStatus(activeMod.id) : 'nao_iniciado';

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Coluna Esquerda — Lista enxuta de módulos */}
      <aside
        aria-label="Módulos de formação teórica"
        className={`flex h-full w-full flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:w-[320px] lg:shrink-0 dark:border-white/[0.07] dark:bg-[#0F1115] ${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="space-y-2.5 border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
          <div className="flex items-center justify-between px-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
            <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
              Formação Teórica
            </span>
            <span className="font-mono tabular-nums">
              {counts.dominado}/{counts.total} dominados
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#9CA3AF]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar módulo..."
              aria-label="Filtrar módulo teórico"
              className="w-full rounded-lg border border-zinc-200/90 bg-white py-1.5 pr-2.5 pl-8 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'nao_iniciado', label: 'Não inic.' },
                { id: 'estudado', label: 'Em and.' },
                { id: 'dominado', label: 'Dominado' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1 text-center text-[11px] font-medium transition-colors ${
                  statusFilter === opt.id
                    ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                    : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {filteredModules.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-[#9CA3AF]">
              Nenhum módulo encontrado.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredModules.map((mod) => {
                const isSelected = activeMod?.id === mod.id;
                const st = getStatus(mod.id);
                return (
                  <li key={mod.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModId(mod.id);
                        setMobileShowDetail(true);
                      }}
                      className={`w-full rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-teal-50/75 text-zinc-950 dark:bg-teal-500/12 dark:text-[#F3F4F6]'
                          : 'text-zinc-700 hover:bg-zinc-100/80 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-medium text-zinc-400 dark:text-[#6B7280]">
                          MÓDULO {mod.num}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            st === 'dominado'
                              ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                              : st === 'estudado'
                                ? 'text-zinc-600 dark:text-[#D1D5DB]'
                                : 'text-zinc-400 dark:text-[#6B7280]'
                          }`}
                        >
                          {STATUS_LABEL_MAP[st]}
                        </span>
                      </div>
                      <div
                        className={`mt-0.5 line-clamp-2 text-sm leading-snug ${
                          isSelected ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]' : 'font-medium'
                        }`}
                      >
                        {mod.shortTitle}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                        {mod.pilar}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </aside>

      {/* Coluna Direita — Leitura editorial limpa (somente leitura, sem drills) */}
      <main
        ref={detailScrollRef}
        className={`flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115] ${mobileShowDetail ? 'block' : 'hidden lg:block'}`}
      >
        {activeMod && (
          <article className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
            <button
              type="button"
              onClick={() => setMobileShowDetail(false)}
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 lg:hidden dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Módulos
            </button>

            <header className="border-b border-zinc-200 pb-5 dark:border-white/[0.10]">
              <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                <span className="font-mono font-medium">Módulo {activeMod.num}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{activeMod.pilar}</span>
              </div>

              <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl dark:text-white">
                {activeMod.title}
              </h1>

              {/* Controle simples de status do módulo */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
                        onClick={() => cockpitStore.setTeoriaModuleStatus(activeMod.id, opt.value)}
                        className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                            : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Atalhos discretos para cartões Pré-Porta vinculados */}
              {linkedHabs.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    Pré-Porta vinculado:
                  </span>
                  {linkedHabs.map((hab) => (
                    <button
                      key={hab.id}
                      type="button"
                      onClick={() => onOpenPrePorta(hab.id)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-zinc-200/80 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]"
                    >
                      <span>{hab.title}</span>
                      <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                    </button>
                  ))}
                </div>
              )}
            </header>

            <div
              className="editorial-prose mt-6"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </article>
        )}
      </main>
    </div>
  );
}
