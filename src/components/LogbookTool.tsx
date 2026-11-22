import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  RODIZIOS_6ANO,
  computeProcedureProgress,
  type Central6AnoState,
  type ProcedureMasteryStage,
} from '../engine/central6ano.ts';
import {
  LOGBOOK_STAGE_FILTERS,
  buildLogbookMarkdownExport,
  cleanLogbookNoteDisplay,
  computeRodizioCompletionCounts,
  filterLogbookProcedures,
  type LogbookStageFilter,
} from '../engine/praticaHelpers.ts';
import { cockpitStore, type LogbookRole } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { detectPiiIssues, sanitizePiiText } from '../utils/piiGuard.ts';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

type LogbookEntry = NonNullable<Central6AnoState['logbookEntries']>[number];

interface LastRecordedAction {
  entryId: string;
  procId: string;
  procName: string;
  roleLabel: string;
}

interface DeletedUndoState {
  entry: LogbookEntry;
  index: number;
  label: string;
}

const ROLE_BUTTONS: ReadonlyArray<{
  role: LogbookRole;
  label: string;
  shortLabel: string;
  countsFor3x: boolean;
  title: string;
}> = [
  {
    role: 'observou',
    label: 'Observou',
    shortLabel: 'Obs.',
    countsFor3x: false,
    title: 'Registra exposição no histórico (não preenche a Regra 3x)',
  },
  {
    role: 'auxiliei',
    label: 'Auxiliou',
    shortLabel: 'Aux.',
    countsFor3x: false,
    title: 'Registra auxílio ativo como exposição (não preenche a Regra 3x)',
  },
  {
    role: 'supervisionado',
    label: 'Supervisionado',
    shortLabel: 'Superv.',
    countsFor3x: true,
    title: 'Registra execução com supervisão (+1 na Regra 3x)',
  },
  {
    role: 'autonomo',
    label: 'Autônomo',
    shortLabel: 'Autôn.',
    countsFor3x: true,
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

const RODIZIO_NAME_MAP = new Map<string, string>(RODIZIOS_6ANO.map((r) => [r.id, r.nome]));
const MATRIX_PROC_IDS = new Set<string>(LOGBOOK_PROCEDIMENTOS_MATRIX.map((p) => p.id));
const MATRIX_RODIZIO_IDS = new Set<string>(LOGBOOK_PROCEDIMENTOS_MATRIX.map((p) => p.rodizioId));

function formatIsoShort(dateIso: string): string {
  const parts = String(dateIso || '').split('-');
  if (parts.length !== 3) return dateIso || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

export interface LogbookToolProps {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
  onOpenQuickCapture?: (req: QuickCaptureRequest) => void;
  onNotify: (msg: string) => void;
  shortcutsEnabled?: boolean;
}

export function LogbookTool({
  central6Ano,
  onOpenPrePorta,
  onOpenQuickCapture,
  onNotify,
  shortcutsEnabled = true,
}: LogbookToolProps) {
  const [query, setQuery] = useState('');
  const [rodizioFilter, setRodizioFilter] = useState<string>(() =>
    MATRIX_RODIZIO_IDS.has(central6Ano.rodizioId) ? central6Ano.rodizioId : 'todos'
  );
  const [userPickedRodizio, setUserPickedRodizio] = useState(false);
  const [stageFilter, setStageFilter] = useState<LogbookStageFilter>('todos');
  const [expandedProcIds, setExpandedProcIds] = useState<Record<string, boolean>>({});
  const [showGeneralHistory, setShowGeneralHistory] = useState(false);

  const [lastRecorded, setLastRecorded] = useState<LastRecordedAction | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [deletedUndo, setDeletedUndo] = useState<DeletedUndoState | null>(null);
  const [copiedMd, setCopiedMd] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // Sincroniza filtro de rodízio quando o usuário muda o rodízio ativo em outro lugar
  useEffect(() => {
    if (userPickedRodizio) return;
    setRodizioFilter(MATRIX_RODIZIO_IDS.has(central6Ano.rodizioId) ? central6Ano.rodizioId : 'todos');
  }, [central6Ano.rodizioId, userPickedRodizio]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Atalho "/" para focar busca e "Esc" para cancelar edição inline
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingEntryId) {
        e.preventDefault();
        setEditingEntryId(null);
        setEditingNoteText('');
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutsEnabled, editingEntryId]);

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
    const map = new Map<string, LogbookEntry[]>();
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

  const historyCountByProcId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [procId, list] of entriesByProcId.entries()) {
      map.set(procId, list.length);
    }
    return map;
  }, [entriesByProcId]);

  const unlinkedEntries = useMemo(
    () =>
      procedureEntries.filter(
        (e) => !e.gatilhoCorrecao || !MATRIX_PROC_IDS.has(e.gatilhoCorrecao)
      ),
    [procedureEntries]
  );

  const progressByProcId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeProcedureProgress>>();
    for (const proc of LOGBOOK_PROCEDIMENTOS_MATRIX) {
      map.set(proc.id, computeProcedureProgress(proc.id, central6Ano));
    }
    return map;
  }, [central6Ano.procAutonomyById, central6Ano.logbookEntries]);

  const rodizioCompletionCounts = useMemo(
    () => computeRodizioCompletionCounts(progressByProcId),
    [progressByProcId]
  );

  const filteredProcedures = useMemo(
    () =>
      filterLogbookProcedures(
        LOGBOOK_PROCEDIMENTOS_MATRIX,
        progressByProcId,
        historyCountByProcId,
        { query, rodizioFilter, stageFilter }
      ),
    [progressByProcId, historyCountByProcId, query, rodizioFilter, stageFilter]
  );

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

  const completionPct =
    summary.totalProcedures > 0
      ? Math.round((summary.completed3x / summary.totalProcedures) * 100)
      : 0;

  const quickNotePiiIssues = useMemo(() => detectPiiIssues(quickNote), [quickNote]);
  const editNotePiiIssues = useMemo(() => detectPiiIssues(editingNoteText), [editingNoteText]);

  const hasActiveFilters =
    query.trim().length > 0 || rodizioFilter !== 'todos' || stageFilter !== 'todos';

  const clearAllFilters = () => {
    setQuery('');
    setRodizioFilter('todos');
    setUserPickedRodizio(true);
    setStageFilter('todos');
  };

  const scheduleUndoBanner = (undo: DeletedUndoState) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setDeletedUndo(undo);
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedUndo(null);
      undoTimerRef.current = null;
    }, 9000);
  };

  const handleRecord = (procId: string, procName: string, role: LogbookRole) => {
    const entryId = cockpitStore.recordMatrixProcedure(procId, role);
    const label = ROLE_BUTTONS.find((b) => b.role === role)?.label || role;
    if (entryId) {
      setLastRecorded({ entryId, procId, procName, roleLabel: label });
      setQuickNote('');
      setDeletedUndo(null);
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

  const handleDeleteWithUndo = (entryId: string, label: string) => {
    const deleted = cockpitStore.deleteLogbookEntry(entryId);
    if (!deleted) return;
    if (lastRecorded?.entryId === entryId) {
      setLastRecorded(null);
      setQuickNote('');
    }
    if (editingEntryId === entryId) {
      setEditingEntryId(null);
      setEditingNoteText('');
    }
    scheduleUndoBanner({ entry: deleted.entry, index: deleted.index, label });
    onNotify('Registro removido do Logbook.');
  };

  const handleRestoreDeleted = () => {
    if (!deletedUndo) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    cockpitStore.restoreLogbookEntry(deletedUndo.entry, deletedUndo.index);
    onNotify(`Restaurado: ${deletedUndo.label}.`);
    setDeletedUndo(null);
  };

  const handleStartEditNote = (item: LogbookEntry) => {
    setEditingEntryId(item.id);
    setEditingNoteText(cleanLogbookNoteDisplay(item.aprendizado, item.papel));
  };

  const handleSaveEditedNote = (e: React.FormEvent, entryId: string) => {
    e.preventDefault();
    const res = cockpitStore.updateLogbookEntryNote(entryId, editingNoteText);
    setEditingEntryId(null);
    setEditingNoteText('');
    onNotify(
      res.sanitizedCount > 0
        ? 'Nota atualizada com anonimização anti-PII.'
        : 'Nota técnica atualizada.'
    );
  };

  const handleCopyMarkdown = async () => {
    const activeFilterParts: string[] = [];
    if (rodizioFilter !== 'todos') {
      const rName = rodizioFilters.find((r) => r.id === rodizioFilter)?.nome || rodizioFilter;
      activeFilterParts.push(`Área: ${rName}`);
    }
    if (stageFilter !== 'todos') {
      const sLabel = LOGBOOK_STAGE_FILTERS.find((s) => s.id === stageFilter)?.label || stageFilter;
      activeFilterParts.push(`Estágio: ${sLabel}`);
    }
    if (query.trim()) {
      activeFilterParts.push(`Busca: "${query.trim()}"`);
    }

    const md = buildLogbookMarkdownExport({
      procedures: filteredProcedures,
      progressByProcId,
      summary,
      filterDescription: activeFilterParts.length > 0 ? activeFilterParts.join(' · ') : undefined,
    });

    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedMd(true);
      onNotify(
        activeFilterParts.length > 0
          ? 'Recorte filtrado do Logbook copiado em Markdown.'
          : 'Resumo do Logbook copiado em Markdown.'
      );
      window.setTimeout(() => setCopiedMd(false), 1800);
    } else {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  // Se o procedimento recém-registrado saiu da lista filtrada, exibimos o banner no topo como fallback
  const lastRecordedVisibleInList =
    lastRecorded && filteredProcedures.some((p) => p.id === lastRecorded.procId);

  const renderQuickNoteBar = (action: LastRecordedAction, inline: boolean) => (
    <form
      onSubmit={handleSaveQuickNote}
      className={`${
        inline ? 'mt-3' : ''
      } flex flex-col gap-2 rounded-lg border border-[#0F766E]/30 bg-teal-50/75 px-3 py-2.5 text-xs dark:border-[#2DD4BF]/25 dark:bg-teal-500/[0.08]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-zinc-800 dark:text-[#E5E7EB]">
          Registrado: <strong>{action.roleLabel}</strong>
          {!inline && ` em ${action.procName}`}
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
            aria-label="Fechar barra pós-registro"
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
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setLastRecorded(null);
              setQuickNote('');
            }
          }}
          placeholder="+ Ajuste técnico opcional para a próxima vez (ex.: ângulo 30°, fio 4-0)..."
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

      {quickNotePiiIssues.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Dado identificável ({Array.from(new Set(quickNotePiiIssues.map((i) => i.label))).join(', ')}) — será anonimizado ao salvar.
          </span>
          <button
            type="button"
            onClick={() => setQuickNote((prev) => sanitizePiiText(prev).sanitized)}
            className="rounded border border-amber-400/70 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Anonimizar agora
          </button>
        </div>
      )}
    </form>
  );

  return (
    <div className="space-y-5">
      {/* Cabeçalho editorial + ações principais */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Logbook de Procedimentos — Regra 3x
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Procedimentos manuais do generalista.{' '}
              <strong className="font-medium text-zinc-700 dark:text-[#D1D5DB]">Supervisionado</strong> e{' '}
              <strong className="font-medium text-zinc-700 dark:text-[#D1D5DB]">Autônomo</strong> avançam a Regra 3x;
              Observou e Auxiliou registram exposição.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {onOpenQuickCapture && (
              <button
                type="button"
                onClick={() =>
                  onOpenQuickCapture({
                    kind: 'logbook',
                    defaultTitle: '',
                    defaultRodizio: central6Ano.rodizioId,
                  })
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#0F766E]/35 bg-teal-50/70 px-2.5 py-1.5 text-xs font-semibold text-[#0F766E] transition-colors hover:bg-teal-100/80 dark:border-[#2DD4BF]/30 dark:bg-teal-500/10 dark:text-[#2DD4BF] dark:hover:bg-teal-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Registro avulso
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-zinc-50 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
            >
              {copiedMd ? (
                <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedMd ? 'Copiado' : 'Copiar (.md)'}
            </button>
          </div>
        </div>

        {/* Barra de progresso global da matriz 3x */}
        <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#15181F]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-mono tabular-nums text-zinc-700 dark:text-[#D1D5DB]">
              <span
                className={
                  summary.completed3x > 0
                    ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                    : 'font-semibold text-zinc-900 dark:text-white'
                }
              >
                {summary.completed3x}/{summary.totalProcedures} em 3x
              </span>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              <span>{summary.autonomousCount} autôn.</span>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              <span>
                {summary.totalExecutions}{' '}
                {summary.totalExecutions === 1 ? 'execução real' : 'execuções reais'}
              </span>
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
              {completionPct}%
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.08]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[#0F766E] transition-all duration-300 dark:bg-[#2DD4BF]"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Banner de Desfazer após exclusão */}
      {deletedUndo && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
        >
          <span>
            Removido do histórico: <strong>{deletedUndo.label}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleRestoreDeleted}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/80 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-[#0F1115] dark:text-amber-200 dark:hover:bg-amber-950"
            >
              <RotateCcw className="h-3 w-3" />
              Desfazer exclusão
            </button>
            <button
              type="button"
              onClick={() => setDeletedUndo(null)}
              aria-label="Fechar aviso de exclusão"
              className="rounded p-1 text-amber-700 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Fallback do banner pós-registro caso o procedimento não esteja visível no recorte atual */}
      {lastRecorded && !lastRecordedVisibleInList && renderQuickNoteBar(lastRecorded, false)}

      {/* Busca + filtros por área e estágio */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-[#6B7280]" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) {
                  e.preventDefault();
                  setQuery('');
                } else {
                  e.currentTarget.blur();
                }
              }
            }}
            placeholder="Filtrar procedimento ou área...  ( / )"
            aria-label="Filtrar procedimento"
            className="w-full rounded-lg border border-zinc-200/80 bg-white py-2 pr-8 pl-9 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca de procedimentos"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:text-[#F3F4F6]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Chips de área com quebra limpa (zero corte de "Pediatr" ou "Emergência") */}
        <div
          role="group"
          aria-label="Filtrar procedimentos por área"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => {
              setRodizioFilter('todos');
              setUserPickedRodizio(true);
            }}
            aria-pressed={rodizioFilter === 'todos'}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              rodizioFilter === 'todos'
                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:bg-white/[0.05] dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
            }`}
          >
            Todas ({LOGBOOK_PROCEDIMENTOS_MATRIX.length})
          </button>
          {rodizioFilters.map((r) => {
            const counts = rodizioCompletionCounts.get(r.id);
            const active = rodizioFilter === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRodizioFilter(r.id);
                  setUserPickedRodizio(true);
                }}
                aria-pressed={active}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                    : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:bg-white/[0.05] dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                }`}
              >
                <span>{r.nome}</span>
                {counts && (
                  <span
                    className={`ml-1 font-mono text-[11px] tabular-nums ${
                      active ? 'opacity-85' : 'text-zinc-400 dark:text-[#6B7280]'
                    }`}
                  >
                    {counts.done3x}/{counts.total}
                  </span>
                )}
                {r.id === central6Ano.rodizioId ? ' · Atual' : ''}
              </button>
            );
          })}
        </div>

        {/* Chips de estágio + contador dinâmico */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div
            role="group"
            aria-label="Filtrar procedimentos por estágio"
            className="flex flex-wrap items-center gap-1"
          >
            {LOGBOOK_STAGE_FILTERS.map((st) => {
              const active = stageFilter === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStageFilter(st.id)}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? 'border-[#0F766E]/40 bg-teal-50 text-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-teal-500/15 dark:text-[#2DD4BF]'
                      : 'border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
            <span className="font-mono tabular-nums">
              {filteredProcedures.length === 0
                ? '0 resultados'
                : `${filteredProcedures.length} ${filteredProcedures.length === 1 ? 'procedimento' : 'procedimentos'}`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de procedimentos */}
      <div className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
        {filteredProcedures.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-10 text-center">
            <p className="text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Nenhum procedimento encontrado para este filtro.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          filteredProcedures.map((proc) => {
            const prog =
              progressByProcId.get(proc.id) || computeProcedureProgress(proc.id, central6Ano);
            const history = entriesByProcId.get(proc.id) || [];
            const filledSegments = Math.min(3, prog.execCount);
            const isExpanded = Boolean(expandedProcIds[proc.id]);
            const linkedHabId = proc.habId;
            const showInlinePostRecord = lastRecorded?.procId === proc.id;

            return (
              <div key={proc.id} className="px-4 py-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Título legível em até 2 linhas no mobile, com badge 3x sempre alinhado ao lado */}
                    <div className="flex items-start gap-2">
                      <span className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-zinc-900 dark:text-[#F3F4F6]">
                        {proc.nome}
                      </span>
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none tabular-nums ${STAGE_BADGE_CLASS[prog.stage]}`}
                      >
                        {prog.stageLabel}
                        {prog.execCount > 3 ? ` (+${prog.execCount - 3})` : ''}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      <span>{proc.rodizioNome}</span>
                      {(prog.obsCount > 0 ||
                        prog.auxCount > 0 ||
                        prog.supCount > 0 ||
                        prog.autCount > 0) && (
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
                      {linkedHabId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => onOpenPrePorta(linkedHabId)}
                            className="inline-flex shrink-0 items-center gap-0.5 font-medium text-[#0F766E] transition-colors hover:underline dark:text-[#2DD4BF]"
                          >
                            Ver técnica
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Barra sutil da Regra 3x real (Supervisionado + Autônomo) */}
                    <div className="mt-2 flex max-w-[148px] items-center gap-1" aria-hidden="true">
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

                  {/* Ações de 1 clique: grade equilibrada no mobile, linha enxuta no desktop, destaque visual nos papéis 3x */}
                  <div className="grid grid-cols-4 gap-1.5 sm:flex sm:shrink-0 sm:items-center">
                    {ROLE_BUTTONS.map((btn) => (
                      <button
                        key={btn.role}
                        type="button"
                        title={btn.title}
                        aria-label={`Registrar ${btn.label} em ${proc.nome}`}
                        onClick={() => handleRecord(proc.id, proc.nome, btn.role)}
                        className={`whitespace-nowrap rounded-md border px-2 py-1.5 text-center text-xs font-medium transition-colors sm:px-2.5 sm:py-1 ${
                          btn.countsFor3x
                            ? 'border-[#0F766E]/35 bg-teal-50/45 text-zinc-900 hover:border-[#0F766E] hover:bg-[#0F766E]/10 hover:text-[#0F766E] dark:border-[#2DD4BF]/30 dark:bg-teal-500/[0.07] dark:text-[#F3F4F6] dark:hover:border-[#2DD4BF] dark:hover:bg-teal-500/15 dark:hover:text-[#2DD4BF]'
                            : 'border-zinc-200/80 bg-zinc-50/70 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#0F1115]/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#E5E7EB]'
                        }`}
                      >
                        <span className="hidden sm:inline">{btn.label}</span>
                        <span className="sm:hidden">{btn.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barra contextual pós-registro exatamente dentro do cartão clicado */}
                {showInlinePostRecord && lastRecorded && renderQuickNoteBar(lastRecorded, true)}

                {/* Histórico expansível com texto completo (sem truncamento) e edição inline de nota */}
                {history.length > 0 && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
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
                      <ul className="mt-2 space-y-2 border-t border-zinc-100 pt-2.5 dark:border-white/[0.06]">
                        {history.map((item) => {
                          const cleanNote = cleanLogbookNoteDisplay(item.aprendizado, item.papel);
                          const isEditingThis = editingEntryId === item.id;

                          return (
                            <li
                              key={item.id}
                              className="rounded-lg bg-zinc-50/70 px-2.5 py-2 text-xs text-zinc-600 dark:bg-white/[0.025] dark:text-[#9CA3AF]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 leading-relaxed">
                                  <span className="font-mono tabular-nums text-zinc-400 dark:text-[#6B7280]">
                                    {formatIsoShort(item.dateIso)}
                                  </span>
                                  <span className="mx-1.5" aria-hidden="true">·</span>
                                  <span className="font-medium text-zinc-800 dark:text-[#F3F4F6]">
                                    {item.papel}
                                  </span>
                                  {!isEditingThis && cleanNote && (
                                    <p className="mt-0.5 break-words text-zinc-700 dark:text-[#D1D5DB]">
                                      {cleanNote}
                                    </p>
                                  )}
                                </div>

                                {!isEditingThis && (
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditNote(item)}
                                      aria-label={
                                        cleanNote
                                          ? `Editar nota de ${proc.nome}`
                                          : `Adicionar nota em ${proc.nome}`
                                      }
                                      title={cleanNote ? 'Editar nota técnica' : 'Adicionar nota técnica'}
                                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                                    >
                                      <Edit3 className="h-3 w-3" />
                                      <span className="hidden sm:inline">
                                        {cleanNote ? 'Editar nota' : '+ Nota'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteWithUndo(item.id, `${proc.nome} (${item.papel})`)
                                      }
                                      aria-label={`Remover registro de ${proc.nome}`}
                                      className="rounded p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {isEditingThis && (
                                <form
                                  onSubmit={(e) => handleSaveEditedNote(e, item.id)}
                                  className="mt-2 space-y-1.5"
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNoteText}
                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEditedNote(e, item.id);
                                      }
                                    }}
                                    placeholder="Ajuste técnico para a próxima vez..."
                                    aria-label={`Editar nota técnica de ${proc.nome}`}
                                    className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                                  />
                                  {editNotePiiIssues.length > 0 && (
                                    <div
                                      role="alert"
                                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200"
                                    >
                                      <span>
                                        Dado identificável ({Array.from(new Set(editNotePiiIssues.map((i) => i.label))).join(', ')}) será anonimizado.
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingNoteText((prev) => sanitizePiiText(prev).sanitized)
                                        }
                                        className="font-semibold underline"
                                      >
                                        Anonimizar
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEntryId(null);
                                        setEditingNoteText('');
                                      }}
                                      className="rounded px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/70 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="submit"
                                      className="rounded bg-[#0F766E] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </form>
                              )}
                            </li>
                          );
                        })}
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
            aria-expanded={showGeneralHistory}
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
              {unlinkedEntries.map((item) => {
                const cleanNote = cleanLogbookNoteDisplay(item.aprendizado, item.papel);
                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-900 dark:text-[#F3F4F6]">
                        {item.titulo}
                      </div>
                      <div className="mt-0.5 text-zinc-500 dark:text-[#9CA3AF]">
                        <span className="font-mono tabular-nums">{formatIsoShort(item.dateIso)}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{item.papel}</span>
                      </div>
                      {cleanNote && (
                        <p className="mt-1 break-words text-zinc-700 dark:text-[#D1D5DB]">
                          {cleanNote}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteWithUndo(item.id, item.titulo)}
                      aria-label={`Remover ${item.titulo}`}
                      className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
