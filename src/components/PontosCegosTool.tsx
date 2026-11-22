import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FileText,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { ALL_PROTOCOLS } from '../data/protocolsRepo.ts';
import {
  RODIZIOS_6ANO,
  getLocalTodayIso,
  type Central6AnoState,
} from '../engine/central6ano.ts';
import {
  formatCompactProtocolTitle,
  formatPrePortaTitle,
} from '../engine/diretrizes.ts';
import {
  buildBlindSpotsMarkdownExport,
  cleanBlindSpotDuvidaDisplay,
  filterBlindSpots,
  findRelatedClinicalLinksForBlindSpot,
  inferBestD2TargetForBlindSpot,
  type BlindSpotEntry,
  type BlindSpotStatusFilter,
} from '../engine/praticaHelpers.ts';
import { buildPromptD2 } from '../engine/treinoClinico.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { detectPiiIssues, sanitizePiiText } from '../utils/piiGuard.ts';

const RODIZIO_NAME_MAP = new Map<string, string>(RODIZIOS_6ANO.map((r) => [r.id, r.nome]));

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

interface DeletedSpotUndo {
  entry: BlindSpotEntry;
  index: number;
}

export interface PontosCegosToolProps {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
  onOpenProtocol?: (protocolId: string) => void;
  onNotify: (msg: string) => void;
  shortcutsEnabled?: boolean;
}

export function PontosCegosTool({
  central6Ano,
  onOpenPrePorta,
  onOpenProtocol,
  onNotify,
  shortcutsEnabled = true,
}: PontosCegosToolProps) {
  const [titulo, setTitulo] = useState('');
  const [rodizio, setRodizio] = useState(central6Ano.rodizioId || RODIZIOS_6ANO[0]?.id || 'cm');
  const [userPickedFormRodizio, setUserPickedFormRodizio] = useState(false);
  const [duvida, setDuvida] = useState('');
  const [acaoRevisao, setAcaoRevisao] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<BlindSpotStatusFilter>('pendentes');
  const [rodizioFilter, setRodizioFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editRodizio, setEditRodizio] = useState('');
  const [editDuvida, setEditDuvida] = useState('');
  const [editAcao, setEditAcao] = useState('');

  const [deletedUndo, setDeletedUndo] = useState<DeletedSpotUndo | null>(null);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedD2Id, setCopiedD2Id] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // Mantém rodízio padrão do formulário sincronizado se o usuário trocar de rodízio ativo
  useEffect(() => {
    if (userPickedFormRodizio) return;
    if (central6Ano.rodizioId) {
      setRodizio(central6Ano.rodizioId);
    }
  }, [central6Ano.rodizioId, userPickedFormRodizio]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Atalho "/" foca a busca de Pontos Cegos; "Esc" cancela edição inline
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingId) {
        e.preventDefault();
        setEditingId(null);
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
  }, [shortcutsEnabled, editingId]);

  const blindSpots = useMemo(
    () => (central6Ano.logbookEntries || []).filter((e) => e.tipo === 'ponto_cego'),
    [central6Ano.logbookEntries]
  );

  const pendingCount = useMemo(
    () => blindSpots.filter((e) => e.status !== 'resolvido').length,
    [blindSpots]
  );
  const resolvedCount = blindSpots.length - pendingCount;

  const availableRodiziosInSpots = useMemo(() => {
    const ids = new Set<string>(blindSpots.map((s) => s.rodizio).filter(Boolean));
    return RODIZIOS_6ANO.filter((r) => ids.has(r.id));
  }, [blindSpots]);

  const filteredSpots = useMemo(
    () =>
      filterBlindSpots(blindSpots, {
        statusFilter,
        rodizioFilter,
        query: searchQuery,
      }),
    [blindSpots, statusFilter, rodizioFilter, searchQuery]
  );

  const piiIssues = useMemo(
    () => detectPiiIssues(`${titulo} ${duvida} ${acaoRevisao}`),
    [titulo, duvida, acaoRevisao]
  );

  const editPiiIssues = useMemo(
    () => (editingId ? detectPiiIssues(`${editTitulo} ${editDuvida} ${editAcao}`) : []),
    [editingId, editTitulo, editDuvida, editAcao]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || rodizioFilter !== 'todos' || statusFilter !== 'pendentes';

  const clearFilters = () => {
    setSearchQuery('');
    setRodizioFilter('todos');
    setStatusFilter('todos');
  };

  const handleAnonymizeNow = () => {
    setTitulo((prev) => sanitizePiiText(prev).sanitized);
    setDuvida((prev) => sanitizePiiText(prev).sanitized);
    setAcaoRevisao((prev) => sanitizePiiText(prev).sanitized);
    onNotify('Campos anonimizados.');
  };

  const submitNewSpot = () => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitNewSpot();
  };

  const handleStartEdit = (item: BlindSpotEntry) => {
    setEditingId(item.id);
    setEditTitulo(item.titulo);
    setEditRodizio(item.rodizio || central6Ano.rodizioId || 'cm');
    setEditDuvida(cleanBlindSpotDuvidaDisplay(item.aprendizado));
    setEditAcao(item.gatilhoCorrecao || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editTitulo.trim()) return;
    const res = cockpitStore.updateBlindSpotEntry(editingId, {
      titulo: editTitulo,
      rodizio: editRodizio,
      duvida: editDuvida,
      acaoRevisao: editAcao,
    });
    setEditingId(null);
    onNotify(
      res.sanitizedCount > 0
        ? 'Ponto cego atualizado com anonimização anti-PII.'
        : 'Ponto cego atualizado.'
    );
  };

  const handleDeleteWithUndo = (item: BlindSpotEntry) => {
    const deleted = cockpitStore.deleteLogbookEntry(item.id);
    if (!deleted) return;
    if (editingId === item.id) setEditingId(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setDeletedUndo({ entry: deleted.entry, index: deleted.index });
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedUndo(null);
      undoTimerRef.current = null;
    }, 9000);
    onNotify('Ponto cego removido.');
  };

  const handleRestoreDeleted = () => {
    if (!deletedUndo) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    cockpitStore.restoreLogbookEntry(deletedUndo.entry, deletedUndo.index);
    onNotify('Ponto cego restaurado.');
    setDeletedUndo(null);
  };

  const handleCopyD2 = async (item: BlindSpotEntry) => {
    const rodNome = RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio || 'Internato';
    const duvidaClean = cleanBlindSpotDuvidaDisplay(item.aprendizado);
    const relato = [
      item.titulo,
      duvidaClean ? `Dúvida / travamento: ${duvidaClean}` : '',
      item.gatilhoCorrecao ? `Foco de revisão: ${item.gatilhoCorrecao}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const target = inferBestD2TargetForBlindSpot(item);
    const prompt = buildPromptD2({
      dateIso: getLocalTodayIso(),
      eixo: target.eixo,
      slug: target.slug,
      rodizio: rodNome,
      casoAnonimizado: relato,
    });

    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopiedD2Id(item.id);
      onNotify(`Prompt D2 copiado (${target.eixo} · ${target.slug}).`);
      window.setTimeout(() => setCopiedD2Id((prev) => (prev === item.id ? null : prev)), 1800);
    } else {
      onNotify('Não foi possível copiar o Prompt D2.');
    }
  };

  const handleCopyMarkdown = async () => {
    const filterParts: string[] = [];
    if (statusFilter !== 'todos') {
      filterParts.push(statusFilter === 'pendentes' ? 'Pendentes' : 'Resolvidos');
    }
    if (rodizioFilter !== 'todos') {
      filterParts.push(`Rodízio: ${RODIZIO_NAME_MAP.get(rodizioFilter) || rodizioFilter}`);
    }
    if (searchQuery.trim()) {
      filterParts.push(`Busca: "${searchQuery.trim()}"`);
    }

    const md = buildBlindSpotsMarkdownExport({
      spots: filteredSpots,
      pendingCount,
      resolvedCount,
      filterDescription: filterParts.length > 0 ? filterParts.join(' · ') : undefined,
    });

    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedMd(true);
      onNotify('Resumo de Pontos Cegos copiado em Markdown.');
      window.setTimeout(() => setCopiedMd(false), 1800);
    } else {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Pontos Cegos (60s)
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
          Captura rápida de lacunas reais do plantão (sem nome, CPF ou prontuário). Detalhe agora ou
          edite na revisão e copie direto para o Prompt D2 da Esteira.
        </p>
      </div>

      {/* Formulário compacto com expansão de detalhes sob demanda */}
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && titulo.trim()) {
            e.preventDefault();
            submitNewSpot();
          }
        }}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-4 dark:border-white/[0.10] dark:bg-[#15181F]"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
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
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
            />
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
            >
              <span>Detalhes</span>
              {detailsOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="submit"
              disabled={!titulo.trim()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] disabled:opacity-45 sm:flex-initial dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
            >
              <Check className="h-3.5 w-3.5" />
              Registrar ponto cego
            </button>
          </div>
        </div>

        {/* Rodízio visível de forma compacta + campos opcionais quando expandidos */}
        {detailsOpen && (
          <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-3 dark:border-white/[0.06]">
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
                onChange={(e) => {
                  setRodizio(e.target.value);
                  setUserPickedFormRodizio(true);
                }}
                title={RODIZIO_NAME_MAP.get(rodizio) || rodizio}
                className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
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
                htmlFor="pc-duvida"
                className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
              >
                O que travou / dúvida (opcional)
              </label>
              <input
                id="pc-duvida"
                type="text"
                value={duvida}
                onChange={(e) => setDuvida(e.target.value)}
                placeholder="Ex.: Esquema Pritchard vs Zuspan e reflexo patelar"
                className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
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
                className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
              />
            </div>
          </div>
        )}

        {!detailsOpen && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
            <span>
              Rodízio atual:{' '}
              <strong className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                {RODIZIO_NAME_MAP.get(rodizio) || rodizio}
              </strong>
            </span>
            <span className="hidden sm:inline">Ctrl+Enter para salvar rápido</span>
          </div>
        )}

        {/* Alerta anti-PII em tempo real */}
        {piiIssues.length > 0 && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Dado identificável detectado (
                {Array.from(new Set(piiIssues.map((i) => i.label))).join(', ')}). Nunca salve dados
                de pacientes — será anonimizado automaticamente ao salvar.
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
      </form>

      {/* Banner de Desfazer exclusão */}
      {deletedUndo && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
        >
          <span className="min-w-0 truncate">
            Ponto cego removido: <strong>{deletedUndo.entry.titulo}</strong>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleRestoreDeleted}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/80 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-[#0F1115] dark:text-amber-200 dark:hover:bg-amber-950"
            >
              <RotateCcw className="h-3 w-3" />
              Desfazer
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

      {/* Busca + Filtro por rodízio + Status + Copiar resumo */}
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-[#6B7280]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (searchQuery) {
                    e.preventDefault();
                    setSearchQuery('');
                  } else {
                    e.currentTarget.blur();
                  }
                }
              }}
              placeholder="Buscar ponto cego, dúvida ou revisão...  ( / )"
              aria-label="Buscar pontos cegos"
              className="w-full rounded-lg border border-zinc-200/80 bg-white py-2 pr-8 pl-9 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca de pontos cegos"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:text-[#F3F4F6]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {availableRodiziosInSpots.length > 0 && (
            <select
              value={rodizioFilter}
              onChange={(e) => setRodizioFilter(e.target.value)}
              aria-label="Filtrar pontos cegos por rodízio"
              className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none focus:border-[#0F766E] sm:max-w-[220px] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:focus:border-[#2DD4BF]"
            >
              <option value="todos">Todos os rodízios</option>
              {availableRodiziosInSpots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por status">
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
                aria-pressed={statusFilter === opt.id}
                onClick={() => setStatusFilter(opt.id)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === opt.id
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
            {copiedMd ? (
              <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedMd ? 'Copiado' : 'Copiar resumo (.md)'}
          </button>
        </div>
      </div>

      {/* Lista de pontos cegos */}
      <div className="divide-y divide-zinc-200/80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
        {filteredSpots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-10 text-center">
            <p className="text-sm text-zinc-500 dark:text-[#9CA3AF]">
              {searchQuery.trim() || rodizioFilter !== 'todos'
                ? 'Nenhum ponto cego encontrado para este filtro.'
                : statusFilter === 'pendentes'
                  ? 'Nenhum ponto cego pendente no momento.'
                  : 'Nenhum registro nesta visualização.'}
            </p>
            {(searchQuery.trim() || rodizioFilter !== 'todos' || (hasActiveFilters && blindSpots.length > 0)) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          filteredSpots.map((item) => {
            const isResolved = item.status === 'resolvido';
            const isD2Copied = copiedD2Id === item.id;
            const isEditing = editingId === item.id;
            const duvidaClean = cleanBlindSpotDuvidaDisplay(item.aprendizado);
            const d2Target = inferBestD2TargetForBlindSpot(item);
            const relatedLinks = !isEditing
              ? findRelatedClinicalLinksForBlindSpot(item, ALL_PROTOCOLS)
              : { protocols: [], habs: [] };

            return (
              <div
                key={item.id}
                className={`border-l-[3px] px-4 py-3.5 ${
                  isResolved
                    ? 'border-l-emerald-500/60 dark:border-l-emerald-400/50'
                    : 'border-l-amber-500 bg-amber-500/[0.025] dark:border-l-amber-400 dark:bg-amber-400/[0.035]'
                }`}
              >
                {isEditing ? (
                  <form
                    onSubmit={handleSaveEdit}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && editTitulo.trim()) {
                        e.preventDefault();
                        handleSaveEdit(e);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`edit-pc-titulo-${item.id}`}
                          className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
                        >
                          Tema / contexto clínico
                        </label>
                        <input
                          id={`edit-pc-titulo-${item.id}`}
                          type="text"
                          required
                          autoFocus
                          value={editTitulo}
                          onChange={(e) => setEditTitulo(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-pc-rod-${item.id}`}
                          className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
                        >
                          Rodízio
                        </label>
                        <select
                          id={`edit-pc-rod-${item.id}`}
                          value={editRodizio}
                          onChange={(e) => setEditRodizio(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        >
                          {RODIZIOS_6ANO.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`edit-pc-duvida-${item.id}`}
                          className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
                        >
                          O que travou / dúvida específica
                        </label>
                        <input
                          id={`edit-pc-duvida-${item.id}`}
                          type="text"
                          value={editDuvida}
                          onChange={(e) => setEditDuvida(e.target.value)}
                          placeholder="Opcional"
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-pc-acao-${item.id}`}
                          className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
                        >
                          Ação de revisão
                        </label>
                        <input
                          id={`edit-pc-acao-${item.id}`}
                          type="text"
                          value={editAcao}
                          onChange={(e) => setEditAcao(e.target.value)}
                          placeholder="Opcional"
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.12] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        />
                      </div>
                    </div>

                    {editPiiIssues.length > 0 && (
                      <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <span>
                          Dado identificável ({Array.from(new Set(editPiiIssues.map((i) => i.label))).join(', ')}) será anonimizado ao salvar.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditTitulo((p) => sanitizePiiText(p).sanitized);
                            setEditDuvida((p) => sanitizePiiText(p).sanitized);
                            setEditAcao((p) => sanitizePiiText(p).sanitized);
                          }}
                          className="font-semibold underline"
                        >
                          Anonimizar agora
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Salvar alterações
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          cockpitStore.toggleBlindSpotStatus(item.id);
                          onNotify(
                            isResolved ? 'Ponto cego reaberto.' : 'Ponto cego marcado como resolvido.'
                          );
                        }}
                        aria-label={
                          isResolved
                            ? `Reabrir ${item.titulo}`
                            : `Marcar ${item.titulo} como resolvido`
                        }
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isResolved
                            ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-[#0F1115]'
                            : 'border-amber-500/70 bg-white hover:border-amber-600 dark:border-amber-400/60 dark:bg-[#0F1115] dark:hover:border-amber-300'
                        }`}
                      >
                        {isResolved && <Check className="h-3.5 w-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium leading-snug break-words ${
                            isResolved
                              ? 'text-zinc-400 line-through dark:text-[#6B7280]'
                              : 'text-zinc-950 dark:text-white'
                          }`}
                        >
                          {item.titulo}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                          <span className="font-mono tabular-nums">{formatIsoShort(item.dateIso)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{RODIZIO_NAME_MAP.get(item.rodizio) || item.rodizio}</span>
                          {isResolved && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                Resolvido
                              </span>
                            </>
                          )}
                        </div>

                        {duvidaClean && (
                          <p className="mt-1.5 break-words text-sm leading-relaxed text-zinc-600 dark:text-[#D1D5DB]">
                            {duvidaClean}
                          </p>
                        )}
                        {item.gatilhoCorrecao && (
                          <p className="mt-1 break-words text-xs font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                            Revisão: {item.gatilhoCorrecao}
                          </p>
                        )}

                        {/* Atalhos diretos para protocolos PEP / Pré-Porta relacionados */}
                        {(relatedLinks.protocols.length > 0 || relatedLinks.habs.length > 0) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {onOpenProtocol &&
                              relatedLinks.protocols.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  title={p.title}
                                  onClick={() => onOpenProtocol(p.id)}
                                  className="inline-flex max-w-[230px] items-center gap-1 rounded-md border border-zinc-200/80 bg-[#FAFAFA] px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                                >
                                  <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                                  <span className="truncate">
                                    {formatCompactProtocolTitle(p.title)}
                                  </span>
                                </button>
                              ))}
                            {relatedLinks.habs.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                title={formatPrePortaTitle(h.title)}
                                onClick={() => onOpenPrePorta(h.id)}
                                className="inline-flex max-w-[230px] items-center gap-1 rounded-md border border-teal-200/80 bg-teal-50/50 px-2 py-0.5 text-[11px] font-medium text-[#0F766E] transition-colors hover:bg-teal-100/70 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-[#2DD4BF]"
                              >
                                <Zap className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {formatPrePortaTitle(h.title).split('(')[0].trim()}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações alinhadas e seguras no desktop e mobile */}
                    <div className="flex shrink-0 items-center justify-end gap-1 pl-8 sm:pl-0">
                      {!isResolved && (
                        <button
                          type="button"
                          onClick={() => handleCopyD2(item)}
                          title={`Copiar Prompt D2 (${d2Target.eixo} · ${d2Target.nome})`}
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
                        onClick={() => handleStartEdit(item)}
                        aria-label={`Editar ponto cego ${item.titulo}`}
                        title="Editar ponto cego"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWithUndo(item)}
                        aria-label={`Remover ponto cego ${item.titulo}`}
                        title="Remover ponto cego"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
