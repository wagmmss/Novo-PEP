import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  CURRICULUM_BANKS_CONFIG,
  CURRICULUM_CATEGORIES_META,
  UNIFIED_CURRICULUM_CATALOG,
  computeMilestoneCountdown,
  computeUnifiedCurriculumScores,
  type Central6AnoState,
  type CurriculumBankId,
  type CurriculumCategoryId,
  type ProofStatus,
  type R1Milestone,
} from '../engine/central6ano.ts';
import { cockpitStore } from '../state/store.ts';

interface R1CurriculoViewProps {
  central6Ano: Central6AnoState;
  onNotify: (message: string) => void;
}

const MILESTONE_CATEGORIES: Array<{ value: R1Milestone['categoria']; label: string }> = [
  { value: 'curriculo', label: 'Currículo' },
  { value: 'estudo', label: 'Estudo' },
  { value: 'graduacao', label: 'Graduação' },
  { value: 'prova', label: 'Prova R1' },
  { value: 'ingresso', label: 'Ingresso' },
];

const MILESTONE_CAT_LABEL: Record<R1Milestone['categoria'], string> = {
  curriculo: 'Currículo',
  estudo: 'Estudo',
  graduacao: 'Graduação',
  prova: 'Prova R1',
  ingresso: 'Ingresso',
};

const PROOF_OPTIONS: Array<{ value: ProofStatus; label: string }> = [
  { value: 'falta', label: 'Falta' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'pdf_pronto', label: 'Comprovado' },
];

const BANK_ORDER: CurriculumBankId[] = ['usp_sp', 'usp_rp', 'unicamp'];

function formatDateBr(dateIso: string): string {
  const parts = String(dateIso || '').split('-');
  if (parts.length !== 3) return dateIso || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatScore(n: number, max: number): string {
  const decimals = max <= 10 ? 2 : 1;
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals).replace('.', ',');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function R1CurriculoView({ central6Ano, onNotify }: R1CurriculoViewProps) {
  // ---- Estado Bloco 1: Prazos R1 ----
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msTitulo, setMsTitulo] = useState('');
  const [msDateIso, setMsDateIso] = useState('');
  const [msCategoria, setMsCategoria] = useState<R1Milestone['categoria']>('prova');
  const [msNota, setMsNota] = useState('');

  // ---- Estado Bloco 2: Matriz Unificada ----
  const [catFilter, setCatFilter] = useState<'todas' | CurriculumCategoryId>('todas');
  const [proofFilter, setProofFilter] = useState<'todos' | ProofStatus>('todos');
  const [showBlocks, setShowBlocks] = useState(false);
  const [copiedScore, setCopiedScore] = useState(false);

  const milestones = useMemo(() => {
    const list = [...(central6Ano.r1Milestones || [])];
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    return list.map((ms) => computeMilestoneCountdown(ms));
  }, [central6Ano.r1Milestones]);

  const enamedConcept: 3 | 4 | 5 =
    central6Ano.curriculumEnamedConcept === 3 ||
    central6Ano.curriculumEnamedConcept === 4 ||
    central6Ano.curriculumEnamedConcept === 5
      ? central6Ano.curriculumEnamedConcept
      : 5;

  const curriculumEval = useMemo(
    () =>
      computeUnifiedCurriculumScores(central6Ano.curriculumEntries, {
        enamedConcept,
      }),
    [central6Ano.curriculumEntries, enamedConcept]
  );

  const filteredCatalog = useMemo(() => {
    return UNIFIED_CURRICULUM_CATALOG.filter((item) => {
      if (catFilter !== 'todas' && item.categoria !== catFilter) return false;
      if (proofFilter !== 'todos') {
        const status: ProofStatus = central6Ano.curriculumEntries?.[item.id]?.proofStatus || 'falta';
        if (status !== proofFilter) return false;
      }
      return true;
    });
  }, [catFilter, proofFilter, central6Ano.curriculumEntries]);

  const resetMilestoneForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setMsTitulo('');
    setMsDateIso('');
    setMsCategoria('prova');
    setMsNota('');
  };

  const openEditMilestone = (ms: R1Milestone) => {
    setEditingId(ms.id);
    setMsTitulo(ms.titulo);
    setMsDateIso(ms.dateIso);
    setMsCategoria(ms.categoria);
    setMsNota(ms.nota || '');
    setFormOpen(true);
  };

  const handleSaveMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msTitulo.trim() || !msDateIso) return;
    if (editingId) {
      cockpitStore.updateR1Milestone(editingId, {
        titulo: msTitulo,
        dateIso: msDateIso,
        categoria: msCategoria,
        nota: msNota,
      });
      onNotify('Prazo atualizado.');
    } else {
      cockpitStore.addR1Milestone({
        titulo: msTitulo,
        dateIso: msDateIso,
        categoria: msCategoria,
        nota: msNota,
      });
      onNotify('Novo prazo adicionado.');
    }
    resetMilestoneForm();
  };

  const handleCopyScoreMarkdown = async () => {
    const uspSp = curriculumEval.banks.usp_sp;
    const uspRp = curriculumEval.banks.usp_rp;
    const unicamp = curriculumEval.banks.unicamp;

    const lines: string[] = [
      '# Placar Unificado de Currículo — R1',
      '',
      `Conceito ENAMED: **${enamedConcept}** (multiplicador USP-SP: ${uspSp.multiplier.toFixed(1)}x)`,
      '',
      '| Banca | Pontuação | Teto | Faltam |',
      '|---|---:|---:|---:|',
      `| USP-SP | ${formatScore(uspSp.finalScore, uspSp.escalaMax)} | ${uspSp.escalaMax} | ${formatScore(uspSp.missingToMax, uspSp.escalaMax)} |`,
      `| USP-RP | ${formatScore(uspRp.finalScore, uspRp.escalaMax)} | ${uspRp.escalaMax} | ${formatScore(uspRp.missingToMax, uspRp.escalaMax)} |`,
      `| UNICAMP | ${formatScore(unicamp.finalScore, unicamp.escalaMax)} | ${unicamp.escalaMax} | ${formatScore(unicamp.missingToMax, unicamp.escalaMax)} |`,
      '',
      `Comprovantes: ${curriculumEval.proofCounts.pdf_pronto} comprovados · ${curriculumEval.proofCounts.em_andamento} em andamento · ${curriculumEval.proofCounts.falta} faltam`,
      '',
      '## Itens preenchidos',
    ];

    for (const item of UNIFIED_CURRICULUM_CATALOG) {
      const entry = central6Ano.curriculumEntries?.[item.id];
      const val = Number(entry?.value) || 0;
      if (val <= 0) continue;
      const pts = curriculumEval.itemPointsByBank[item.id];
      const statusLabel =
        PROOF_OPTIONS.find((p) => p.value === (entry?.proofStatus || 'falta'))?.label || 'Falta';
      lines.push(
        `- **${item.titulo}** (${item.inputType === 'boolean' ? 'Sim' : `${val} ${item.unitLabel || ''}`.trim()}) · ${statusLabel} — USP-SP: ${pts.usp_sp} | USP-RP: ${pts.usp_rp} | UNICAMP: ${pts.unicamp}`
      );
    }

    const ok = await copyText(lines.join('\n'));
    if (ok) {
      setCopiedScore(true);
      onNotify('Placar de currículo copiado em Markdown.');
      window.setTimeout(() => setCopiedScore(false), 1800);
    }
  };

  return (
    <main className="h-[calc(100vh-3.25rem)] overflow-y-auto bg-white dark:bg-[#0b1117]">
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-8 sm:py-8">
        {/* ================================================================
            BLOCO 1 — PRAZOS & CICLOS R1
           ================================================================ */}
        <section aria-labelledby="r1-prazos-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1
                id="r1-prazos-heading"
                className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
              >
                Prazos & Ciclos R1
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Marcos do internato e provas de residência com contagem regressiva automática.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (formOpen && !editingId) {
                  resetMilestoneForm();
                } else {
                  setEditingId(null);
                  setMsTitulo('');
                  setMsDateIso('');
                  setMsCategoria('prova');
                  setMsNota('');
                  setFormOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-teal-600/50 hover:text-teal-800 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:border-teal-400/50 dark:hover:text-teal-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo prazo
            </button>
          </div>

          {formOpen && (
            <form
              onSubmit={handleSaveMilestone}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-[#111827]/70"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {editingId ? 'Editar prazo' : 'Adicionar prazo R1'}
                </span>
                <button
                  type="button"
                  onClick={resetMilestoneForm}
                  aria-label="Fechar formulário de prazo"
                  className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ms-titulo"
                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Marco / evento
                  </label>
                  <input
                    id="ms-titulo"
                    type="text"
                    required
                    value={msTitulo}
                    onChange={(e) => setMsTitulo(e.target.value)}
                    placeholder="Ex.: Envio do currículo USP-SP"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ms-data"
                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Data
                  </label>
                  <input
                    id="ms-data"
                    type="date"
                    required
                    value={msDateIso}
                    onChange={(e) => setMsDateIso(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ms-cat"
                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Categoria
                  </label>
                  <select
                    id="ms-cat"
                    value={msCategoria}
                    onChange={(e) => setMsCategoria(e.target.value as R1Milestone['categoria'])}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                  >
                    {MILESTONE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="ms-nota"
                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Observação (opcional)
                  </label>
                  <input
                    id="ms-nota"
                    type="text"
                    value={msNota}
                    onChange={(e) => setMsNota(e.target.value)}
                    placeholder="Ex.: Conferir PDF único e autenticidade das declarações."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetMilestoneForm}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {editingId ? 'Salvar alterações' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {milestones.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum prazo cadastrado. Clique em &ldquo;Novo prazo&rdquo; para adicionar.
              </div>
            ) : (
              milestones.map((item) => {
                const { milestone, status, label } = item;
                return (
                  <div
                    key={milestone.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {milestone.titulo}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {MILESTONE_CAT_LABEL[milestone.categoria]}
                        </span>
                      </div>
                      {milestone.nota && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {milestone.nota}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <div
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            status === 'overdue'
                              ? 'text-red-600 dark:text-red-400'
                              : status === 'soon'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-teal-700 dark:text-teal-400'
                          }`}
                        >
                          {label}
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                          {formatDateBr(milestone.dateIso)}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEditMilestone(milestone)}
                          aria-label={`Editar ${milestone.titulo}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            cockpitStore.deleteR1Milestone(milestone.id);
                            onNotify('Prazo removido.');
                          }}
                          aria-label={`Remover ${milestone.titulo}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ================================================================
            BLOCO 2 — MATRIZ UNIFICADA DE CURRÍCULO (3 BANCAS)
           ================================================================ */}
        <section
          aria-labelledby="matriz-curriculo-heading"
          className="space-y-5 border-t border-slate-200 pt-8 dark:border-slate-800"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="matriz-curriculo-heading"
                className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
              >
                Matriz Unificada de Currículo
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Preencha uma vez e acompanhe a pontuação simultânea em USP-SP, USP-RP e UNICAMP.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Conceito ENAMED"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-[#111827]"
              >
                <span className="px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  ENAMED
                </span>
                {([3, 4, 5] as const).map((concept) => {
                  const active = enamedConcept === concept;
                  const mult = concept === 5 ? '1,2×' : concept === 4 ? '1,1×' : '1,0×';
                  return (
                    <button
                      key={concept}
                      type="button"
                      onClick={() => cockpitStore.setCurriculumEnamedConcept(concept)}
                      className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-xs font-medium tabular-nums transition-colors ${
                        active
                          ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {concept} ({mult})
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleCopyScoreMarkdown}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {copiedScore ? (
                  <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedScore ? 'Copiado' : 'Copiar placar (.md)'}
              </button>
            </div>
          </div>

          {/* Placar simultâneo das 3 bancas */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {BANK_ORDER.map((bankId) => {
              const summary = curriculumEval.banks[bankId];
              const cfg = CURRICULUM_BANKS_CONFIG[bankId];
              return (
                <div
                  key={bankId}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111827]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-300">
                      {summary.sigla}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {cfg.pesoNotaFinal}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
                      {formatScore(summary.finalScore, summary.escalaMax)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
                      / {summary.escalaMax}
                    </span>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all duration-300 dark:bg-teal-400"
                      style={{ width: `${summary.pct}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      Faltam {formatScore(summary.missingToMax, summary.escalaMax)} pts
                    </span>
                    {bankId === 'usp_sp' && (
                      <span className="font-mono tabular-nums">
                        {formatScore(summary.rawSubtotal, 100)} × {summary.multiplier.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {showBlocks && (
                    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      {summary.blocks.map((blk) => (
                        <li
                          key={blk.blockId}
                          className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400"
                        >
                          <span className="truncate">{blk.label}</span>
                          <span className="shrink-0 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {formatScore(blk.cappedScore, summary.escalaMax)}/{blk.maxPoints}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setShowBlocks((prev) => !prev)}
              className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              {showBlocks ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {showBlocks ? 'Ocultar detalhamento por bloco' : 'Ver detalhamento por bloco'}
            </button>

            <span className="font-mono tabular-nums">
              {curriculumEval.proofCounts.filledItems}/{curriculumEval.proofCounts.totalItems} preenchidos ·{' '}
              {curriculumEval.proofCounts.pdf_pronto} comprovados ·{' '}
              {curriculumEval.proofCounts.em_andamento} em andamento ·{' '}
              {curriculumEval.proofCounts.falta} faltam
            </span>
          </div>

          {/* Filtros de categoria e comprovante */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCatFilter('todas')}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  catFilter === 'todas'
                    ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                Todas
              </button>
              {(
                Object.entries(CURRICULUM_CATEGORIES_META) as Array<
                  [CurriculumCategoryId, { label: string }]
                >
              ).map(([catId, meta]) => (
                <button
                  key={catId}
                  type="button"
                  onClick={() => setCatFilter(catId)}
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    catFilter === catId
                      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {meta.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'todos', label: 'Todos status' },
                  { id: 'falta', label: 'Falta' },
                  { id: 'em_andamento', label: 'Em andamento' },
                  { id: 'pdf_pronto', label: 'Comprovado' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setProofFilter(st.id)}
                  className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    proofFilter === st.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela / Lista limpa dos 20 itens */}
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {filteredCatalog.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum item de currículo corresponde aos filtros selecionados.
              </div>
            ) : (
              filteredCatalog.map((item) => {
                const entry = central6Ano.curriculumEntries?.[item.id];
                const val = Math.min(item.maxInput, Math.max(0, Number(entry?.value) || 0));
                const proofStatus: ProofStatus = entry?.proofStatus || 'falta';
                const step = item.step || 1;
                const pts = curriculumEval.itemPointsByBank[item.id] || {
                  usp_sp: 0,
                  usp_rp: 0,
                  unicamp: 0,
                };

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.titulo}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.descricao}
                      </p>

                      {/* Pontos por banca em texto tabular discreto */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        <span className={pts.usp_sp > 0 ? 'font-semibold text-teal-700 dark:text-teal-400' : ''}>
                          USP-SP: {item.rules.usp_sp ? `${formatScore(pts.usp_sp, 100)}/${item.rules.usp_sp.maxItemPoints}` : '—'}
                        </span>
                        <span className={pts.usp_rp > 0 ? 'font-semibold text-teal-700 dark:text-teal-400' : ''}>
                          USP-RP: {item.rules.usp_rp ? `${formatScore(pts.usp_rp, 10)}/${item.rules.usp_rp.maxItemPoints}` : '—'}
                        </span>
                        <span className={pts.unicamp > 0 ? 'font-semibold text-teal-700 dark:text-teal-400' : ''}>
                          UNICAMP: {item.rules.unicamp ? `${formatScore(pts.unicamp, 100)}/${item.rules.unicamp.maxItemPoints}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Controles de 1-2 cliques (valor + comprovante) */}
                    <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                      {item.inputType === 'boolean' ? (
                        <button
                          type="button"
                          onClick={() =>
                            cockpitStore.updateCurriculumEntry(item.id, {
                              value: val > 0 ? 0 : 1,
                            })
                          }
                          aria-pressed={val > 0}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            val > 0
                              ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-teal-600/50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300'
                          }`}
                        >
                          {val > 0 && <Check className="h-3.5 w-3.5" />}
                          {val > 0 ? 'Concluído' : 'Marcar'}
                        </button>
                      ) : (
                        <div className="inline-flex items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#111827]">
                          <button
                            type="button"
                            onClick={() =>
                              cockpitStore.updateCurriculumEntry(item.id, {
                                value: Math.max(0, Math.round((val - step) * 100) / 100),
                              })
                            }
                            disabled={val <= 0}
                            aria-label={`Diminuir ${item.titulo}`}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[4.5rem] px-2 text-center font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {val}
                            {item.unitLabel ? ` ${item.unitLabel}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              cockpitStore.updateCurriculumEntry(item.id, {
                                value: Math.min(item.maxInput, Math.round((val + step) * 100) / 100),
                              })
                            }
                            disabled={val >= item.maxInput}
                            aria-label={`Aumentar ${item.titulo}`}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <select
                        aria-label={`Status do comprovante para ${item.titulo}`}
                        value={proofStatus}
                        onChange={(e) =>
                          cockpitStore.updateCurriculumEntry(item.id, {
                            proofStatus: e.target.value as ProofStatus,
                          })
                        }
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium outline-none focus:border-teal-600 dark:focus:border-teal-400 ${
                          proofStatus === 'pdf_pronto'
                            ? 'border-teal-600/40 bg-teal-50/70 text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300'
                            : proofStatus === 'em_andamento'
                              ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-400'
                        }`}
                      >
                        {PROOF_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
