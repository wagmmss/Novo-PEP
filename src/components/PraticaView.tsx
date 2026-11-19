import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ENSAIO_MENTAL_3MIN_PASSOS,
  ENSAIO_MENTAL_PROCS_DATA,
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  RODIZIOS_6ANO,
  buildContextualAiPrompt,
  type Central6AnoState,
  type PromptContextualKind,
} from '../engine/central6ano.ts';
import { cockpitStore, type LogbookRole } from '../state/store.ts';
import { detectPiiIssues, sanitizePiiText } from '../utils/piiGuard.ts';

type PraticaSubTab = 'logbook' | 'pontos-cegos' | 'prompts' | 'ensaio';

interface PraticaViewProps {
  central6Ano: Central6AnoState;
  onNotify: (message: string) => void;
}

const SUB_TABS: Array<{ id: PraticaSubTab; label: string }> = [
  { id: 'logbook', label: 'Logbook 3x' },
  { id: 'pontos-cegos', label: 'Pontos Cegos' },
  { id: 'prompts', label: 'Prompts IA' },
  { id: 'ensaio', label: 'Ensaio Mental' },
];

const ROLE_BUTTONS: Array<{ role: LogbookRole; label: string; shortLabel: string; title: string }> = [
  {
    role: 'observou',
    label: 'Observou',
    shortLabel: 'Obs.',
    title: 'Registra no histórico (não conta na Regra 3x de execução prática)',
  },
  {
    role: 'auxiliei',
    label: 'Auxiliou',
    shortLabel: 'Aux.',
    title: 'Registra auxílio ativo (+1 na Regra 3x)',
  },
  {
    role: 'supervisionado',
    label: 'Supervisionado',
    shortLabel: 'Superv.',
    title: 'Registra execução com supervisão (+1 na Regra 3x)',
  },
  {
    role: 'autonomo',
    label: 'Autônomo',
    shortLabel: 'Autôn.',
    title: 'Registra execução autônoma (+1 na Regra 3x)',
  },
];

const PROMPT_TYPES: Array<{ id: PromptContextualKind; label: string; subtitle: string }> = [
  { id: 'paciente', label: 'Paciente Simulado', subtitle: 'Anamnese Calgary-Cambridge + HDPE' },
  { id: 'oratoria', label: 'Oratória Clínica', subtitle: 'Rubrica SNAPPS / SBAR (0–10)' },
  { id: 'raciocinio', label: 'Raciocínio & Bayes', subtitle: 'Illness Scripts em 3 etapas' },
  { id: 'exames', label: 'Exames de Urgência', subtitle: 'Gasometria 5 passos + ECG / Imagem' },
  { id: 'osce', label: 'Estação OSCE', subtitle: 'Simulação cronometrada de 8 min' },
];

const RODIZIO_NAME_MAP = new Map<string, string>(
  RODIZIOS_6ANO.map((r) => [r.id, r.nome])
);

const MATRIX_PROC_IDS = new Set<string>(LOGBOOK_PROCEDIMENTOS_MATRIX.map((p) => p.id));

function formatIsoShort(dateIso: string): string {
  const parts = String(dateIso || '').split('-');
  if (parts.length !== 3) return dateIso || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PraticaView({ central6Ano, onNotify }: PraticaViewProps) {
  const [subTab, setSubTab] = useState<PraticaSubTab>('logbook');

  const pendingBlindCount = useMemo(
    () =>
      (central6Ano.logbookEntries || []).filter(
        (e) => e.tipo === 'ponto_cego' && e.status !== 'resolvido'
      ).length,
    [central6Ano.logbookEntries]
  );

  return (
    <main className="h-[calc(100vh-3.25rem)] overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de sub-abas limpa — 1 ferramenta focada por vez */}
      <div className="sticky top-0 z-20 border-b border-zinc-200/80 bg-[#FAFAFA]/95 backdrop-blur-sm dark:border-white/[0.07] dark:bg-[#0F1115]/95">
        <div className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 sm:px-8">
          {SUB_TABS.map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'pontos-cegos' && pendingBlindCount > 0 && (
                  <span className="ml-1.5 font-mono text-xs tabular-nums text-zinc-400 dark:text-[#6B7280]">
                    {pendingBlindCount}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
        {subTab === 'logbook' && (
          <LogbookTool central6Ano={central6Ano} onNotify={onNotify} />
        )}
        {subTab === 'pontos-cegos' && (
          <PontosCegosTool central6Ano={central6Ano} onNotify={onNotify} />
        )}
        {subTab === 'prompts' && (
          <PromptsIaTool central6Ano={central6Ano} onNotify={onNotify} />
        )}
        {subTab === 'ensaio' && <EnsaioMentalTool />}
      </div>
    </main>
  );
}

// ============================================================================
// 1. LOGBOOK 3x
// ============================================================================

function LogbookTool({
  central6Ano,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  onNotify: (msg: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [rodizioFilter, setRodizioFilter] = useState<string>('todos');
  const [expandedProcIds, setExpandedProcIds] = useState<Record<string, boolean>>({});
  const [showGeneralHistory, setShowGeneralHistory] = useState(false);

  const rodizioFilters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
      if (!seen.has(proc.rodizioId)) {
        seen.set(proc.rodizioId, proc.rodizioNome);
      }
    }
    return Array.from(seen.entries()).map(([id, nome]) => ({ id, nome }));
  }, []);

  const procedureEntries = useMemo(
    () => (central6Ano.logbookEntries || []).filter((e) => e.tipo === 'procedimento'),
    [central6Ano.logbookEntries]
  );

  const entriesByProcId = useMemo(() => {
    const map = new Map<string, typeof procedureEntries>();
    for (const entry of procedureEntries) {
      const key = entry.gatilhoCorrecao && MATRIX_PROC_IDS.has(entry.gatilhoCorrecao)
        ? entry.gatilhoCorrecao
        : null;
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [procedureEntries]);

  const unlinkedEntries = useMemo(
    () =>
      procedureEntries.filter(
        (e) => !e.gatilhoCorrecao || !MATRIX_PROC_IDS.has(e.gatilhoCorrecao)
      ),
    [procedureEntries]
  );

  const filteredProcedures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOGBOOK_PROCEDIMENTOS_MATRIX.filter((proc) => {
      if (rodizioFilter !== 'todos' && proc.rodizioId !== rodizioFilter) return false;
      if (!q) return true;
      return (
        proc.nome.toLowerCase().includes(q) ||
        proc.rodizioNome.toLowerCase().includes(q) ||
        proc.guiaRef.toLowerCase().includes(q)
      );
    });
  }, [query, rodizioFilter]);

  const summary = useMemo(() => {
    let completed3x = 0;
    let totalExecutions = 0;
    for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
      const count = central6Ano.procCountsById?.[proc.id] || 0;
      totalExecutions += count;
      if (count >= 3) completed3x += 1;
    }
    return {
      completed3x,
      totalProcedures: LOGBOOK_PROCEDIMENTOS_MATRIX.length,
      totalExecutions,
    };
  }, [central6Ano.procCountsById]);

  const handleRecord = (procId: string, procName: string, role: LogbookRole) => {
    cockpitStore.recordMatrixProcedure(procId, role);
    const label = ROLE_BUTTONS.find((b) => b.role === role)?.label || role;
    onNotify(`${procName}: ${label} registrado.`);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho editorial */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]">
            Logbook de Procedimentos — Regra 3x
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
            Auxiliou, Supervisionado e Autônomo avançam a Regra 3x; Observou registra no histórico.
          </p>
        </div>
        <div className="font-mono text-xs tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
          {summary.completed3x}/{summary.totalProcedures} em 3x · {summary.totalExecutions} execuções
        </div>
      </div>

      {/* Busca e filtros por rodízio */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-[#6B7280]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar procedimento ou área..."
            aria-label="Filtrar procedimento"
            className="w-full rounded-lg border border-zinc-200/80 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setRodizioFilter('todos')}
            className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              rodizioFilter === 'todos'
                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
            }`}
          >
            Todas as áreas ({LOGBOOK_PROCEDIMENTOS_MATRIX.length})
          </button>
          {rodizioFilters.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRodizioFilter(r.id)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                rodizioFilter === r.id
                  ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                  : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
              }`}
            >
              {r.nome}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de procedimentos */}
      <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
        {filteredProcedures.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
            Nenhum procedimento encontrado para este filtro.
          </div>
        ) : (
          filteredProcedures.map((proc) => {
            const count = central6Ano.procCountsById?.[proc.id] || 0;
            const auto = central6Ano.procAutonomyById?.[proc.id] || {
              auxiliei: 0,
              supervisionado: 0,
              autonomo: 0,
            };
            const history = entriesByProcId.get(proc.id) || [];
            const obsCount = history.filter((h) => h.papel === 'Observou').length;
            const rule3xDone = count >= 3;
            const filledSegments = Math.min(3, count);
            const isExpanded = Boolean(expandedProcIds[proc.id]);

            return (
              <div key={proc.id} className="px-4 py-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                        {proc.nome}
                      </span>
                      <span
                        className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                          rule3xDone
                            ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                            : 'text-zinc-500 dark:text-[#9CA3AF]'
                        }`}
                      >
                        {Math.min(count, 3)}/3{rule3xDone ? ' ✓' : ''}
                        {count > 3 ? ` (+${count - 3})` : ''}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      <span>{proc.rodizioNome}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Meta ano: {proc.metaAlvo}</span>
                      {(auto.auxiliei > 0 || auto.supervisionado > 0 || auto.autonomo > 0 || obsCount > 0) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {[
                              obsCount > 0 ? `Obs ${obsCount}` : '',
                              auto.auxiliei > 0 ? `Aux ${auto.auxiliei}` : '',
                              auto.supervisionado > 0 ? `Sup ${auto.supervisionado}` : '',
                              auto.autonomo > 0 ? `Aut ${auto.autonomo}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Barra sutil da Regra 3x (3 segmentos) */}
                    <div className="mt-2 flex max-w-[140px] items-center gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            filledSegments >= step
                              ? 'bg-[#0F766E] dark:bg-[#2DD4BF]'
                              : 'bg-zinc-200 dark:bg-white/[0.08]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Ações de 1 clique */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                    {ROLE_BUTTONS.map((btn) => (
                      <button
                        key={btn.role}
                        type="button"
                        title={btn.title}
                        onClick={() => handleRecord(proc.id, proc.nome, btn.role)}
                        className="whitespace-nowrap rounded-md border border-zinc-200/90 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:bg-[#0F766E]/[0.06] hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
                      >
                        <span className="hidden sm:inline">{btn.label}</span>
                        <span className="sm:hidden">{btn.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Histórico compacto expansível do procedimento */}
                {history.length > 0 && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProcIds((prev) => ({
                          ...prev,
                          [proc.id]: !prev[proc.id],
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span>
                        Histórico ({history.length})
                      </span>
                    </button>

                    {isExpanded && (
                      <ul className="mt-2 space-y-1.5 border-t border-zinc-100 pt-2 dark:border-white/[0.06]">
                        {history.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-3 text-xs text-zinc-600 dark:text-[#9CA3AF]"
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-mono tabular-nums text-zinc-400 dark:text-[#6B7280]">
                                {formatIsoShort(item.dateIso)}
                              </span>
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span className="font-medium text-zinc-800 dark:text-[#F3F4F6]">
                                {item.papel}
                              </span>
                              {item.aprendizado && (
                                <>
                                  <span className="mx-1.5" aria-hidden="true">·</span>
                                  <span>{item.aprendizado}</span>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                cockpitStore.deleteLogbookEntry(item.id);
                                onNotify('Registro removido do Logbook.');
                              }}
                              aria-label={`Remover registro de ${proc.nome}`}
                              className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Registros rápidos capturados em Protocolos / Pré-Porta */}
      {unlinkedEntries.length > 0 && (
        <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
          <button
            type="button"
            onClick={() => setShowGeneralHistory((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
          >
            <span>
              Registros avulsos e capturas à Beira-Leito ({unlinkedEntries.length})
            </span>
            {showGeneralHistory ? (
              <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-[#6B7280]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-[#6B7280]" />
            )}
          </button>

          {showGeneralHistory && (
            <ul className="divide-y divide-zinc-200/70 border-t border-zinc-200/80 dark:divide-white/[0.06] dark:border-white/[0.07]">
              {unlinkedEntries.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 dark:text-[#F3F4F6]">
                      {item.titulo}
                    </div>
                    <div className="mt-0.5 text-zinc-500 dark:text-[#9CA3AF]">
                      <span className="font-mono tabular-nums">{formatIsoShort(item.dateIso)}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{item.papel}</span>
                      {item.aprendizado ? ` — ${item.aprendizado}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cockpitStore.deleteLogbookEntry(item.id);
                      onNotify('Registro removido.');
                    }}
                    aria-label={`Remover ${item.titulo}`}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. PONTOS CEGOS (CAPTURA 60s + ANTI-PII + EXPORT MARKDOWN)
// ============================================================================

function PontosCegosTool({
  central6Ano,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  onNotify: (msg: string) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [rodizio, setRodizio] = useState(central6Ano.rodizioId || RODIZIOS_6ANO[0]?.id || 'cm');
  const [duvida, setDuvida] = useState('');
  const [acaoRevisao, setAcaoRevisao] = useState('');
  const [filter, setFilter] = useState<'pendentes' | 'resolvidos' | 'todos'>('pendentes');
  const [copiedMd, setCopiedMd] = useState(false);

  const blindSpots = useMemo(
    () => (central6Ano.logbookEntries || []).filter((e) => e.tipo === 'ponto_cego'),
    [central6Ano.logbookEntries]
  );

  const pendingCount = useMemo(
    () => blindSpots.filter((e) => e.status !== 'resolvido').length,
    [blindSpots]
  );
  const resolvedCount = blindSpots.length - pendingCount;

  const filteredSpots = useMemo(() => {
    if (filter === 'pendentes') return blindSpots.filter((e) => e.status !== 'resolvido');
    if (filter === 'resolvidos') return blindSpots.filter((e) => e.status === 'resolvido');
    return blindSpots;
  }, [blindSpots, filter]);

  const piiIssues = useMemo(
    () => detectPiiIssues(`${titulo} ${duvida} ${acaoRevisao}`),
    [titulo, duvida, acaoRevisao]
  );

  const handleAnonymizeNow = () => {
    setTitulo((prev) => sanitizePiiText(prev).sanitized);
    setDuvida((prev) => sanitizePiiText(prev).sanitized);
    setAcaoRevisao((prev) => sanitizePiiText(prev).sanitized);
    onNotify('Campos anonimizados.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const res = cockpitStore.addBlindSpotEntry({
      titulo,
      rodizio,
      duvida,
      acaoRevisao,
    });
    setTitulo('');
    setDuvida('');
    setAcaoRevisao('');
    onNotify(
      res.sanitizedCount > 0
        ? 'Ponto cego salvo com dados pessoais anonimizados.'
        : 'Ponto cego salvo.'
    );
  };

  const handleCopyMarkdown = async () => {
    const lines: string[] = [
      '# Pontos Cegos — 6º Ano',
      '',
      `Pendentes: ${pendingCount} · Resolvidos: ${resolvedCount}`,
      '',
    ];
    for (const item of filteredSpots) {
      const done = item.status === 'resolvido';
      const rodNome = RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio;
      lines.push(`- [${done ? 'x' : ' '}] **${item.titulo}** (${rodNome}, ${formatIsoShort(item.dateIso)})`);
      if (item.aprendizado) lines.push(`  - Dúvida: ${item.aprendizado}`);
      if (item.gatilhoCorrecao) lines.push(`  - Revisão: ${item.gatilhoCorrecao}`);
    }
    const ok = await copyText(lines.join('\n'));
    if (ok) {
      setCopiedMd(true);
      onNotify('Resumo de Pontos Cegos copiado em Markdown.');
      window.setTimeout(() => setCopiedMd(false), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]">
          Pontos Cegos (60s)
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
          Capture lacunas clínicas reais sem salvar nome, CPF ou prontuário do paciente.
        </p>
      </div>

      {/* Formulário rápido */}
      <form
        onSubmit={handleSubmit}
        className="space-y-3.5 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label
              htmlFor="pc-tema"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
            >
              Tema / contexto clínico
            </label>
            <input
              id="pc-tema"
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Dose de ataque de sulfato de magnésio na pré-eclâmpsia grave"
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
          </div>

          <div>
            <label
              htmlFor="pc-rodizio"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
            >
              Rodízio
            </label>
            <select
              id="pc-rodizio"
              value={rodizio}
              onChange={(e) => setRodizio(e.target.value)}
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
            >
              {RODIZIOS_6ANO.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="pc-duvida"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
            >
              O que travou / dúvida específica
            </label>
            <input
              id="pc-duvida"
              type="text"
              value={duvida}
              onChange={(e) => setDuvida(e.target.value)}
              placeholder="Ex.: Esquema Pritchard vs Zuspan e monitoramento de reflexo patelar"
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
          </div>

          <div>
            <label
              htmlFor="pc-acao"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
            >
              Ação de revisão (opcional)
            </label>
            <input
              id="pc-acao"
              type="text"
              value={acaoRevisao}
              onChange={(e) => setAcaoRevisao(e.target.value)}
              placeholder="Ex.: Revisar protocolo + criar 2 cards no Anki"
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
          </div>
        </div>

        {/* Alerta anti-PII em tempo real */}
        {piiIssues.length > 0 && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Dado identificável detectado ({Array.from(new Set(piiIssues.map((i) => i.label))).join(', ')}).
                Nunca salve dados de pacientes — será anonimizado automaticamente ao salvar.
              </span>
            </div>
            <button
              type="button"
              onClick={handleAnonymizeNow}
              className="whitespace-nowrap rounded-md border border-amber-400/70 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              Anonimizar agora
            </button>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
          >
            <Check className="h-3.5 w-3.5" />
            Registrar ponto cego
          </button>
        </div>
      </form>

      {/* Filtros + copiar resumo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'pendentes', label: `Pendentes (${pendingCount})` },
              { id: 'resolvidos', label: `Resolvidos (${resolvedCount})` },
              { id: 'todos', label: `Todos (${blindSpots.length})` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === opt.id
                  ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                  : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCopyMarkdown}
          disabled={filteredSpots.length === 0}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
        >
          {copiedMd ? <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedMd ? 'Copiado' : 'Copiar resumo (.md)'}
        </button>
      </div>

      {/* Lista de pontos cegos */}
      <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
        {filteredSpots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
            {filter === 'pendentes'
              ? 'Nenhum ponto cego pendente no momento.'
              : 'Nenhum registro nesta visualização.'}
          </div>
        ) : (
          filteredSpots.map((item) => {
            const isResolved = item.status === 'resolvido';
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => {
                    cockpitStore.toggleBlindSpotStatus(item.id);
                    onNotify(isResolved ? 'Ponto cego reaberto.' : 'Ponto cego marcado como resolvido.');
                  }}
                  aria-label={isResolved ? `Reabrir ${item.titulo}` : `Marcar ${item.titulo} como resolvido`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isResolved
                      ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                      : 'border-zinc-300 bg-white hover:border-[#0F766E] dark:border-white/[0.18] dark:bg-[#0F1115] dark:hover:border-[#2DD4BF]'
                  }`}
                >
                  {isResolved && <Check className="h-3.5 w-3.5" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-medium ${
                      isResolved
                        ? 'text-zinc-400 line-through dark:text-[#6B7280]'
                        : 'text-zinc-900 dark:text-[#F3F4F6]'
                    }`}
                  >
                    {item.titulo}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    <span className="font-mono tabular-nums">{formatIsoShort(item.dateIso)}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio}</span>
                  </div>
                  {item.aprendizado && (
                    <p className="mt-1.5 text-sm text-zinc-600 dark:text-[#D1D5DB]">
                      {item.aprendizado}
                    </p>
                  )}
                  {item.gatilhoCorrecao && (
                    <p className="mt-1 text-xs text-[#0F766E] dark:text-[#2DD4BF]">
                      Revisão: {item.gatilhoCorrecao}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    cockpitStore.deleteLogbookEntry(item.id);
                    onNotify('Ponto cego removido.');
                  }}
                  aria-label={`Remover ponto cego ${item.titulo}`}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 3. PROMPTS IA (MOTOR buildContextualAiPrompt)
// ============================================================================

function PromptsIaTool({
  central6Ano,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  onNotify: (msg: string) => void;
}) {
  const [kind, setKind] = useState<PromptContextualKind>('paciente');
  const [copied, setCopied] = useState(false);

  const activeRodizio = useMemo(
    () => RODIZIOS_6ANO.find((r) => r.id === central6Ano.rodizioId) || RODIZIOS_6ANO[0],
    [central6Ano.rodizioId]
  );

  const pendingSpotsCount = useMemo(
    () =>
      (central6Ano.logbookEntries || []).filter(
        (e) => e.tipo === 'ponto_cego' && e.status !== 'resolvido'
      ).length,
    [central6Ano.logbookEntries]
  );

  const generatedPrompt = useMemo(
    () => buildContextualAiPrompt(kind, central6Ano),
    [kind, central6Ano]
  );

  const handleCopyPrompt = async () => {
    const ok = await copyText(generatedPrompt);
    if (ok) {
      setCopied(true);
      onNotify('Prompt contextual copiado.');
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]">
          Prompts IA Contextuais
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
          Escolha o treino, ajuste o contexto mínimo e copie o prompt calibrado para o seu rodízio.
        </p>
      </div>

      {/* Seletor de tipo de prompt */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PROMPT_TYPES.map((pt) => {
          const active = kind === pt.id;
          return (
            <button
              key={pt.id}
              type="button"
              onClick={() => setKind(pt.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-[#0F766E] bg-[#0F766E]/[0.08] text-[#0F766E] dark:border-[#2DD4BF] dark:bg-[#2DD4BF]/[0.10] dark:text-[#2DD4BF]'
                  : 'border-zinc-200/80 bg-white text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]'
              }`}
            >
              <div className="text-xs font-semibold">{pt.label}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                {pt.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contexto mínimo */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:grid-cols-3 dark:border-white/[0.07] dark:bg-[#15181F]">
        <div>
          <label
            htmlFor="prompt-rodizio"
            className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
          >
            Rodízio ativo
          </label>
          <select
            id="prompt-rodizio"
            value={central6Ano.rodizioId}
            onChange={(e) => {
              const nextRod = RODIZIOS_6ANO.find((r) => r.id === e.target.value);
              cockpitStore.updateCentralContext({
                rodizioId: e.target.value,
                focoSemanalAncora70: nextRod?.ancora70 || central6Ano.focoSemanalAncora70,
                microHabitoSemanal: nextRod?.microHabitoSugerido || '',
              });
            }}
            className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
          >
            {RODIZIOS_6ANO.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="prompt-foco"
            className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
          >
            Foco / tema clínico
          </label>
          <input
            id="prompt-foco"
            type="text"
            value={central6Ano.focoSemanalAncora70 || ''}
            onChange={(e) =>
              cockpitStore.updateCentralContext({ focoSemanalAncora70: e.target.value })
            }
            placeholder={activeRodizio?.ancora70}
            className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
          />
        </div>

        <div>
          <label
            htmlFor="prompt-micro"
            className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
          >
            Micro-hábito em treino
          </label>
          <input
            id="prompt-micro"
            type="text"
            value={central6Ano.microHabitoSemanal || ''}
            onChange={(e) =>
              cockpitStore.updateCentralContext({ microHabitoSemanal: e.target.value })
            }
            placeholder={activeRodizio?.microHabitoSugerido}
            className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
          />
        </div>
      </div>

      {/* Prompt gerado */}
      <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-4 py-2.5 dark:border-white/[0.07]">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
            <Sparkles className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
            <span>
              {pendingSpotsCount > 0
                ? `Pronto para colar · inclui até 3 pontos cegos pendentes (${pendingSpotsCount} ativos)`
                : 'Pronto para colar no modelo de sua preferência'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar prompt'}
          </button>
        </div>

        <pre className="whitespace-pre-wrap px-4 py-4 font-sans text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
          {generatedPrompt}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// 4. ENSAIO MENTAL (3 MINUTOS)
// ============================================================================

const ENSAIO_DURATION_SEC = 180;

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function EnsaioMentalTool() {
  const [selectedId, setSelectedId] = useState<string>(ENSAIO_MENTAL_PROCS_DATA[0]?.id || 'proc-sutura');
  const [secondsLeft, setSecondsLeft] = useState<number>(ENSAIO_DURATION_SEC);
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const proc = useMemo(
    () =>
      ENSAIO_MENTAL_PROCS_DATA.find((p) => p.id === selectedId) || ENSAIO_MENTAL_PROCS_DATA[0],
    [selectedId]
  );

  const stepValues = [proc.indicacao, proc.material, proc.anatomia, proc.armadilha];
  const elapsedPct = Math.round(((ENSAIO_DURATION_SEC - secondsLeft) / ENSAIO_DURATION_SEC) * 100);

  const handleReset = () => {
    setRunning(false);
    setSecondsLeft(ENSAIO_DURATION_SEC);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]">
          Ensaio Mental Pré-Procedimento (3 min)
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
          Visualize cada etapa crítica em silêncio antes de calçar a luva estéril.
        </p>
      </div>

      {/* Seletor + Cronômetro de 3 min */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:flex-row sm:items-end sm:justify-between dark:border-white/[0.07] dark:bg-[#15181F]">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="ensaio-proc-select"
            className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
          >
            Procedimento
          </label>
          <select
            id="ensaio-proc-select"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              handleReset();
            }}
            className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm font-medium text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
          >
            {ENSAIO_MENTAL_PROCS_DATA.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 sm:shrink-0">
          <div className="text-right">
            <div
              className={`font-mono text-2xl font-semibold tracking-tight tabular-nums ${
                secondsLeft === 0
                  ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                  : 'text-zinc-900 dark:text-[#F3F4F6]'
              }`}
              aria-live="off"
            >
              {formatMmSs(secondsLeft)}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
              {secondsLeft === 0 ? 'Ensaio concluído' : running ? 'Em andamento' : 'Cronômetro 3 min'}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (secondsLeft === 0) setSecondsLeft(ENSAIO_DURATION_SEC);
                setRunning((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
            >
              {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {running ? 'Pausar' : 'Iniciar'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Resetar cronômetro"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200/90 bg-white p-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Barra sutil de progresso do timer */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[0.08]">
        <div
          className="h-full bg-[#0F766E] transition-all duration-500 dark:bg-[#2DD4BF]"
          style={{ width: `${elapsedPct}%` }}
        />
      </div>

      {/* 4 passos estruturados */}
      <ol className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
        {ENSAIO_MENTAL_3MIN_PASSOS.map((passo, index) => {
          const isArmadilha = index === 3;
          return (
            <li
              key={passo.step}
              className={`px-5 py-4 ${
                isArmadilha
                  ? 'bg-amber-50/45 dark:bg-amber-950/20'
                  : 'bg-white dark:bg-[#15181F]'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold tabular-nums ${
                    isArmadilha
                      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200'
                      : 'border-zinc-200/90 bg-[#FAFAFA] text-zinc-700 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB]'
                  }`}
                >
                  {passo.step}
                </span>

                <div className="min-w-0 flex-1">
                  <h2
                    className={`text-sm font-semibold ${
                      isArmadilha
                        ? 'text-amber-950 dark:text-amber-200'
                        : 'text-zinc-900 dark:text-[#F3F4F6]'
                    }`}
                  >
                    {passo.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    {passo.prompt}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                    {stepValues[index]}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
