import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  FileDown,
  Lock,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Central6AnoState } from '../data/central6ano_data.ts';
import {
  ARQUETIPOS_E3,
  CENARIOS_E4,
  FRASE_BASE_SERVICO,
  QUEIXAS_E1,
  type AmbienteE1,
  type AmbienteE3,
  type AmbienteE4,
  type Eixo,
  type FonteTipo,
  type NaoPodePassarItem,
  type Passo,
  type Pemc,
  type Score,
  type SN,
  type TipoLog,
} from '../data/treino_clinico_data.ts';
import { HAB_PROTOCOLS } from '../data/protocolsRepo.ts';
import {
  buildPromptA,
  buildPromptB,
  buildPromptC,
  buildPromptD1,
  buildPromptD2,
  computeContingencia10Jan,
  computeDominioE1,
  computeDominioE3E4,
  computePilotoStatus,
  computeRelatorioBaseline,
  computeTreinoMetrics,
  E1_BY_SLUG,
  E3_BY_SLUG,
  E4_BY_SLUG,
  findCatalogItem,
  formatDateDDMM,
  formatDateDDMMYYYY,
  formatLogLine,
  formatLogMarkdown,
  formatNaoPodePassarMarkdown,
  getBlocoMacro,
  habIdsDe,
  mecanismosUsadosDe,
  migrateTreinoClinicoState,
  parseLogLineFromGemini,
  proximosPassos,
  rodizioAtivo,
  sortLogsChrono,
  sugerirAmbienteE3,
  todayIsoLocal,
  weekIsoOf,
} from '../engine/treinoClinico.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';

interface TreinoClinicoViewProps {
  central6Ano: Central6AnoState;
  onOpenPrePorta: (habId: string) => void;
  onNotify: (msg: string) => void;
}

type LeftSection = 'esteira' | 'e1' | 'e3' | 'e4' | 'log';

const HAB_BY_ID = new Map(HAB_PROTOCOLS.map((h) => [h.id, h]));

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente: {
    label: 'Pendente',
    cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]',
  },
  em_treino: {
    label: 'Em treino',
    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  com_pemc: {
    label: 'Com PEMC',
    cls: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  dominada: {
    label: 'Dominada',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  revisar: {
    label: 'Revisar (~21d)',
    cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  },
};

const BLOCO_LABEL: Record<string, string> = {
  BLOCO0_PILOTO: 'Bloco 0 · Piloto (21–29/nov)',
  BLOCO1_FERIAS: 'Bloco 1 · Férias (30/nov–24/jan)',
  BLOCO2_INTERNATO: 'Bloco 2 · Internato (25/jan+)',
};

const ORIGEM_LABEL: Record<string, string> = {
  piloto: 'Piloto',
  fila_primeira_passada: '1ª passada',
  reserva: 'Reserva',
  reteste: 'Reteste',
  confirmacao: 'Confirmação',
  manutencao: 'Manutenção ~21d',
  servico: 'Apontamento [SERVIÇO]',
  rodizio: 'Alvo do rodízio',
  pin_visual: 'Bloco visual',
  fallback: 'Manutenção geral',
  baseline: 'Baseline cego',
};

export function TreinoClinicoView({
  central6Ano,
  onOpenPrePorta,
  onNotify,
}: TreinoClinicoViewProps) {
  const treino = useMemo(
    () => migrateTreinoClinicoState(central6Ano.treinoClinico),
    [central6Ano.treinoClinico]
  );

  const [todayIso, setTodayIso] = useState<string>(() => todayIsoLocal());
  const [section, setSection] = useState<LeftSection>('esteira');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedE1Slug, setSelectedE1Slug] = useState<string>(QUEIXAS_E1[0].slug);
  const [selectedE3Slug, setSelectedE3Slug] = useState<string>(ARQUETIPOS_E3[0].slug);
  const [selectedE4Slug, setSelectedE4Slug] = useState<string>(CENARIOS_E4[0].slug);
  const [logFilter, setLogFilter] = useState<'todos' | TipoLog>('todos');

  // Estados efêmeros para montagem de prompts (CASO_FIXO nunca persiste!)
  const [casoFixoMasked, setCasoFixoMasked] = useState('');
  const [ambienteE1Sel, setAmbienteE1Sel] = useState<AmbienteE1>('UPA com retaguarda');
  const [ambienteE4Sel, setAmbienteE4Sel] = useState<AmbienteE4>('UPA com sala vermelha');
  const [d2Eixo, setD2Eixo] = useState<Eixo>('E1');
  const [d2Relato, setD2Relato] = useState('');

  // Import rápido da linha do Gemini
  const [geminiLineRaw, setGeminiLineRaw] = useState('');
  const [quickMin, setQuickMin] = useState('25');
  const [quickIaPista, setQuickIaPista] = useState<'N' | 'S'>('N');
  const [quickErroCritico, setQuickErroCritico] = useState(false);
  const [quickRefacaoPendente, setQuickRefacaoPendente] = useState(false);
  const [quickLinha2min, setQuickLinha2min] = useState(true);
  const [quickBaselineHint, setQuickBaselineHint] = useState<'' | 'A' | 'B'>('');
  const [importError, setImportError] = useState<string | null>(null);

  // Registro rápido de SERVIÇO / GRAVAÇÃO
  const [servicoSlug, setServicoSlug] = useState('dor-toracica');
  const [servicoResultado, setServicoResultado] = useState<'apontamento' | 'recusa'>('apontamento');
  const [servicoTexto, setServicoTexto] = useState('');
  const [gravSlug, setGravSlug] = useState('dor-toracica');
  const [gravMuletas, setGravMuletas] = useState('3');
  const [gravAjuste, setGravAjuste] = useState('pausa limpa de 1s');

  // NPP: adicionar e checar fonte primária
  const [nppNovoTexto, setNppNovoTexto] = useState('');
  const [nppOrigemId, setNppOrigemId] = useState('');
  const [checkingNppId, setCheckingNppId] = useState<string | null>(null);
  const [checkFonteTipo, setCheckFonteTipo] = useState<FonteTipo>('diretriz');
  const [checkFonteRef, setCheckFonteRef] = useState('');

  const bloco = useMemo(() => getBlocoMacro(todayIso), [todayIso]);
  const weekIso = useMemo(() => weekIsoOf(todayIso), [todayIso]);
  const rodizio = useMemo(() => rodizioAtivo(todayIso, central6Ano), [todayIso, central6Ano]);
  const metrics = useMemo(() => computeTreinoMetrics(treino, todayIso), [treino, todayIso]);
  const passosHoje = useMemo(
    () => proximosPassos(todayIso, treino, central6Ano),
    [todayIso, treino, central6Ano]
  );
  const pilotoStatuses = useMemo(
    () => computePilotoStatus(treino, todayIso),
    [treino, todayIso]
  );
  const contingencia = useMemo(
    () => computeContingencia10Jan(treino, todayIso),
    [treino, todayIso]
  );
  const relatorioBaseline = useMemo(() => computeRelatorioBaseline(treino), [treino]);

  const handleCopy = async (text: string, msg: string) => {
    const ok = await copyToClipboard(text);
    onNotify(ok ? msg : 'Não foi possível copiar para a área de transferência.');
  };

  const handleImportGeminiLine = (overrideBaseline?: 'A' | 'B') => {
    setImportError(null);
    const hint = overrideBaseline || (quickBaselineHint || undefined);
    const parsed = parseLogLineFromGemini(geminiLineRaw, todayIso, hint);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    const d = parsed.draft;
    const minVal = d.minPendente ? parseInt(quickMin, 10) : d.min;
    const pistaVal = d.iaPistaPendente ? quickIaPista === 'S' : d.iaPista;

    const res = cockpitStore.addTreinoLogEntry({
      dateIso: d.dateIso,
      tipo: d.tipo,
      slug: d.slug,
      mecanismo: d.mecanismo,
      ambiente: d.ambiente,
      rodizioId: d.rodizioId,
      min: Number.isFinite(minVal) ? minVal : null,
      h3Bloco: d.h3Bloco,
      pemc: d.pemc,
      score: d.score,
      iaPista: d.tipo === 'Micro' || d.tipo === 'SERVIÇO' || d.tipo === 'GRAVAÇÃO' ? null : pistaVal,
      baselineFase: d.baselineFase,
      avaliavel: true,
      erroCritico: quickErroCritico,
      refacaoIntegralPendente: d.tipo === 'Nova' ? quickRefacaoPendente : false,
      atritoE2: null,
      servicoResultado: null,
      linhaEm2min: bloco === 'BLOCO0_PILOTO' ? quickLinha2min : null,
      vereditoIA: d.vereditoIA,
    });

    if (!res.ok) {
      setImportError(res.error);
      return;
    }

    setGeminiLineRaw('');
    setQuickErroCritico(false);
    setQuickRefacaoPendente(false);
    const warnSuffix = res.warnings.length > 0 ? ` · Aviso: ${res.warnings[0]}` : '';
    onNotify(`Sessão registrada (${res.entry.veredito})${warnSuffix}`);
  };

  const handleSaveServico = () => {
    const res = cockpitStore.addTreinoLogEntry({
      dateIso: todayIso,
      tipo: 'SERVIÇO',
      slug: servicoSlug,
      mecanismo: null,
      ambiente: null,
      rodizioId: rodizio?.id || null,
      min: 5,
      h3Bloco: 'NA',
      pemc:
        servicoResultado === 'recusa'
          ? { kind: 'nenhuma' }
          : servicoTexto.trim()
            ? { kind: 'omissao', texto: servicoTexto.trim() }
            : { kind: 'nenhuma' },
      score: { kind: 'NA' },
      iaPista: null,
      baselineFase: null,
      avaliavel: true,
      erroCritico: false,
      refacaoIntegralPendente: false,
      atritoE2: null,
      servicoResultado,
      linhaEm2min: null,
      vereditoIA: null,
    });
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    setServicoTexto('');
    onNotify('Observação [SERVIÇO] registrada.');
  };

  const handleSaveGravacao = () => {
    const res = cockpitStore.addTreinoLogEntry({
      dateIso: todayIso,
      tipo: 'GRAVAÇÃO',
      slug: gravSlug,
      mecanismo: null,
      ambiente: null,
      rodizioId: null,
      min: 5,
      h3Bloco: 'NA',
      pemc: { kind: 'NA' },
      score: {
        kind: 'muletas',
        contagem: Math.max(0, parseInt(gravMuletas, 10) || 0),
        ajuste: gravAjuste.trim() || 'pausa limpa',
      },
      iaPista: null,
      baselineFase: null,
      avaliavel: true,
      erroCritico: false,
      refacaoIntegralPendente: false,
      atritoE2: null,
      servicoResultado: null,
      linhaEm2min: null,
      vereditoIA: null,
    });
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    onNotify('Gravação semanal registrada.');
  };

  const renderHabChips = (habIds: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {habIds.map((id) => {
        const hab = HAB_BY_ID.get(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpenPrePorta(id)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
          >
            <span>{hab ? hab.title.replace(/^Cartão \d+ — /, '') : id}</span>
            <ArrowUpRight className="h-3 w-3 opacity-60" />
          </button>
        );
      })}
    </div>
  );

  const buildPromptForPasso = (p: Extract<Passo, { kind: 'sessao' }>, maskCasoFixo = false): string => {
    if (p.prompt === 'A') {
      const tipo = p.baseline === 'A' ? 'BASELINE-A' : p.baseline === 'B' ? 'BASELINE-B' : 'Nova';
      return buildPromptA({
        dateIso: todayIso,
        tipo,
        slug: p.slug,
        servico: ambienteE1Sel,
        casoFixo: maskCasoFixo ? (casoFixoMasked ? '[CONTEÚDO SIGILOSO MASCARADO]' : '[COLAR CASO SELADO SEM LER]') : casoFixoMasked,
      });
    }
    if (p.prompt === 'D1') {
      return buildPromptD1({
        dateIso: todayIso,
        slug: p.slug,
        servico: ambienteE1Sel,
        mecanismosUsados: p.mecanismosUsados || mecanismosUsadosDe(p.slug, treino.logs),
      });
    }
    if (p.prompt === 'D2') {
      return buildPromptD2({
        dateIso: todayIso,
        eixo: d2Eixo,
        slug: p.slug,
        rodizio: rodizio?.nome || 'Internato',
        casoAnonimizado: d2Relato,
      });
    }
    if (p.prompt === 'B') {
      return buildPromptB({
        dateIso: todayIso,
        slug: p.slug,
        servico: p.ambiente as AmbienteE3,
      });
    }
    return buildPromptC({
      dateIso: todayIso,
      slug: p.slug,
      servico: ambienteE4Sel,
    });
  };

  // Listas filtradas
  const filteredE1 = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return QUEIXAS_E1;
    return QUEIXAS_E1.filter(
      (item) => item.nome.toLowerCase().includes(q) || item.slug.includes(q) || String(item.num) === q
    );
  }, [searchQuery]);

  const activeE1 = E1_BY_SLUG.get(selectedE1Slug) || QUEIXAS_E1[0];
  const activeE3 = E3_BY_SLUG.get(selectedE3Slug) || ARQUETIPOS_E3[0];
  const activeE4 = E4_BY_SLUG.get(selectedE4Slug) || CENARIOS_E4[0];

  const orderedLogs = useMemo(() => sortLogsChrono(treino.logs).reverse(), [treino.logs]);
  const filteredLogs = useMemo(
    () => (logFilter === 'todos' ? orderedLogs : orderedLogs.filter((l) => l.tipo === logFilter)),
    [orderedLogs, logFilter]
  );

  // NPP da queixa E1 ativa
  const nppDaQueixa = useMemo(
    () => treino.naoPodePassar.filter((n) => n.slug === activeE1.slug),
    [treino.naoPodePassar, activeE1.slug]
  );
  const origensNppValidas = useMemo(
    () =>
      orderedLogs.filter(
        (l) =>
          l.slug === activeE1.slug &&
          (l.tipo === 'Nova' || l.tipo === 'Var' || l.tipo === 'Micro') &&
          l.pemc.kind === 'omissao'
      ),
    [orderedLogs, activeE1.slug]
  );

  const handleAddNpp = (slug: string) => {
    const origemId = nppOrigemId || origensNppValidas[0]?.id || '';
    const lines = nppNovoTexto
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*•]\s*/, '').replace(/^\[CHECAR\]\s*/i, '').trim())
      .filter(Boolean);
    const res = cockpitStore.addTreinoNppItems(
      lines.map((texto) => ({ slug, texto, origemLogId: origemId }))
    );
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    setNppNovoTexto('');
    onNotify(`${lines.length} item(ns) adicionado(s) com tag [CHECAR].`);
  };

  const handleConfirmCheckNpp = (item: NaoPodePassarItem) => {
    const res = cockpitStore.checkTreinoNppItem(item.id, checkFonteTipo, checkFonteRef, todayIso);
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    setCheckingNppId(null);
    setCheckFonteRef('');
    onNotify('Tag [CHECAR] retirada com fonte primária registrada.');
  };

  const posPlantaoHoje =
    treino.internato.posPlantaoByDate[todayIso] !== undefined
      ? treino.internato.posPlantaoByDate[todayIso]
      : central6Ano.arquetipoId === 'pos_plantao';
  const semanaPesadaAtual =
    treino.internato.semanaPesadaByWeek[weekIso] !== undefined
      ? treino.internato.semanaPesadaByWeek[weekIso]
      : central6Ano.marchaId === '2_pesada' || central6Ano.marchaId === '1_sobrevivencia';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de Métricas Contínuas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 bg-white px-4 py-2 text-xs dark:border-white/[0.07] dark:bg-[#15181F]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#0F766E]/10 px-2 py-0.5 font-semibold text-[#0F766E] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]">
            {BLOCO_LABEL[bloco]}
          </span>
          {rodizio && bloco === 'BLOCO2_INTERNATO' && (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-white/[0.06] dark:text-[#D1D5DB]">
              Rodízio: {rodizio.nome}
            </span>
          )}
          <span className="font-mono text-zinc-600 tabular-nums dark:text-[#9CA3AF]">
            3H: <strong className="text-zinc-900 dark:text-[#F3F4F6]">{metrics.h3Num}/{metrics.h3Den}</strong>
            {metrics.h3Pct !== null ? ` (${metrics.h3Pct}%)` : ''}
          </span>
          <span className="font-mono text-zinc-600 tabular-nums dark:text-[#9CA3AF]">
            PEMC: <strong className="text-zinc-900 dark:text-[#F3F4F6]">{metrics.pemcNum}/{metrics.pemcDen}</strong>
          </span>
          <span className="font-mono text-zinc-600 tabular-nums dark:text-[#9CA3AF]">
            Domínio E1:{' '}
            <strong className="text-zinc-900 dark:text-[#F3F4F6]">
              {metrics.dominadasE1}/{metrics.totalAlvoE1}
            </strong>
          </span>
          {metrics.pendentesChecar > 0 && (
            <button
              type="button"
              onClick={() => setSection('log')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300"
            >
              <AlertTriangle className="h-3 w-3" />
              {metrics.pendentesChecar} [CHECAR]
            </button>
          )}
          {metrics.gatilhoClaudeIaPista && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              <ShieldAlert className="h-3 w-3" />
              Gatilho Claude: ≥2/5 IA_Pista
            </span>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
          <span>Data da esteira:</span>
          <input
            type="date"
            value={todayIso}
            onChange={(e) => e.target.value && setTodayIso(e.target.value)}
            className="rounded border border-zinc-200 bg-[#FAFAFA] px-1.5 py-0.5 font-mono text-[11px] text-zinc-800 dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#F3F4F6]"
          />
        </label>
      </div>

      {/* Corpo Master-Detail */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Coluna Esquerda */}
        <aside className="flex h-full w-full flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:w-[320px] lg:shrink-0 dark:border-white/[0.07] dark:bg-[#0F1115]">
          <div className="grid grid-cols-5 gap-1 border-b border-zinc-200/80 p-2 dark:border-white/[0.07]">
            {(
              [
                { id: 'esteira', label: 'Hoje' },
                { id: 'e1', label: 'E1 (20)' },
                { id: 'e3', label: 'E3 (8)' },
                { id: 'e4', label: 'E4 (7)' },
                { id: 'log', label: 'LOG' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  section === tab.id
                    ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                    : 'bg-white text-zinc-600 hover:text-zinc-900 dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {section === 'esteira' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#9CA3AF]">
                    Progresso 1ª Passada
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">E1 Porta Comum</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                        {metrics.primeiraPassadaE1}/19
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">E3-Porta Prescrição</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                        {metrics.primeiraPassadaE3Porta}/7
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">E4 Paciente Grave</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                        {metrics.primeiraPassadaE4}/7
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">Blocos visuais ECG/RX</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                        {Object.keys(treino.visual).length}/4
                      </span>
                    </div>
                  </div>
                </div>

                {/* Piloto checklist compacto */}
                <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#9CA3AF]">
                    Bloco 0 · Piloto (21–29/nov)
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {pilotoStatuses.map((ps) => (
                      <li key={ps.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-zinc-700 dark:text-[#D1D5DB]">
                          {ps.concluido ? '✓ ' : '○ '}
                          {ps.id} ({formatDateDDMM(ps.dataNominal)})
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            ps.concluido
                              ? ps.ok
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.05] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {ps.concluido ? (ps.ok ? 'OK' : 'Auditar') : 'Pendente'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Status da Contingência 10/jan */}
                <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#9CA3AF]">
                    Termômetro 10/jan (Meta 3H ≥ 80%)
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-800 dark:text-[#E5E7EB]">
                    {contingencia.num}/{contingencia.den} (
                    {contingencia.den > 0 ? Math.round((contingencia.num / contingencia.den) * 100) : 0}%)
                    {' · '}
                    <span className={contingencia.disparou ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {contingencia.disparou ? 'Abaixo da meta' : 'Na meta'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {section === 'e1' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar 20 queixas..."
                    className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pr-2.5 pl-8 text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6]"
                  />
                </div>
                {filteredE1.map((q) => {
                  const dom = computeDominioE1(q.slug, treino.logs, todayIso);
                  const locked = Boolean(q.unlockAfter && todayIso <= q.unlockAfter);
                  const badge = STATUS_BADGE[dom.status];
                  const active = selectedE1Slug === q.slug;
                  return (
                    <button
                      key={q.slug}
                      type="button"
                      onClick={() => setSelectedE1Slug(q.slug)}
                      className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                          : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60 dark:hover:bg-[#15181F]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                          <span className="font-mono text-zinc-400">#{String(q.num).padStart(2, '0')}</span>
                          <span className="truncate">{q.nome}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                            {locked ? 'Reservada BASELINE' : badge.label}
                          </span>
                          {q.visualTipo && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                              {q.visualTipo}
                            </span>
                          )}
                        </div>
                      </div>
                      {locked && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {section === 'e3' && (
              <div className="space-y-2">
                {ARQUETIPOS_E3.map((a) => {
                  const dom = computeDominioE3E4('E3', a.slug, treino.logs);
                  const locked = Boolean(a.unlockAfter && todayIso <= a.unlockAfter);
                  const active = selectedE3Slug === a.slug;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => setSelectedE3Slug(a.slug)}
                      className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                          : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                          <span className="mr-1 font-mono text-zinc-400">#{a.num}</span>
                          {a.nome}
                        </p>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]">
                            {a.rubrica}
                          </span>
                          {dom.dominada && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                              Dominado
                            </span>
                          )}
                          {locked && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                              Pós 24/jan
                            </span>
                          )}
                        </div>
                      </div>
                      {locked && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {section === 'e4' && (
              <div className="space-y-2">
                {CENARIOS_E4.map((c) => {
                  const dom = computeDominioE3E4('E4', c.slug, treino.logs);
                  const active = selectedE4Slug === c.slug;
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => setSelectedE4Slug(c.slug)}
                      className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                          : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60'
                      }`}
                    >
                      <p className="text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                        <span className="mr-1 font-mono text-zinc-400">#{c.num}</span>
                        {c.nome}
                      </p>
                      <div className="mt-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            dom.dominada
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {dom.dominada ? 'Dominado (2× 4/4)' : `${dom.seq.length} execuções`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {section === 'log' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleCopy(formatLogMarkdown(treino, todayIso), 'LOG.md copiado!')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white hover:opacity-95 dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Copiar LOG.md ({treino.logs.length} linhas)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      formatNaoPodePassarMarkdown(treino.naoPodePassar),
                      'NAO_PODE_PASSAR.md copiado!'
                    )
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#E5E7EB]"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar NAO_PODE_PASSAR.md ({treino.naoPodePassar.length})
                </button>
                <div className="rounded-xl border border-zinc-200/80 bg-white p-3 text-xs dark:border-white/[0.07] dark:bg-[#15181F]">
                  <p className="font-semibold text-zinc-800 dark:text-[#E5E7EB]">
                    Comparativo Baseline (29/nov × 24/jan)
                  </p>
                  {relatorioBaseline.inconclusivo ? (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      Inconclusivo: {relatorioBaseline.motivoInconclusivo}
                    </p>
                  ) : (
                    <div className="mt-1.5 space-y-1 text-[11px] text-zinc-600 dark:text-[#9CA3AF]">
                      <p>
                        Caso A:{' '}
                        {relatorioBaseline.baseA
                          ? `3H=${relatorioBaseline.baseA.h3Bloco} · ${relatorioBaseline.baseA.veredito}`
                          : 'Pendente'}
                      </p>
                      <p>
                        Caso B:{' '}
                        {relatorioBaseline.baseB
                          ? `3H=${relatorioBaseline.baseB.h3Bloco} · ${relatorioBaseline.baseB.veredito}`
                          : 'Pendente'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Coluna Direita — Painel de Execução */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-4xl space-y-5">
            {/* ── VISÃO 1: ESTEIRA CONTÍNUA DE HOJE ── */}
            {section === 'esteira' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-[#F3F4F6]">
                      Esteira Contínua — {formatDateDDMMYYYY(todayIso)}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      Siga os passos na ordem abaixo. Simulação por voz no Gemini (sem modo Live) → cole a linha final do LOG aqui.
                    </p>
                  </div>
                  {bloco === 'BLOCO2_INTERNATO' && (
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {(
                        [
                          ['posPlantaoByDate', todayIso, 'Pós-plantão hoje', posPlantaoHoje],
                          ['semanaPesadaByWeek', weekIso, 'Semana pesada', semanaPesadaAtual],
                          ['diaLivreByDate', todayIso, 'Dia livre', Boolean(treino.internato.diaLivreByDate[todayIso])],
                          ['casoRealByDate', todayIso, 'Caso real (D2)', Boolean(treino.internato.casoRealByDate[todayIso])],
                          ['semPacienteNovoSeg', weekIso, 'Sem pac. novo seg', Boolean(treino.internato.semPacienteNovoSeg[weekIso])],
                        ] as const
                      ).map(([mapKey, key, label, val]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => cockpitStore.setTreinoInternatoFlag(mapKey, key, !val)}
                          className={`rounded-md border px-2 py-1 font-medium transition-colors ${
                            val
                              ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] dark:border-[#2DD4BF] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]'
                              : 'border-zinc-200 bg-white text-zinc-600 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {val ? '✓ ' : ''}
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lista de Passos do Dia */}
                <div className="space-y-4">
                  {passosHoje.map((passo, idx) => {
                    if (passo.kind === 'descanso') {
                      const msgMap = {
                        fds: 'Fim de semana — descanso total de habilidades (0 min).',
                        feriado: 'Feriado — descanso protegido.',
                        viagem: 'Semana de viagem (11–17/jan) — pausa total (0 sessões).',
                        pos_plantao: 'Pós-plantão noturno — ZERO micro-dose e ZERO treino hoje.',
                        meta_semana_cumprida: 'Meta de hoje/semana concluída. Sem dívida acumulada.',
                        aguardando_data: `Próximo passo do piloto agendado para ${passo.proximaDataIso ? formatDateDDMMYYYY(passo.proximaDataIso) : 'breve'}.`,
                      };
                      return (
                        <div
                          key={`desc-${idx}`}
                          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{msgMap[passo.motivo]}</span>
                          </div>
                        </div>
                      );
                    }

                    if (passo.kind === 'sessao') {
                      const item = findCatalogItem(passo.slug);
                      const habs = item ? habIdsDe(item) : [];
                      const isBaseline = Boolean(passo.baseline);
                      const promptPreview = buildPromptForPasso(passo, true);

                      return (
                        <div
                          key={`sess-${idx}-${passo.slug}-${passo.prompt}`}
                          className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-2 py-0.5 text-[11px] font-bold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]">
                                  <Play className="h-3 w-3" />
                                  Passo {idx + 1} · Prompt {passo.prompt}
                                </span>
                                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.06] dark:text-[#D1D5DB]">
                                  {ORIGEM_LABEL[passo.origem] || passo.origem}
                                </span>
                                <span className="font-mono text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                                  Teto ≤ {passo.tetoMin} min
                                </span>
                                {passo.visual && (
                                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                                    + Bloco Visual {passo.visual} (10 min)
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-1.5 text-base font-bold text-zinc-900 dark:text-[#F3F4F6]">
                                {item ? item.nome : passo.slug}{' '}
                                <span className="font-mono text-xs font-normal text-zinc-400">
                                  ({passo.slug})
                                </span>
                              </h3>
                            </div>

                            {!isBaseline && (passo.prompt === 'A' || passo.prompt === 'D1') && (
                              <select
                                value={ambienteE1Sel}
                                onChange={(e) => setAmbienteE1Sel(e.target.value as AmbienteE1)}
                                className="rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2 py-1 text-xs text-zinc-800 dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#E5E7EB]"
                              >
                                <option value="UPA com retaguarda">UPA com retaguarda</option>
                                <option value="PA de cidade pequena sem laboratório no turno">
                                  PA pequeno sem lab
                                </option>
                              </select>
                            )}
                            {passo.prompt === 'C' && (
                              <select
                                value={ambienteE4Sel}
                                onChange={(e) => setAmbienteE4Sel(e.target.value as AmbienteE4)}
                                className="rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2 py-1 text-xs text-zinc-800 dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#E5E7EB]"
                              >
                                <option value="UPA com sala vermelha">UPA com sala vermelha</option>
                                <option value="PA de cidade pequena">PA de cidade pequena</option>
                              </select>
                            )}
                          </div>

                          {passo.pausaSilenciosa10s && (
                            <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                              Contingência 10/jan ativa: faça 10 s em silêncio pós-triagem → provável / perigosa / não pode passar.
                            </div>
                          )}

                          {passo.prompt === 'D1' && (
                            <p className="text-xs text-zinc-600 dark:text-[#9CA3AF]">
                              Mecanismos já usados (injetados no prompt):{' '}
                              <span className="font-mono font-medium text-zinc-800 dark:text-[#E5E7EB]">
                                {passo.mecanismosUsados && passo.mecanismosUsados.length > 0
                                  ? passo.mecanismosUsados.join(', ')
                                  : 'nenhum'}
                              </span>
                            </p>
                          )}

                          {isBaseline && (
                            <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                              <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                                Caso Fixo Selado (BASELINE-{passo.baseline}) — cole sem ler (nunca exibido nem salvo)
                              </label>
                              <input
                                type="password"
                                autoComplete="off"
                                value={casoFixoMasked}
                                onChange={(e) => setCasoFixoMasked(e.target.value)}
                                placeholder="Cole aqui o conteúdo de docs/piloto/selado/CASO_..."
                                className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 dark:border-amber-500/30 dark:bg-[#0F1115] dark:text-[#F3F4F6]"
                              />
                            </div>
                          )}

                          {passo.prompt === 'D2' && (
                            <div className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/[0.08] dark:bg-[#0F1115]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                                  Debriefing real (LGPD — zero nome/CPF/prontuário)
                                </span>
                                <select
                                  value={d2Eixo}
                                  onChange={(e) => setD2Eixo(e.target.value as Eixo)}
                                  className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-xs dark:border-white/[0.08] dark:bg-[#15181F]"
                                >
                                  <option value="E1">E1</option>
                                  <option value="E3">E3</option>
                                  <option value="E4">E4</option>
                                </select>
                              </div>
                              <textarea
                                rows={2}
                                value={d2Relato}
                                onChange={(e) => setD2Relato(e.target.value)}
                                placeholder="Idade aprox., sexo, queixa/contexto, o que perguntei/examinei/prescrevi..."
                                className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6]"
                              />
                            </div>
                          )}

                          {habs.length > 0 && renderHabChips(habs)}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  buildPromptForPasso(passo, false),
                                  `Prompt ${passo.prompt} (${passo.slug}) copiado para o Gemini!`
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95 dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                              Copiar Prompt {passo.prompt} para o Gemini
                            </button>

                            {passo.visual && !treino.visual[passo.slug]?.feitoEm && (
                              <button
                                type="button"
                                onClick={() => {
                                  cockpitStore.markTreinoVisualDone(passo.slug, todayIso);
                                  onNotify(`Bloco visual ${passo.visual} (${passo.slug}) marcado como concluído.`);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Marcar Visual {passo.visual} feito (LITFL/Radiopaedia)
                              </button>
                            )}
                          </div>

                          <details className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]">
                            <summary className="cursor-pointer font-medium text-zinc-600 dark:text-[#9CA3AF]">
                              Ver texto completo do Prompt {passo.prompt}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                              {promptPreview}
                            </pre>
                          </details>
                        </div>
                      );
                    }

                    if (passo.kind === 'servico') {
                      return (
                        <div
                          key={`serv-${idx}`}
                          className="space-y-3 rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 dark:border-teal-500/20 dark:bg-teal-500/10"
                        >
                          <p className="text-xs font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                            Observação em Serviço [SERVIÇO] — Segunda-Feira
                          </p>
                          <p className="text-sm italic text-zinc-800 dark:text-[#E5E7EB]">
                            “{FRASE_BASE_SERVICO}”
                          </p>
                          {passo.pedido && (
                            <p className="text-xs text-teal-900 dark:text-teal-200">
                              Foco do rodízio: <strong>{passo.pedido}</strong>
                            </p>
                          )}
                          <div className="grid gap-2 sm:grid-cols-3">
                            <select
                              value={servicoSlug}
                              onChange={(e) => setServicoSlug(e.target.value)}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#15181F]"
                            >
                              {QUEIXAS_E1.map((q) => (
                                <option key={q.slug} value={q.slug}>
                                  {q.slug}
                                </option>
                              ))}
                            </select>
                            <select
                              value={servicoResultado}
                              onChange={(e) => setServicoResultado(e.target.value as 'apontamento' | 'recusa')}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#15181F]"
                            >
                              <option value="apontamento">Preceptor observou (apontamento)</option>
                              <option value="recusa">Preceptor recusou (cumpre sem falha)</option>
                            </select>
                            <input
                              type="text"
                              value={servicoTexto}
                              onChange={(e) => setServicoTexto(e.target.value)}
                              placeholder="Apontamento em 1 frase..."
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#15181F]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleSaveServico}
                            className="rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                          >
                            Registrar [SERVIÇO]
                          </button>
                        </div>
                      );
                    }

                    if (passo.kind === 'ef_familiar') {
                      return (
                        <div
                          key={`ef-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white p-3.5 dark:border-white/[0.07] dark:bg-[#15181F]"
                        >
                          <div>
                            <p className="text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                              Exame Físico real em familiar (10 min)
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                              Treine a coreografia da manobra que mais falhou na semana.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              cockpitStore.toggleTreinoRitualEf(weekIso);
                              onNotify('Ritual de exame físico em familiar atualizado.');
                            }}
                            className="rounded-lg border border-[#0F766E] px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-[#0F766E]/10 dark:border-[#2DD4BF] dark:text-[#2DD4BF]"
                          >
                            Marcar feito
                          </button>
                        </div>
                      );
                    }

                    if (passo.kind === 'gravacao') {
                      return (
                        <div
                          key={`grav-${idx}`}
                          className="space-y-2 rounded-xl border border-zinc-200/80 bg-white p-3.5 dark:border-white/[0.07] dark:bg-[#15181F]"
                        >
                          <p className="text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                            Gravação semanal de fala (5 min ouvindo — muletas vocais)
                          </p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <select
                              value={gravSlug}
                              onChange={(e) => setGravSlug(e.target.value)}
                              className="rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#0F1115]"
                            >
                              {QUEIXAS_E1.map((q) => (
                                <option key={q.slug} value={q.slug}>
                                  {q.slug}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              value={gravMuletas}
                              onChange={(e) => setGravMuletas(e.target.value)}
                              placeholder="Qtd muletas"
                              className="rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#0F1115]"
                            />
                            <input
                              type="text"
                              value={gravAjuste}
                              onChange={(e) => setGravAjuste(e.target.value)}
                              placeholder="1 ajuste vocal"
                              className="rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#0F1115]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleSaveGravacao}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900"
                          >
                            Registrar [GRAVAÇÃO]
                          </button>
                        </div>
                      );
                    }

                    if (passo.kind === 'checagem_fontes') {
                      return (
                        <div
                          key={`chec-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3.5 text-xs dark:border-white/[0.07] dark:bg-[#15181F]"
                        >
                          <span className="text-zinc-700 dark:text-[#D1D5DB]">
                            Bloco de checagem de fontes (~{passo.minutos} min):{' '}
                            <strong>{passo.pendentesChecar}</strong> item(ns) com <code>[CHECAR]</code>.
                          </span>
                          <button
                            type="button"
                            onClick={() => setSection('log')}
                            className="font-semibold text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                          >
                            Abrir Não Pode Passar →
                          </button>
                        </div>
                      );
                    }

                    // Marco
                    return (
                      <div
                        key={`marco-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/80 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
                      >
                        <div>
                          <p className="text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                            Marco: {passo.marco}
                          </p>
                          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                            {passo.marco === 'congelamento_2026-11-29' &&
                              'Auditar computabilidade do LOG do piloto (15 min) e congelar o plano v3.1.'}
                            {passo.marco === 'contingencia_2027-01-10' &&
                              `Snapshot 3H: ${contingencia.num}/${contingencia.den} → ${contingencia.disparou ? 'DISPAROU (S7 vira 2× D1)' : 'NA META (S7 normal)'}.`}
                            {passo.marco === 'revisao_2027-01-24' &&
                              'Revisão de 15 min pós-BASELINE-B: comparar Caso A × Caso B no painel LOG.'}
                          </p>
                        </div>
                        {passo.marco === 'congelamento_2026-11-29' && !treino.piloto.auditoriaEm && (
                          <button
                            type="button"
                            onClick={() => {
                              cockpitStore.markTreinoPilotoAuditado(todayIso);
                              onNotify('Auditoria de 29/nov marcada como concluída!');
                            }}
                            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                          >
                            Concluir Auditoria
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Card Universal de Importação da Linha do Gemini */}
                <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-[#D1D5DB]">
                    <Sparkles className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                    Registrar 1ª Tentativa (colar linha final ditada pelo Gemini)
                  </div>
                  <textarea
                    rows={2}
                    value={geminiLineRaw}
                    onChange={(e) => setGeminiLineRaw(e.target.value)}
                    placeholder="Ex.: 21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo"
                    className="w-full rounded-lg border border-zinc-200 bg-[#FAFAFA] p-2.5 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#F3F4F6]"
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">Min reais:</span>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={quickMin}
                        onChange={(e) => setQuickMin(e.target.value)}
                        className="w-16 rounded border border-zinc-200 bg-[#FAFAFA] px-2 py-1 font-mono dark:border-white/[0.08] dark:bg-[#0F1115]"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">IA_Pista?:</span>
                      <select
                        value={quickIaPista}
                        onChange={(e) => setQuickIaPista(e.target.value as 'N' | 'S')}
                        className="rounded border border-zinc-200 bg-[#FAFAFA] px-2 py-1 dark:border-white/[0.08] dark:bg-[#0F1115]"
                      >
                        <option value="N">N (limpo)</option>
                        <option value="S">S (IA vazou pista)</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">Baseline:</span>
                      <select
                        value={quickBaselineHint}
                        onChange={(e) => setQuickBaselineHint(e.target.value as '' | 'A' | 'B')}
                        className="rounded border border-zinc-200 bg-[#FAFAFA] px-2 py-1 dark:border-white/[0.08] dark:bg-[#0F1115]"
                      >
                        <option value="">Auto</option>
                        <option value="A">BASELINE-A</option>
                        <option value="B">BASELINE-B</option>
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-1 text-zinc-600 dark:text-[#9CA3AF]">
                      <input
                        type="checkbox"
                        checked={quickErroCritico}
                        onChange={(e) => setQuickErroCritico(e.target.checked)}
                      />
                      Erro crítico (E3/E4)
                    </label>
                    <label className="inline-flex items-center gap-1 text-zinc-600 dark:text-[#9CA3AF]">
                      <input
                        type="checkbox"
                        checked={quickRefacaoPendente}
                        onChange={(e) => setQuickRefacaoPendente(e.target.checked)}
                      />
                      Refação pendente (Nova)
                    </label>
                    {bloco === 'BLOCO0_PILOTO' && (
                      <label className="inline-flex items-center gap-1 text-zinc-600 dark:text-[#9CA3AF]">
                        <input
                          type="checkbox"
                          checked={quickLinha2min}
                          onChange={(e) => setQuickLinha2min(e.target.checked)}
                        />
                        LOG saiu ≤2m
                      </label>
                    )}
                  </div>
                  {importError && (
                    <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                      {importError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleImportGeminiLine()}
                    disabled={!geminiLineRaw.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Importar e Salvar no LOG
                  </button>
                </div>
              </>
            )}

            {/* ── VISÃO 2: E1 (20 QUEIXAS) ── */}
            {section === 'e1' && (() => {
              const dom = computeDominioE1(activeE1.slug, treino.logs, todayIso);
              const mecs = mecanismosUsadosDe(activeE1.slug, treino.logs);
              const locked = Boolean(activeE1.unlockAfter && todayIso <= activeE1.unlockAfter);
              const slugLogs = orderedLogs.filter((l) => l.slug === activeE1.slug);

              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs text-zinc-400">
                          #{String(activeE1.num).padStart(2, '0')} · {activeE1.slug}
                        </span>
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-[#F3F4F6]">
                          {activeE1.nome}
                        </h2>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[dom.status].cls}`}>
                        {locked ? 'Reservada BASELINE até 24/jan' : STATUS_BADGE[dom.status].label}
                      </span>
                    </div>

                    <div className="mt-3">{renderHabChips(habIdsDe(activeE1))}</div>

                    <p className="mt-3 text-xs text-zinc-600 dark:text-[#9CA3AF]">
                      Mecanismos já usados:{' '}
                      <span className="font-mono font-medium text-zinc-800 dark:text-[#E5E7EB]">
                        {mecs.length > 0 ? mecs.join(', ') : 'nenhum'}
                      </span>
                    </p>

                    {!locked && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              buildPromptA({ dateIso: todayIso, tipo: 'Nova', slug: activeE1.slug, servico: ambienteE1Sel }),
                              `Prompt A (${activeE1.slug}) copiado!`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                          Copiar Prompt A (Nova)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              buildPromptD1({
                                dateIso: todayIso,
                                slug: activeE1.slug,
                                servico: ambienteE1Sel,
                                mecanismosUsados: mecs,
                              }),
                              `Prompt D1 (${activeE1.slug}) copiado!`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F766E] px-3 py-1.5 text-xs font-semibold text-[#0F766E] dark:border-[#2DD4BF] dark:text-[#2DD4BF]"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                          Copiar Prompt D1 (Variante)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Não Pode Passar da Queixa */}
                  <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F3F4F6]">
                        Não Pode Passar ({nppDaQueixa.length}/6)
                      </h3>
                      <span className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                        Só nasce após PEMC real · AMBOSS/IA não retiram [CHECAR]
                      </span>
                    </div>

                    {nppDaQueixa.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                        Nenhum item registrado para esta queixa.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {nppDaQueixa.map((it) => (
                          <li
                            key={it.id}
                            className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span
                                  className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                    it.checado
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                  }`}
                                >
                                  {it.checado ? 'VALIDADO' : '[CHECAR]'}
                                </span>
                                <span className="text-zinc-800 dark:text-[#E5E7EB]">{it.texto}</span>
                                {it.checado && it.fontePrimaria && (
                                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                                    Fonte ({it.fonteTipo}): {it.fontePrimaria} ·{' '}
                                    {it.checadoEm ? formatDateDDMMYYYY(it.checadoEm) : ''}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {!it.checado ? (
                                  <button
                                    type="button"
                                    onClick={() => setCheckingNppId(checkingNppId === it.id ? null : it.id)}
                                    className="rounded bg-[#0F766E] px-2 py-1 text-[10px] font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                                  >
                                    Validar fonte
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => cockpitStore.uncheckTreinoNppItem(it.id)}
                                    className="rounded border border-zinc-300 px-2 py-1 text-[10px] text-zinc-600 dark:border-white/[0.1] dark:text-[#9CA3AF]"
                                  >
                                    Voltar [CHECAR]
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => cockpitStore.deleteTreinoNppItem(it.id)}
                                  className="p-1 text-zinc-400 hover:text-rose-600"
                                  aria-label="Excluir item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {checkingNppId === it.id && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-2 dark:border-white/[0.06]">
                                <select
                                  value={checkFonteTipo}
                                  onChange={(e) => setCheckFonteTipo(e.target.value as FonteTipo)}
                                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-white/[0.08] dark:bg-[#15181F]"
                                >
                                  <option value="diretriz">Diretriz</option>
                                  <option value="protocolo_oficial">Protocolo oficial (MS/HC-FMRP)</option>
                                  <option value="bula_profissional">Bula profissional</option>
                                </select>
                                <input
                                  type="text"
                                  value={checkFonteRef}
                                  onChange={(e) => setCheckFonteRef(e.target.value)}
                                  placeholder="Ex.: Diretriz SBC SCA 2025, p. 18 (≥10 chars)"
                                  className="min-w-[200px] flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-white/[0.08] dark:bg-[#15181F]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleConfirmCheckNpp(it)}
                                  className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                                >
                                  Confirmar
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {origensNppValidas.length > 0 && nppDaQueixa.length < 6 && (
                      <div className="space-y-2 border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
                        <select
                          value={nppOrigemId || origensNppValidas[0].id}
                          onChange={(e) => setNppOrigemId(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1.5 text-xs dark:border-white/[0.08] dark:bg-[#0F1115]"
                        >
                          {origensNppValidas.map((o) => (
                            <option key={o.id} value={o.id}>
                              Origem: {formatDateDDMM(o.dateIso)} · {o.tipo} ({o.mecanismo || o.slug}) —{' '}
                              {o.pemc.kind === 'omissao' ? o.pemc.texto : ''}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          value={nppNovoTexto}
                          onChange={(e) => setNppNovoTexto(e.target.value)}
                          placeholder="Cole 1 item por linha (máx. 6 no total)..."
                          className="w-full rounded-lg border border-zinc-200 bg-[#FAFAFA] p-2 text-xs dark:border-white/[0.08] dark:bg-[#0F1115]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNpp(activeE1.slug)}
                          disabled={!nppNovoTexto.trim()}
                          className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar com [CHECAR]
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Histórico da Queixa */}
                  <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F3F4F6]">
                      Histórico ({slugLogs.length})
                    </h3>
                    {slugLogs.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">Nenhuma sessão registrada ainda.</p>
                    ) : (
                      <div className="mt-2 space-y-1.5 font-mono text-[11px]">
                        {slugLogs.map((l) => (
                          <div
                            key={l.id}
                            className="rounded-lg bg-zinc-50 px-2.5 py-1.5 text-zinc-700 dark:bg-[#0F1115] dark:text-[#D1D5DB]"
                          >
                            {formatLogLine(l)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── VISÃO 3: E3 (8 ARQUÉTIPOS) ── */}
            {section === 'e3' && (() => {
              const locked = Boolean(activeE3.unlockAfter && todayIso <= activeE3.unlockAfter);
              const ambSug = sugerirAmbienteE3(activeE3.slug, treino.logs);
              const dom = computeDominioE3E4('E3', activeE3.slug, treino.logs);
              return (
                <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-zinc-400">
                        #{activeE3.num} · {activeE3.slug} · {activeE3.rubrica}
                      </span>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-[#F3F4F6]">
                        {activeE3.nome}
                      </h2>
                    </div>
                    {dom.dominada && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Dominado {dom.temUpaEPaNoPar ? '(UPA + PA)' : ''}
                      </span>
                    )}
                  </div>
                  {renderHabChips(habIdsDe(activeE3))}
                  <p className="text-xs text-zinc-600 dark:text-[#9CA3AF]">
                    Ambiente sugerido automaticamente: <strong>{ambSug}</strong>
                  </p>
                  {locked ? (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      Este arquétipo (`e3-ubs-longitudinal`) libera automaticamente após 24/01/2027.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeE3.ambientesPermitidos.map((amb) => (
                        <button
                          key={amb}
                          type="button"
                          onClick={() =>
                            handleCopy(
                              buildPromptB({ dateIso: todayIso, slug: activeE3.slug, servico: amb }),
                              `Prompt B (${activeE3.slug} · ${amb}) copiado!`
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                            amb === ambSug
                              ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                              : 'border border-zinc-300 text-zinc-700 dark:border-white/[0.1] dark:text-[#E5E7EB]'
                          }`}
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" />
                          Copiar Prompt B ({amb})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── VISÃO 4: E4 (7 CENÁRIOS) ── */}
            {section === 'e4' && (() => {
              const dom = computeDominioE3E4('E4', activeE4.slug, treino.logs);
              return (
                <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-zinc-400">
                        #{activeE4.num} · {activeE4.slug}
                      </span>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-[#F3F4F6]">
                        {activeE4.nome}
                      </h2>
                    </div>
                    {dom.dominada && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Dominado (2× 4/4)
                      </span>
                    )}
                  </div>
                  {renderHabChips(habIdsDe(activeE4))}
                  <div className="flex flex-wrap gap-2">
                    {(['UPA com sala vermelha', 'PA de cidade pequena'] as AmbienteE4[]).map((amb) => (
                      <button
                        key={amb}
                        type="button"
                        onClick={() =>
                          handleCopy(
                            buildPromptC({ dateIso: todayIso, slug: activeE4.slug, servico: amb }),
                            `Prompt C (${activeE4.slug} · ${amb}) copiado!`
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar Prompt C ({amb})
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── VISÃO 5: LOG COMPLETO & PENDÊNCIAS [CHECAR] ── */}
            {section === 'log' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-[#F3F4F6]">
                      LOG de Sessões ({filteredLogs.length})
                    </h2>
                    <div className="flex flex-wrap gap-1">
                      {(['todos', 'Nova', 'Var', 'E3', 'E4', 'Micro', 'SERVIÇO', 'GRAVAÇÃO', 'BASELINE'] as const).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setLogFilter(f)}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                              logFilter === f
                                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                            }`}
                          >
                            {f}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {filteredLogs.length === 0 ? (
                    <p className="mt-3 text-xs text-zinc-500">Nenhuma linha registrada neste filtro.</p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {filteredLogs.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] dark:border-white/[0.06] dark:bg-[#0F1115]"
                        >
                          <span className="min-w-0 truncate text-zinc-800 dark:text-[#E5E7EB]">
                            {formatLogLine(l)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const res = cockpitStore.deleteTreinoLogEntry(l.id);
                              if (!res.ok) onNotify(res.error);
                              else onNotify('Linha removida do LOG.');
                            }}
                            className="shrink-0 p-1 text-zinc-400 hover:text-rose-600"
                            aria-label="Excluir linha do LOG"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Todos os [CHECAR] pendentes */}
                <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F3F4F6]">
                    Pendências [CHECAR] ({metrics.pendentesChecar})
                  </h3>
                  {metrics.pendentesChecar === 0 ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      Nenhuma pendência de checagem em fonte primária.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {treino.naoPodePassar
                        .filter((n) => !n.checado)
                        .map((n) => (
                          <li
                            key={n.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10"
                          >
                            <span>
                              <strong className="font-mono">{n.slug}:</strong> {n.texto}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedE1Slug(n.slug);
                                setSection('e1');
                              }}
                              className="shrink-0 font-semibold text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                            >
                              Validar →
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
