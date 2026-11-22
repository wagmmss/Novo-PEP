import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  RODIZIOS_6ANO,
  computeProcedureProgress,
  getLocalTodayIso,
  type Central6AnoState,
  type ProcedureMasteryStage,
} from '../engine/central6ano.ts';
import { RODIZIOS_TREINO } from '../data/treino_clinico_data.ts';
import { buildPromptD2, findCatalogItem } from '../engine/treinoClinico.ts';
import { cockpitStore, type LogbookRole } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { detectPiiIssues, sanitizePiiText } from '../utils/piiGuard.ts';

type PraticaSubTab = 'logbook' | 'pontos-cegos';

interface PraticaViewProps {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
  onNotify: (message: string) => void;
}

const SUB_TABS: Array<{ id: PraticaSubTab; label: string }> = [
  { id: 'logbook', label: 'Logbook 3x' },
  { id: 'pontos-cegos', label: 'Pontos Cegos' },
];

export const PROC_TO_HAB_ID: Record<string, string> = Object.fromEntries(
  LOGBOOK_PROCEDIMENTOS_MATRIX.filter((p) => Boolean(p.habId)).map((p) => [p.id, p.habId!])
);

const ROLE_BUTTONS: Array<{ role: LogbookRole; label: string; shortLabel: string; title: string }> = [
  {
    role: 'observou',
    label: 'Observou',
    shortLabel: 'Obs.',
    title: 'Registra exposição no histórico (não preenche a Regra 3x)',
  },
  {
    role: 'auxiliei',
    label: 'Auxiliou',
    shortLabel: 'Aux.',
    title: 'Registra auxílio ativo como exposição (não preenche a Regra 3x)',
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
    title: 'Registra execução autônoma (+1 na Regra 3x e destrava selo Autônomo)',
  },
];

const STAGE_BADGE_CLASS: Record<ProcedureMasteryStage, string> = {
  pendente: 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]',
  exposicao: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  em_treino: 'bg-sky-500/15 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300',
  supervisionado_3x: 'bg-teal-500/15 text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]',
  autonomo_3x: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
};

const RODIZIO_NAME_MAP = new Map<string, string>(
  RODIZIOS_6ANO.map((r) => [r.id, r.nome])
);

const MATRIX_PROC_IDS = new Set<string>(LOGBOOK_PROCEDIMENTOS_MATRIX.map((p) => p.id));
const MATRIX_RODIZIO_IDS = new Set<string>(LOGBOOK_PROCEDIMENTOS_MATRIX.map((p) => p.rodizioId));

function formatIsoShort(dateIso: string): string {
  const parts = String(dateIso || '').split('-');
  if (parts.length !== 3) return dateIso || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function inferCatalogSlugForRodizio(rodizioId: string): string {
  const alvos = RODIZIOS_TREINO[rodizioId]?.alvos || [];
  for (const slug of alvos) {
    if (findCatalogItem(slug)) return slug;
  }
  return 'dor-toracica';
}

export function PraticaView({ central6Ano, onOpenPrePorta, onNotify }: PraticaViewProps) {
  const [subTab, setSubTab] = useState<PraticaSubTab>('logbook');

  const pendingBlindCount = useMemo(
    () =>
      (central6Ano.logbookEntries || []).filter(
        (e) => e.tipo === 'ponto_cego' && e.status !== 'resolvido'
      ).length,
    [central6Ano.logbookEntries]
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de sub-abas limpa — Logbook manual e caixa de entrada de Pontos Cegos */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-[#FAFAFA]/95 backdrop-blur-sm dark:border-white/[0.10] dark:bg-[#0F1115]/95">
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
                  <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
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
          <LogbookTool
            central6Ano={central6Ano}
            onOpenPrePorta={onOpenPrePorta}
            onNotify={onNotify}
          />
        )}
        {subTab === 'pontos-cegos' && (
          <PontosCegosTool central6Ano={central6Ano} onNotify={onNotify} />
        )}
      </div>
    </main>
  );
}

// ============================================================================
// 1. LOGBOOK 3x — PROCEDIMENTOS MANUAIS DO GENERALISTA (ESCADA DE AUTONOMIA)
// ============================================================================

interface LastRecordedAction {
  entryId: string;
  procName: string;
  roleLabel: string;
}

function LogbookTool({
  central6Ano,
  onOpenPrePorta,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
  onNotify: (msg: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [rodizioFilter, setRodizioFilter] = useState<string>(() =>
    MATRIX_RODIZIO_IDS.has(central6Ano.rodizioId) ? central6Ano.rodizioId : 'todos'
  );
  const [expandedProcIds, setExpandedProcIds] = useState<Record<string, boolean>>({});
  const [showGeneralHistory, setShowGeneralHistory] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<LastRecordedAction | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [copiedMd, setCopiedMd] = useState(false);

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
      const key =
        entry.gatilhoCorrecao && MATRIX_PROC_IDS.has(entry.gatilhoCorrecao)
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
        proc.rodizioNome.toLowerCase().includes(q)
      );
    });
  }, [query, rodizioFilter]);

  const progressByProcId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeProcedureProgress>>();
    for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
      map.set(proc.id, computeProcedureProgress(proc.id, central6Ano));
    }
    return map;
  }, [central6Ano.procAutonomyById, central6Ano.logbookEntries]);

  const summary = useMemo(() => {
    let completed3x = 0;
    let autonomousCount = 0;
    let totalExecutions = 0;
    for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
      const prog = progressByProcId.get(proc.id);
      if (!prog) continue;
      totalExecutions += prog.execCount;
      if (prog.rule3xDone) completed3x += 1;
      if (prog.stage === 'autonomo_3x') autonomousCount += 1;
    }
    return {
      completed3x,
      autonomousCount,
      totalProcedures: LOGBOOK_PROCEDIMENTOS_MATRIX.length,
      totalExecutions,
    };
  }, [progressByProcId]);

  const handleRecord = (procId: string, procName: string, role: LogbookRole) => {
    const entryId = cockpitStore.recordMatrixProcedure(procId, role);
    const label = ROLE_BUTTONS.find((b) => b.role === role)?.label || role;
    if (entryId) {
      setLastRecorded({ entryId, procName, roleLabel: label });
      setQuickNote('');
    }
    onNotify(`${procName}: ${label} registrado.`);
  };

  const handleUndoLast = () => {
    if (!lastRecorded) return;
    cockpitStore.deleteLogbookEntry(lastRecorded.entryId);
    onNotify(`Desfeito: ${lastRecorded.procName} (${lastRecorded.roleLabel}).`);
    setLastRecorded(null);
    setQuickNote('');
  };

  const handleSaveQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastRecorded || !quickNote.trim()) return;
    const res = cockpitStore.updateLogbookEntryNote(lastRecorded.entryId, quickNote);
    onNotify(
      res.sanitizedCount > 0
        ? 'Nota técnica salva com anonimização anti-PII.'
        : 'Nota técnica salva no registro.'
    );
    setLastRecorded(null);
    setQuickNote('');
  };

  const handleCopyMarkdown = async () => {
    const lines: string[] = [
      '# Logbook de Procedimentos Manuais — 6º Ano',
      '',
      `Regra 3x (Supervisionado + Autônomo): ${summary.completed3x}/${summary.totalProcedures} · Autônomos: ${summary.autonomousCount} · Execuções reais: ${summary.totalExecutions}`,
      '',
    ];
    for (const proc of filteredProcedures) {
      const prog = progressByProcId.get(proc.id);
      if (!prog) continue;
      const done = prog.rule3xDone ? 'x' : ' ';
      const detail = [
        prog.obsCount > 0 ? `Obs ${prog.obsCount}` : '',
        prog.auxCount > 0 ? `Aux ${prog.auxCount}` : '',
        prog.supCount > 0 ? `Sup ${prog.supCount}` : '',
        prog.autCount > 0 ? `Aut ${prog.autCount}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      lines.push(
        `- [${done}] **${proc.nome}** (${proc.rodizioNome}) — ${prog.stageLabel}${detail ? ` · ${detail}` : ''}`
      );
    }
    const ok = await copyToClipboard(lines.join('\n'));
    if (ok) {
      setCopiedMd(true);
      onNotify('Resumo do Logbook copiado em Markdown.');
      window.setTimeout(() => setCopiedMd(false), 1800);
    } else {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho editorial */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Logbook de Procedimentos — Regra 3x
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
            Procedimentos manuais do generalista. <strong>Supervisionado</strong> e <strong>Autônomo</strong> avançam a Regra 3x; Observou e Auxiliou registram exposição.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="font-mono text-xs tabular-nums text-zinc-600 dark:text-[#9CA3AF]">
            <span className={summary.completed3x > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>
              {summary.completed3x}/{summary.totalProcedures} em 3x
            </span>
            {summary.autonomousCount > 0 && ` · ${summary.autonomousCount} autôn.`}
            {' · '}
            {summary.totalExecutions} exec.
          </div>

          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-zinc-50 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
          >
            {copiedMd ? <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedMd ? 'Copiado' : 'Copiar (.md)'}
          </button>
        </div>
      </div>

      {/* Barra pós-registro: Desfazer + Nota técnica opcional de 1 linha (zero fricção no 1º clique) */}
      {lastRecorded && (
        <form
          onSubmit={handleSaveQuickNote}
          className="flex flex-col gap-2 rounded-xl border border-[#0F766E]/30 bg-teal-50/70 px-3.5 py-2.5 text-xs dark:border-[#2DD4BF]/25 dark:bg-teal-500/[0.08]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-zinc-800 dark:text-[#E5E7EB]">
              Registrado: <strong>{lastRecorded.procName}</strong> ({lastRecorded.roleLabel})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndoLast}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300/80 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:text-red-600 dark:border-white/[0.12] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:text-red-400"
              >
                <RotateCcw className="h-3 w-3" />
                Desfazer
              </button>
              <button
                type="button"
                onClick={() => {
                  setLastRecorded(null);
                  setQuickNote('');
                }}
                aria-label="Fechar aviso"
                className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="+ Ajuste técnico opcional para a próxima vez (ex.: ângulo 30°, usar fio 4-0)..."
              aria-label="Nota técnica opcional"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
            <button
              type="submit"
              disabled={!quickNote.trim()}
              className="shrink-0 rounded-lg bg-[#0F766E] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] disabled:opacity-40 dark:bg-[#2DD4BF] dark:text-[#0F1115]"
            >
              Salvar nota
            </button>
          </div>
        </form>
      )}

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
              {r.id === central6Ano.rodizioId ? ' · Atual' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de procedimentos */}
      <div className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
        {filteredProcedures.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
            Nenhum procedimento encontrado para este filtro.
          </div>
        ) : (
          filteredProcedures.map((proc) => {
            const prog = progressByProcId.get(proc.id) || computeProcedureProgress(proc.id, central6Ano);
            const history = entriesByProcId.get(proc.id) || [];
            const filledSegments = Math.min(3, prog.execCount);
            const isExpanded = Boolean(expandedProcIds[proc.id]);
            const linkedHabId = proc.habId;

            return (
              <div key={proc.id} className="px-4 py-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {linkedHabId ? (
                        <button
                          type="button"
                          onClick={() => onOpenPrePorta(linkedHabId)}
                          className="min-w-0 truncate text-left text-sm font-medium text-zinc-900 transition-colors hover:text-[#0F766E] dark:text-[#F3F4F6] dark:hover:text-[#2DD4BF]"
                        >
                          {proc.nome}
                        </button>
                      ) : (
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                          {proc.nome}
                        </span>
                      )}
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${STAGE_BADGE_CLASS[prog.stage]}`}
                      >
                        {prog.stageLabel}
                        {prog.execCount > 3 ? ` (+${prog.execCount - 3})` : ''}
                      </span>
                      {linkedHabId && (
                        <button
                          type="button"
                          onClick={() => onOpenPrePorta(linkedHabId)}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#0F766E] transition-colors hover:underline dark:text-[#2DD4BF]"
                        >
                          Ver técnica
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      <span>{proc.rodizioNome}</span>
                      {(prog.obsCount > 0 || prog.auxCount > 0 || prog.supCount > 0 || prog.autCount > 0) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {[
                              prog.obsCount > 0 ? `Obs ${prog.obsCount}` : '',
                              prog.auxCount > 0 ? `Aux ${prog.auxCount}` : '',
                              prog.supCount > 0 ? `Sup ${prog.supCount}` : '',
                              prog.autCount > 0 ? `Aut ${prog.autCount}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Barra sutil da Regra 3x real (Supervisionado + Autônomo) */}
                    <div className="mt-2 flex max-w-[140px] items-center gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            filledSegments >= step
                              ? prog.stage === 'autonomo_3x'
                                ? 'bg-emerald-500 dark:bg-emerald-400'
                                : 'bg-[#0F766E] dark:bg-[#2DD4BF]'
                              : 'bg-zinc-200 dark:bg-white/[0.10]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Ações de 1 clique */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                    {ROLE_BUTTONS.map((btn) => {
                      const countsFor3x = btn.role === 'supervisionado' || btn.role === 'autonomo';
                      return (
                        <button
                          key={btn.role}
                          type="button"
                          title={btn.title}
                          onClick={() => handleRecord(proc.id, proc.nome, btn.role)}
                          className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            countsFor3x
                              ? 'border-zinc-300/90 bg-white text-zinc-800 hover:border-[#0F766E]/50 hover:bg-[#0F766E]/[0.07] hover:text-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#E5E7EB] dark:hover:border-[#2DD4BF]/50 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]'
                              : 'border-zinc-200/80 bg-zinc-50/70 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/[0.07] dark:bg-[#0F1115]/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#E5E7EB]'
                          }`}
                        >
                          <span className="hidden sm:inline">{btn.label}</span>
                          <span className="sm:hidden">{btn.shortLabel}</span>
                        </button>
                      );
                    })}
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
                      <span>Histórico ({history.length})</span>
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

      {/* Registros avulsos / anteriores fora da matriz manual */}
      {unlinkedEntries.length > 0 && (
        <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
          <button
            type="button"
            onClick={() => setShowGeneralHistory((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
          >
            <span>
              Registros avulsos e histórico anterior ({unlinkedEntries.length})
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
// 2. PONTOS CEGOS (CAPTURA 60s + ANTI-PII + EXPORT MARKDOWN + PROMPT D2)
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
  const [copiedD2Id, setCopiedD2Id] = useState<string | null>(null);

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

  const handleCopyD2 = async (item: NonNullable<Central6AnoState['logbookEntries']>[number]) => {
    const rodNome = RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio || 'Internato';
    const relato = [
      item.titulo,
      item.aprendizado ? `Dúvida / travamento: ${item.aprendizado}` : '',
      item.gatilhoCorrecao ? `Foco de revisão: ${item.gatilhoCorrecao}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const prompt = buildPromptD2({
      dateIso: getLocalTodayIso(),
      eixo: 'E1',
      slug: inferCatalogSlugForRodizio(item.rodizio),
      rodizio: rodNome,
      casoAnonimizado: relato,
    });

    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopiedD2Id(item.id);
      onNotify('Prompt D2 (Debriefing v3.1) copiado.');
      window.setTimeout(() => setCopiedD2Id((prev) => (prev === item.id ? null : prev)), 1800);
    } else {
      onNotify('Não foi possível copiar o Prompt D2.');
    }
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
    const ok = await copyToClipboard(lines.join('\n'));
    if (ok) {
      setCopiedMd(true);
      onNotify('Resumo de Pontos Cegos copiado em Markdown.');
      window.setTimeout(() => setCopiedMd(false), 1800);
    } else {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Pontos Cegos (60s)
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
          Caixa de entrada rápida de lacunas reais do hospital (sem nome, CPF ou prontuário). Copie direto para o Prompt D2 da Esteira quando for revisar.
        </p>
      </div>

      {/* Formulário rápido */}
      <form
        onSubmit={handleSubmit}
        className="space-y-3.5 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
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
      <div className="divide-y divide-zinc-200/80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
        {filteredSpots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
            {filter === 'pendentes'
              ? 'Nenhum ponto cego pendente no momento.'
              : 'Nenhum registro nesta visualização.'}
          </div>
        ) : (
          filteredSpots.map((item) => {
            const isResolved = item.status === 'resolvido';
            const isD2Copied = copiedD2Id === item.id;
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 border-l-[3px] px-4 py-3.5 ${
                  isResolved
                    ? 'border-l-emerald-500/60 dark:border-l-emerald-400/50'
                    : 'border-l-amber-500 bg-amber-500/[0.03] dark:border-l-amber-400 dark:bg-amber-400/[0.04]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    cockpitStore.toggleBlindSpotStatus(item.id);
                    onNotify(isResolved ? 'Ponto cego reaberto.' : 'Ponto cego marcado como resolvido.');
                  }}
                  aria-label={isResolved ? `Reabrir ${item.titulo}` : `Marcar ${item.titulo} como resolvido`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isResolved
                      ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-[#0F1115]'
                      : 'border-amber-500/70 bg-white hover:border-amber-600 dark:border-amber-400/60 dark:bg-[#0F1115] dark:hover:border-amber-300'
                  }`}
                >
                  {isResolved && <Check className="h-3.5 w-3.5" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isResolved
                          ? 'text-zinc-400 line-through dark:text-[#6B7280]'
                          : 'text-zinc-950 dark:text-white'
                      }`}
                    >
                      {item.titulo}
                    </span>
                    {!isResolved && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-400/15 dark:text-amber-300">
                        Pendente
                      </span>
                    )}
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

                <div className="flex shrink-0 items-center gap-1">
                  {!isResolved && (
                    <button
                      type="button"
                      onClick={() => handleCopyD2(item)}
                      title="Copiar Prompt D2 (Debriefing v3.1) já preenchido e anonimizado"
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-zinc-200/90 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                    >
                      {isD2Copied ? (
                        <Check className="h-3 w-3 text-[#0F766E] dark:text-[#2DD4BF]" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-[#0F766E] dark:text-[#2DD4BF]" />
                      )}
                      <span>{isD2Copied ? 'Copiado' : 'Copiar D2'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      cockpitStore.deleteLogbookEntry(item.id);
                      onNotify('Ponto cego removido.');
                    }}
                    aria-label={`Remover ponto cego ${item.titulo}`}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
