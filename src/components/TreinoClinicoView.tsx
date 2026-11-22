import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Edit3,
  FileDown,
  Lock,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
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
  type TipoLog,
  type TreinoLogEntry,
} from '../data/treino_clinico_data.ts';
import { HAB_PROTOCOLS } from '../data/protocolsRepo.ts';
import { FORMACAO_TEORICA_MODULOS } from '../data/formacao_teorica_data.ts';
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
  formatTargetLabel,
  getBlocoMacro,
  guiaTeoricoDaSemana,
  habIdsDe,
  mecanismosUsadosDe,
  migrateTreinoClinicoState,
  parseLogLineFromGemini,
  proximosPassos,
  recomendarGuiasPorGargalo,
  rodizioAtivo,
  sortLogsChrono,
  sugerirAmbienteE3,
  todayIsoLocal,
  weekIsoOf,
} from '../engine/treinoClinico.ts';
import { formatPrePortaTitle } from '../engine/diretrizes.ts';
import { normalizeSearchText } from '../engine/search.ts';
import { cockpitStore } from '../state/store.ts';
import type { TreinoSectionRoute } from '../state/hashRoute.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { detectPiiIssues, sanitizePiiText } from '../utils/piiGuard.ts';

export interface TreinoFocusTarget {
  eixo: 'e1' | 'e3' | 'e4';
  slug?: string;
  nonce: number;
}

interface TreinoClinicoViewProps {
  central6Ano: Central6AnoState;
  section?: TreinoSectionRoute;
  routeSlug?: string | null;
  mobileShowDetail?: boolean;
  onChangeRoute?: (
    sec: TreinoSectionRoute,
    slug: string | null | undefined,
    detail: boolean
  ) => void;
  onOpenPrePorta: (habId: string) => void;
  onNotify: (msg: string) => void;
  onOpenGuiaTeorico?: (modId: string) => void;
  focusTarget?: TreinoFocusTarget | null;
  onConsumeFocusTarget?: () => void;
}

type LeftSection = TreinoSectionRoute;
type E1StatusFilter = 'todas' | 'pendente' | 'com_pemc' | 'dominada' | 'revisar';

type UndoDeletion =
  | { kind: 'log'; entry: TreinoLogEntry; index: number; label: string }
  | { kind: 'npp'; item: NaoPodePassarItem; index: number; label: string };

interface RecentPemcShortcut {
  logId: string;
  slug: string;
  texto: string;
}

const HAB_BY_ID = new Map(HAB_PROTOCOLS.map((h) => [h.id, h]));
const VISUAL_QUEIXAS = QUEIXAS_E1.filter((q) => Boolean(q.visualTipo));
const MAX_VISIBLE_HAB_CHIPS = 3;

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

const MARCO_LABEL: Record<string, string> = {
  'congelamento_2026-11-29': 'Revisão do Piloto (29/11)',
  'contingencia_2027-01-10': 'Termômetro 10/Jan',
  'revisao_2027-01-24': 'Revisão Pré-Internato (24/01)',
};

const INPUT_BASE_CLS =
  'rounded-lg border border-zinc-200 bg-[#FAFAFA] text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 dark:border-white/[0.10] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:ring-[#2DD4BF]/15';

const WHITE_INPUT_CLS =
  'rounded-lg border border-zinc-200 bg-white text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF] dark:focus:ring-[#2DD4BF]/15';

function defaultMinForTipo(tipo: TipoLog): string {
  if (tipo === 'Var') return '12';
  if (tipo === 'E3') return '35';
  if (tipo === 'E4') return '25';
  if (tipo === 'Micro') return '10';
  if (tipo === 'SERVIÇO' || tipo === 'GRAVAÇÃO') return '5';
  return '25';
}

function PiiInlineAlert({
  text,
  onAnonymize,
}: {
  text: string;
  onAnonymize?: () => void;
}) {
  const issues = useMemo(() => detectPiiIssues(text), [text]);
  if (issues.length === 0) return null;
  const labels = Array.from(new Set(issues.map((i) => i.label))).join(', ');
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/50 dark:text-amber-200"
    >
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Dado identificável detectado ({labels}) — será anonimizado ao salvar.
      </span>
      {onAnonymize && (
        <button
          type="button"
          onClick={onAnonymize}
          className="rounded border border-amber-400/70 bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
        >
          Anonimizar agora
        </button>
      )}
    </div>
  );
}

export function TreinoClinicoView({
  central6Ano,
  section: controlledSection,
  routeSlug,
  mobileShowDetail: controlledMobileDetail,
  onChangeRoute,
  onOpenPrePorta,
  onNotify,
  onOpenGuiaTeorico,
  focusTarget,
  onConsumeFocusTarget,
}: TreinoClinicoViewProps) {
  const treino = useMemo(
    () => migrateTreinoClinicoState(central6Ano.treinoClinico),
    [central6Ano.treinoClinico]
  );

  const realTodayIso = todayIsoLocal();
  const [todayIso, setTodayIso] = useState<string>(() => realTodayIso);
  const isSimulatingDate = todayIso !== realTodayIso;

  const [internalSection, setInternalSection] = useState<LeftSection>(
    controlledSection || 'esteira'
  );
  const [internalMobileDetail, setInternalMobileDetail] = useState<boolean>(
    Boolean(controlledMobileDetail)
  );
  const section: LeftSection = controlledSection ?? internalSection;
  const mobileShowDetail: boolean =
    controlledMobileDetail !== undefined ? controlledMobileDetail : internalMobileDetail;

  const [searchQuery, setSearchQuery] = useState('');
  const [e1StatusFilter, setE1StatusFilter] = useState<E1StatusFilter>('todas');
  const [selectedE1Slug, setSelectedE1Slug] = useState<string>(() =>
    controlledSection === 'e1' && routeSlug && E1_BY_SLUG.has(routeSlug)
      ? routeSlug
      : QUEIXAS_E1[0].slug
  );
  const [selectedE3Slug, setSelectedE3Slug] = useState<string>(() =>
    controlledSection === 'e3' && routeSlug && E3_BY_SLUG.has(routeSlug)
      ? routeSlug
      : ARQUETIPOS_E3[0].slug
  );
  const [selectedE4Slug, setSelectedE4Slug] = useState<string>(() =>
    controlledSection === 'e4' && routeSlug && E4_BY_SLUG.has(routeSlug)
      ? routeSlug
      : CENARIOS_E4[0].slug
  );
  const [logFilter, setLogFilter] = useState<'todos' | TipoLog>('todos');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Expansão controlada de chips Pré-Porta (evita empurrar CTA principal abaixo da dobra)
  const [expandedHabGroups, setExpandedHabGroups] = useState<Record<string, boolean>>({});

  // Estados efêmeros para montagem de prompts (CASO_FIXO nunca persiste!)
  const [casoFixoMasked, setCasoFixoMasked] = useState('');
  const [ambienteE1Sel, setAmbienteE1Sel] = useState<AmbienteE1>('UPA com retaguarda');
  const [ambienteE4Sel, setAmbienteE4Sel] = useState<AmbienteE4>('UPA com sala vermelha');
  const [d2Eixo, setD2Eixo] = useState<Eixo>('E1');
  const [d2Relato, setD2Relato] = useState('');

  // Import rápido da linha do Gemini
  const [geminiLineRaw, setGeminiLineRaw] = useState('');
  const [quickMin, setQuickMin] = useState('25');
  const [userEditedMin, setUserEditedMin] = useState(false);
  const [quickIaPista, setQuickIaPista] = useState<'N' | 'S'>('N');
  const [quickErroCritico, setQuickErroCritico] = useState(false);
  const [quickRefacaoPendente, setQuickRefacaoPendente] = useState(false);
  const [quickLinha2min, setQuickLinha2min] = useState(true);
  const [quickBaselineHint, setQuickBaselineHint] = useState<'' | 'A' | 'B'>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [recentPemcShortcut, setRecentPemcShortcut] = useState<RecentPemcShortcut | null>(null);

  // Registro rápido de SERVIÇO / GRAVAÇÃO
  const [servicoSlug, setServicoSlug] = useState('dor-toracica');
  const [userPickedServicoSlug, setUserPickedServicoSlug] = useState(false);
  const [servicoResultado, setServicoResultado] = useState<'apontamento' | 'recusa'>('apontamento');
  const [servicoTexto, setServicoTexto] = useState('');
  const [gravSlug, setGravSlug] = useState('dor-toracica');
  const [gravMuletas, setGravMuletas] = useState('3');
  const [gravAjuste, setGravAjuste] = useState('pausa limpa de 1s');

  // NPP: adicionar, editar inline e checar fonte primária
  const [nppNovoTexto, setNppNovoTexto] = useState('');
  const [nppOrigemId, setNppOrigemId] = useState('');
  const [checkingNppId, setCheckingNppId] = useState<string | null>(null);
  const [checkFonteTipo, setCheckFonteTipo] = useState<FonteTipo>('diretriz');
  const [checkFonteRef, setCheckFonteRef] = useState('');
  const [editingNppId, setEditingNppId] = useState<string | null>(null);
  const [editingNppText, setEditingNppText] = useState('');
  const checkFonteInputRef = useRef<HTMLInputElement | null>(null);

  // Banner de Desfazer exclusão (5 s) para LOG e NPP
  const [undoDeletion, setUndoDeletion] = useState<UndoDeletion | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const scheduleUndo = useCallback((payload: UndoDeletion) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setUndoDeletion(payload);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoDeletion(null);
      undoTimerRef.current = null;
    }, 5500);
  }, []);

  const updateRoute = useCallback(
    (nextSec: LeftSection, nextSlug: string | null | undefined, nextDetail: boolean) => {
      setInternalSection(nextSec);
      setInternalMobileDetail(nextDetail);
      onChangeRoute?.(nextSec, nextSlug, nextDetail);
    },
    [onChangeRoute]
  );

  // Sincroniza seleção quando a URL muda (popstate / deep-link)
  useEffect(() => {
    if (!routeSlug) return;
    if (section === 'e1' && E1_BY_SLUG.has(routeSlug)) {
      setSelectedE1Slug(routeSlug);
    } else if (section === 'e3' && E3_BY_SLUG.has(routeSlug)) {
      setSelectedE3Slug(routeSlug);
    } else if (section === 'e4' && E4_BY_SLUG.has(routeSlug)) {
      setSelectedE4Slug(routeSlug);
    }
  }, [section, routeSlug]);

  // Consome focusTarget vindo de Guias Teóricos e limpa imediatamente (evita estado preso)
  useEffect(() => {
    if (!focusTarget) return;
    let chosenSlug: string | null = null;
    if (focusTarget.slug) {
      if (focusTarget.eixo === 'e1' && E1_BY_SLUG.has(focusTarget.slug)) {
        setSelectedE1Slug(focusTarget.slug);
        chosenSlug = focusTarget.slug;
      } else if (focusTarget.eixo === 'e3' && E3_BY_SLUG.has(focusTarget.slug)) {
        setSelectedE3Slug(focusTarget.slug);
        chosenSlug = focusTarget.slug;
      } else if (focusTarget.eixo === 'e4' && E4_BY_SLUG.has(focusTarget.slug)) {
        setSelectedE4Slug(focusTarget.slug);
        chosenSlug = focusTarget.slug;
      }
    }
    updateRoute(focusTarget.eixo, chosenSlug, Boolean(chosenSlug));
    onConsumeFocusTarget?.();
  }, [focusTarget, onConsumeFocusTarget, updateRoute]);

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
  const guiaSemana = useMemo(() => guiaTeoricoDaSemana(todayIso), [todayIso]);
  const guiasGargalo = useMemo(() => recomendarGuiasPorGargalo(treino), [treino]);

  // Pré-seleciona alvo sugerido do rodízio / dia atual para [SERVIÇO]
  useEffect(() => {
    if (userPickedServicoSlug) return;
    const firstSess = passosHoje.find((p) => p.kind === 'sessao');
    const suggested =
      rodizio?.alvos?.[0] ||
      (firstSess && firstSess.kind === 'sessao' ? firstSess.slug : null) ||
      'dor-toracica';
    if (findCatalogItem(suggested)) {
      setServicoSlug(suggested);
    }
  }, [rodizio, passosHoje, userPickedServicoSlug]);

  // Preview instantâneo da linha colada do Gemini (P2) + ajuste inteligente de quickMin (P0.10)
  const parsedGeminiPreview = useMemo(() => {
    if (!geminiLineRaw.trim()) return null;
    return parseLogLineFromGemini(geminiLineRaw, todayIso, quickBaselineHint || undefined);
  }, [geminiLineRaw, todayIso, quickBaselineHint]);

  const detectedTipo = parsedGeminiPreview?.ok ? parsedGeminiPreview.draft.tipo : null;
  const erroCriticoApplies = !detectedTipo || detectedTipo === 'E3' || detectedTipo === 'E4';
  const refacaoApplies = !detectedTipo || detectedTipo === 'Nova';

  useEffect(() => {
    if (!geminiLineRaw.trim()) {
      setUserEditedMin(false);
      return;
    }
    if (parsedGeminiPreview?.ok && !userEditedMin) {
      setQuickMin(defaultMinForTipo(parsedGeminiPreview.draft.tipo));
    }
  }, [parsedGeminiPreview, geminiLineRaw, userEditedMin]);

  const activeE1 = E1_BY_SLUG.get(selectedE1Slug) || QUEIXAS_E1[0];
  const activeE3 = E3_BY_SLUG.get(selectedE3Slug) || ARQUETIPOS_E3[0];
  const activeE4 = E4_BY_SLUG.get(selectedE4Slug) || CENARIOS_E4[0];

  // P0.3: resetar estado local de NPP ao trocar de queixa E1 (evita nppOrigemId obsoleto)
  const pendingCheckTargetRef = useRef<string | null>(null);
  useEffect(() => {
    setNppOrigemId('');
    setNppNovoTexto('');
    setEditingNppId(null);
    setEditingNppText('');
    if (pendingCheckTargetRef.current) {
      setCheckingNppId(pendingCheckTargetRef.current);
      pendingCheckTargetRef.current = null;
      window.setTimeout(() => checkFonteInputRef.current?.focus(), 40);
    } else {
      setCheckingNppId(null);
    }
  }, [activeE1.slug]);

  useEffect(() => {
    if (checkingNppId) {
      window.setTimeout(() => checkFonteInputRef.current?.focus(), 30);
    }
  }, [checkingNppId]);

  const orderedLogs = useMemo(() => sortLogsChrono(treino.logs).reverse(), [treino.logs]);

  const filteredLogs = useMemo(() => {
    const qNorm = normalizeSearchText(logSearchQuery);
    const tokens = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
    return orderedLogs.filter((l) => {
      if (logFilter !== 'todos' && l.tipo !== logFilter) return false;
      if (tokens.length === 0) return true;
      const hay = normalizeSearchText(
        `${formatTargetLabel(l.slug)} ${l.slug} ${l.mecanismo || ''} ${l.tipo} ${l.veredito} ${formatLogLine(l)}`
      );
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [orderedLogs, logFilter, logSearchQuery]);

  // Listas filtradas de E1 com busca sem acento (P0.5) + filtro rápido por status (P2)
  const e1DominioBySlug = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeDominioE1>>();
    for (const q of QUEIXAS_E1) {
      map.set(q.slug, computeDominioE1(q.slug, treino.logs, todayIso));
    }
    return map;
  }, [treino.logs, todayIso]);

  const filteredE1 = useMemo(() => {
    const qNorm = normalizeSearchText(searchQuery);
    const tokens = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
    return QUEIXAS_E1.filter((item) => {
      if (e1StatusFilter !== 'todas') {
        const st = e1DominioBySlug.get(item.slug)?.status || 'pendente';
        if (e1StatusFilter === 'pendente') {
          if (st !== 'pendente' && st !== 'em_treino') return false;
        } else if (st !== e1StatusFilter) {
          return false;
        }
      }
      if (tokens.length === 0) return true;
      const hay = normalizeSearchText(`${item.num} ${String(item.num).padStart(2, '0')} ${item.nome} ${item.slug}`);
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [searchQuery, e1StatusFilter, e1DominioBySlug]);

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
  const effectiveOrigemId = useMemo(
    () =>
      origensNppValidas.some((l) => l.id === nppOrigemId)
        ? nppOrigemId
        : (origensNppValidas[0]?.id ?? ''),
    [origensNppValidas, nppOrigemId]
  );

  const handleCopy = async (text: string, msg: string) => {
    const ok = await copyToClipboard(text);
    onNotify(ok ? msg : 'Não foi possível copiar para a área de transferência.');
    return ok;
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
    const allowErroCritico = d.tipo === 'E3' || d.tipo === 'E4';

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
      erroCritico: allowErroCritico ? quickErroCritico : false,
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

    // P2: atalho de 1 clique para enviar PEMC recém-importada ao NPP
    if (
      (res.entry.tipo === 'Nova' || res.entry.tipo === 'Var' || res.entry.tipo === 'Micro') &&
      E1_BY_SLUG.has(res.entry.slug) &&
      res.entry.pemc.kind === 'omissao'
    ) {
      setRecentPemcShortcut({
        logId: res.entry.id,
        slug: res.entry.slug,
        texto: res.entry.pemc.texto,
      });
    } else {
      setRecentPemcShortcut(null);
    }

    setGeminiLineRaw('');
    setUserEditedMin(false);
    setQuickErroCritico(false);
    setQuickRefacaoPendente(false);
    const warnSuffix = res.warnings.length > 0 ? ` · Aviso: ${res.warnings[0]}` : '';
    onNotify(`Sessão registrada (${res.entry.veredito})${warnSuffix}`);
  };

  const handleSendRecentPemcToNpp = () => {
    if (!recentPemcShortcut) return;
    const res = cockpitStore.addTreinoNppItems([
      {
        slug: recentPemcShortcut.slug,
        texto: recentPemcShortcut.texto,
        origemLogId: recentPemcShortcut.logId,
      },
    ]);
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    const targetLabel = formatTargetLabel(recentPemcShortcut.slug);
    setRecentPemcShortcut(null);
    onNotify(`PEMC enviada para [CHECAR] em ${targetLabel}.`);
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

  const renderHabChips = (habIds: string[], groupKey: string) => {
    const expanded = Boolean(expandedHabGroups[groupKey]);
    const visible = expanded ? habIds : habIds.slice(0, MAX_VISIBLE_HAB_CHIPS);
    const hiddenCount = Math.max(0, habIds.length - MAX_VISIBLE_HAB_CHIPS);

    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {visible.map((id) => {
            const hab = HAB_BY_ID.get(id);
            const label = hab ? formatPrePortaTitle(hab.title) : id;
            return (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => onOpenPrePorta(id)}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-left text-[11px] font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
              >
                <span className="truncate">{label}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setExpandedHabGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
              }
              className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-[#0F766E] hover:bg-teal-50/70 dark:border-white/[0.14] dark:text-[#2DD4BF] dark:hover:bg-teal-500/10"
            >
              {expanded ? (
                <>
                  Recolher
                  <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  +{hiddenCount} {hiddenCount === 1 ? 'cartão transversal' : 'cartões transversais'}
                  <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const buildPromptForPasso = (
    p: Extract<Passo, { kind: 'sessao' }>,
    maskCasoFixo = false
  ): string => {
    if (p.prompt === 'A') {
      const tipo = p.baseline === 'A' ? 'BASELINE-A' : p.baseline === 'B' ? 'BASELINE-B' : 'Nova';
      return buildPromptA({
        dateIso: todayIso,
        tipo,
        slug: p.slug,
        servico: ambienteE1Sel,
        casoFixo: maskCasoFixo
          ? casoFixoMasked
            ? '[CONTEÚDO SIGILOSO MASCARADO]'
            : '[COLAR CASO SELADO SEM LER]'
          : casoFixoMasked,
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

  const handleAddNpp = (slug: string) => {
    const lines = nppNovoTexto
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*•]\s*/, '').replace(/^\[CHECAR\]\s*/i, '').trim())
      .filter(Boolean);
    const res = cockpitStore.addTreinoNppItems(
      lines.map((texto) => ({ slug, texto, origemLogId: effectiveOrigemId }))
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
    onNotify(
      res.sanitizedCount > 0
        ? 'Tag [CHECAR] retirada com fonte primária anonimizada (anti-PII).'
        : 'Tag [CHECAR] retirada com fonte primária registrada.'
    );
  };

  const handleSaveEditNpp = (item: NaoPodePassarItem) => {
    const trimmed = editingNppText.trim();
    if (!trimmed) return;
    cockpitStore.updateTreinoNppText(item.id, trimmed);
    setEditingNppId(null);
    setEditingNppText('');
    onNotify(
      item.checado
        ? 'Item NPP atualizado — tag [CHECAR] reativada para nova conferência.'
        : 'Item NPP atualizado.'
    );
  };

  const handleDeleteLogWithUndo = (entry: TreinoLogEntry) => {
    const res = cockpitStore.deleteTreinoLogEntry(entry.id);
    if (!res.ok) {
      onNotify(res.error);
      return;
    }
    scheduleUndo({
      kind: 'log',
      entry: res.deleted,
      index: res.index,
      label: `${formatDateDDMM(entry.dateIso)} · ${entry.tipo} · ${formatTargetLabel(entry.slug)}`,
    });
    onNotify('Linha removida do LOG.');
  };

  const handleDeleteNppWithUndo = (item: NaoPodePassarItem) => {
    const deleted = cockpitStore.deleteTreinoNppItem(item.id);
    if (!deleted) return;
    if (checkingNppId === item.id) setCheckingNppId(null);
    if (editingNppId === item.id) setEditingNppId(null);
    scheduleUndo({
      kind: 'npp',
      item: deleted.item,
      index: deleted.index,
      label: item.texto.slice(0, 60),
    });
    onNotify('Item removido de Não Pode Passar.');
  };

  const handleUndoDelete = () => {
    if (!undoDeletion) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    if (undoDeletion.kind === 'log') {
      cockpitStore.restoreTreinoLogEntry(undoDeletion.entry, undoDeletion.index);
      onNotify('Linha do LOG restaurada.');
    } else {
      cockpitStore.restoreTreinoNppItem(undoDeletion.item, undoDeletion.index);
      onNotify('Item Não Pode Passar restaurado.');
    }
    setUndoDeletion(null);
  };

  const posPlantaoHoje =
    treino.internato.posPlantaoByDate[todayIso] !== undefined
      ? treino.internato.posPlantaoByDate[todayIso]
      : central6Ano.arquetipoId === 'pos_plantao';
  const semanaPesadaAtual =
    treino.internato.semanaPesadaByWeek[weekIso] !== undefined
      ? treino.internato.semanaPesadaByWeek[weekIso]
      : central6Ano.marchaId === '2_pesada' || central6Ano.marchaId === '1_sobrevivencia';

  const isListSection = section === 'e1' || section === 'e3' || section === 'e4';

  const selectSection = (next: LeftSection) => {
    if (next === 'esteira' || next === 'log') {
      updateRoute(next, null, false);
    } else {
      const slug =
        next === 'e1' ? selectedE1Slug : next === 'e3' ? selectedE3Slug : selectedE4Slug;
      updateRoute(next, slug, false);
    }
  };

  const renderTargetOptGroups = () => (
    <>
      <optgroup label="E1 — Porta Comum">
        {QUEIXAS_E1.map((q) => (
          <option key={q.slug} value={q.slug}>
            {formatTargetLabel(q.slug)}
          </option>
        ))}
      </optgroup>
      <optgroup label="E3 — Prescrição">
        {ARQUETIPOS_E3.map((a) => (
          <option key={a.slug} value={a.slug}>
            {formatTargetLabel(a.slug)}
          </option>
        ))}
      </optgroup>
      <optgroup label="E4 — Paciente Grave">
        {CENARIOS_E4.map((c) => (
          <option key={c.slug} value={c.slug}>
            {formatTargetLabel(c.slug)}
          </option>
        ))}
      </optgroup>
    </>
  );

  const renderSectionTabs = (mobile = false) => (
    <div
      role="tablist"
      aria-label="Seções do Treino Clínico"
      className={`grid grid-cols-5 gap-1 border-b border-zinc-200/80 p-2 dark:border-white/[0.07] ${
        mobile ? 'bg-[#FAFAFA] lg:hidden dark:bg-[#0F1115]' : 'hidden lg:grid'
      }`}
    >
      {(
        [
          { id: 'esteira', label: 'Hoje' },
          { id: 'e1', label: 'E1 (20)' },
          { id: 'e3', label: 'E3 (8)' },
          { id: 'e4', label: 'E4 (7)' },
          { id: 'log', label: 'LOG' },
        ] as const
      ).map((tab) => {
        const active = section === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => selectSection(tab.id)}
            className={`rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                : 'bg-white text-zinc-600 hover:text-zinc-900 dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const renderEsteiraSummaryCards = () => (
    <div className="space-y-3">
      {bloco === 'BLOCO2_INTERNATO' && rodizio && (
        <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-3 dark:border-teal-500/25 dark:bg-teal-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0F766E] dark:text-[#2DD4BF]">
            Semana do Rodízio · {rodizio.nome}
          </p>
          <p className="mt-1 text-xs text-zinc-700 dark:text-[#D1D5DB]">
            {semanaPesadaAtual
              ? 'Marcha pesada: 1 micro + 0 caso completo.'
              : posPlantaoHoje
                ? 'Pós-plantão hoje: descanso protegido.'
                : 'Ritmo normal: 1 [SERVIÇO] + casos do rodízio.'}
          </p>
          {rodizio.alvos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {rodizio.alvos.slice(0, 4).map((slug) => (
                <span
                  key={slug}
                  className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-[#0F1115]/70 dark:text-[#D1D5DB]"
                >
                  {formatTargetLabel(slug)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* Piloto & Termômetro 10/Jan: expandidos nos blocos 0 e 1, recolhidos no Internato */}
      {bloco === 'BLOCO2_INTERNATO' ? (
        <details className="rounded-xl border border-zinc-200/80 bg-white p-3 text-xs dark:border-white/[0.07] dark:bg-[#15181F]">
          <summary className="cursor-pointer font-semibold text-zinc-600 dark:text-[#9CA3AF]">
            Histórico Piloto & Termômetro 10/jan
          </summary>
          <div className="mt-2.5 space-y-2.5 border-t border-zinc-200/70 pt-2.5 dark:border-white/[0.06]">
            <ul className="space-y-1">
              {pilotoStatuses.map((ps) => (
                <li key={ps.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-zinc-700 dark:text-[#D1D5DB]">
                    {ps.concluido ? '✓ ' : '○ '}
                    {ps.id} ({formatDateDDMM(ps.dataNominal)})
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {ps.concluido ? (ps.ok ? 'OK' : 'Auditar') : 'Pendente'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[11px] text-zinc-700 dark:text-[#D1D5DB]">
              10/jan: {contingencia.num}/{contingencia.den} (
              {contingencia.den > 0 ? Math.round((contingencia.num / contingencia.den) * 100) : 0}%) ·{' '}
              {contingencia.disparou ? 'Abaixo da meta' : 'Na meta'}
            </p>
          </div>
        </details>
      ) : (
        <>
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

          <div className="rounded-xl border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-[#15181F]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#9CA3AF]">
              Termômetro 10/jan (Meta 3H ≥ 80%)
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-800 dark:text-[#E5E7EB]">
              {contingencia.num}/{contingencia.den} (
              {contingencia.den > 0 ? Math.round((contingencia.num / contingencia.den) * 100) : 0}%)
              {' · '}
              <span
                className={
                  contingencia.disparou
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }
              >
                {contingencia.disparou ? 'Abaixo da meta' : 'Na meta'}
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );

  const renderLogExportCards = () => (
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
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#E5E7EB] dark:hover:bg-[#1C2029]"
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
  );

  const renderStructuredLogRow = (l: TreinoLogEntry, showDelete = false) => {
    const scoreText =
      l.score.kind === 'rubrica'
        ? `${l.score.valor}/4${l.score.ajuste ? ` (${l.score.ajuste})` : ''}`
        : l.score.kind === 'muletas'
          ? `${l.score.contagem} muletas${l.score.ajuste ? ` (${l.score.ajuste})` : ''}`
          : 'NA';
    const pemcText =
      l.pemc.kind === 'omissao'
        ? l.pemc.texto
        : l.pemc.kind === 'baselineSN'
          ? `PEMC=${l.pemc.valor}`
          : l.pemc.kind;

    return (
      <div
        key={l.id}
        className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50 px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
              {formatDateDDMM(l.dateIso)}
            </span>
            <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-800 dark:bg-white/[0.08] dark:text-[#E5E7EB]">
              {l.tipo}
            </span>
            <span className="font-semibold text-zinc-900 dark:text-[#F3F4F6]">
              {formatTargetLabel(l.slug)}
            </span>
            {l.mecanismo && (
              <span className="font-mono text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                · {l.mecanismo}
              </span>
            )}
            {l.ambiente && (
              <span className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">· {l.ambiente}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="text-zinc-600 dark:text-[#9CA3AF]">
              {l.min !== null ? `${l.min}m` : '__m'}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-700 dark:text-[#D1D5DB]">3H: {l.h3Bloco}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-700 dark:text-[#D1D5DB]">Score: {scoreText}</span>
            {l.iaPista !== null && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span
                  className={
                    l.iaPista
                      ? 'font-semibold text-rose-600 dark:text-rose-400'
                      : 'text-zinc-500 dark:text-[#9CA3AF]'
                  }
                >
                  IA_Pista: {l.iaPista ? 'S' : 'N'}
                </span>
              </>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                l.veredito === 'Limpo'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : l.veredito === 'Repetir'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    : 'bg-zinc-200/70 text-zinc-600 dark:bg-white/[0.07] dark:text-[#9CA3AF]'
              }`}
            >
              {l.veredito}
            </span>
          </div>

          {l.pemc.kind === 'omissao' && (
            <p className="break-words text-[11px] text-amber-800 dark:text-amber-300">
              PEMC: {pemcText}
            </p>
          )}
        </div>

        {showDelete && (
          <button
            type="button"
            onClick={() => handleDeleteLogWithUndo(l)}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
            aria-label="Excluir linha do LOG"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

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
            3H:{' '}
            <strong className="text-zinc-900 dark:text-[#F3F4F6]">
              {metrics.h3Num}/{metrics.h3Den}
            </strong>
            {metrics.h3Pct !== null ? ` (${metrics.h3Pct}%)` : ''}
          </span>
          <span className="font-mono text-zinc-600 tabular-nums dark:text-[#9CA3AF]">
            PEMC:{' '}
            <strong className="text-zinc-900 dark:text-[#F3F4F6]">
              {metrics.pemcNum}/{metrics.pemcDen}
            </strong>
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
              onClick={() => selectSection('log')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300"
            >
              <AlertTriangle className="h-3 w-3" />
              {metrics.pendentesChecar} [CHECAR]
            </button>
          )}
          {metrics.gatilhoClaudeIaPista && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              <ShieldAlert className="h-3 w-3" />
              Alerta IA_Pista: ≥2/5
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isSimulatingDate && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
              Simulando {formatDateDDMM(todayIso)}
              <button
                type="button"
                onClick={() => setTodayIso(todayIsoLocal())}
                className="ml-1 rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 hover:bg-amber-300 dark:bg-amber-400/25 dark:text-amber-100"
              >
                Hoje
              </button>
            </span>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
            <span>Data:</span>
            <input
              type="date"
              value={todayIso}
              onChange={(e) => e.target.value && setTodayIso(e.target.value)}
              className="rounded border border-zinc-200 bg-[#FAFAFA] px-1.5 py-0.5 font-mono text-[11px] text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.10] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
            />
          </label>
        </div>
      </div>

      {/* Barra de abas exclusiva do mobile (< lg): sempre visível e tocável */}
      {renderSectionTabs(true)}

      {/* Corpo Master-Detail responsivo (P0.1) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Coluna Esquerda */}
        <aside
          aria-label="Navegação do Treino Clínico"
          className={`h-full w-full flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:flex lg:w-[320px] lg:shrink-0 dark:border-white/[0.07] dark:bg-[#0F1115] ${
            isListSection ? (mobileShowDetail ? 'hidden' : 'flex') : 'hidden'
          }`}
        >
          {renderSectionTabs(false)}

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {section === 'esteira' && renderEsteiraSummaryCards()}

            {section === 'e1' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar 20 queixas..."
                    aria-label="Filtrar queixas E1"
                    className={`w-full py-1.5 pr-8 pl-8 ${WHITE_INPUT_CLS}`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpar busca de queixas E1"
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* P2: Filtros rápidos por status em E1 */}
                <div
                  role="group"
                  aria-label="Filtrar queixas E1 por status"
                  className="flex flex-wrap gap-1"
                >
                  {(
                    [
                      { id: 'todas', label: 'Todas' },
                      { id: 'pendente', label: 'Pendentes' },
                      { id: 'com_pemc', label: 'Com PEMC' },
                      { id: 'dominada', label: 'Dominadas' },
                      { id: 'revisar', label: 'Revisar' },
                    ] as const
                  ).map((opt) => {
                    const active = e1StatusFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setE1StatusFilter(opt.id)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          active
                            ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:text-[#9CA3AF] dark:hover:bg-white/[0.10]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {filteredE1.length === 0 ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center dark:border-white/[0.08]">
                    <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                      Nenhuma queixa encontrada para este filtro.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setE1StatusFilter('todas');
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#D1D5DB]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpar filtro
                    </button>
                  </div>
                ) : (
                  filteredE1.map((q) => {
                    const dom = e1DominioBySlug.get(q.slug) || computeDominioE1(q.slug, treino.logs, todayIso);
                    const locked = Boolean(q.unlockAfter && todayIso <= q.unlockAfter);
                    const badge = STATUS_BADGE[dom.status];
                    const active = selectedE1Slug === q.slug;
                    return (
                      <button
                        key={q.slug}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          setSelectedE1Slug(q.slug);
                          updateRoute('e1', q.slug, true);
                        }}
                        className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                          active
                            ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                            : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60 dark:hover:bg-[#15181F]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                            <span className="font-mono text-zinc-400">
                              #{String(q.num).padStart(2, '0')}
                            </span>
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
                  })
                )}
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
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        setSelectedE3Slug(a.slug);
                        updateRoute('e3', a.slug, true);
                      }}
                      className={`flex w-full items-start justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                          : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60 dark:hover:bg-[#15181F]'
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
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        setSelectedE4Slug(c.slug);
                        updateRoute('e4', c.slug, true);
                      }}
                      className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F766E] bg-white dark:border-[#2DD4BF] dark:bg-[#15181F]'
                          : 'border-zinc-200/70 bg-white/60 hover:bg-white dark:border-white/[0.06] dark:bg-[#15181F]/60 dark:hover:bg-[#15181F]'
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

            {section === 'log' && renderLogExportCards()}
          </div>
        </aside>

        {/* Coluna Direita — Painel de Execução */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:block ${
            isListSection ? (mobileShowDetail ? 'block' : 'hidden') : 'block'
          }`}
        >
          <div className="mx-auto max-w-4xl space-y-5">
            {/* Botão Voltar à lista no mobile para E1 / E3 / E4 */}
            {isListSection && mobileShowDetail && (
              <button
                type="button"
                onClick={() => updateRoute(section, null, false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 lg:hidden dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar à lista
              </button>
            )}

            {/* Banner de Desfazer exclusão (5 s) */}
            {undoDeletion && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100"
              >
                <span className="min-w-0 truncate">
                  Removido: <strong>{undoDeletion.label}</strong>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndoDelete}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400/80 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-[#0F1115] dark:text-amber-200"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Desfazer
                  </button>
                  <button
                    type="button"
                    onClick={() => setUndoDeletion(null)}
                    aria-label="Fechar aviso de exclusão"
                    className="rounded p-1 text-amber-700 hover:text-amber-950 dark:text-amber-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ── VISÃO 1: ESTEIRA CONTÍNUA DE HOJE ── */}
            {section === 'esteira' && (
              <>
                {/* Resumo recolhível exclusivo do mobile (< lg) */}
                <details className="rounded-xl border border-zinc-200/80 bg-white p-3 text-xs lg:hidden dark:border-white/[0.07] dark:bg-[#15181F]">
                  <summary className="cursor-pointer font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                    Resumo da 1ª Passada ({metrics.primeiraPassadaE1}/19 E1 · {metrics.primeiraPassadaE3Porta}/7 E3 · {metrics.primeiraPassadaE4}/7 E4)
                  </summary>
                  <div className="mt-3">{renderEsteiraSummaryCards()}</div>
                </details>

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
                    <div
                      role="group"
                      aria-label="Controles de marcha do Internato"
                      className="flex flex-wrap gap-1.5 text-[11px]"
                    >
                      {(
                        [
                          ['posPlantaoByDate', todayIso, 'Pós-plantão hoje', posPlantaoHoje],
                          ['semanaPesadaByWeek', weekIso, 'Semana pesada', semanaPesadaAtual],
                          [
                            'diaLivreByDate',
                            todayIso,
                            'Dia livre',
                            Boolean(treino.internato.diaLivreByDate[todayIso]),
                          ],
                          [
                            'casoRealByDate',
                            todayIso,
                            'Caso real (D2)',
                            Boolean(treino.internato.casoRealByDate[todayIso]),
                          ],
                          [
                            'semPacienteNovoSeg',
                            weekIso,
                            'Sem pac. novo seg',
                            Boolean(treino.internato.semPacienteNovoSeg[weekIso]),
                          ],
                        ] as const
                      ).map(([mapKey, key, label, val]) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={val}
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

                {/* Guia da semana + Recomendações por gargalo */}
                {(guiaSemana || guiasGargalo.length > 0) && (
                  <div className="space-y-2.5 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                    {guiaSemana &&
                      (() => {
                        const mod = FORMACAO_TEORICA_MODULOS.find((m) => m.id === guiaSemana.modId);
                        const st = central6Ano.teoriaStatusById?.[guiaSemana.modId] || 'nao_iniciado';
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                                Guia Teórico da Semana (~20 min + 3 Micro-Drills)
                              </span>
                              <p className="text-xs font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                                {mod ? mod.title : guiaSemana.motivo}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenGuiaTeorico?.(guiaSemana.modId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#0F766E] px-2.5 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-[#0F766E]/10 dark:border-[#2DD4BF] dark:text-[#2DD4BF]"
                            >
                              <span>
                                {st === 'dominado'
                                  ? '✓ Dominado · Revisar Drills'
                                  : 'Abrir Guia & 3 Micro-Drills'}
                              </span>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })()}

                    {guiasGargalo.length > 0 && (
                      <div className="space-y-1.5 border-t border-zinc-200/70 pt-2.5 dark:border-white/[0.06]">
                        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                          Recomendado pelos seus gargalos recentes no LOG:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {guiasGargalo.map((g) => {
                            const mod = FORMACAO_TEORICA_MODULOS.find((m) => m.id === g.modId);
                            return (
                              <button
                                key={g.modId}
                                type="button"
                                onClick={() => onOpenGuiaTeorico?.(g.modId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300/80 bg-amber-50/70 px-2.5 py-1 text-left text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                              >
                                <span>
                                  <strong>{mod ? `Mód. ${mod.num}` : g.modId}:</strong> {g.motivo}
                                </span>
                                <ArrowUpRight className="h-3 w-3 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                      const baselineMissingCase = isBaseline && !casoFixoMasked.trim();

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
                                {formatTargetLabel(passo.slug)}
                              </h3>
                            </div>

                            {!isBaseline && (passo.prompt === 'A' || passo.prompt === 'D1') && (
                              <select
                                aria-label="Ambiente da simulação E1"
                                value={ambienteE1Sel}
                                onChange={(e) => setAmbienteE1Sel(e.target.value as AmbienteE1)}
                                className={`px-2 py-1 ${INPUT_BASE_CLS}`}
                              >
                                <option value="UPA com retaguarda">UPA com retaguarda</option>
                                <option value="PA de cidade pequena sem laboratório no turno">
                                  PA pequeno sem lab
                                </option>
                              </select>
                            )}
                            {passo.prompt === 'C' && (
                              <select
                                aria-label="Ambiente da simulação E4"
                                value={ambienteE4Sel}
                                onChange={(e) => setAmbienteE4Sel(e.target.value as AmbienteE4)}
                                className={`px-2 py-1 ${INPUT_BASE_CLS}`}
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
                            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label
                                  htmlFor={`baseline-input-${idx}`}
                                  className="text-xs font-semibold text-amber-900 dark:text-amber-200"
                                >
                                  Caso Fixo Selado (BASELINE-{passo.baseline}) — cole sem ler (nunca salvo)
                                </label>
                                {casoFixoMasked && (
                                  <button
                                    type="button"
                                    onClick={() => setCasoFixoMasked('')}
                                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-[#0F1115] dark:text-amber-200"
                                  >
                                    <X className="h-3 w-3" />
                                    Limpar campo selado
                                  </button>
                                )}
                              </div>
                              <input
                                id={`baseline-input-${idx}`}
                                type="password"
                                autoComplete="off"
                                value={casoFixoMasked}
                                onChange={(e) => setCasoFixoMasked(e.target.value)}
                                placeholder="Cole aqui o conteúdo do caso selado (sem ler)"
                                className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-500 dark:border-amber-500/30 dark:bg-[#0F1115] dark:text-[#F3F4F6]"
                              />
                              {baselineMissingCase && (
                                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                  Cole o caso selado acima antes de copiar o Prompt A de BASELINE.
                                </p>
                              )}
                            </div>
                          )}

                          {passo.prompt === 'D2' && (
                            <div className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/[0.08] dark:bg-[#0F1115]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                                  Debriefing real (LGPD — zero nome/CPF/prontuário)
                                </span>
                                <select
                                  aria-label="Eixo do caso D2"
                                  value={d2Eixo}
                                  onChange={(e) => setD2Eixo(e.target.value as Eixo)}
                                  className={`px-2 py-0.5 ${WHITE_INPUT_CLS}`}
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
                                className={`w-full p-2 ${WHITE_INPUT_CLS}`}
                              />
                              <PiiInlineAlert
                                text={d2Relato}
                                onAnonymize={() => setD2Relato((p) => sanitizePiiText(p).sanitized)}
                              />
                            </div>
                          )}

                          {/* CTA principal posicionado acima dos chips Pré-Porta (P1) */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={async () => {
                                if (baselineMissingCase) {
                                  onNotify('Cole o caso selado no campo acima antes de copiar o Prompt A de BASELINE.');
                                  return;
                                }
                                const ok = await handleCopy(
                                  buildPromptForPasso(passo, false),
                                  `Prompt ${passo.prompt} (${formatTargetLabel(passo.slug)}) copiado para o Gemini!`
                                );
                                if (ok && isBaseline) {
                                  setCasoFixoMasked('');
                                }
                              }}
                              disabled={baselineMissingCase}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                              Copiar Prompt {passo.prompt} para o Gemini
                            </button>

                            {passo.visual && !treino.visual[passo.slug]?.feitoEm && (
                              <button
                                type="button"
                                onClick={() => {
                                  cockpitStore.markTreinoVisualDone(passo.slug, todayIso);
                                  onNotify(
                                    `Bloco visual ${passo.visual} (${formatTargetLabel(passo.slug)}) marcado como concluído.`
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Marcar Visual {passo.visual} feito
                              </button>
                            )}
                          </div>

                          {habs.length > 0 &&
                            renderHabChips(habs, `passo-${idx}-${passo.slug}-${passo.prompt}`)}

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
                              aria-label="Alvo clínico da observação em serviço"
                              value={servicoSlug}
                              onChange={(e) => {
                                setServicoSlug(e.target.value);
                                setUserPickedServicoSlug(true);
                              }}
                              className={`px-2 py-1.5 ${WHITE_INPUT_CLS}`}
                            >
                              {renderTargetOptGroups()}
                            </select>
                            <select
                              aria-label="Resultado da observação em serviço"
                              value={servicoResultado}
                              onChange={(e) =>
                                setServicoResultado(e.target.value as 'apontamento' | 'recusa')
                              }
                              className={`px-2 py-1.5 ${WHITE_INPUT_CLS}`}
                            >
                              <option value="apontamento">Preceptor observou (apontamento)</option>
                              <option value="recusa">Preceptor recusou (cumpre sem falha)</option>
                            </select>
                            <input
                              type="text"
                              value={servicoTexto}
                              onChange={(e) => setServicoTexto(e.target.value)}
                              placeholder="Apontamento em 1 frase..."
                              className={`px-2.5 py-1.5 ${WHITE_INPUT_CLS}`}
                            />
                          </div>
                          <PiiInlineAlert
                            text={servicoTexto}
                            onAnonymize={() => setServicoTexto((p) => sanitizePiiText(p).sanitized)}
                          />
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
                              aria-label="Alvo da gravação semanal"
                              value={gravSlug}
                              onChange={(e) => setGravSlug(e.target.value)}
                              className={`px-2 py-1.5 ${INPUT_BASE_CLS}`}
                            >
                              {renderTargetOptGroups()}
                            </select>
                            <input
                              type="number"
                              min={0}
                              value={gravMuletas}
                              onChange={(e) => setGravMuletas(e.target.value)}
                              placeholder="Qtd muletas"
                              className={`px-2 py-1.5 ${INPUT_BASE_CLS}`}
                            />
                            <input
                              type="text"
                              value={gravAjuste}
                              onChange={(e) => setGravAjuste(e.target.value)}
                              placeholder="1 ajuste vocal"
                              className={`px-2 py-1.5 ${INPUT_BASE_CLS}`}
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
                            <strong>{passo.pendentesChecar}</strong> item(ns) com{' '}
                            <code>[CHECAR]</code>.
                          </span>
                          <button
                            type="button"
                            onClick={() => selectSection('log')}
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
                            {MARCO_LABEL[passo.marco] || passo.marco}
                          </p>
                          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                            {passo.marco === 'congelamento_2026-11-29' &&
                              'Auditar computabilidade do LOG do piloto (15 min) e confirmar a estrutura do plano.'}
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

                {/* P1: Resumo clicável dos 4 Blocos Visuais (ECG+RX / ECG) — acessível em qualquer dia */}
                <details className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 text-xs dark:border-white/[0.07] dark:bg-[#15181F]">
                  <summary className="cursor-pointer font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                    Blocos Visuais ECG / RX ({Object.keys(treino.visual).length}/{VISUAL_QUEIXAS.length} concluídos)
                  </summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {VISUAL_QUEIXAS.map((q) => {
                      const doneDate = treino.visual[q.slug]?.feitoEm;
                      return (
                        <div
                          key={q.slug}
                          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50 px-2.5 py-2 dark:border-white/[0.06] dark:bg-[#0F1115]"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-900 dark:text-[#F3F4F6]">
                              {formatTargetLabel(q.slug)}
                            </p>
                            <p className="font-mono text-[10px] text-indigo-700 dark:text-indigo-300">
                              {q.visualTipo} {doneDate ? `· feito em ${formatDateDDMM(doneDate)}` : '· pendente'}
                            </p>
                          </div>
                          {doneDate ? (
                            <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                              ✓ Feito
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                cockpitStore.markTreinoVisualDone(q.slug, todayIso);
                                onNotify(`Bloco visual ${q.visualTipo} (${formatTargetLabel(q.slug)}) marcado.`);
                              }}
                              className="shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
                            >
                              Marcar feito
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>

                {/* Card Universal de Importação da Linha do Gemini */}
                <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-[#D1D5DB]">
                    <Sparkles className="h-3.5 w-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                    Registrar 1ª Tentativa (colar linha final ditada pelo Gemini)
                  </div>
                  <textarea
                    rows={2}
                    value={geminiLineRaw}
                    onChange={(e) => {
                      setGeminiLineRaw(e.target.value);
                      setImportError(null);
                    }}
                    placeholder="Ex.: 21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo"
                    className={`w-full p-2.5 font-mono ${INPUT_BASE_CLS}`}
                  />

                  <PiiInlineAlert
                    text={geminiLineRaw}
                    onAnonymize={() => setGeminiLineRaw((p) => sanitizePiiText(p).sanitized)}
                  />

                  {/* P2: Preview instantâneo da linha do LOG antes de salvar */}
                  {parsedGeminiPreview && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-[11px] ${
                        parsedGeminiPreview.ok
                          ? 'border-teal-200 bg-teal-50/70 text-zinc-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-[#E5E7EB]'
                          : 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
                      }`}
                    >
                      {parsedGeminiPreview.ok ? (
                        <div className="flex flex-wrap items-center gap-1.5 font-mono">
                          <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                            Prévia:
                          </span>
                          <span>{formatDateDDMM(parsedGeminiPreview.draft.dateIso)}</span>
                          <span>·</span>
                          <span className="font-semibold">{parsedGeminiPreview.draft.tipo}</span>
                          <span>·</span>
                          <span>{formatTargetLabel(parsedGeminiPreview.draft.slug)}</span>
                          <span>·</span>
                          <span
                            className={
                              parsedGeminiPreview.draft.minPendente
                                ? 'font-semibold text-amber-700 dark:text-amber-300'
                                : ''
                            }
                          >
                            {parsedGeminiPreview.draft.minPendente
                              ? `Min pendente (usará ${quickMin}m)`
                              : `${parsedGeminiPreview.draft.min}m`}
                          </span>
                          <span>·</span>
                          <span>3H={parsedGeminiPreview.draft.h3Bloco}</span>
                          <span>·</span>
                          <span>
                            PEMC=
                            {parsedGeminiPreview.draft.pemc.kind === 'omissao'
                              ? parsedGeminiPreview.draft.pemc.texto
                              : parsedGeminiPreview.draft.pemc.kind === 'baselineSN'
                                ? parsedGeminiPreview.draft.pemc.valor
                                : parsedGeminiPreview.draft.pemc.kind}
                          </span>
                          <span>·</span>
                          <span>Veredito IA: {parsedGeminiPreview.draft.vereditoIA}</span>
                        </div>
                      ) : (
                        <span>Formato ainda inválido: {parsedGeminiPreview.error}</span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">Min reais:</span>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={quickMin}
                        onChange={(e) => {
                          setQuickMin(e.target.value);
                          setUserEditedMin(true);
                        }}
                        className={`w-16 px-2 py-1 font-mono ${INPUT_BASE_CLS}`}
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-600 dark:text-[#9CA3AF]">IA_Pista?:</span>
                      <select
                        value={quickIaPista}
                        onChange={(e) => setQuickIaPista(e.target.value as 'N' | 'S')}
                        className={`px-2 py-1 ${INPUT_BASE_CLS}`}
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
                        className={`px-2 py-1 ${INPUT_BASE_CLS}`}
                      >
                        <option value="">Auto</option>
                        <option value="A">BASELINE-A</option>
                        <option value="B">BASELINE-B</option>
                      </select>
                    </label>
                    <label
                      className={`inline-flex items-center gap-1 ${
                        erroCriticoApplies
                          ? 'text-zinc-700 dark:text-[#D1D5DB]'
                          : 'text-zinc-400 opacity-50 dark:text-[#6B7280]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!erroCriticoApplies}
                        checked={erroCriticoApplies && quickErroCritico}
                        onChange={(e) => setQuickErroCritico(e.target.checked)}
                      />
                      Erro crítico (E3/E4)
                    </label>
                    <label
                      className={`inline-flex items-center gap-1 ${
                        refacaoApplies
                          ? 'text-zinc-700 dark:text-[#D1D5DB]'
                          : 'text-zinc-400 opacity-50 dark:text-[#6B7280]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!refacaoApplies}
                        checked={refacaoApplies && quickRefacaoPendente}
                        onChange={(e) => setQuickRefacaoPendente(e.target.checked)}
                      />
                      Refação pendente (Nova)
                    </label>
                    {bloco === 'BLOCO0_PILOTO' && (
                      <label className="inline-flex items-center gap-1 text-zinc-700 dark:text-[#D1D5DB]">
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

                  {/* P2: Atalho de 1 clique para enviar PEMC recém-importada ao NPP */}
                  {recentPemcShortcut && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100">
                      <span className="min-w-0 flex-1">
                        PEMC registrada em <strong>{formatTargetLabel(recentPemcShortcut.slug)}</strong>:{' '}
                        “{recentPemcShortcut.texto}”
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSendRecentPemcToNpp}
                          className="rounded-md bg-amber-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-zinc-950"
                        >
                          Enviar para [CHECAR]
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecentPemcShortcut(null)}
                          aria-label="Dispensar atalho PEMC"
                          className="rounded p-1 text-amber-700 hover:text-amber-950 dark:text-amber-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── VISÃO 2: E1 (20 QUEIXAS) ── */}
            {section === 'e1' &&
              (() => {
                const dom = computeDominioE1(activeE1.slug, treino.logs, todayIso);
                const mecs = mecanismosUsadosDe(activeE1.slug, treino.logs);
                const locked = Boolean(activeE1.unlockAfter && todayIso <= activeE1.unlockAfter);
                const slugLogs = orderedLogs.filter((l) => l.slug === activeE1.slug);
                const promptAPreview = buildPromptA({
                  dateIso: todayIso,
                  tipo: 'Nova',
                  slug: activeE1.slug,
                  servico: ambienteE1Sel,
                });
                const promptD1Preview = buildPromptD1({
                  dateIso: todayIso,
                  slug: activeE1.slug,
                  servico: ambienteE1Sel,
                  mecanismosUsados: mecs,
                });
                const isBaselineQueixa = activeE1.reservedBaseline;

                return (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs text-zinc-400">
                            E1 · Queixa #{String(activeE1.num).padStart(2, '0')}
                          </span>
                          <h2 className="text-lg font-bold text-zinc-900 dark:text-[#F3F4F6]">
                            {activeE1.nome}
                          </h2>
                        </div>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[dom.status].cls}`}
                        >
                          {locked ? 'Reservada BASELINE até 24/jan' : STATUS_BADGE[dom.status].label}
                        </span>
                      </div>

                      {/* P1: Status de BASELINE-A e BASELINE-B na queixa #20 */}
                      {isBaselineQueixa && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span
                            className={`rounded-md px-2 py-1 font-medium ${
                              relatorioBaseline.baseA
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                            }`}
                          >
                            BASELINE-A (29/nov):{' '}
                            {relatorioBaseline.baseA
                              ? `Concluído (${relatorioBaseline.baseA.veredito})`
                              : 'Pendente'}
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 font-medium ${
                              relatorioBaseline.baseB
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                            }`}
                          >
                            BASELINE-B (24/jan):{' '}
                            {relatorioBaseline.baseB
                              ? `Concluído (${relatorioBaseline.baseB.veredito})`
                              : 'Pendente'}
                          </span>
                        </div>
                      )}

                      {/* P0.7: Seletor de ambiente + CTAs Prompt A / D1 */}
                      {!locked && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label="Ambiente da simulação E1"
                            value={ambienteE1Sel}
                            onChange={(e) => setAmbienteE1Sel(e.target.value as AmbienteE1)}
                            className={`px-2 py-1.5 ${INPUT_BASE_CLS}`}
                          >
                            <option value="UPA com retaguarda">UPA com retaguarda</option>
                            <option value="PA de cidade pequena sem laboratório no turno">
                              PA pequeno sem lab
                            </option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                promptAPreview,
                                `Prompt A (${formatTargetLabel(activeE1.slug)}) copiado!`
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
                                promptD1Preview,
                                `Prompt D1 (${formatTargetLabel(activeE1.slug)}) copiado!`
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F766E] px-3 py-1.5 text-xs font-semibold text-[#0F766E] dark:border-[#2DD4BF] dark:text-[#2DD4BF]"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                            Copiar Prompt D1 (Variante)
                          </button>
                        </div>
                      )}

                      {renderHabChips(habIdsDe(activeE1), `e1-${activeE1.slug}`)}

                      <p className="text-xs text-zinc-600 dark:text-[#9CA3AF]">
                        Mecanismos já usados:{' '}
                        <span className="font-mono font-medium text-zinc-800 dark:text-[#E5E7EB]">
                          {mecs.length > 0 ? mecs.join(', ') : 'nenhum'}
                        </span>
                      </p>

                      {!locked && (
                        <details className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]">
                          <summary className="cursor-pointer font-medium text-zinc-600 dark:text-[#9CA3AF]">
                            Ver prévia do Prompt A / D1
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                            {promptAPreview}
                          </pre>
                        </details>
                      )}
                    </div>

                    {/* Não Pode Passar da Queixa */}
                    <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
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
                              {editingNppId === it.id ? (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNppText}
                                    onChange={(e) => setEditingNppText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEditNpp(it);
                                      } else if (e.key === 'Escape') {
                                        setEditingNppId(null);
                                      }
                                    }}
                                    className={`w-full px-2.5 py-1.5 ${WHITE_INPUT_CLS}`}
                                  />
                                  <PiiInlineAlert
                                    text={editingNppText}
                                    onAnonymize={() =>
                                      setEditingNppText((p) => sanitizePiiText(p).sanitized)
                                    }
                                  />
                                  {it.checado && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                      Editar o texto reativa a tag [CHECAR] até nova validação em fonte primária.
                                    </p>
                                  )}
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditingNppId(null)}
                                      className="rounded px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200/60 dark:text-[#9CA3AF]"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEditNpp(it)}
                                      className="rounded bg-[#0F766E] px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                        it.checado
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                      }`}
                                    >
                                      {it.checado ? 'VALIDADO' : '[CHECAR]'}
                                    </span>
                                    <span className="break-words text-zinc-800 dark:text-[#E5E7EB]">
                                      {it.texto}
                                    </span>
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
                                        onClick={() =>
                                          setCheckingNppId(checkingNppId === it.id ? null : it.id)
                                        }
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
                                      onClick={() => {
                                        setEditingNppId(it.id);
                                        setEditingNppText(it.texto);
                                        setCheckingNppId(null);
                                      }}
                                      aria-label="Editar item NPP"
                                      className="rounded p-1 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-white/[0.06] dark:hover:text-[#F3F4F6]"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteNppWithUndo(it)}
                                      className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                                      aria-label="Excluir item NPP"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {checkingNppId === it.id && (
                                <div className="mt-2 space-y-2 border-t border-zinc-200/70 pt-2 dark:border-white/[0.06]">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      aria-label="Tipo de fonte primária"
                                      value={checkFonteTipo}
                                      onChange={(e) => setCheckFonteTipo(e.target.value as FonteTipo)}
                                      className={`px-2 py-1 text-[11px] ${WHITE_INPUT_CLS}`}
                                    >
                                      <option value="diretriz">Diretriz</option>
                                      <option value="protocolo_oficial">
                                        Protocolo oficial (MS/HC-FMRP)
                                      </option>
                                      <option value="bula_profissional">Bula profissional</option>
                                    </select>
                                    <input
                                      ref={checkFonteInputRef}
                                      type="text"
                                      value={checkFonteRef}
                                      onChange={(e) => setCheckFonteRef(e.target.value)}
                                      placeholder="Ex.: Diretriz SBC SCA 2025, p. 18 (≥10 chars)"
                                      className={`min-w-[200px] flex-1 px-2 py-1 text-[11px] ${WHITE_INPUT_CLS}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmCheckNpp(it)}
                                      className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                                    >
                                      Confirmar
                                    </button>
                                  </div>
                                  <PiiInlineAlert
                                    text={checkFonteRef}
                                    onAnonymize={() =>
                                      setCheckFonteRef((p) => sanitizePiiText(p).sanitized)
                                    }
                                  />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {origensNppValidas.length > 0 && nppDaQueixa.length < 6 && (
                        <div className="space-y-2 border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
                          <select
                            aria-label="Sessão de origem da PEMC"
                            value={effectiveOrigemId}
                            onChange={(e) => setNppOrigemId(e.target.value)}
                            className={`w-full px-2.5 py-1.5 ${INPUT_BASE_CLS}`}
                          >
                            {origensNppValidas.map((o) => (
                              <option key={o.id} value={o.id}>
                                Origem: {formatDateDDMM(o.dateIso)} · {o.tipo} (
                                {o.mecanismo || formatTargetLabel(o.slug)}) —{' '}
                                {o.pemc.kind === 'omissao' ? o.pemc.texto : ''}
                              </option>
                            ))}
                          </select>
                          <textarea
                            rows={2}
                            value={nppNovoTexto}
                            onChange={(e) => setNppNovoTexto(e.target.value)}
                            placeholder="Cole 1 item por linha (máx. 6 no total)..."
                            className={`w-full p-2 ${INPUT_BASE_CLS}`}
                          />
                          <PiiInlineAlert
                            text={nppNovoTexto}
                            onAnonymize={() =>
                              setNppNovoTexto((p) => sanitizePiiText(p).sanitized)
                            }
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
                        <p className="mt-2 text-xs text-zinc-500">
                          Nenhuma sessão registrada ainda.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {slugLogs.map((l) => renderStructuredLogRow(l, false))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* ── VISÃO 3: E3 (8 ARQUÉTIPOS) ── */}
            {section === 'e3' &&
              (() => {
                const locked = Boolean(activeE3.unlockAfter && todayIso <= activeE3.unlockAfter);
                const ambSug = sugerirAmbienteE3(activeE3.slug, treino.logs);
                const dom = computeDominioE3E4('E3', activeE3.slug, treino.logs);
                const slugLogs = orderedLogs.filter((l) => l.slug === activeE3.slug);
                const promptBPreview = buildPromptB({
                  dateIso: todayIso,
                  slug: activeE3.slug,
                  servico: ambSug,
                });

                return (
                  <div className="space-y-4">
                    <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs text-zinc-400">
                            E3 · Arquétipo #{activeE3.num} · {activeE3.rubrica}
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

                      <p className="text-xs text-zinc-600 dark:text-[#9CA3AF]">
                        Ambiente sugerido automaticamente: <strong>{ambSug}</strong>
                      </p>

                      {locked ? (
                        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          Este arquétipo ({activeE3.nome}) libera automaticamente após 24/01/2027.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {activeE3.ambientesPermitidos.map((amb) => (
                            <button
                              key={amb}
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  buildPromptB({
                                    dateIso: todayIso,
                                    slug: activeE3.slug,
                                    servico: amb,
                                  }),
                                  `Prompt B (${activeE3.nome} · ${amb}) copiado!`
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

                      {renderHabChips(habIdsDe(activeE3), `e3-${activeE3.slug}`)}

                      {!locked && (
                        <details className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]">
                          <summary className="cursor-pointer font-medium text-zinc-600 dark:text-[#9CA3AF]">
                            Ver prévia do Prompt B ({ambSug})
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                            {promptBPreview}
                          </pre>
                        </details>
                      )}
                    </div>

                    {/* P1: Histórico filtrado por alvo E3 */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F3F4F6]">
                        Histórico ({slugLogs.length})
                      </h3>
                      {slugLogs.length === 0 ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          Nenhuma sessão registrada ainda para este arquétipo.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {slugLogs.map((l) => renderStructuredLogRow(l, false))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* ── VISÃO 4: E4 (7 CENÁRIOS) ── */}
            {section === 'e4' &&
              (() => {
                const dom = computeDominioE3E4('E4', activeE4.slug, treino.logs);
                const slugLogs = orderedLogs.filter((l) => l.slug === activeE4.slug);
                const promptCPreview = buildPromptC({
                  dateIso: todayIso,
                  slug: activeE4.slug,
                  servico: ambienteE4Sel,
                });

                return (
                  <div className="space-y-4">
                    <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs text-zinc-400">
                            E4 · Cenário #{activeE4.num}
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

                      <div className="flex flex-wrap gap-2">
                        {(['UPA com sala vermelha', 'PA de cidade pequena'] as AmbienteE4[]).map(
                          (amb) => (
                            <button
                              key={amb}
                              type="button"
                              onClick={() => {
                                setAmbienteE4Sel(amb);
                                handleCopy(
                                  buildPromptC({
                                    dateIso: todayIso,
                                    slug: activeE4.slug,
                                    servico: amb,
                                  }),
                                  `Prompt C (${activeE4.nome} · ${amb}) copiado!`
                                );
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                              Copiar Prompt C ({amb})
                            </button>
                          )
                        )}
                      </div>

                      {renderHabChips(habIdsDe(activeE4), `e4-${activeE4.slug}`)}

                      <details className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-[#0F1115]">
                        <summary className="cursor-pointer font-medium text-zinc-600 dark:text-[#9CA3AF]">
                          Ver prévia do Prompt C ({ambienteE4Sel})
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-[#D1D5DB]">
                          {promptCPreview}
                        </pre>
                      </details>
                    </div>

                    {/* P1: Histórico filtrado por alvo E4 */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F3F4F6]">
                        Histórico ({slugLogs.length})
                      </h3>
                      {slugLogs.length === 0 ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          Nenhuma sessão registrada ainda para este cenário.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {slugLogs.map((l) => renderStructuredLogRow(l, false))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* ── VISÃO 5: LOG COMPLETO & PENDÊNCIAS [CHECAR] ── */}
            {section === 'log' && (
              <div className="space-y-4">
                {/* Exportações e Comparativo Baseline recolhível no mobile (< lg) */}
                <details className="rounded-xl border border-zinc-200/80 bg-white p-3 text-xs lg:hidden dark:border-white/[0.07] dark:bg-[#15181F]">
                  <summary className="cursor-pointer font-semibold text-zinc-700 dark:text-[#D1D5DB]">
                    Exportar LOG / Não Pode Passar & Comparativo Baseline
                  </summary>
                  <div className="mt-3">{renderLogExportCards()}</div>
                </details>

                <div className="space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#15181F]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-[#F3F4F6]">
                      LOG de Sessões ({filteredLogs.length})
                    </h2>
                    <div
                      role="group"
                      aria-label="Filtrar LOG por tipo"
                      className="flex flex-wrap gap-1"
                    >
                      {(
                        [
                          'todos',
                          'Nova',
                          'Var',
                          'E3',
                          'E4',
                          'Micro',
                          'SERVIÇO',
                          'GRAVAÇÃO',
                          'BASELINE',
                        ] as const
                      ).map((f) => {
                        const active = logFilter === f;
                        return (
                          <button
                            key={f}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setLogFilter(f)}
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                              active
                                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-[#9CA3AF]'
                            }`}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* P2: Busca leve sem acento no LOG */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      placeholder="Buscar no LOG por queixa, mecanismo, PEMC ou veredito..."
                      aria-label="Buscar no LOG de sessões"
                      className={`w-full py-1.5 pr-8 pl-8 ${INPUT_BASE_CLS}`}
                    />
                    {logSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setLogSearchQuery('')}
                        aria-label="Limpar busca do LOG"
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:text-[#9CA3AF]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {filteredLogs.length === 0 ? (
                    <div className="space-y-2 py-4 text-center">
                      <p className="text-xs text-zinc-500">
                        Nenhuma linha registrada neste filtro.
                      </p>
                      {(logFilter !== 'todos' || logSearchQuery.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogFilter('todos');
                            setLogSearchQuery('');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB]"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Limpar filtros
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredLogs.map((l) => renderStructuredLogRow(l, true))}
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
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10"
                          >
                            <span className="min-w-0 flex-1 break-words text-zinc-800 dark:text-[#E5E7EB]">
                              <strong className="font-semibold">
                                {formatTargetLabel(n.slug)}:
                              </strong>{' '}
                              {n.texto}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                pendingCheckTargetRef.current = n.id;
                                setSelectedE1Slug(n.slug);
                                if (activeE1.slug === n.slug) {
                                  setCheckingNppId(n.id);
                                  pendingCheckTargetRef.current = null;
                                }
                                updateRoute('e1', n.slug, true);
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
