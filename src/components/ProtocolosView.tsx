import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  Pill,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import { resolveClinicalLinksForPep } from '../data/clinical_links.ts';
import {
  analyzeSectionGaps,
  applyPatientContextToAstState,
  compileProtocolForDisplay,
  countOpenBracketsInFreeText,
  EMPTY_GAP_REPORT,
  EMPTY_PATIENT_CONTEXT,
  auditProtocolPrescription,
  patientContextHasValues,
  GLOBAL_SEARCH_INDEX,
  PEP_PROTOCOLS,
  PROTOCOL_BY_ID,
  serializeProtocolSection,
  splitGuiaIntoSections,
  walkInlineNodes,
  type PatientContextInput,
  type PepAstSection,
  type PepSectionId,
  type SectionGapReport,
} from '../data/protocolsRepo.ts';
import type { AstSelectionState, ChoiceGroupNode, InlineInputNode } from '../engine/pepAst.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import type { PrescriptionAuditReport } from '../engine/prescriptionGuard.ts';
import {
  classifyGuiaSectionTheme,
  formatPrePortaTitle,
  renderGuiaSectionBodyHtml,
} from '../engine/diretrizes.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import { PepBlockRenderer } from './PepBlockRenderer.tsx';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

type AreaFilter = 'todos' | 'go' | 'upa' | 'enf' | 'ped';

/** Alvo de cópia: protocolo inteiro ou uma seção. */
type CopyKey = 'all' | PepSectionId;

/**
 * Atalhos de cópia (mesmo mapa das "Power Actions" do PEP antigo), ativos fora de campos de texto:
 * 1 = Tudo · 2 = Conduta · 3 = Prescrição · 4 = Evolução · 5 = Orientações. Alt+C = Copiar tudo.
 */
const COPY_SHORTCUTS: Record<string, CopyKey> = {
  '1': 'all',
  '2': 'conduta',
  '3': 'receita',
  '4': 'evolucao',
  '5': 'orientacoes',
};

const COPY_SHORTCUT_BY_KEY: Partial<Record<CopyKey, string>> = {
  all: '1',
  conduta: '2',
  receita: '3',
  evolucao: '4',
  orientacoes: '5',
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function addGapReports(a: SectionGapReport, b: SectionGapReport): SectionGapReport {
  const openFields = a.openFields + b.openFields;
  const unselectedChoices = a.unselectedChoices + b.unselectedChoices;
  const missingWeightForDoses = a.missingWeightForDoses || b.missingWeightForDoses;
  return {
    openFields,
    identificationFields: a.identificationFields + b.identificationFields,
    unselectedChoices,
    missingWeightForDoses,
    total: openFields + unselectedChoices + (missingWeightForDoses ? 1 : 0),
  };
}

/** Alertas do auditor de prescrição exibidos no topo da seção (Prescrição trava; Conduta só informa). */
function GuardAlertList({
  report,
  anchorId,
  blocking,
}: {
  report: PrescriptionAuditReport | null;
  anchorId: string;
  blocking: boolean;
}) {
  if (!report || report.alerts.length === 0) return null;
  return (
    <div
      id={anchorId}
      className="scroll-mt-20 space-y-1.5 border-b border-zinc-200/80 px-4 py-3 dark:border-white/[0.08]"
    >
      {report.alerts.map((a) => {
        const isBlock = a.severity === 'block';
        const tone =
          isBlock && blocking
            ? 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
            : isBlock || a.severity === 'warn'
              ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
              : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-[#D1D5DB]';
        return (
          <div
            key={a.id}
            role={isBlock && blocking ? 'alert' : undefined}
            className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${tone}`}
          >
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold">{a.title}</span>
              {a.detail && <span className="opacity-90"> — {a.detail}</span>}
            </div>
          </div>
        );
      })}
      {!blocking && (
        <p className="text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
          Itens da Conduta costumam ser condicionais: estes alertas não travam a cópia.
        </p>
      )}
    </div>
  );
}

function describeGapReport(report: SectionGapReport): string[] {
  const parts: string[] = [];
  if (report.missingWeightForDoses) parts.push('peso não informado (doses por kg não calculadas)');
  if (report.openFields > 0) {
    parts.push(
      `${report.openFields} ${report.openFields === 1 ? 'campo clínico vazio' : 'campos clínicos vazios'}`
    );
  }
  if (report.unselectedChoices > 0) {
    parts.push(
      `${report.unselectedChoices} ${
        report.unselectedChoices === 1 ? 'escolha sem seleção (some do texto)' : 'escolhas sem seleção (somem do texto)'
      }`
    );
  }
  return parts;
}

const AREA_FILTERS: Array<{ id: AreaFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'go', label: 'GO' },
  { id: 'upa', label: 'UPA' },
  { id: 'enf', label: 'Enfermaria' },
  { id: 'ped', label: 'Pediatria' },
];

const AREA_DOT_CLASS: Partial<Record<ClinicalProtocolItem['mod_id'], string>> = {
  go: 'bg-rose-500 dark:bg-rose-400',
  upa: 'bg-amber-500 dark:bg-amber-400',
  enf: 'bg-sky-500 dark:bg-sky-400',
  ped: 'bg-emerald-500 dark:bg-emerald-400',
};

const AREA_ACTIVE_BORDER_CLASS: Partial<Record<ClinicalProtocolItem['mod_id'], string>> = {
  go: 'border-l-rose-500 dark:border-l-rose-400',
  upa: 'border-l-amber-500 dark:border-l-amber-400',
  enf: 'border-l-sky-500 dark:border-l-sky-400',
  ped: 'border-l-emerald-500 dark:border-l-emerald-400',
};

const SECTION_VISUAL_STYLE: Record<
  PepSectionId,
  {
    borderClass: string;
    headerBgClass: string;
    titleClass: string;
    dotClass: string;
    shortLabel: string;
    Icon: typeof FileText;
  }
> = {
  evolucao: {
    borderClass: 'border-l-[3px] border-l-sky-500',
    headerBgClass: 'bg-sky-500/[0.06]',
    titleClass: 'text-sky-700 dark:text-sky-400',
    dotClass: 'bg-sky-500 dark:bg-sky-400',
    shortLabel: 'Evolução',
    Icon: FileText,
  },
  conduta: {
    borderClass: 'border-l-[3px] border-l-indigo-500',
    headerBgClass: 'bg-indigo-500/[0.06]',
    titleClass: 'text-indigo-700 dark:text-indigo-400',
    dotClass: 'bg-indigo-500 dark:bg-indigo-400',
    shortLabel: 'Conduta',
    Icon: ClipboardList,
  },
  receita: {
    borderClass: 'border-l-[3px] border-l-teal-500',
    headerBgClass: 'bg-teal-500/[0.07]',
    titleClass: 'text-teal-700 dark:text-teal-400',
    dotClass: 'bg-teal-500 dark:bg-teal-400',
    shortLabel: 'Prescrição',
    Icon: Pill,
  },
  orientacoes: {
    borderClass: 'border-l-[3px] border-l-amber-500',
    headerBgClass: 'bg-amber-500/[0.07]',
    titleClass: 'text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500 dark:bg-amber-400',
    shortLabel: 'Orientações',
    Icon: ShieldAlert,
  },
  geral: {
    borderClass: 'border-l-[3px] border-l-zinc-400 dark:border-l-zinc-500',
    headerBgClass: 'bg-zinc-500/[0.04]',
    titleClass: 'text-zinc-700 dark:text-zinc-300',
    dotClass: 'bg-zinc-400 dark:bg-zinc-500',
    shortLabel: 'Geral',
    Icon: FileText,
  },
};

const MOD_LABELS: Record<ClinicalProtocolItem['mod_id'], string> = {
  go: 'GO',
  upa: 'UPA',
  enf: 'Enfermaria',
  ped: 'Pediatria',
  hab: 'Pré-Porta',
};

const MOD_TO_RODIZIO: Record<string, string> = {
  go: 'go',
  upa: 'emergencia_trauma',
  enf: 'cm',
  ped: 'ped',
};

const SUBCAT_DISPLAY_MAP: Record<string, string> = {
  'Enfermaria Puerperio': 'Enfermaria Puerpério',
  'Ambulatorio GO': 'Ambulatório GO',
  'Procedimentos Ambulatoriais': 'Procedimentos Ambulatoriais',
  'Centro Obstetrico Cirurgias': 'Centro Obstétrico & Cirurgias',
  'Emergencias GO': 'Emergências GO',
  'Triagem e Ficha Mestra': 'Triagem e Ficha Mestra',
  'Infeccoes e Vias Aereas': 'Infecções e Vias Aéreas',
  'Gastrointestinal e Abdominal': 'Gastrointestinal e Abdominal',
  'Cardiovascular e Respiratorio': 'Cardiovascular e Respiratório',
  'Neurologia e Saude Mental': 'Neurologia e Saúde Mental',
  'Nefrologia Urologia e Dermatologia': 'Nefrologia, Urologia e Dermatologia',
  'Emergencias Graves e Procedimentos': 'Emergências Graves e Procedimentos',
  'Admissao e Avaliacao Inicial': 'Admissão e Avaliação Inicial',
  'Evolucao Diaria SOAP': 'Evolução Diária SOAP',
  'Passagem de Plantao e Rounds': 'Passagem de Plantão e Rounds',
  'Altas e Desospitalizacao': 'Altas e Desospitalização',
  'Declaracao de Obito e Cuidados': 'Declaração de Óbito e Cuidados',
  'Ficha Mestra e Triagem': 'Ficha Mestra e Triagem',
  'Puericultura e Ambulatorio': 'Puericultura e Ambulatório',
  'Respiratorio e IVAS': 'Respiratório e IVAS',
  'Gastrointestinal e Desidratacao': 'Gastrointestinal e Desidratação',
  'Febre e Infeccoes Sistemicas': 'Febre e Infecções Sistêmicas',
};

function getSubcategoryLabel(item: ClinicalProtocolItem): string {
  const withSubcat = item as ClinicalProtocolItem & { subcat?: string };
  const raw = (withSubcat.subcat || item.category || MOD_LABELS[item.mod_id] || 'Geral').trim();
  return SUBCAT_DISPLAY_MAP[raw] || raw;
}

interface ProtocolosViewProps {
  selectedId: string | null;
  mobileShowDetail: boolean;
  favoriteIds: readonly string[];
  onSelectProtocol: (id: string) => void;
  onBackToList: () => void;
  onOpenPrePorta: (habId: string) => void;
  onOpenQuickCapture: (req: QuickCaptureRequest) => void;
  onNotify: (msg: string) => void;
  /** Desligado quando há modal aberto (Ctrl+K, backup, captura rápida, ajuda). */
  shortcutsEnabled?: boolean;
  /** Pedido externo de "Copiar tudo" (Shift+Enter na Command Palette). */
  copyRequest?: { protocolId: string; nonce: number } | null;
  /** Avisa o App que o pedido externo já foi consumido (não repetir ao remontar a tela). */
  onCopyRequestHandled?: () => void;
}

export function ProtocolosView({
  selectedId,
  mobileShowDetail,
  favoriteIds,
  onSelectProtocol,
  onBackToList,
  onOpenPrePorta,
  onOpenQuickCapture,
  onNotify,
  shortcutsEnabled = true,
  copyRequest = null,
  onCopyRequestHandled,
}: ProtocolosViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('todos');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [patient, setPatient] = useState<PatientContextInput>(EMPTY_PATIENT_CONTEXT);
  const [guiaOpen, setGuiaOpen] = useState(false);

  // Estado interativo da AST real + modo de edição livre opcional por bloco
  const [editingBlockIds, setEditingBlockIds] = useState<Record<string, boolean>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [editedBaseTexts, setEditedBaseTexts] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** Cópia retida pela trava de lacunas (o relatório é recalculado ao vivo). */
  const [pendingCopyKey, setPendingCopyKey] = useState<CopyKey | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listPaneRef = useRef<HTMLDivElement | null>(null);
  const handledCopyNonceRef = useRef<number | null>(null);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const activeProtocol = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id !== 'hab') return found;
    }
    return PEP_PROTOCOLS[0];
  }, [selectedId]);

  const compiled = useMemo(
    () => compileProtocolForDisplay(activeProtocol, patient),
    [activeProtocol, patient]
  );

  const [astState, setAstState] = useState<AstSelectionState>(() => compiled.initialAstState);
  // Protocolo ao qual o astState atual pertence (evita serializar AST nova com estado antigo no frame da troca)
  const [astStateProtocolId, setAstStateProtocolId] = useState<string>(activeProtocol.id);
  const prevProtocolIdRef = useRef<string>(activeProtocol.id);
  const mainRef = useRef<HTMLElement | null>(null);

  // Reinicia AST limpa ao trocar de protocolo. Peso/idade são SEMPRE limpos na troca para
  // impedir que o peso de um paciente vaze para a prescrição do próximo.
  useEffect(() => {
    if (prevProtocolIdRef.current !== activeProtocol.id) {
      prevProtocolIdRef.current = activeProtocol.id;
      const hadPatientValues = patientContextHasValues(patient);
      if (hadPatientValues) {
        setPatient(EMPTY_PATIENT_CONTEXT);
        setAstState(compileProtocolForDisplay(activeProtocol, EMPTY_PATIENT_CONTEXT).initialAstState);
        onNotify('Dados do paciente limpos ao trocar de protocolo — informe os deste paciente.');
      } else {
        setAstState(compiled.initialAstState);
      }
      setAstStateProtocolId(activeProtocol.id);
      setGuiaOpen(false);
      setEditingBlockIds({});
      setEditedTexts({});
      setEditedBaseTexts({});
      setCopiedKey(null);
      setPendingCopyKey(null);
      mainRef.current?.scrollTo({ top: 0 });
    } else {
      setAstState((prev) =>
        applyPatientContextToAstState(compiled.ast, prev, compiled.clinicalContext)
      );
    }
  }, [activeProtocol, compiled, patient]);

  const filteredProtocols = useMemo(() => {
    let base =
      areaFilter === 'todos'
        ? PEP_PROTOCOLS
        : PEP_PROTOCOLS.filter((p) => p.mod_id === areaFilter);

    if (onlyFavorites) {
      base = base.filter((p) => favoriteSet.has(p.id));
    }

    const q = searchQuery.trim();
    if (!q) return base;
    return searchClinicalProtocols(GLOBAL_SEARCH_INDEX, base, q, base.length).map((r) => r.item);
  }, [areaFilter, onlyFavorites, favoriteSet, searchQuery]);

  // Agrupamento por subcategoria preservando a ordem natural / de relevância
  const groupedProtocols = useMemo(() => {
    const groups: Array<{
      key: string;
      modId: ClinicalProtocolItem['mod_id'];
      label: string;
      items: ClinicalProtocolItem[];
    }> = [];
    const byKey = new Map<
      string,
      {
        key: string;
        modId: ClinicalProtocolItem['mod_id'];
        label: string;
        items: ClinicalProtocolItem[];
      }
    >();

    for (const item of filteredProtocols) {
      const label = getSubcategoryLabel(item);
      const key = `${item.mod_id}::${label}`;
      let grp = byKey.get(key);
      if (!grp) {
        grp = { key, modId: item.mod_id, label, items: [] };
        byKey.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(item);
    }
    return groups;
  }, [filteredProtocols]);

  const clinicalLinks = useMemo(
    () => resolveClinicalLinksForPep(activeProtocol),
    [activeProtocol]
  );

  const linkedPrePorta = useMemo(() => {
    const firstHabId = clinicalLinks.habIds[0];
    return firstHabId ? PROTOCOL_BY_ID.get(firstHabId) ?? null : null;
  }, [clinicalLinks]);

  const guiaSections = useMemo(
    () => splitGuiaIntoSections(activeProtocol.guia_body || ''),
    [activeProtocol.guia_body]
  );

  const hasPatientValues = patientContextHasValues(patient);
  const hasPrescriptionSections = compiled.sections.some((s) => s.id === 'receita' || s.id === 'conduta');

  const isFavorite = favoriteSet.has(activeProtocol.id);

  // Handlers de interação direta na AST (espelhamento + condicionais + escolhas)
  const handleAstInputChange = (node: InlineInputNode, value: string) => {
    setAstState((prev) => {
      const nextInputValues = { ...prev.inputValues, [node.id]: value };
      const nextUserEdited = { ...prev.userEditedNodes, [node.id]: true };

      // Espelhamento entre campos com mesmo mirrorRole (ex: Nome, Idade, Peso)
      if (node.mirrorRole) {
        for (const blk of compiled.ast.blocks) {
          walkInlineNodes(blk.children, (other) => {
            if (
              other.kind === 'inline-input' &&
              other.id !== node.id &&
              other.mirrorRole === node.mirrorRole &&
              !prev.userEditedNodes[other.id]
            ) {
              nextInputValues[other.id] = value;
            }
          });
        }
      }

      return {
        ...prev,
        inputValues: nextInputValues,
        userEditedNodes: nextUserEdited,
      };
    });

    // Sincronizar Peso/Idade digitado inline com a faixa do paciente para recalcular doses automaticamente
    if (node.anthroRole === 'peso' || node.mirrorRole === 'peso') {
      setPatient((p) => (p.pesoKg === value ? p : { ...p, pesoKg: value }));
    } else if (node.mirrorRole === 'idade') {
      setPatient((p) => (p.idade === value ? p : { ...p, idade: value }));
    }
  };

  const handleAstChoiceSelect = (group: ChoiceGroupNode, nextIndices: number[]) => {
    setAstState((prev) => ({
      ...prev,
      choiceSelections: {
        ...prev.choiceSelections,
        [group.id]: nextIndices,
      },
      userEditedNodes: {
        ...prev.userEditedNodes,
        [group.id]: true,
      },
    }));
  };

  const handleToggleTrava = (travaId: string) => {
    setAstState((prev) => ({
      ...prev,
      travaExcluded: {
        ...prev.travaExcluded,
        [travaId]: !prev.travaExcluded[travaId],
      },
      userEditedNodes: {
        ...prev.userEditedNodes,
        [travaId]: true,
      },
    }));
  };

  const handleToggleOptional = (optionalId: string) => {
    setAstState((prev) => ({
      ...prev,
      optionalOpen: {
        ...prev.optionalOpen,
        [optionalId]: !prev.optionalOpen[optionalId],
      },
      userEditedNodes: {
        ...prev.userEditedNodes,
        [optionalId]: true,
      },
    }));
  };

  const handleToggleCheckbox = (blockId: string) => {
    setAstState((prev) => ({
      ...prev,
      checkboxStates: {
        ...prev.checkboxStates,
        [blockId]: !(prev.checkboxStates[blockId] ?? true),
      },
    }));
  };

  const getSectionSerializedText = (section: PepAstSection): string => {
    return serializeProtocolSection(compiled.ast, astState, compiled.clinicalContext, section);
  };

  const getBlockText = (section: PepAstSection): string => {
    return editedTexts[section.id] !== undefined
      ? editedTexts[section.id]
      : getSectionSerializedText(section);
  };

  // Auditor de prescrição sobre o texto que de fato será copiado (inclui edição livre)
  const prescriptionAudit = useMemo(() => {
    const texts: Partial<Record<PepSectionId, string>> = {};
    for (const sec of compiled.sections) {
      if (sec.id === 'receita' || sec.id === 'conduta') texts[sec.id] = getBlockText(sec);
    }
    return auditProtocolPrescription(activeProtocol, texts, compiled.clinicalContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProtocol, compiled, astState, editedTexts]);

  /** Alertas "block" da Prescrição que seguram a cópia (Prescrição ou Copiar tudo). */
  const getGuardBlockingAlerts = (key: CopyKey) =>
    key === 'all' || key === 'receita'
      ? (prescriptionAudit.receita?.alerts ?? []).filter((a) => a.severity === 'block')
      : [];

  const handleCopyBlock = async (key: string, text: string): Promise<boolean> => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } else {
      onNotify('Não foi possível copiar automaticamente.');
    }
    return ok;
  };

  const getCombinedText = (): string =>
    compiled.sections
      .map((sec) => getBlockText(sec))
      .filter((t) => t.trim().length > 0)
      .join('\n\n');

  const getSectionGapReport = (section: PepAstSection): SectionGapReport => {
    const edited = editedTexts[section.id];
    if (edited !== undefined) {
      const n = countOpenBracketsInFreeText(edited);
      return { ...EMPTY_GAP_REPORT, openFields: n, total: n };
    }
    return analyzeSectionGaps(compiled.ast, astState, compiled.clinicalContext, section);
  };

  /**
   * Trava de cópia: audita a Prescrição (lacunas clínicas, escolhas vazias, peso ausente)
   * e a Conduta (apenas peso ausente com dose por kg). Evolução/Orientações não travam.
   */
  const getCopyGapReport = (key: CopyKey): { report: SectionGapReport; focusSectionId: PepSectionId | null } => {
    let report: SectionGapReport = { ...EMPTY_GAP_REPORT };
    let focusSectionId: PepSectionId | null = null;
    for (const sec of compiled.sections) {
      const auditsReceita = sec.id === 'receita' && (key === 'all' || key === 'receita');
      const auditsConduta = sec.id === 'conduta' && (key === 'all' || key === 'conduta');
      if (!auditsReceita && !auditsConduta) continue;
      const secReport = getSectionGapReport(sec);
      const counted: SectionGapReport = auditsReceita
        ? secReport
        : {
            ...EMPTY_GAP_REPORT,
            missingWeightForDoses: secReport.missingWeightForDoses,
            total: secReport.missingWeightForDoses ? 1 : 0,
          };
      if (counted.total > 0 && focusSectionId === null) focusSectionId = sec.id;
      report = addGapReports(report, counted);
    }
    return { report, focusSectionId };
  };

  const getCopyLabel = (key: CopyKey): string =>
    key === 'all' ? 'protocolo completo' : (SECTION_VISUAL_STYLE[key]?.shortLabel ?? key).toLowerCase();

  const requestCopy = async (key: CopyKey, options?: { force?: boolean }) => {
    const section = key === 'all' ? null : compiled.sections.find((sec) => sec.id === key) ?? null;
    if (key !== 'all' && !section) {
      onNotify(`Este protocolo não tem a seção ${getCopyLabel(key)}.`);
      return;
    }
    const text = section ? getBlockText(section) : getCombinedText();
    if (!text.trim()) {
      onNotify('Nada para copiar nesta seção.');
      return;
    }
    const { report } = getCopyGapReport(key);
    const guardBlocks = getGuardBlockingAlerts(key).length;
    if (!options?.force && (report.total > 0 || guardBlocks > 0)) {
      setPendingCopyKey(key);
      return;
    }
    setPendingCopyKey(null);
    const ok = await handleCopyBlock(key, text);
    if (ok && options?.force && (report.total > 0 || guardBlocks > 0)) {
      onNotify('Copiado com lacunas — revise no PEP antes de assinar.');
    } else if (ok && report.identificationFields > 0) {
      onNotify(
        `Copiado · ${report.identificationFields} campo(s) de identificação em branco (nome/idade/data).`
      );
    }
  };

  const handleCopyAll = () => requestCopy('all');

  /** Leva o foco à primeira lacuna que segura a cópia pendente. */
  const goToFirstBlockingGap = () => {
    if (!pendingCopyKey) return;
    const { report, focusSectionId } = getCopyGapReport(pendingCopyKey);
    setPendingCopyKey(null);

    // Sem lacunas: o que segura a cópia são alertas do auditor → leva até eles
    if (report.total === 0) {
      document.getElementById('pep-guard-receita')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const focusEl = (el: HTMLElement | null) => {
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement) el.select();
      return true;
    };

    if (report.missingWeightForDoses && focusEl(document.getElementById('pt-peso'))) return;
    if (!focusSectionId) return;

    if (editedTexts[focusSectionId] !== undefined) {
      setEditingBlockIds((prev) => ({ ...prev, [focusSectionId]: true }));
      window.requestAnimationFrame(() => {
        focusEl(document.querySelector<HTMLElement>(`#pep-section-${focusSectionId} textarea`));
      });
      return;
    }

    const root = document.getElementById(`pep-section-${focusSectionId}`);
    const candidates = Array.from(
      root?.querySelectorAll<HTMLElement>(
        'input[data-pep-gap-kind="clinical"], [data-pep-unselected="true"]'
      ) ?? []
    ).filter((el) => !(el instanceof HTMLInputElement) || !el.value.trim());
    if (!focusEl(candidates[0] ?? null)) {
      root?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /** Alt+N / Alt+Shift+N: próxima (ou anterior) lacuna vazia em TODO o protocolo. */
  const focusNextEmptyField = (backwards = false) => {
    const root = mainRef.current;
    if (!root) return;
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input[data-pep-gap="true"]:not(:disabled):not([data-pep-gap-kind="suggested"]), [data-pep-unselected="true"]'
      )
    ).filter((el) => !(el instanceof HTMLInputElement) || !el.value.trim());
    if (candidates.length === 0) {
      onNotify('Nenhum campo vazio neste protocolo.');
      return;
    }
    const active = document.activeElement;
    const ordered = backwards ? [...candidates].reverse() : candidates;
    const flag = backwards ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
    const next =
      (active && root.contains(active)
        ? ordered.find((el) => el !== active && Boolean(active.compareDocumentPosition(el) & flag))
        : undefined) ?? ordered[0];
    next.scrollIntoView({ behavior: 'smooth', block: 'center' });
    next.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement) next.select();
  };

  // Ordem plana da lista (mesma ordem visual dos grupos) para navegação por ↑/↓
  const flatVisibleProtocols = groupedProtocols.flatMap((g) => g.items);

  const selectAdjacentProtocol = (delta: 1 | -1) => {
    if (flatVisibleProtocols.length === 0) return;
    const idx = flatVisibleProtocols.findIndex((p) => p.id === activeProtocol.id);
    const nextIdx =
      idx === -1
        ? 0
        : Math.min(flatVisibleProtocols.length - 1, Math.max(0, idx + delta));
    const next = flatVisibleProtocols[nextIdx];
    if (next && next.id !== activeProtocol.id) onSelectProtocol(next.id);
  };

  // Atalhos globais da tela de Protocolos (handler via ref para sempre ler o estado atual)
  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      // e.code: independe do layout de teclado (Alt+N no macOS gera "˜" em e.key)
      if (e.code === 'KeyN') {
        e.preventDefault();
        focusNextEmptyField(e.shiftKey);
      } else if (e.code === 'KeyC' && !e.shiftKey) {
        e.preventDefault();
        void requestCopy('all');
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape' && pendingCopyKey) {
      e.preventDefault();
      setPendingCopyKey(null);
      return;
    }
    if (isEditableTarget(e.target)) return;
    // Dentro de um popover de escolha, dígitos não disparam cópia
    if ((e.target as HTMLElement | null)?.closest?.('[data-choice-popover]')) return;

    if (e.key === '/') {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }
    const copyKey = COPY_SHORTCUTS[e.key];
    if (copyKey) {
      e.preventDefault();
      void requestCopy(copyKey);
    }
  };

  useEffect(() => {
    if (!shortcutsEnabled) return;
    const listener = (e: KeyboardEvent) => shortcutHandlerRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [shortcutsEnabled]);

  // Shift+Enter na Command Palette: copia tudo assim que o estado do novo protocolo estiver montado
  useEffect(() => {
    if (!copyRequest || handledCopyNonceRef.current === copyRequest.nonce) return;
    if (copyRequest.protocolId !== activeProtocol.id || astStateProtocolId !== activeProtocol.id) return;
    handledCopyNonceRef.current = copyRequest.nonce;
    onCopyRequestHandled?.();
    void requestCopy('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyRequest, activeProtocol.id, astStateProtocolId, astState]);

  // Mantém o item selecionado visível na lista ao navegar por ↑/↓ ou Ctrl+K
  useEffect(() => {
    const el = listPaneRef.current?.querySelector<HTMLElement>(
      `[data-protocol-id="${CSS.escape(activeProtocol.id)}"]`
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeProtocol.id]);

  const pendingGap = pendingCopyKey ? getCopyGapReport(pendingCopyKey).report : null;
  const pendingGuard = pendingCopyKey ? getGuardBlockingAlerts(pendingCopyKey) : [];
  const pendingBlocking = Boolean(pendingGap && (pendingGap.total > 0 || pendingGuard.length > 0));

  const handleClearPatient = () => {
    setPatient(EMPTY_PATIENT_CONTEXT);
    setEditedTexts({});
    setEditedBaseTexts({});
    setEditingBlockIds({});
    setPendingCopyKey(null);
    const fresh = compileProtocolForDisplay(activeProtocol, EMPTY_PATIENT_CONTEXT);
    setAstState(fresh.initialAstState);
    setAstStateProtocolId(activeProtocol.id);
  };

  const scrollToElementById = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleJumpToDiretrizes = () => {
    setGuiaOpen(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        scrollToElementById('pep-section-diretrizes');
      }, 30);
    });
  };

  return (
    <div className="mx-auto flex min-h-0 flex-1 w-full overflow-hidden">
      {/* COLUNA ESQUERDA: Lista de Protocolos agrupada por subcategoria (320px em >=1024px) */}
      <aside
        aria-label="Lista de protocolos clínicos"
        className={`${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        } h-full w-full shrink-0 flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:w-[320px] dark:border-white/[0.07] dark:bg-[#0F1115]`}
      >
        <div className="space-y-2.5 border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
          {/* Busca + botão discreto de estrela (Favoritos) */}
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-[#9CA3AF]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectAdjacentProtocol(e.key === 'ArrowDown' ? 1 : -1);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    // Garante seleção do 1º resultado e devolve o foco ao documento (atalhos 1–5 ativos)
                    if (!flatVisibleProtocols.some((p) => p.id === activeProtocol.id) && flatVisibleProtocols[0]) {
                      onSelectProtocol(flatVisibleProtocols[0].id);
                    }
                    e.currentTarget.blur();
                    mainRef.current?.focus({ preventScroll: true });
                  } else if (e.key === 'Escape') {
                    if (searchQuery) {
                      e.preventDefault();
                      setSearchQuery('');
                    } else {
                      e.currentTarget.blur();
                    }
                  }
                }}
                placeholder="Filtrar protocolo, queixa ou CID...  ( / )"
                title="Atalho: /  ·  ↑↓ escolhe o protocolo  ·  Enter volta ao documento"
                aria-label="Filtrar protocolos"
                className="w-full rounded-lg border border-zinc-200/90 bg-white py-1.5 pr-7 pl-8 text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar filtro"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F3F4F6]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOnlyFavorites((v) => !v)}
              aria-pressed={onlyFavorites}
              aria-label="Filtrar favoritos"
              title={onlyFavorites ? 'Mostrando apenas favoritos' : 'Filtrar favoritos'}
              className={`inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border transition-colors ${
                onlyFavorites
                  ? 'border-amber-400/70 bg-amber-50 text-amber-500 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-400'
                  : 'border-zinc-200/90 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:border-white/[0.15] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Filtros de área em 1 linha limpa sem quebrar */}
          <div
            className="flex items-center justify-between gap-0.5"
            role="group"
            aria-label="Filtrar por área"
          >
            {AREA_FILTERS.map((f) => {
              const active = areaFilter === f.id;
              const dotClass = f.id !== 'todos' ? AREA_DOT_CLASS[f.id] : undefined;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAreaFilter(f.id)}
                  aria-pressed={active}
                  className={`inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-center text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                      : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                  }`}
                >
                  {dotClass && (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${dotClass} ${
                        active ? 'ring-1 ring-white/70 dark:ring-[#0F1115]/50' : ''
                      }`}
                    />
                  )}
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contador discreto */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/[0.06] dark:text-[#9CA3AF]">
          <span className="tabular-nums">
            {filteredProtocols.length}{' '}
            {filteredProtocols.length === 1 ? 'protocolo' : 'protocolos'}
            {onlyFavorites ? ' · favoritos' : ''}
          </span>
          {(areaFilter !== 'todos' || onlyFavorites) && (
            <button
              type="button"
              onClick={() => {
                setAreaFilter('todos');
                setOnlyFavorites(false);
              }}
              className="text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
            >
              Ver todos
            </button>
          )}
        </div>

        {/* Lista agrupada por subcategoria com micro-cabeçalhos sticky */}
        <div ref={listPaneRef} className="flex-1 overflow-y-auto">
          {filteredProtocols.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-zinc-500 dark:text-[#9CA3AF]">
              {onlyFavorites
                ? 'Nenhum protocolo favoritado neste filtro.'
                : 'Nenhum protocolo encontrado.'}
            </div>
          ) : (
            groupedProtocols.map((group) => {
              const groupDot = AREA_DOT_CLASS[group.modId];
              return (
                <div key={group.key}>
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-zinc-200/60 bg-[#FAFAFA]/95 px-3 py-1.5 text-[10px] font-semibold tracking-[0.06em] text-zinc-500 uppercase backdrop-blur-xs dark:border-white/[0.06] dark:bg-[#0F1115]/95 dark:text-[#9CA3AF]">
                    {groupDot && (
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${groupDot}`} />
                    )}
                    <span className="truncate">{group.label}</span>
                  </div>
                  {group.items.map((item) => {
                    const isSelected = item.id === activeProtocol.id;
                    const isFav = favoriteSet.has(item.id);
                    const activeAreaBorder =
                      AREA_ACTIVE_BORDER_CLASS[item.mod_id] || 'border-l-[#0F766E] dark:border-l-[#2DD4BF]';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-protocol-id={item.id}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => onSelectProtocol(item.id)}
                        className={`group flex w-full items-start justify-between gap-2.5 border-b border-l-2 border-b-zinc-200/40 px-3 py-2.5 text-left transition-colors dark:border-b-white/[0.05] ${
                          isSelected
                            ? `${activeAreaBorder} bg-white text-zinc-950 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)] dark:bg-[#1A1F2B] dark:text-white`
                            : 'border-l-transparent text-zinc-700 hover:bg-zinc-100/80 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]/70'
                        }`}
                      >
                        <span
                          className={`line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug ${
                            isSelected
                              ? 'font-semibold text-zinc-950 dark:text-white'
                              : 'font-medium'
                          }`}
                        >
                          {item.title}
                        </span>

                        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                          {item.cid10 && (
                            <span className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-[#6B7280]">
                              {item.cid10}
                            </span>
                          )}
                          {isFav && (
                            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* COLUNA DIREITA: Documento Único Editorial (max-w-4xl centrado) */}
      <main
        ref={mainRef}
        tabIndex={-1}
        data-pep-document="true"
        className={`outline-none ${
          mobileShowDetail ? 'block' : 'hidden lg:block'
        } h-full flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]`}
      >
        {/* TRAVA DE CÓPIA: fica fixa no topo do documento enquanto houver cópia retida */}
        {pendingCopyKey && pendingGap && (
          <div className="sticky top-0 z-30 border-b border-amber-300/70 bg-amber-50/95 backdrop-blur-sm dark:border-amber-500/30 dark:bg-[#2A2112]/95">
            <div
              role="alertdialog"
              aria-live="assertive"
              aria-label="Cópia retida por lacunas na prescrição"
              className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-8"
            >
              {pendingBlocking ? (
                <div className="flex min-w-0 flex-1 items-start gap-2 text-xs text-amber-950 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0">
                    <span className="font-semibold">Cópia retida ({getCopyLabel(pendingCopyKey)}):</span>{' '}
                    {[
                      ...describeGapReport(pendingGap),
                      ...(pendingGuard.length > 0
                        ? [
                            `${pendingGuard.length} ${
                              pendingGuard.length === 1 ? 'alerta de prescrição' : 'alertas de prescrição'
                            } (${pendingGuard.map((a) => a.title.split(':')[0]).join(', ')})`,
                          ]
                        : []),
                    ].join(' · ')}.
                    {pendingGap.identificationFields > 0 && (
                      <span className="text-amber-800/80 dark:text-amber-200/70">
                        {' '}
                        Nome/idade/data em branco não travam.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-teal-900 dark:text-teal-100">
                  <Check className="h-4 w-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                  <span className="font-semibold">Lacunas resolvidas — pronto para copiar.</span>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {pendingBlocking ? (
                  <>
                    <button
                      type="button"
                      autoFocus
                      onClick={goToFirstBlockingGap}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:text-[#1A1306] dark:hover:bg-amber-400"
                    >
                      {pendingGap.total > 0 ? 'Ir para a 1ª' : 'Ver alertas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestCopy(pendingCopyKey, { force: true })}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-400/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-500/10"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar mesmo assim
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    autoFocus
                    onClick={() => void requestCopy(pendingCopyKey)}
                    className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-teal-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar agora
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingCopyKey(null)}
                  aria-label="Cancelar cópia (Esc)"
                  title="Cancelar (Esc)"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-[1260px] items-start gap-8 px-4 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto min-w-0 max-w-4xl flex-1 xl:mx-0">
          {/* Botão Voltar em meia tela / tablet (< 1024px) */}
          <div className="mb-3 lg:hidden">
            <button
              type="button"
              onClick={onBackToList}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Protocolos
            </button>
          </div>

          {/* Cabeçalho Editorial do Protocolo */}
          <header className="border-b border-zinc-200/80 pb-5 dark:border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
              <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                {MOD_LABELS[activeProtocol.mod_id]}
              </span>
              <span>·</span>
              <span>{getSubcategoryLabel(activeProtocol)}</span>
              {activeProtocol.cid10 && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[11px]">{activeProtocol.cid10}</span>
                </>
              )}
              {activeProtocol.gravidade === 'critico' && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-red-700 dark:text-red-400">
                    Emergência crítica
                  </span>
                </>
              )}
            </div>

            <div className="mt-1.5 flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl dark:text-[#F3F4F6]">
                {activeProtocol.title}
              </h1>
              <button
                type="button"
                onClick={() => {
                  const added = cockpitStore.toggleFavorite(activeProtocol.id);
                  onNotify(added ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
                }}
                aria-label={isFavorite ? 'Remover dos favoritos' : 'Favoritar protocolo'}
                title={isFavorite ? 'Remover dos favoritos' : 'Favoritar protocolo'}
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
              >
                <Star
                  className={`h-4 w-4 ${
                    isFavorite ? 'fill-amber-400 text-amber-400' : ''
                  }`}
                />
              </button>
            </div>

            {/* Ações leves do documento */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                title="Copiar tudo (atalho: 1 ou Alt+C)"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-teal-300"
              >
                {copiedKey === 'all' ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar tudo
                  </>
                )}
              </button>

              {linkedPrePorta && (
                <button
                  type="button"
                  onClick={() => onOpenPrePorta(linkedPrePorta.id)}
                  title={`Pré-Porta: ${formatPrePortaTitle(linkedPrePorta.title)}`}
                  className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
                >
                  <Stethoscope className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                  <span className="truncate">
                    Pré-Porta: {formatPrePortaTitle(linkedPrePorta.title)}
                  </span>
                </button>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenQuickCapture({
                      kind: 'logbook',
                      defaultTitle: activeProtocol.title,
                      defaultRodizio: MOD_TO_RODIZIO[activeProtocol.mod_id],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Logbook
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenQuickCapture({
                      kind: 'ponto_cego',
                      defaultTitle: activeProtocol.title,
                      defaultRodizio: MOD_TO_RODIZIO[activeProtocol.mod_id],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ponto Cego
                </button>
              </div>
            </div>

            {/* Quick Jump (Índice de salto rápido por bloco do protocolo) */}
            {(compiled.sections.length > 1 || guiaSections.length > 0) && (
              <nav
                aria-label="Ir para seção do protocolo"
                className="mt-3 flex flex-wrap items-center gap-1.5 xl:hidden"
              >
                {compiled.sections.map((sec) => {
                  const secStyle = SECTION_VISUAL_STYLE[sec.id] || SECTION_VISUAL_STYLE.geral;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => scrollToElementById(`pep-section-${sec.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-white/[0.18] dark:hover:bg-[#1C2029] dark:hover:text-white"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${secStyle.dotClass}`}
                      />
                      <span>{secStyle.shortLabel}</span>
                    </button>
                  );
                })}
                {guiaSections.length > 0 && (
                  <button
                    type="button"
                    onClick={handleJumpToDiretrizes}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 dark:border-white/[0.10] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-white/[0.18] dark:hover:bg-[#1C2029] dark:hover:text-white"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500"
                    />
                    <span>Diretrizes</span>
                  </button>
                )}
              </nav>
            )}

            {/* Faixa do paciente: peso/idade só onde há cálculo ponderal; alergias/TFG/gestação onde há prescrição */}
            {(compiled.needsWeightPersonalization || hasPrescriptionSections) && (
              <div className="mt-4 rounded-lg border border-zinc-200/80 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                    Paciente
                  </span>

                  {compiled.needsWeightPersonalization && (
                  <>
                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="pt-peso"
                      className="text-xs font-medium text-zinc-600 dark:text-[#D1D5DB]"
                    >
                      Peso (kg)
                    </label>
                    <input
                      id="pt-peso"
                      type="text"
                      inputMode="decimal"
                      value={patient.pesoKg}
                      onChange={(e) => setPatient((p) => ({ ...p, pesoKg: e.target.value }))}
                      placeholder="Ex: 14"
                      className="w-20 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="pt-idade"
                      className="text-xs font-medium text-zinc-500 dark:text-[#9CA3AF]"
                    >
                      Idade
                    </label>
                    <input
                      id="pt-idade"
                      type="text"
                      value={patient.idade}
                      onChange={(e) => setPatient((p) => ({ ...p, idade: e.target.value }))}
                      placeholder="Ex: 3a / 8m"
                      className="w-24 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                  </div>
                  </>
                  )}

                  <div className="flex items-center gap-1.5">
                    <label htmlFor="pt-alergias" className="text-xs font-medium text-zinc-500 dark:text-[#9CA3AF]">
                      Alergias
                    </label>
                    <input
                      id="pt-alergias"
                      type="text"
                      value={patient.alergias ?? ''}
                      onChange={(e) => setPatient((p) => ({ ...p, alergias: e.target.value }))}
                      placeholder="Ex: dipirona, penicilina"
                      className="w-44 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label
                      htmlFor="pt-clcr"
                      title="TFG / Clearance de creatinina (mL/min)"
                      className="text-xs font-medium text-zinc-500 dark:text-[#9CA3AF]"
                    >
                      TFG
                    </label>
                    <input
                      id="pt-clcr"
                      type="text"
                      inputMode="decimal"
                      value={patient.clCr ?? ''}
                      onChange={(e) => setPatient((p) => ({ ...p, clCr: e.target.value }))}
                      placeholder="mL/min"
                      className="w-16 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                  </div>

                  {activeProtocol.mod_id !== 'ped' && (
                    <div className="flex items-center gap-1.5">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-[#9CA3AF]">
                        <input
                          type="checkbox"
                          checked={patient.gestante}
                          onChange={(e) =>
                            setPatient((p) => ({
                              ...p,
                              gestante: e.target.checked,
                              igSemanas: e.target.checked ? p.igSemanas : '',
                            }))
                          }
                          className="h-3.5 w-3.5 accent-[#0F766E]"
                        />
                        Gestante
                      </label>
                      {patient.gestante && (
                        <input
                          id="pt-ig"
                          type="text"
                          inputMode="decimal"
                          aria-label="Idade gestacional (semanas)"
                          value={patient.igSemanas}
                          onChange={(e) => setPatient((p) => ({ ...p, igSemanas: e.target.value }))}
                          placeholder="IG sem"
                          className="w-16 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        />
                      )}
                    </div>
                  )}

                  {hasPatientValues && (
                    <button
                      type="button"
                      onClick={handleClearPatient}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Novo paciente
                    </button>
                  )}
                </div>

                {/* Alerta de plausibilidade clínica Idade x Peso */}
                {compiled.plausibilityAlert && (
                  <div
                    role="alert"
                    className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                      compiled.plausibilityAlert.severity === 'critical'
                        ? 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                        : 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <span className="font-semibold">{compiled.plausibilityAlert.title}:</span>{' '}
                      {compiled.plausibilityAlert.detail}
                    </div>
                  </div>
                )}

                {/* Resumo rápido de doses ponderais calculadas + alertas de teto adulto */}
                {compiled.clinicalContext.weightDoses && (
                  <div className="mt-3 border-t border-zinc-200/70 pt-2.5 dark:border-white/[0.07]">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                      <span className="font-medium text-zinc-700 dark:text-[#D1D5DB]">
                        Doses ponderais para{' '}
                        <span className="font-mono">
                          {String(compiled.clinicalContext.weightDoses.weightKg).replace('.', ',')} kg
                        </span>
                      </span>
                      <span>Recalculado nos blocos abaixo</span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {compiled.clinicalContext.weightDoses.items.slice(0, 6).map((doseItem) => (
                        <div
                          key={doseItem.drug}
                          className="flex items-baseline justify-between gap-2 py-0.5"
                        >
                          <span className="truncate text-zinc-600 dark:text-[#9CA3AF]">
                            {doseItem.drug.split('(')[0].trim()}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[11px] font-medium ${
                              !doseItem.allowed
                                ? 'text-red-700 dark:text-red-400'
                                : doseItem.ceilingHit
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-zinc-900 dark:text-[#F3F4F6]'
                            }`}
                          >
                            {doseItem.formattedDose.split('|')[0].trim()}
                            {doseItem.ceilingHit && doseItem.allowed ? ' · Teto' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </header>

          {/* BLOCOS INTERATIVOS E COPIÁVEIS DO PEP (AST REAL) */}
          <div className="mt-6 space-y-6">
            {compiled.sections.map((section) => {
              const isEditing = Boolean(editingBlockIds[section.id]);
              const serializedText = getSectionSerializedText(section);
              const isEdited =
                editedTexts[section.id] !== undefined && editedTexts[section.id] !== serializedText;
              const isStaleManualEdit =
                isEdited &&
                editedBaseTexts[section.id] !== undefined &&
                editedBaseTexts[section.id] !== serializedText;
              const currentText = getBlockText(section);
              const isCopied = copiedKey === section.id;

              const restoreAutomatic = () => {
                setEditedTexts((prev) => {
                  const next = { ...prev };
                  delete next[section.id];
                  return next;
                });
                setEditedBaseTexts((prev) => {
                  const next = { ...prev };
                  delete next[section.id];
                  return next;
                });
                setEditingBlockIds((prev) => ({
                  ...prev,
                  [section.id]: false,
                }));
              };

              const secStyle = SECTION_VISUAL_STYLE[section.id] || SECTION_VISUAL_STYLE.geral;
              const SectionIcon = secStyle.Icon;

              return (
                <section
                  key={section.id}
                  id={`pep-section-${section.id}`}
                  aria-label={section.title}
                  className={`scroll-mt-4 rounded-lg border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.10] dark:bg-[#15181F] ${secStyle.borderClass}`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-tr-[7px] border-b border-zinc-200/80 px-4 py-2.5 dark:border-white/[0.08] ${secStyle.headerBgClass}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <SectionIcon className={`h-3.5 w-3.5 shrink-0 ${secStyle.titleClass}`} />
                      <h2
                        className={`text-xs font-semibold tracking-wide uppercase ${secStyle.titleClass}`}
                      >
                        {section.title}
                      </h2>
                      {isStaleManualEdit ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Edição manual ativa</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={restoreAutomatic}
                            className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
                          >
                            Restaurar automático
                          </button>
                        </span>
                      ) : isEdited ? (
                        <span className="text-[11px] text-[#0F766E] dark:text-[#2DD4BF]">
                          · Editado livremente
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isEdited && !isStaleManualEdit && (
                        <button
                          type="button"
                          onClick={restoreAutomatic}
                          title="Restaurar sincronização automática do protocolo"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar automático
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (!isEditing && editedTexts[section.id] === undefined) {
                            setEditedTexts((prev) => ({
                              ...prev,
                              [section.id]: serializedText,
                            }));
                            setEditedBaseTexts((prev) => ({
                              ...prev,
                              [section.id]: serializedText,
                            }));
                          }
                          setEditingBlockIds((prev) => ({
                            ...prev,
                            [section.id]: !prev[section.id],
                          }));
                        }}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          isEditing
                            ? 'bg-zinc-200/80 text-zinc-900 dark:bg-[#1C2029] dark:text-[#F3F4F6]'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        <Edit3 className="h-3 w-3" />
                        {isEditing ? 'Concluir' : 'Editar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void requestCopy(section.id)}
                        title={
                          COPY_SHORTCUT_BY_KEY[section.id]
                            ? `Copiar ${section.title} (atalho: ${COPY_SHORTCUT_BY_KEY[section.id]})`
                            : `Copiar ${section.title}`
                        }
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isCopied
                            ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                            : 'border border-zinc-200/90 bg-white text-zinc-700 hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/50 dark:hover:text-[#2DD4BF]'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {section.id === 'receita' && (
                    <GuardAlertList report={prescriptionAudit.receita} anchorId="pep-guard-receita" blocking />
                  )}
                  {section.id === 'conduta' && (
                    <GuardAlertList report={prescriptionAudit.conduta} anchorId="pep-guard-conduta" blocking={false} />
                  )}
                  {isEditing ? (
                    <div className="p-4">
                      <textarea
                        value={currentText}
                        onChange={(e) => {
                          if (editedBaseTexts[section.id] === undefined) {
                            setEditedBaseTexts((prev) => ({
                              ...prev,
                              [section.id]: serializedText,
                            }));
                          }
                          setEditedTexts((prev) => ({
                            ...prev,
                            [section.id]: e.target.value,
                          }));
                        }}
                        rows={Math.min(24, Math.max(5, currentText.split('\n').length + 1))}
                        aria-label={`Editar ${section.title}`}
                        className="w-full resize-y rounded-md border border-[#0F766E]/40 bg-[#FAFAFA] p-3 font-sans text-[14px] leading-relaxed text-zinc-900 outline-none focus:border-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                      />
                    </div>
                  ) : isEdited ? (
                    <div className="px-5 py-4 whitespace-pre-wrap text-[14px] leading-[1.68] text-zinc-800 dark:text-[#D1D5DB]">
                      {currentText}
                    </div>
                  ) : (
                    <PepBlockRenderer
                      ast={compiled.ast}
                      section={section}
                      state={astState}
                      clinicalContext={compiled.clinicalContext}
                      onInputChange={handleAstInputChange}
                      onChoiceSelect={handleAstChoiceSelect}
                      onToggleTrava={handleToggleTrava}
                      onToggleOptional={handleToggleOptional}
                      onToggleCheckbox={handleToggleCheckbox}
                    />
                  )}
                </section>
              );
            })}
          </div>

          {/* DIRETRIZES & FUNDAMENTAÇÃO CLÍNICA (Colapsável fechada por padrão) */}
          {guiaSections.length > 0 && (
            <section
              id="pep-section-diretrizes"
              className="mt-8 scroll-mt-4 border-t border-zinc-200 pt-5 dark:border-white/[0.10]"
            >
              <button
                type="button"
                onClick={() => setGuiaOpen((v) => !v)}
                aria-expanded={guiaOpen}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-100/80 dark:hover:bg-[#15181F]"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                  <span className="font-display text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
                    Diretrizes &amp; Fundamentação Clínica
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                    ({guiaSections.length} {guiaSections.length === 1 ? 'seção' : 'seções'})
                  </span>
                </div>
                {guiaOpen ? (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                )}
              </button>

              {guiaOpen && (
                <div className="mt-4 space-y-6 px-2 pb-8">
                  {guiaSections.map((sec, idx) => {
                    const meta = classifyGuiaSectionTheme(sec.title);
                    const isDanger = meta.cls === 'theme-danger';
                    const cleanTitle = sec.title.replace(/^[^\wÀ-ÿ]+/, '').trim() || sec.title;
                    return (
                      <div
                        key={`${idx}-${sec.title}`}
                        className={
                          isDanger
                            ? 'rounded-lg border border-amber-200/90 bg-amber-50/40 p-4 dark:border-amber-500/25 dark:bg-amber-500/10'
                            : 'space-y-2'
                        }
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-zinc-950 dark:text-[#F3F4F6]">
                            {cleanTitle}
                          </h3>
                          <span
                            className={`shrink-0 text-[11px] font-medium ${
                              isDanger
                                ? 'text-amber-800 dark:text-amber-300'
                                : 'text-zinc-400 dark:text-[#9CA3AF]'
                            }`}
                          >
                            {meta.tag}
                          </span>
                        </div>
                        <div
                          className="editorial-prose"
                          dangerouslySetInnerHTML={{
                            __html: renderGuiaSectionBodyHtml(sec.body),
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
          {/* COLUNA FIXA À DIREITA (≥ 1280px): índice + copiar + alertas + doses, acompanha a rolagem */}
          <aside
            aria-label="Índice e ações do protocolo"
            className="sticky top-6 hidden w-60 shrink-0 xl:block"
          >
            <div className="space-y-4 rounded-lg border border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                  Copiar para o PEP
                </div>
                <button
                  type="button"
                  onClick={() => void requestCopy('all')}
                  title="Copiar tudo (1 ou Alt+C)"
                  className="mb-1.5 flex w-full items-center justify-between gap-2 rounded-md bg-[#0F766E] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-teal-300"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {copiedKey === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedKey === 'all' ? 'Copiado' : 'Tudo'}
                  </span>
                  <kbd className="rounded bg-white/20 px-1 font-mono text-[10px] dark:bg-black/15">1</kbd>
                </button>
                <ul className="space-y-0.5">
                  {compiled.sections.map((sec) => {
                    const st = SECTION_VISUAL_STYLE[sec.id] || SECTION_VISUAL_STYLE.geral;
                    const shortcut = COPY_SHORTCUT_BY_KEY[sec.id];
                    const gapCount = sec.id === 'receita' ? getCopyGapReport('receita').report.total : 0;
                    const guardCount =
                      sec.id === 'receita'
                        ? prescriptionAudit.receita?.blockCount ?? 0
                        : sec.id === 'conduta'
                          ? (prescriptionAudit.conduta?.blockCount ?? 0) + (prescriptionAudit.conduta?.warnCount ?? 0)
                          : 0;
                    return (
                      <li key={sec.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => scrollToElementById(`pep-section-${sec.id}`)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]"
                        >
                          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dotClass}`} />
                          <span className="truncate">{st.shortLabel}</span>
                          {gapCount > 0 && (
                            <span
                              title={`${gapCount} lacuna(s) que travam a cópia`}
                              className="ml-auto shrink-0 rounded bg-amber-500/15 px-1 font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-300"
                            >
                              {gapCount}
                            </span>
                          )}
                          {guardCount > 0 && (
                            <span
                              title={`${guardCount} alerta(s) de prescrição`}
                              className={`${gapCount > 0 ? '' : 'ml-auto '}shrink-0 rounded bg-red-500/15 px-1 font-mono text-[10px] font-semibold text-red-700 dark:text-red-300`}
                            >
                              !{guardCount}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void requestCopy(sec.id)}
                          aria-label={`Copiar ${sec.title}`}
                          title={shortcut ? `Copiar ${sec.title} (${shortcut})` : `Copiar ${sec.title}`}
                          className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[11px] transition-colors ${
                            copiedKey === sec.id
                              ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-[#2DD4BF] dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                              : 'border-zinc-200/90 text-zinc-600 hover:border-[#0F766E]/50 hover:text-[#0F766E] dark:border-white/[0.1] dark:text-[#D1D5DB] dark:hover:text-[#2DD4BF]'
                          }`}
                        >
                          {copiedKey === sec.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {shortcut && <kbd className="font-mono text-[10px]">{shortcut}</kbd>}
                        </button>
                      </li>
                    );
                  })}
                  {guiaSections.length > 0 && (
                    <li>
                      <button
                        type="button"
                        onClick={handleJumpToDiretrizes}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
                      >
                        <BookOpen className="h-3 w-3 shrink-0" />
                        Diretrizes
                      </button>
                    </li>
                  )}
                </ul>
              </div>

              {compiled.clinicalContext.weightDoses && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                    Doses ·{' '}
                    <span className="font-mono normal-case">
                      {String(compiled.clinicalContext.weightDoses.weightKg).replace('.', ',')} kg
                    </span>
                  </div>
                  <ul className="space-y-0.5 text-[11px]">
                    {compiled.clinicalContext.weightDoses.items.slice(0, 6).map((d) => (
                      <li key={d.drug} className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-zinc-600 dark:text-[#9CA3AF]">{d.drug.split('(')[0].trim()}</span>
                        <span
                          className={`shrink-0 font-mono font-medium ${
                            !d.allowed
                              ? 'text-red-700 dark:text-red-400'
                              : d.ceilingHit
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-zinc-900 dark:text-[#F3F4F6]'
                          }`}
                        >
                          {d.formattedDose.split('|')[0].trim()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="border-t border-zinc-200/70 pt-2 text-[11px] leading-relaxed text-zinc-400 dark:border-white/[0.07] dark:text-[#6B7280]">
                <kbd className="font-mono">Alt+N</kbd> próximo campo vazio · <kbd className="font-mono">?</kbd> atalhos
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
