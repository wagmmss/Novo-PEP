import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCheck2,
  FileText,
  Info,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  CURRICULUM_BANKS_CONFIG,
  CURRICULUM_CATEGORIES_META,
  FERIAS_SEMANAS,
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  MARCHAS_6ANO,
  RITUAL_DOMINGO_DATA,
  RODIZIOS_6ANO,
  UNIFIED_CURRICULUM_CATALOG,
  computeCurriculumRoiOpportunities,
  computeMilestoneCountdown,
  computeProcedureProgress,
  computeUnifiedCurriculumScores,
  getEffectiveRitualDoneMap,
  getLocalTodayIso,
  resolveExpectedRodizioForDate,
  resolveFeriasSemanaForDate,
  type Central6AnoState,
  type CurriculumBankId,
  type CurriculumCategoryId,
  type CurriculumEffortLevel,
  type MarchaId,
  type ProofStatus,
  type R1Milestone,
  type UnifiedCurriculumEvaluation,
} from '../engine/central6ano.ts';
import {
  ARQUETIPOS_E3,
  CENARIOS_E4,
  QUEIXAS_E1,
  RODIZIOS_TREINO,
} from '../data/treino_clinico_data.ts';
import { weekIsoOf } from '../engine/treinoClinico.ts';
import { cockpitStore } from '../state/store.ts';
import type { SextoAnoTab } from './TopBar.tsx';

type PlanoR1SubTab = 'plano' | 'r1';

interface R1CurriculoViewProps {
  central6Ano: Central6AnoState;
  onNavigateSextoAnoTab?: (tab: SextoAnoTab) => void;
  onNotify: (message: string) => void;
}

const PLANO_R1_SUB_TABS: Array<{ id: PlanoR1SubTab; label: string }> = [
  { id: 'plano', label: 'Plano 6º Ano' },
  { id: 'r1', label: 'R1 & Currículo' },
];

const OPERATIONAL_MARCHAS: MarchaId[] = ['3_normal', '2_pesada', '1_sobrevivencia'];

const TREINO_SLUG_LABEL_MAP = new Map<string, string>([
  ...QUEIXAS_E1.map((q): [string, string] => [q.slug, q.nome]),
  ...ARQUETIPOS_E3.map((a): [string, string] => [a.slug, a.nome]),
  ...CENARIOS_E4.map((c): [string, string] => [c.slug, c.nome]),
]);

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
  { value: 'falta', label: 'Falta PDF' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'pdf_pronto', label: 'PDF pronto' },
];

type ProofFilterValue = 'todos' | 'preenchidos' | 'nao_feitos' | ProofStatus;

const EFFORT_META: Record<CurriculumEffortLevel, { label: string; badgeClass: string }> = {
  baixo: {
    label: 'Esforço baixo',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  },
  medio: {
    label: 'Esforço médio',
    badgeClass: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  },
  alto: {
    label: 'Esforço alto',
    badgeClass: 'bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.08] dark:text-[#D1D5DB]',
  },
};

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

function formatQuestionsEq(q: number): string {
  if (q <= 0) return '0 questões';
  const rounded = q.toFixed(1).replace('.', ',');
  return `≈ ${rounded} ${q === 1 ? 'questão' : 'questões'}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function R1CurriculoView({
  central6Ano,
  onNavigateSextoAnoTab,
  onNotify,
}: R1CurriculoViewProps) {
  const subTab: PlanoR1SubTab = central6Ano.r1SubTab === 'r1' ? 'r1' : 'plano';
  const handleChangeSubTab = (tab: PlanoR1SubTab) => {
    cockpitStore.setR1SubTab(tab);
  };

  // ---- Estado Bloco 1: Prazos R1 ----
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msTitulo, setMsTitulo] = useState('');
  const [msDateIso, setMsDateIso] = useState('');
  const [msCategoria, setMsCategoria] = useState<R1Milestone['categoria']>('prova');
  const [msNota, setMsNota] = useState('');

  // ---- Estado Bloco 2: Matriz Unificada ----
  const [catFilter, setCatFilter] = useState<'todas' | CurriculumCategoryId>('todas');
  const [proofFilter, setProofFilter] = useState<ProofFilterValue>('todos');
  const [showBlocks, setShowBlocks] = useState(false);
  const [showRoi, setShowRoi] = useState(true);
  const [copiedScore, setCopiedScore] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [expandedRuleIds, setExpandedRuleIds] = useState<Record<string, boolean>>({});

  const milestones = useMemo(() => {
    const list = [...(central6Ano.r1Milestones || [])];
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    return list.map((ms) => computeMilestoneCountdown(ms));
  }, [central6Ano.r1Milestones]);

  const nextMilestone = useMemo(
    () => milestones.find((m) => m.daysLeft >= 0) || milestones[0] || null,
    [milestones]
  );

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

  const roiOpportunities = useMemo(
    () =>
      computeCurriculumRoiOpportunities(central6Ano.curriculumEntries, {
        enamedConcept,
        limit: 5,
      }),
    [central6Ano.curriculumEntries, enamedConcept]
  );

  const filteredCatalog = useMemo(() => {
    return UNIFIED_CURRICULUM_CATALOG.filter((item) => {
      if (catFilter !== 'todas' && item.categoria !== catFilter) return false;
      const entry = central6Ano.curriculumEntries?.[item.id];
      const val = Math.min(item.maxInput, Math.max(0, Number(entry?.value) || 0));
      const status: ProofStatus = entry?.proofStatus || 'falta';

      if (proofFilter === 'preenchidos') return val > 0;
      if (proofFilter === 'nao_feitos') return val <= 0;
      if (proofFilter === 'falta' || proofFilter === 'em_andamento' || proofFilter === 'pdf_pronto') {
        return val > 0 && status === proofFilter;
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

  const handleLoadBaselineInventory = () => {
    const res = cockpitStore.applyBaselineCurriculumInventory('merge');
    if (res.updatedCount > 0) {
      onNotify(`Inventário base aplicado (${res.updatedCount} itens atualizados com suas notas).`);
    } else {
      onNotify('Seu inventário base já está 100% carregado.');
    }
  };

  const openNoteEditor = (itemId: string) => {
    const currentNote = central6Ano.curriculumEntries?.[itemId]?.notes || '';
    setEditingNoteId(itemId);
    setNoteDraft(currentNote);
  };

  const saveNoteEditor = (itemId: string) => {
    cockpitStore.updateCurriculumEntry(itemId, { notes: noteDraft });
    setEditingNoteId(null);
    setNoteDraft('');
    onNotify('Nota de comprovante salva.');
  };

  const toggleRuleDetails = (itemId: string) => {
    setExpandedRuleIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleCopyScoreMarkdown = async () => {
    const uspSp = curriculumEval.banks.usp_sp;
    const uspRp = curriculumEval.banks.usp_rp;
    const unicamp = curriculumEval.banks.unicamp;

    const lines: string[] = [
      '# Placar Unificado de Currículo — R1 Psiquiatria (Editais 2027)',
      '',
      `Conceito ENAMED: **${enamedConcept}** (USP-SP: ${uspSp.multiplier.toFixed(1)}× · USP-RP: +${formatScore(uspRp.enamedBonusPoints, 10)} pt no Histórico)`,
      '',
      '| Banca | Comprovado (PDF) | Projetado | Teto | Faltam (equiv. 1ª fase) |',
      '|---|---:|---:|---:|---:|',
      `| USP-SP | ${formatScore(uspSp.confirmedScore, uspSp.escalaMax)} | ${formatScore(uspSp.finalScore, uspSp.escalaMax)} | ${uspSp.escalaMax} | ${formatScore(uspSp.missingToMax, uspSp.escalaMax)} (${formatQuestionsEq(uspSp.equivalentFirstPhaseQuestions)}) |`,
      `| USP-RP | ${formatScore(uspRp.confirmedScore, uspRp.escalaMax)} | ${formatScore(uspRp.finalScore, uspRp.escalaMax)} | ${uspRp.escalaMax} | ${formatScore(uspRp.missingToMax, uspRp.escalaMax)} (${formatQuestionsEq(uspRp.equivalentFirstPhaseQuestions)}) |`,
      `| UNICAMP | ${formatScore(unicamp.confirmedScore, unicamp.escalaMax)} | ${formatScore(unicamp.finalScore, unicamp.escalaMax)} | ${unicamp.escalaMax} | ${formatScore(unicamp.missingToMax, unicamp.escalaMax)} (${formatQuestionsEq(unicamp.equivalentFirstPhaseQuestions)}) |`,
      '',
      `Dossiê (itens preenchidos): ${curriculumEval.proofCounts.filledItems} preenchidos · ${curriculumEval.proofCounts.pdf_pronto} PDF pronto · ${curriculumEval.proofCounts.em_andamento} em andamento · ${curriculumEval.proofCounts.falta} faltam PDF`,
      '',
    ];

    if (roiOpportunities.length > 0) {
      lines.push('## Top ROI (próximas alavancas até 30/06/2027)');
      for (const opp of roiOpportunities) {
        const deltas: string[] = [];
        if (opp.deltaByBank.usp_sp > 0) deltas.push(`+${formatScore(opp.deltaByBank.usp_sp, 100)} USP-SP`);
        if (opp.deltaByBank.usp_rp > 0) deltas.push(`+${formatScore(opp.deltaByBank.usp_rp, 10)} USP-RP`);
        if (opp.deltaByBank.unicamp > 0) deltas.push(`+${formatScore(opp.deltaByBank.unicamp, 100)} UNICAMP`);
        lines.push(`- **${opp.actionLabel}** (${EFFORT_META[opp.effort].label}) → ${deltas.join(' · ')}`);
      }
      lines.push('');
    }

    lines.push('## Itens preenchidos');
    for (const item of UNIFIED_CURRICULUM_CATALOG) {
      const entry = central6Ano.curriculumEntries?.[item.id];
      const val = Number(entry?.value) || 0;
      if (val <= 0) continue;
      const pts = curriculumEval.itemPointsByBank[item.id];
      const statusLabel =
        PROOF_OPTIONS.find((p) => p.value === (entry?.proofStatus || 'falta'))?.label || 'Falta PDF';
      const noteSuffix = entry?.notes ? ` — _${entry.notes}_` : '';
      lines.push(
        `- **${item.titulo}** (${item.inputType === 'boolean' ? 'Sim' : `${val} ${item.unitLabel || ''}`.trim()}) · ${statusLabel} — USP-SP: ${pts.usp_sp} | USP-RP: ${pts.usp_rp} | UNICAMP: ${pts.unicamp}${noteSuffix}`
      );
    }

    const ok = await copyText(lines.join('\n'));
    if (ok) {
      setCopiedScore(true);
      onNotify('Placar e dossiê de currículo copiados em Markdown.');
      window.setTimeout(() => setCopiedScore(false), 1800);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de sub-abas limpa: Plano 6º Ano | R1 & Currículo */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-[#FAFAFA]/95 backdrop-blur-sm dark:border-white/[0.10] dark:bg-[#0F1115]/95">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 sm:px-8">
          {PLANO_R1_SUB_TABS.map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleChangeSubTab(tab.id)}
                className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'plano' ? (
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
          <Plano6AnoTool
            central6Ano={central6Ano}
            curriculumEval={curriculumEval}
            onNavigateSextoAnoTab={onNavigateSextoAnoTab}
            onOpenR1Tab={() => handleChangeSubTab('r1')}
            onNotify={onNotify}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-8 sm:py-8">
          {/* ================================================================
              BLOCO 1 — PRAZOS & CICLOS R1 (2027 → 2028 → MAR/2029)
             ================================================================ */}
          <section aria-labelledby="r1-prazos-heading" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h1
                  id="r1-prazos-heading"
                  className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
                >
                  Prazos & Ciclos R1 · Psiquiatria
                </h1>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
                  Linha do tempo 2027 → 2028 → ingresso mar/2029 com contagem regressiva editável.
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
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo prazo
              </button>
            </div>

            {nextMilestone && (
              <div className="flex flex-col gap-2 rounded-xl border border-[#0F766E]/25 bg-[#0F766E]/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2DD4BF]/25 dark:bg-[#2DD4BF]/[0.06]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#0F766E]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#0F766E] uppercase dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]">
                      Próximo marco
                    </span>
                    <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {nextMilestone.milestone.titulo}
                    </span>
                  </div>
                  {nextMilestone.milestone.nota && (
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-[#9CA3AF]">
                      {nextMilestone.milestone.nota}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <div className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                    {nextMilestone.label}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
                    {formatDateBr(nextMilestone.milestone.dateIso)}
                  </div>
                </div>
              </div>
            )}

            {formOpen && (
              <form
                onSubmit={handleSaveMilestone}
                className="space-y-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                    {editingId ? 'Editar prazo' : 'Adicionar prazo R1'}
                  </span>
                  <button
                    type="button"
                    onClick={resetMilestoneForm}
                    aria-label="Fechar formulário de prazo"
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="ms-titulo"
                      className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
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
                      className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ms-data"
                      className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
                    >
                      Data
                    </label>
                    <input
                      id="ms-data"
                      type="date"
                      required
                      value={msDateIso}
                      onChange={(e) => setMsDateIso(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ms-cat"
                      className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
                    >
                      Categoria
                    </label>
                    <select
                      id="ms-cat"
                      value={msCategoria}
                      onChange={(e) => setMsCategoria(e.target.value as R1Milestone['categoria'])}
                      className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
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
                      className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
                    >
                      Observação (opcional)
                    </label>
                    <input
                      id="ms-nota"
                      type="text"
                      value={msNota}
                      onChange={(e) => setMsNota(e.target.value)}
                      placeholder="Ex.: Conferir PDF único e autenticidade das declarações."
                      className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetMilestoneForm}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {editingId ? 'Salvar alterações' : 'Adicionar'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
              {milestones.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
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
                          <span className="text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                            {milestone.titulo}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-[#6B7280]">
                            {MILESTONE_CAT_LABEL[milestone.categoria]}
                          </span>
                        </div>
                        {milestone.nota && (
                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
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
                                  : 'text-[#0F766E] dark:text-[#2DD4BF]'
                            }`}
                          >
                            {label}
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-[#6B7280]">
                            {formatDateBr(milestone.dateIso)}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditMilestone(milestone)}
                            aria-label={`Editar ${milestone.titulo}`}
                            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
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
                            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-red-400"
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
              BLOCO 2 — MATRIZ UNIFICADA DE CURRÍCULO (EDITAIS 2027 · 3 BANCAS)
             ================================================================ */}
          <section
            aria-labelledby="matriz-curriculo-heading"
            className="space-y-5 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2
                  id="matriz-curriculo-heading"
                  className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
                >
                  Matriz Unificada de Currículo
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
                  Baremas auditados (Editais 2027) para USP-SP, USP-RP e UNICAMP com placar comprovado vs. projetado.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Conceito ENAMED da faculdade"
                  title="Aplica fator 1,0×/1,1×/1,2× na USP-SP e +0,3/+0,4/+0,5 pt no Histórico da USP-RP (Editais 2027)"
                  className="inline-flex items-center rounded-lg border border-zinc-200/80 bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.08] dark:bg-[#15181F]"
                >
                  <span className="px-2 text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]">
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
                            ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                            : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        {concept} ({mult})
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleLoadBaselineInventory}
                  title="Preenche/mescla os itens conhecidos do seu inventário (FMRP, Psicologia, IC, artigos, Liga, Natação e 4 PDFs da pasta Certificados) sem apagar suas notas."
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Carregar meu inventário
                </button>

                <button
                  type="button"
                  onClick={handleCopyScoreMarkdown}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-zinc-50 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
                >
                  {copiedScore ? (
                    <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedScore ? 'Copiado' : 'Copiar placar (.md)'}
                </button>
              </div>
            </div>

            {/* Placar simultâneo das 3 bancas — Comprovado (PDF) vs. Projetado + Equivalência em Questões */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {BANK_ORDER.map((bankId) => {
                const summary = curriculumEval.banks[bankId];
                const cfg = CURRICULUM_BANKS_CONFIG[bankId];
                const pctRounded = Math.round(summary.pct);
                const confirmedPctRounded = Math.round(summary.confirmedPct);
                const isHighScore = pctRounded >= 80;
                return (
                  <div
                    key={bankId}
                    className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold tracking-wide text-zinc-950 dark:text-white">
                        {summary.sigla}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                        {cfg.psiquiatriaPesos}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-white">
                          {formatScore(summary.finalScore, summary.escalaMax)}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
                          / {summary.escalaMax}
                        </span>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                          isHighScore
                            ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                            : 'bg-teal-500/12 text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]'
                        }`}
                      >
                        {pctRounded}%
                      </span>
                    </div>

                    {/* Barra dupla: Projetado (suave) + Comprovado em PDF (sólido) */}
                    <div
                      className="relative mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/[0.10]"
                      title={`Comprovado em PDF: ${formatScore(summary.confirmedScore, summary.escalaMax)} (${confirmedPctRounded}%) · Projetado: ${formatScore(summary.finalScore, summary.escalaMax)} (${pctRounded}%)`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[#0F766E]/30 transition-all duration-300 dark:bg-[#2DD4BF]/30"
                        style={{ width: `${Math.min(100, Math.max(0, summary.pct))}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
                          isHighScore
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : 'bg-[#0F766E] dark:bg-[#2DD4BF]'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, summary.confirmedPct))}%` }}
                      />
                    </div>

                    {/* Linha Comprovado vs Sem PDF */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="font-mono tabular-nums text-zinc-700 dark:text-[#D1D5DB]">
                        PDF pronto:{' '}
                        <strong className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                          {formatScore(summary.confirmedScore, summary.escalaMax)}
                        </strong>
                      </span>
                      {summary.unconfirmedGap > 0 ? (
                        <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          +{formatScore(summary.unconfirmedGap, summary.escalaMax)} sem PDF
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          100% comprovado
                        </span>
                      )}
                    </div>

                    {/* Impacto real na nota final de Psiquiatria + Equivalência em questões */}
                    <div className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-600 dark:bg-white/[0.04] dark:text-[#9CA3AF]">
                      <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                        <span>
                          Faltam {formatScore(summary.missingToMax, summary.escalaMax)} pts
                        </span>
                        <span
                          className="font-semibold text-zinc-800 dark:text-[#E5E7EB]"
                          title={`Déficit de ${formatScore(summary.finalGradeImpactMissing, 100)} pts na nota final (0–100) de Psiquiatria`}
                        >
                          {formatQuestionsEq(summary.equivalentFirstPhaseQuestions)} na 1ªF
                        </span>
                      </div>
                      {bankId === 'usp_sp' && (
                        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-[#6B7280]">
                          Bruto {formatScore(summary.rawSubtotal, 100)} × {summary.multiplier.toFixed(1)} (ENAMED {enamedConcept})
                        </div>
                      )}
                      {bankId === 'usp_rp' && summary.enamedBonusPoints > 0 && (
                        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-[#6B7280]">
                          Inclui +{formatScore(summary.enamedBonusPoints, 10)} pt ENAMED {enamedConcept} no Histórico
                        </div>
                      )}
                    </div>

                    {showBlocks && (
                      <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-2.5 dark:border-white/[0.06]">
                        <ul className="space-y-1">
                          {summary.blocks.map((blk) => {
                            const hitCap = blk.cappedScore >= blk.maxPoints && blk.maxPoints > 0;
                            return (
                              <li
                                key={blk.blockId}
                                className="flex items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-[#9CA3AF]"
                              >
                                <span className="truncate">{blk.label}</span>
                                <span
                                  className={`shrink-0 font-mono tabular-nums ${
                                    hitCap
                                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                      : 'text-zinc-700 dark:text-[#D1D5DB]'
                                  }`}
                                >
                                  {formatScore(blk.cappedScore, summary.escalaMax)}/{blk.maxPoints}
                                </span>
                              </li>
                            );
                          })}
                        </ul>

                        <div className="rounded-lg border border-zinc-200/70 bg-[#FAFAFA] p-2 text-[11px] leading-relaxed text-zinc-600 dark:border-white/[0.06] dark:bg-[#0F1115] dark:text-[#9CA3AF]">
                          <div className="font-medium text-zinc-800 dark:text-[#D1D5DB]">
                            Regra de envio · {summary.sigla}
                          </div>
                          <p className="mt-0.5">{cfg.dicaEnvio}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
              <button
                type="button"
                onClick={() => setShowBlocks((prev) => !prev)}
                className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
              >
                {showBlocks ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showBlocks ? 'Ocultar blocos e regras de envio' : 'Ver detalhamento por bloco & regras de envio'}
              </button>

              <span className="font-mono tabular-nums">
                {curriculumEval.proofCounts.filledItems}/{curriculumEval.proofCounts.totalItems} preenchidos ·{' '}
                <span className="text-[#0F766E] dark:text-[#2DD4BF]">
                  {curriculumEval.proofCounts.pdf_pronto} PDF pronto
                </span>{' '}
                · {curriculumEval.proofCounts.em_andamento} em andamento ·{' '}
                <span className={curriculumEval.proofCounts.falta > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}>
                  {curriculumEval.proofCounts.falta} faltam PDF
                </span>
              </span>
            </div>

            {/* Bloco Top ROI — Onde ganhar mais pontos até 30/06/2027 respeitando tetos */}
            {roiOpportunities.length > 0 && (
              <div className="rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.09] dark:bg-[#15181F]">
                <button
                  type="button"
                  onClick={() => setShowRoi((prev) => !prev)}
                  aria-expanded={showRoi}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50/70 dark:hover:bg-[#1C2029]/60"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                    <div>
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">
                        Maiores alavancas de pontuação (ROI até 30/06/2027)
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                        Simulação real nas 3 bancas já descontando blocos no teto e fator ENAMED.
                      </div>
                    </div>
                  </div>
                  {showRoi ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 dark:text-[#6B7280]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-[#6B7280]" />
                  )}
                </button>

                {showRoi && (
                  <div className="divide-y divide-zinc-200/70 border-t border-zinc-200/80 dark:divide-white/[0.06] dark:border-white/[0.07]">
                    {roiOpportunities.map((opp, index) => {
                      const effortMeta = EFFORT_META[opp.effort];
                      return (
                        <div
                          key={opp.itemId}
                          className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-400 dark:text-[#6B7280]">
                                #{index + 1}
                              </span>
                              <span className="text-xs font-medium text-zinc-900 dark:text-[#F3F4F6]">
                                {opp.actionLabel}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${effortMeta.badgeClass}`}>
                                {effortMeta.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] tabular-nums sm:shrink-0">
                            {opp.deltaByBank.usp_sp > 0 && (
                              <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                                +{formatScore(opp.deltaByBank.usp_sp, 100)} USP-SP
                              </span>
                            )}
                            {opp.deltaByBank.usp_rp > 0 && (
                              <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                                +{formatScore(opp.deltaByBank.usp_rp, 10)} USP-RP
                              </span>
                            )}
                            {opp.deltaByBank.unicamp > 0 && (
                              <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                                +{formatScore(opp.deltaByBank.unicamp, 100)} UNICAMP
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Filtros de categoria e comprovante (bug corrigido: "Falta PDF" só conta itens preenchidos) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCatFilter('todas')}
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    catFilter === 'todas'
                      ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                      : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
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
                        ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                        : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]'
                    }`}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1 border-t border-zinc-200/70 pt-2 dark:border-white/[0.06]">
                <span className="mr-1 text-[11px] font-medium text-zinc-400 dark:text-[#6B7280]">
                  Dossiê:
                </span>
                {(
                  [
                    { id: 'todos', label: `Todos (${curriculumEval.proofCounts.totalItems})` },
                    { id: 'preenchidos', label: `Preenchidos (${curriculumEval.proofCounts.filledItems})` },
                    { id: 'falta', label: `Falta PDF (${curriculumEval.proofCounts.falta})` },
                    { id: 'em_andamento', label: `Em andamento (${curriculumEval.proofCounts.em_andamento})` },
                    { id: 'pdf_pronto', label: `PDF pronto (${curriculumEval.proofCounts.pdf_pronto})` },
                    { id: 'nao_feitos', label: `Não feitos (${curriculumEval.proofCounts.unfilledItems})` },
                  ] as Array<{ id: ProofFilterValue; label: string }>
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setProofFilter(st.id)}
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      proofFilter === st.id
                        ? 'bg-zinc-900 text-white dark:bg-[#F3F4F6] dark:text-[#0F1115]'
                        : 'text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista dos itens unificados com notas e regras de edital sob demanda */}
            <div className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.07] dark:border-white/[0.10] dark:bg-[#15181F]">
              {filteredCatalog.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
                  Nenhum item de currículo corresponde aos filtros selecionados.
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const entry = central6Ano.curriculumEntries?.[item.id];
                  const val = Math.min(item.maxInput, Math.max(0, Number(entry?.value) || 0));
                  const proofStatus: ProofStatus = entry?.proofStatus || 'falta';
                  const savedNote = entry?.notes?.trim() || '';
                  const step = item.step || 1;
                  const pts = curriculumEval.itemPointsByBank[item.id] || {
                    usp_sp: 0,
                    usp_rp: 0,
                    unicamp: 0,
                  };
                  const isEditingThisNote = editingNoteId === item.id;
                  const isRuleOpen = Boolean(expandedRuleIds[item.id]);

                  return (
                    <div key={item.id} className="px-4 py-3.5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                              {item.titulo}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleRuleDetails(item.id)}
                              aria-expanded={isRuleOpen}
                              aria-label={`Ver regras de edital para ${item.titulo}`}
                              title="Ver regras exatas dos editais 2027 para este item"
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                isRuleOpen
                                  ? 'bg-[#0F766E]/12 text-[#0F766E] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]'
                                  : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#6B7280] dark:hover:bg-[#1C2029] dark:hover:text-[#D1D5DB]'
                              }`}
                            >
                              <Info className="h-3 w-3" />
                              Regras
                            </button>
                          </div>

                          <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                            {item.descricao}
                          </p>

                          {/* Pontos por banca em texto tabular discreto */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
                            <span className={pts.usp_sp > 0 ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]' : ''}>
                              USP-SP: {item.rules.usp_sp ? `${formatScore(pts.usp_sp, 100)}/${item.rules.usp_sp.maxItemPoints}` : '—'}
                            </span>
                            <span className={pts.usp_rp > 0 ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]' : ''}>
                              USP-RP: {item.rules.usp_rp ? `${formatScore(pts.usp_rp, 10)}/${item.rules.usp_rp.maxItemPoints}` : '—'}
                            </span>
                            <span className={pts.unicamp > 0 ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]' : ''}>
                              UNICAMP: {item.rules.unicamp ? `${formatScore(pts.unicamp, 100)}/${item.rules.unicamp.maxItemPoints}` : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Controles de 1-2 cliques (valor + comprovante + nota) */}
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
                                  ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                  : 'border-zinc-200/90 bg-white text-zinc-600 hover:border-[#0F766E]/40 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40'
                              }`}
                            >
                              {val > 0 && <Check className="h-3.5 w-3.5" />}
                              {val > 0 ? 'Concluído' : 'Marcar'}
                            </button>
                          ) : (
                            <div className="inline-flex items-center rounded-md border border-zinc-200/90 bg-white dark:border-white/[0.09] dark:bg-[#0F1115]">
                              <button
                                type="button"
                                onClick={() =>
                                  cockpitStore.updateCurriculumEntry(item.id, {
                                    value: Math.max(0, Math.round((val - step) * 100) / 100),
                                  })
                                }
                                disabled={val <= 0}
                                aria-label={`Diminuir ${item.titulo}`}
                                className="p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-[4.5rem] px-2 text-center font-mono text-xs font-medium tabular-nums text-zinc-900 dark:text-[#F3F4F6]">
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
                                className="p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          <select
                            aria-label={`Status do comprovante para ${item.titulo}`}
                            value={proofStatus}
                            disabled={val <= 0}
                            onChange={(e) =>
                              cockpitStore.updateCurriculumEntry(item.id, {
                                proofStatus: e.target.value as ProofStatus,
                              })
                            }
                            className={`rounded-md border px-2 py-1.5 text-xs font-medium outline-none focus:border-[#0F766E] disabled:cursor-not-allowed disabled:opacity-45 dark:focus:border-[#2DD4BF] ${
                              val <= 0
                                ? 'border-zinc-200/70 bg-zinc-50 text-zinc-400 dark:border-white/[0.06] dark:bg-[#0F1115] dark:text-[#6B7280]'
                                : proofStatus === 'pdf_pronto'
                                  ? 'border-[#0F766E]/35 bg-[#0F766E]/[0.08] text-[#0F766E] dark:border-[#2DD4BF]/35 dark:bg-[#2DD4BF]/[0.10] dark:text-[#2DD4BF]'
                                  : proofStatus === 'em_andamento'
                                    ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                                    : 'border-red-200/90 bg-red-50/50 text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-300'
                            }`}
                          >
                            {PROOF_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => (isEditingThisNote ? setEditingNoteId(null) : openNoteEditor(item.id))}
                            aria-label={`Nota de comprovante para ${item.titulo}`}
                            title={savedNote ? 'Editar nota/evidência do comprovante' : 'Adicionar nota (DOI, nome do PDF, pendência)'}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                              savedNote || isEditingThisNote
                                ? 'border-[#0F766E]/35 bg-[#0F766E]/[0.06] text-[#0F766E] dark:border-[#2DD4BF]/35 dark:bg-[#2DD4BF]/[0.08] dark:text-[#2DD4BF]'
                                : 'border-zinc-200/90 bg-white text-zinc-500 hover:text-zinc-800 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                            }`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{savedNote ? 'Nota' : '+Nota'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Regras específicas dos editais 2027 (colapsável por item) */}
                      {isRuleOpen && (
                        <div className="mt-2.5 space-y-1 rounded-lg border border-zinc-200/70 bg-[#FAFAFA] px-3 py-2 text-[11px] text-zinc-600 dark:border-white/[0.06] dark:bg-[#0F1115] dark:text-[#9CA3AF]">
                          {BANK_ORDER.map((bId) => {
                            const rule = item.rules[bId];
                            return (
                              <div key={bId} className="flex flex-wrap gap-x-2">
                                <span className="font-mono font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                                  {CURRICULUM_BANKS_CONFIG[bId].sigla}:
                                </span>
                                <span>{rule ? rule.note : 'Não pontua neste edital.'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Nota salva inline ou editor compacto */}
                      {isEditingThisNote ? (
                        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveNoteEditor(item.id);
                              } else if (e.key === 'Escape') {
                                setEditingNoteId(null);
                              }
                            }}
                            placeholder="Ex.: PDF salvo em Certificados/..., DOI, pendência de assinatura CCEx..."
                            className="flex-1 rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="rounded-md px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveNoteEditor(item.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                            >
                              <Check className="h-3 w-3" />
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        savedNote && (
                          <button
                            type="button"
                            onClick={() => openNoteEditor(item.id)}
                            className="mt-2 block w-full rounded-md border border-zinc-200/70 bg-[#FAFAFA] px-2.5 py-1.5 text-left text-xs text-zinc-600 transition-colors hover:border-[#0F766E]/35 hover:text-zinc-900 dark:border-white/[0.06] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:border-[#2DD4BF]/35 dark:hover:text-[#F3F4F6]"
                          >
                            <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">Dossiê: </span>
                            {savedNote}
                          </button>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// ============================================================================
// SUB-ABA: PLANO 6º ANO (RODÍZIO ATIVO & FÉRIAS v3.1 · MARCHA DA SEMANA · REVISÃO SEMANAL)
// ============================================================================

function Plano6AnoTool({
  central6Ano,
  curriculumEval,
  onNavigateSextoAnoTab,
  onOpenR1Tab,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  curriculumEval: UnifiedCurriculumEvaluation;
  onNavigateSextoAnoTab?: (tab: SextoAnoTab) => void;
  onOpenR1Tab: () => void;
  onNotify: (msg: string) => void;
}) {
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const weekIso = useMemo(() => weekIsoOf(todayIso), [todayIso]);

  const activeRodizio = useMemo(
    () => RODIZIOS_6ANO.find((r) => r.id === central6Ano.rodizioId) || RODIZIOS_6ANO[0],
    [central6Ano.rodizioId]
  );
  const expectedRodizio = useMemo(() => resolveExpectedRodizioForDate(todayIso), [todayIso]);
  const currentFeriasWeekId = useMemo(() => resolveFeriasSemanaForDate(todayIso), [todayIso]);

  const [mapaOpen, setMapaOpen] = useState<boolean>(false);
  const [feriasOpen, setFeriasOpen] = useState<boolean>(
    activeRodizio.id === 'ferias' || todayIso <= '2027-01-24'
  );
  const [editingFoco, setEditingFoco] = useState<boolean>(false);
  const [draftAncora, setDraftAncora] = useState<string>('');
  const [draftTrilha, setDraftTrilha] = useState<string>('');

  const effectiveAncora = (central6Ano.focoSemanalAncora70 || '').trim() || activeRodizio.ancora70;
  const effectiveTrilha = (central6Ano.focoSemanalTrilha30 || '').trim() || activeRodizio.trilha30;
  const isFocoCustom =
    effectiveAncora !== activeRodizio.ancora70 || effectiveTrilha !== activeRodizio.trilha30;

  // Procedimentos reais do Logbook 3x para o rodízio ativo
  const rodizioProcs = useMemo(() => {
    return LOGBOOK_PROCEDIMENTOS_MATRIX.filter((p) => p.rodizioId === activeRodizio.id).map((proc) => ({
      proc,
      progress: computeProcedureProgress(proc.id, central6Ano),
    }));
  }, [activeRodizio.id, central6Ano]);

  const rodizioProcsDoneCount = useMemo(
    () => rodizioProcs.filter((p) => p.progress.rule3xDone).length,
    [rodizioProcs]
  );

  // Ponte viva com a Esteira v3.1 para o rodízio ativo
  const treinoRodizioDef = RODIZIOS_TREINO[activeRodizio.id] || null;

  // Marcha da semana sincronizada com a Esteira v3.1
  const treinoSemanaPesadaExplicit = central6Ano.treinoClinico?.internato?.semanaPesadaByWeek?.[weekIso];
  const activeMarchaId: MarchaId = useMemo(() => {
    if (treinoSemanaPesadaExplicit === true) {
      return central6Ano.marchaId === '1_sobrevivencia' ? '1_sobrevivencia' : '2_pesada';
    }
    if (treinoSemanaPesadaExplicit === false) {
      return '3_normal';
    }
    return OPERATIONAL_MARCHAS.includes(central6Ano.marchaId) ? central6Ano.marchaId : '3_normal';
  }, [central6Ano.marchaId, treinoSemanaPesadaExplicit]);

  const isEsteiraPesada = activeMarchaId === '2_pesada' || activeMarchaId === '1_sobrevivencia';

  // Indicadores vivos para a Revisão Semanal (Ritual de Domingo)
  const pendingChecarCount = useMemo(
    () => (central6Ano.treinoClinico?.naoPodePassar || []).filter((it) => !it.checado).length,
    [central6Ano.treinoClinico?.naoPodePassar]
  );

  const openBlindSpotsCount = useMemo(
    () =>
      (central6Ano.logbookEntries || []).filter(
        (e) => e.tipo === 'ponto_cego' && e.status !== 'resolvido'
      ).length,
    [central6Ano.logbookEntries]
  );

  const pendingCurriculumProofs =
    curriculumEval.proofCounts.falta + curriculumEval.proofCounts.em_andamento;
  const curriculumDeadlinePassed = todayIso > '2027-06-30';

  const ritualDoneMap = useMemo(
    () => getEffectiveRitualDoneMap(central6Ano, todayIso),
    [central6Ano, todayIso]
  );
  const ritualDoneCount = RITUAL_DOMINGO_DATA.filter((item) => Boolean(ritualDoneMap[item.id])).length;

  const handleSelectRodizio = (rodId: string) => {
    const target = RODIZIOS_6ANO.find((r) => r.id === rodId);
    if (!target) return;
    cockpitStore.selectRodizio(target.id);
    setEditingFoco(false);
    if (target.id === 'ferias') {
      setFeriasOpen(true);
    }
    setMapaOpen(false);
    onNotify(`Bloco ativo alterado para ${target.nome}.`);
  };

  const openFocoEditor = () => {
    setDraftAncora(effectiveAncora);
    setDraftTrilha(effectiveTrilha);
    setEditingFoco(true);
  };

  const handleSaveFoco = (e: React.FormEvent) => {
    e.preventDefault();
    cockpitStore.updateCentralContext({
      focoSemanalAncora70: draftAncora.trim() || activeRodizio.ancora70,
      focoSemanalTrilha30: draftTrilha.trim() || activeRodizio.trilha30,
    });
    setEditingFoco(false);
    onNotify('Foco semanal 70/30 atualizado.');
  };

  const handleRestoreFocoDefault = () => {
    cockpitStore.updateCentralContext({
      focoSemanalAncora70: activeRodizio.ancora70,
      focoSemanalTrilha30: activeRodizio.trilha30,
    });
    setEditingFoco(false);
    onNotify('Foco 70/30 restaurado para o padrão do bloco.');
  };

  const handleSelectMarcha = (marchaId: MarchaId) => {
    cockpitStore.setWeeklyMarcha(marchaId, todayIso);
    const label = MARCHAS_6ANO[marchaId]?.nome || marchaId;
    const syncedNote =
      marchaId === '3_normal'
        ? 'Esteira v3.1 em modo normal.'
        : 'Esteira v3.1 sincronizada para Semana Pesada.';
    onNotify(`${label} ativada. ${syncedNote}`);
  };

  return (
    <div className="space-y-10">
      {/* ====================================================================
          1. BLOCO / RODÍZIO ATIVO, PONTE v3.1, FÉRIAS & MAPA ANUAL
         ==================================================================== */}
      <section aria-labelledby="plano-rodizios-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1
              id="plano-rodizios-heading"
              className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
            >
              Rodízio Ativo &amp; Mapa do 6º Ano
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Controle o bloco atual, ajuste os subtemas 70/30 da semana e acompanhe Logbook 3x e Esteira v3.1.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMapaOpen((v) => !v)}
            aria-expanded={mapaOpen}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
          >
            {mapaOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Trocar bloco ({RODIZIOS_6ANO.length})
          </button>
        </div>

        {/* Aviso discreto se a data de hoje pertencer a outro bloco */}
        {expectedRodizio.id !== activeRodizio.id && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/25 dark:text-amber-200">
            <span>
              Pela data de hoje ({formatDateBr(todayIso)}), o bloco previsto é{' '}
              <strong className="font-semibold">{expectedRodizio.nome}</strong>.
            </span>
            <button
              type="button"
              onClick={() => handleSelectRodizio(expectedRodizio.id)}
              className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-800 dark:bg-amber-400 dark:text-[#0F1115] dark:hover:bg-amber-300"
            >
              Sincronizar com hoje
            </button>
          </div>
        )}

        {/* Mapa anual compacto (seletor único dos 10 blocos) */}
        {mapaOpen && (
          <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
            {RODIZIOS_6ANO.map((r) => {
              const isActive = r.id === activeRodizio.id;
              const isCalendarToday = r.id === expectedRodizio.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRodizio(r.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    isActive
                      ? 'bg-[#0F766E]/[0.06] dark:bg-[#2DD4BF]/[0.08]'
                      : 'hover:bg-zinc-50 dark:hover:bg-[#1C2029]/70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm ${
                          isActive
                            ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]'
                            : 'font-medium text-zinc-900 dark:text-[#F3F4F6]'
                        }`}
                      >
                        {r.nome}
                      </span>
                      {isActive && (
                        <span className="rounded bg-[#0F766E]/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F766E] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]">
                          Ativo
                        </span>
                      )}
                      {isCalendarToday && !isActive && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                          Previsto hoje
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      70%: {r.ancora70}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-[#6B7280]">
                    {r.periodo}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Cartão vivo do rodízio ativo */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200/70 pb-3.5 dark:border-white/[0.08]">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
                {activeRodizio.nome}
              </h2>
              <span className="font-mono text-xs tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                {activeRodizio.periodo}
              </span>
            </div>

            {!editingFoco && (
              <button
                type="button"
                onClick={openFocoEditor}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
              >
                <Pencil className="h-3 w-3" />
                Ajustar foco 70/30
              </button>
            )}
          </div>

          {/* Foco 70/30 (leitura limpa ou edição inline) */}
          {editingFoco ? (
            <form onSubmit={handleSaveFoco} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="plano-foco-70"
                    className="mb-1 block text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]"
                  >
                    Foco Âncora da Semana (70%)
                  </label>
                  <textarea
                    id="plano-foco-70"
                    rows={2}
                    value={draftAncora}
                    onChange={(e) => setDraftAncora(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="plano-foco-30"
                    className="mb-1 block text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]"
                  >
                    Trilha Paralela da Semana (30%)
                  </label>
                  <textarea
                    id="plano-foco-30"
                    rows={2}
                    value={draftTrilha}
                    onChange={(e) => setDraftTrilha(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF] dark:focus:bg-[#0F1115]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleRestoreFocoDefault}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurar padrão do bloco
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingFoco(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Salvar foco
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                  <span>Foco Âncora (70%)</span>
                  {isFocoCustom && (
                    <span className="rounded bg-teal-500/12 px-1.5 py-0.5 font-mono text-[10px] font-medium normal-case text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]">
                      Ajustado p/ semana
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                  {effectiveAncora}
                </p>
              </div>
              <div>
                <div className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                  Trilha Paralela (30%)
                </div>
                <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                  {effectiveTrilha}
                </p>
              </div>
            </div>
          )}

          {/* Ponte direta com a Esteira v3.1 (nos 8 rodízios do internato) */}
          {treinoRodizioDef && (
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                  Ponte Esteira v3.1 — Alvos &amp; [SERVIÇO]
                </span>
                {onNavigateSextoAnoTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateSextoAnoTab('teoria')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                  >
                    Abrir Esteira
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {treinoRodizioDef.alvos.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-md border border-zinc-200/80 bg-[#FAFAFA] px-2 py-0.5 text-xs text-zinc-700 dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#D1D5DB]"
                  >
                    {TREINO_SLUG_LABEL_MAP.get(slug) || slug}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
                <span className="font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                  Pedido [SERVIÇO] (Seg):
                </span>{' '}
                {treinoRodizioDef.pedidoServico}
              </p>
            </div>
          )}

          {/* Procedimentos reais do Logbook 3x (ou marcos práticos do bloco) */}
          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                  {rodizioProcs.length > 0 ? 'Procedimentos do bloco (Logbook 3x)' : 'Marcos práticos do bloco'}
                </span>
                {rodizioProcs.length > 0 && (
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                    {rodizioProcsDoneCount}/{rodizioProcs.length} em 3x
                  </span>
                )}
              </div>
              {rodizioProcs.length > 0 && onNavigateSextoAnoTab && (
                <button
                  type="button"
                  onClick={() => onNavigateSextoAnoTab('pratica')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                >
                  Abrir Logbook
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {rodizioProcs.length > 0 ? (
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {rodizioProcs.map(({ proc, progress }) => (
                  <li
                    key={proc.id}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm text-zinc-700 dark:text-[#D1D5DB]"
                  >
                    <span className="min-w-0 truncate">{proc.nome}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                        progress.rule3xDone
                          ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                          : progress.execCount > 0
                            ? 'bg-teal-500/12 text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                      }`}
                    >
                      {progress.stageLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-[#D1D5DB]">
                {activeRodizio.procedimentosAlvo.map((item) => (
                  <li key={item} className="flex items-baseline gap-2">
                    <span className="text-zinc-400 dark:text-[#6B7280]" aria-hidden="true">
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Cronograma de Férias alinhado à v3.1 (8 semanas — destaque automático pela data) */}
        <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
          <button
            type="button"
            onClick={() => setFeriasOpen((v) => !v)}
            aria-expanded={feriasOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-[#1C2029]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                  Cronograma de Férias v3.1 (8 Semanas)
                </span>
                {todayIso <= '2026-11-29' && (
                  <span className="rounded bg-teal-500/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]">
                    Piloto 21–29/11
                  </span>
                )}
                {currentFeriasWeekId && (
                  <span className="rounded bg-teal-500/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F766E] dark:bg-teal-400/15 dark:text-[#2DD4BF]">
                    {currentFeriasWeekId.toUpperCase()} ativa hoje
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                30/11/2026 a 24/01/2027 · Trilha teórica (Cirurgia/CTI/GO) + cadência real da Esteira v3.1
              </div>
            </div>
            {feriasOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 dark:text-[#6B7280]" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-[#6B7280]" />
            )}
          </button>

          {feriasOpen && (
            <div className="divide-y divide-zinc-200/70 border-t border-zinc-200/80 dark:divide-white/[0.06] dark:border-white/[0.07]">
              {FERIAS_SEMANAS.map((sem) => {
                const isCurrent = currentFeriasWeekId === sem.id;
                const isPast = todayIso > sem.ate;
                return (
                  <div
                    key={sem.id}
                    className={`px-4 py-3 ${
                      isCurrent
                        ? 'bg-[#0F766E]/[0.06] dark:bg-[#2DD4BF]/[0.08]'
                        : isPast
                          ? 'opacity-65'
                          : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isCurrent
                            ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                            : 'text-zinc-900 dark:text-[#F3F4F6]'
                        }`}
                      >
                        {sem.label}
                      </span>
                      {isCurrent && (
                        <span className="shrink-0 rounded bg-[#0F766E]/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F766E] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]">
                          Semana atual
                        </span>
                      )}
                      {!isCurrent && sem.isFreeWeek && (
                        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]">
                          Pausa total
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-[#9CA3AF]">
                      <div>
                        <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                          Teoria (Medway/MedQuest):
                        </span>{' '}
                        {sem.focoConteudo}
                      </div>
                      <div>
                        <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                          Esteira v3.1:
                        </span>{' '}
                        {sem.focoExames}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          2. MARCHA DA SEMANA (SINCRONIZADA COM A ESTEIRA v3.1)
         ==================================================================== */}
      <section
        aria-labelledby="plano-marcha-heading"
        className="space-y-4 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="plano-marcha-heading"
              className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
            >
              Marcha da Semana
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Calibre a carga da semana conforme seus plantões de 12h — sincronizado automaticamente com a Esteira v3.1.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
            Esteira ({formatDateBr(weekIso)}):{' '}
            <strong
              className={
                isEsteiraPesada
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#0F766E] dark:text-[#2DD4BF]'
              }
            >
              {isEsteiraPesada ? 'Semana pesada' : 'Modo normal'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {OPERATIONAL_MARCHAS.map((mId) => {
            const cfg = MARCHAS_6ANO[mId];
            const active = activeMarchaId === mId;
            return (
              <button
                key={mId}
                type="button"
                onClick={() => handleSelectMarcha(mId)}
                aria-pressed={active}
                className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-[#0F766E] bg-[#0F766E]/[0.06] dark:border-[#2DD4BF] dark:bg-[#2DD4BF]/[0.08]'
                    : 'border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-zinc-50 dark:border-white/[0.07] dark:bg-[#15181F] dark:hover:bg-[#1C2029]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      active
                        ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                        : 'text-zinc-900 dark:text-[#F3F4F6]'
                    }`}
                  >
                    {cfg.nome}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400 dark:text-[#6B7280]">
                    {cfg.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-[#9CA3AF]">
                  {cfg.resumo}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
          <strong className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
            Pós-plantão noturno é descanso integral
          </strong>{' '}
          (zero revisão leve e zero treino). Para marcar pós-plantão ou dia livre de hoje, use os controles diários em{' '}
          {onNavigateSextoAnoTab ? (
            <button
              type="button"
              onClick={() => onNavigateSextoAnoTab('teoria')}
              className="font-medium text-[#0F766E] underline-offset-2 hover:underline dark:text-[#2DD4BF]"
            >
              Treino &amp; Teoria
            </button>
          ) : (
            <span>Treino &amp; Teoria</span>
          )}
          .
        </p>
      </section>

      {/* ====================================================================
          3. REVISÃO SEMANAL (RITUAL DE DOMINGO — DADOS VIVOS & ATALHOS)
         ==================================================================== */}
      <section
        aria-labelledby="plano-ritual-heading"
        className="space-y-4 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="plano-ritual-heading"
                className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white"
              >
                Revisão Semanal (Ritual de Domingo)
              </h2>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                {ritualDoneCount}/{RITUAL_DOMINGO_DATA.length}
              </span>
              {central6Ano.ritualDomingoLastCompletedIso && (
                <span className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-[#6B7280]">
                  Último: {formatDateBr(central6Ano.ritualDomingoLastCompletedIso)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Checklist vivo de 15 minutos com sinais reais do app — reinicia automaticamente todo sábado.
            </p>
          </div>

          {ritualDoneCount > 0 && (
            <button
              type="button"
              onClick={() => {
                cockpitStore.resetRitualDomingo(todayIso);
                onNotify('Revisão semanal reiniciada.');
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar semana
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
          {RITUAL_DOMINGO_DATA.map((item, idx) => {
            const checked = Boolean(ritualDoneMap[item.id]);
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <label className="relative flex flex-1 cursor-pointer items-start gap-3">
                  <span
                    className={`relative mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                        : 'border-zinc-300 bg-white dark:border-white/[0.18] dark:bg-[#0F1115]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => cockpitStore.toggleRitualDomingoItem(item.id, todayIso)}
                      className="sr-only"
                    />
                    {checked && <Check className="h-3 w-3 stroke-[2.75]" />}
                  </span>
                  <span
                    className={`flex-1 text-sm leading-snug ${
                      checked
                        ? 'text-zinc-400 line-through dark:text-[#6B7280]'
                        : 'text-zinc-800 dark:text-[#F3F4F6]'
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-xs tabular-nums text-zinc-400 dark:text-[#6B7280]">
                      {idx + 1}.
                    </span>
                    {item.text}
                  </span>
                </label>

                {/* Sinais vivos e atalhos reais por passo */}
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-7 sm:pl-0">
                  {item.id === 'rit-escala' && (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700 dark:bg-white/[0.06] dark:text-[#D1D5DB]">
                      {MARCHAS_6ANO[activeMarchaId].nome}
                    </span>
                  )}

                  {item.id === 'rit-7030' && (
                    <button
                      type="button"
                      onClick={openFocoEditor}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200/90 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                    >
                      {isFocoCustom ? 'Ajustado · Editar' : 'Editar 70/30'}
                    </button>
                  )}

                  {item.id === 'rit-habito' && (
                    <>
                      {onNavigateSextoAnoTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateSextoAnoTab('teoria')}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${
                            pendingChecarCount > 0
                              ? 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:bg-amber-400/15 dark:text-amber-300'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {pendingChecarCount} [CHECAR]
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                      {onNavigateSextoAnoTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateSextoAnoTab('pratica')}
                          className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200/70 dark:bg-white/[0.06] dark:text-[#D1D5DB]"
                        >
                          {openBlindSpotsCount} Pontos Cegos
                          {rodizioProcs.length > 0 ? ` · ${rodizioProcsDoneCount}/${rodizioProcs.length} Logbook` : ''}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}

                  {item.id === 'rit-curriculo' && (
                    <button
                      type="button"
                      onClick={onOpenR1Tab}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${
                        curriculumDeadlinePassed
                          ? 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                          : pendingCurriculumProofs > 0
                            ? 'bg-teal-500/12 text-[#0F766E] hover:bg-teal-500/20 dark:bg-teal-400/15 dark:text-[#2DD4BF]'
                            : 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                      }`}
                    >
                      {curriculumDeadlinePassed
                        ? 'Corte encerrado'
                        : pendingCurriculumProofs > 0
                          ? `${pendingCurriculumProofs} pendentes`
                          : 'Dossiê em dia ✓'}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
