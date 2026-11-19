import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  CURRICULUM_BANKS_CONFIG,
  CURRICULUM_CATEGORIES_META,
  FERIAS_SEMANAS,
  RITUAL_DOMINGO_DATA,
  RODIZIOS_6ANO,
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

type PlanoR1SubTab = 'plano' | 'r1';

interface R1CurriculoViewProps {
  central6Ano: Central6AnoState;
  onNotify: (message: string) => void;
}

const PLANO_R1_SUB_TABS: Array<{ id: PlanoR1SubTab; label: string }> = [
  { id: 'plano', label: 'Plano 6º Ano' },
  { id: 'r1', label: 'R1 & Currículo' },
];

const ARQUETIPOS_DIA: Array<{
  id: Central6AnoState['arquetipoId'];
  titulo: string;
  ritmo: string;
  foco: string;
  postura: string;
}> = [
  {
    id: 'ferias_4h',
    titulo: 'Férias 4h',
    ritmo: '4h líquidas/dia',
    foco: 'Base prática + Exames + OSCE',
    postura: '2h conteúdo âncora (Cirurgia/CTI/GO) + 1h leitura sistemática de exames + 1h prática de habilidades ou anamnese.',
  },
  {
    id: 'dia_cheio',
    titulo: 'Dia Cheio',
    ritmo: 'Turnos + bloco enxuto',
    foco: 'Hospital + manutenção 70/30',
    postura: 'Foco 100% no paciente durante o hospital; à noite, 1 bloco objetivo de questões do rodízio + Anki nas micro-janelas.',
  },
  {
    id: 'pe_vespera',
    titulo: 'Véspera',
    ritmo: 'Revisão de alta retenção',
    foco: 'Pontos Cegos + checklists',
    postura: 'Zero matéria pesada nova. Revisar Pontos Cegos abertos, checklists Pré-Porta e dormir cedo.',
  },
  {
    id: 'plantao_12h',
    titulo: 'Plantão 12h',
    ritmo: 'Energia preservada',
    foco: 'Execução clínica + micro-revisão',
    postura: 'Cochilo profilático antes do plantão noturno; no plantão, capturar Pontos Cegos e registrar procedimentos no Logbook.',
  },
  {
    id: 'pos_plantao',
    titulo: 'Pós-Plantão = Descanso',
    ritmo: 'Sono protegido',
    foco: 'Recuperação cognitiva',
    postura: 'Zero meta pesada de teoria ou questões. Priorize sono de recuperação; no máximo Anki leve (≤ 15 min) sem culpa.',
  },
  {
    id: 'fds',
    titulo: 'Fim de Semana',
    ritmo: 'Blocos longos + Ritual',
    foco: 'Tração 70/30 + Trilha paralela',
    postura: 'Janela principal para fechar a trilha paralela 30%, fazer simulado/imagens puras e executar o Ritual de Domingo.',
  },
];

const RITUAL_CLEAN_COPY: Record<string, string> = {
  'rit-escala': 'Revisar a escala real da semana (turnos, plantões noturnos e folgas) e alinhar o Arquétipo de Dia.',
  'rit-7030': 'Definir os subtemas prioritários da semana: 70% Rodízio-Âncora + 30% Trilha Paralela R1.',
  'rit-habito': 'Revisar os Pontos Cegos pendentes em Prática e atualizar o Logbook 3x.',
  'rit-curriculo': 'Conferir 1 pendência de comprovante PDF na matriz R1 & Currículo.',
};

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
  const [subTab, setSubTab] = useState<PlanoR1SubTab>('plano');

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
    <main className="h-[calc(100vh-3.25rem)] overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de sub-abas limpa: Plano 6º Ano | R1 & Currículo */}
      <div className="sticky top-0 z-20 border-b border-zinc-200/80 bg-[#FAFAFA]/95 backdrop-blur-sm dark:border-white/[0.07] dark:bg-[#0F1115]/95">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 sm:px-8">
          {PLANO_R1_SUB_TABS.map((tab) => {
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
          <Plano6AnoTool central6Ano={central6Ano} onNotify={onNotify} />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-8 sm:py-8">
          {/* ================================================================
              BLOCO 1 — PRAZOS & CICLOS R1
             ================================================================ */}
          <section aria-labelledby="r1-prazos-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1
                id="r1-prazos-heading"
                className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]"
              >
                Prazos & Ciclos R1
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
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
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo prazo
            </button>
          </div>

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
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
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
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
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
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
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
                    className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] focus:bg-white dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
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

          <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
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
            BLOCO 2 — MATRIZ UNIFICADA DE CURRÍCULO (3 BANCAS)
           ================================================================ */}
        <section
          aria-labelledby="matriz-curriculo-heading"
          className="space-y-5 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                id="matriz-curriculo-heading"
                className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]"
              >
                Matriz Unificada de Currículo
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
                Preencha uma vez e acompanhe a pontuação simultânea em USP-SP, USP-RP e UNICAMP.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Conceito ENAMED"
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

          {/* Placar simultâneo das 3 bancas */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {BANK_ORDER.map((bankId) => {
              const summary = curriculumEval.banks[bankId];
              const cfg = CURRICULUM_BANKS_CONFIG[bankId];
              return (
                <div
                  key={bankId}
                  className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-zinc-700 dark:text-[#D1D5DB]">
                      {summary.sigla}
                    </span>
                    <span className="text-[11px] text-zinc-400 dark:text-[#6B7280]">
                      {cfg.pesoNotaFinal}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-[#F3F4F6]">
                      {formatScore(summary.finalScore, summary.escalaMax)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-400 dark:text-[#6B7280]">
                      / {summary.escalaMax}
                    </span>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-[#0F766E] transition-all duration-300 dark:bg-[#2DD4BF]"
                      style={{ width: `${summary.pct}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
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
                    <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-2.5 dark:border-white/[0.06]">
                      {summary.blocks.map((blk) => (
                        <li
                          key={blk.blockId}
                          className="flex items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-[#9CA3AF]"
                        >
                          <span className="truncate">{blk.label}</span>
                          <span className="shrink-0 font-mono tabular-nums text-zinc-700 dark:text-[#D1D5DB]">
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
            <button
              type="button"
              onClick={() => setShowBlocks((prev) => !prev)}
              className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
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
                Comprovante:
              </span>
              {(
                [
                  { id: 'todos', label: 'Todos' },
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
                      ? 'bg-zinc-900 text-white dark:bg-[#F3F4F6] dark:text-[#0F1115]'
                      : 'text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela / Lista limpa dos 20 itens */}
          <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
            {filteredCatalog.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-[#9CA3AF]">
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
                      <div className="text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                        {item.titulo}
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
                        onChange={(e) =>
                          cockpitStore.updateCurriculumEntry(item.id, {
                            proofStatus: e.target.value as ProofStatus,
                          })
                        }
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF] ${
                          proofStatus === 'pdf_pronto'
                            ? 'border-[#0F766E]/35 bg-[#0F766E]/[0.08] text-[#0F766E] dark:border-[#2DD4BF]/35 dark:bg-[#2DD4BF]/[0.10] dark:text-[#2DD4BF]'
                            : proofStatus === 'em_andamento'
                              ? 'border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                              : 'border-zinc-200/90 bg-white text-zinc-600 dark:border-white/[0.09] dark:bg-[#0F1115] dark:text-[#9CA3AF]'
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
      )}
    </main>
  );
}

// ============================================================================
// SUB-ABA: PLANO 6º ANO (RODÍZIOS & FÉRIAS · ARQUÉTIPOS DE DIA · RITUAL DE DOMINGO)
// ============================================================================

function Plano6AnoTool({
  central6Ano,
  onNotify,
}: {
  central6Ano: Central6AnoState;
  onNotify: (msg: string) => void;
}) {
  const activeRodizio = useMemo(
    () => RODIZIOS_6ANO.find((r) => r.id === central6Ano.rodizioId) || RODIZIOS_6ANO[0],
    [central6Ano.rodizioId]
  );
  const [feriasOpen, setFeriasOpen] = useState<boolean>(activeRodizio.id === 'ferias');

  const ritualDoneMap = central6Ano.ritualDomingoDoneIds || {};
  const ritualDoneCount = RITUAL_DOMINGO_DATA.filter((item) => Boolean(ritualDoneMap[item.id])).length;

  const handleSelectRodizio = (rodId: string) => {
    const target = RODIZIOS_6ANO.find((r) => r.id === rodId);
    if (!target) return;
    cockpitStore.updateCentralContext({
      rodizioId: target.id,
      focoSemanalAncora70: target.ancora70,
      microHabitoSemanal: target.microHabitoSugerido,
    });
    if (target.id === 'ferias') {
      setFeriasOpen(true);
    }
    onNotify(`Bloco ativo alterado para ${target.nome}.`);
  };

  return (
    <div className="space-y-10">
      {/* 1. BLOCOS / RODÍZIOS DO 6º ANO & ESTUDOS NAS FÉRIAS */}
      <section aria-labelledby="plano-rodizios-heading" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              id="plano-rodizios-heading"
              className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]"
            >
              Blocos &amp; Rodízios do 6º Ano
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Consulte o mapa anual de rodízios (70% âncora / 30% trilha) e ajuste o bloco atual.
            </p>
          </div>

          <div className="sm:w-72">
            <label
              htmlFor="plano-rodizio-select"
              className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
            >
              Bloco / rodízio ativo
            </label>
            <select
              id="plano-rodizio-select"
              value={activeRodizio.id}
              onChange={(e) => handleSelectRodizio(e.target.value)}
              className="w-full rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-xs font-medium text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none focus:border-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
            >
              {RODIZIOS_6ANO.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cartão detalhado do rodízio selecionado */}
        <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-3.5 dark:border-white/[0.06]">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-[#F3F4F6]">
              {activeRodizio.nome}
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
              {activeRodizio.periodo}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Foco Âncora (70%)
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                {activeRodizio.ancora70}
              </p>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Trilha Paralela (30%)
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-[#D1D5DB]">
                {activeRodizio.trilha30}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 md:grid-cols-2 dark:border-white/[0.06]">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Procedimentos-alvo do bloco
              </div>
              <ul className="mt-1.5 space-y-1 text-sm text-zinc-700 dark:text-[#D1D5DB]">
                {activeRodizio.procedimentosAlvo.map((proc) => (
                  <li key={proc} className="flex items-baseline gap-2">
                    <span className="text-zinc-400 dark:text-[#6B7280]" aria-hidden="true">
                      •
                    </span>
                    <span>{proc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                Micro-hábito sugerido
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                {activeRodizio.microHabitoSugerido}
              </p>
            </div>
          </div>
        </div>

        {/* Lista panorâmica rápida dos 10 blocos */}
        <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:divide-white/[0.06] dark:border-white/[0.07] dark:bg-[#15181F]">
          {RODIZIOS_6ANO.map((r) => {
            const isActive = r.id === activeRodizio.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelectRodizio(r.id)}
                className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  isActive
                    ? 'bg-[#0F766E]/[0.06] dark:bg-[#2DD4BF]/[0.08]'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#1C2029]/70'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm ${
                      isActive
                        ? 'font-semibold text-[#0F766E] dark:text-[#2DD4BF]'
                        : 'font-medium text-zinc-900 dark:text-[#F3F4F6]'
                    }`}
                  >
                    {r.nome}
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

        {/* Cronograma de Estudos nas Férias (8 semanas) */}
        <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
          <button
            type="button"
            onClick={() => setFeriasOpen((v) => !v)}
            aria-expanded={feriasOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-[#1C2029]"
          >
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                Estudos nas Férias — Cronograma de 8 Semanas
              </div>
              <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                30/11/2026 a 24/01/2027 · Clique em uma semana para marcar a semana ativa
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
                const isSelected = central6Ano.feriasSemana === sem.id;
                const cleanLabel = sem.label.replace(/🏖️\s*/g, '');
                return (
                  <button
                    key={sem.id}
                    type="button"
                    onClick={() => {
                      cockpitStore.updateCentralContext({ feriasSemana: sem.id });
                      onNotify(`Semana de férias marcada: ${sem.id.toUpperCase()}.`);
                    }}
                    className={`block w-full px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#0F766E]/[0.06] dark:bg-[#2DD4BF]/[0.08]'
                        : 'hover:bg-zinc-50 dark:hover:bg-[#1C2029]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                            : 'text-zinc-900 dark:text-[#F3F4F6]'
                        }`}
                      >
                        {cleanLabel}
                      </span>
                      {isSelected && (
                        <span className="shrink-0 font-mono text-[11px] font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                          Ativa
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-[#9CA3AF]">
                      <div>
                        <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                          Conteúdo:
                        </span>{' '}
                        {sem.focoConteudo}
                      </div>
                      {!sem.isFreeWeek && (
                        <div>
                          <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                            Exames:
                          </span>{' '}
                          {sem.focoExames}
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                          Prática:
                        </span>{' '}
                        {sem.focoHabilidade}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 2. ARQUÉTIPOS DE DIA */}
      <section
        aria-labelledby="plano-arquetipos-heading"
        className="space-y-4 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
      >
        <div>
          <h2
            id="plano-arquetipos-heading"
            className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]"
          >
            Arquétipos de Dia
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
            Escolha a postura operacional conforme a carga real de turnos e plantões — sem culpa em dia pesado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ARQUETIPOS_DIA.map((arq) => {
            const active = central6Ano.arquetipoId === arq.id;
            return (
              <button
                key={arq.id}
                type="button"
                onClick={() => {
                  cockpitStore.updateCentralContext({ arquetipoId: arq.id });
                  onNotify(`Arquétipo ativo: ${arq.titulo}.`);
                }}
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
                    {arq.titulo}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400 dark:text-[#6B7280]">
                    {arq.ritmo}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium text-zinc-700 dark:text-[#D1D5DB]">
                  {arq.foco}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-[#9CA3AF]">
                  {arq.postura}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. RITUAL DE DOMINGO */}
      <section
        aria-labelledby="plano-ritual-heading"
        className="space-y-4 border-t border-zinc-200/80 pt-8 dark:border-white/[0.07]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="plano-ritual-heading"
                className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-[#F3F4F6]"
              >
                Ritual de Domingo
              </h2>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
                {ritualDoneCount}/{RITUAL_DOMINGO_DATA.length}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-[#9CA3AF]">
              Checklist semanal de 15 minutos para alinhar rodízio, pontos cegos e currículo.
            </p>
          </div>

          {ritualDoneCount > 0 && (
            <button
              type="button"
              onClick={() => {
                cockpitStore.resetRitualDomingo();
                onNotify('Ritual de Domingo reiniciado para a nova semana.');
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
            const displayText = RITUAL_CLEAN_COPY[item.id] || item.text.replace(/^\d+\.\s*/, '');
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-50/70 dark:hover:bg-[#1C2029]/60"
              >
                <span
                  className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                    checked
                      ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                      : 'border-zinc-300 bg-white dark:border-white/[0.18] dark:bg-[#0F1115]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => cockpitStore.toggleRitualDomingoItem(item.id)}
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
                  {displayText}
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
