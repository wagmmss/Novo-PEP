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
  PanelLeftClose,
  PanelLeftOpen,
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
  getSubcategoryLabel as formatSubcategoryLabel,
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
  formatCompactProtocolTitle,
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
 * Atalhos de cópia alinhados à ordem visual do índice e às Power Actions:
 * 1 = Tudo · 2 = Evolução · 3 = Conduta · 4 = Prescrição · 5 = Orientações. Alt+C = Copiar tudo.
 */
const COPY_SHORTCUTS: Record<string, CopyKey> = {
  '1': 'all',
  '2': 'evolucao',
  '3': 'conduta',
  '4': 'receita',
  '5': 'orientacoes',
};

const COPY_SHORTCUT_BY_KEY: Partial<Record<CopyKey, string>> = {
  all: '1',
  evolucao: '2',
  conduta: '3',
  receita: '4',
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
          Alertas informativos de conduta: revise os blocos condicionais antes de copiar.
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

function getSubcategoryLabel(item: ClinicalProtocolItem): string {
  const withSubcat = item as ClinicalProtocolItem & { subcat?: string };
  const raw = (withSubcat.subcat || item.category || MOD_LABELS[item.mod_id] || 'Geral').trim();
  return formatSubcategoryLabel(raw);
}

interface DraftSnapshot {
  protocolId: string;
  title: string;
  astState: AstSelectionState;
  editedTexts: Record<string, string>;
  editedBaseTexts: Record<string, string>;
  sectionNotes: Record<string, string>;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});
  const [patient, setPatient] = useState<PatientContextInput>(EMPTY_PATIENT_CONTEXT);
  const [ckdEpiOpen, setCkdEpiOpen] = useState(false);
  const [mobilePatientExpanded, setMobilePatientExpanded] = useState(false);
  const [guiaOpen, setGuiaOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<PepSectionId | null>(null);

  // Estado interativo da AST real + modo de edição livre opcional por bloco + notas rápidas
  const [editingBlockIds, setEditingBlockIds] = useState<Record<string, boolean>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [editedBaseTexts, setEditedBaseTexts] = useState<Record<string, string>>({});
  const [sectionNotes, setSectionNotes] = useState<Record<string, string>>({});
  const [openNoteSections, setOpenNoteSections] = useState<Record<string, boolean>>({});
  const [lastDraftSnapshot, setLastDraftSnapshot] = useState<DraftSnapshot | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** Cópia retida pela trava de lacunas (o relatório é recalculado ao vivo). */
  const [pendingCopyKey, setPendingCopyKey] = useState<CopyKey | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listPaneRef = useRef<HTMLDivElement | null>(null);
  const handledCopyNonceRef = useRef<number | null>(null);
  const initializedCollapsedRef = useRef(false);
  const pendingRestoreRef = useRef<DraftSnapshot | null>(null);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const activeProtocol = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id !== 'hab') return found;
    }
    return PEP_PROTOCOLS[0];
  }, [selectedId]);

  // Na carga inicial, mantém expandida apenas a área do protocolo ativo; ao trocar de protocolo via Ctrl+K/link, expande sua área
  useEffect(() => {
    if (!initializedCollapsedRef.current) {
      initializedCollapsedRef.current = true;
      setCollapsedAreas({
        go: activeProtocol.mod_id !== 'go',
        upa: activeProtocol.mod_id !== 'upa',
        enf: activeProtocol.mod_id !== 'enf',
        ped: activeProtocol.mod_id !== 'ped',
      });
      return;
    }
    setCollapsedAreas((prev) =>
      prev[activeProtocol.mod_id] ? { ...prev, [activeProtocol.mod_id]: false } : prev
    );
  }, [activeProtocol.mod_id]);

  const effectivePatient = useMemo<PatientContextInput>(() => {
    if (activeProtocol.mod_id === 'go' && !patient.sexo) {
      return { ...patient, sexo: 'F' };
    }
    return patient;
  }, [activeProtocol.mod_id, patient]);

  const compiled = useMemo(
    () => compileProtocolForDisplay(activeProtocol, effectivePatient),
    [activeProtocol, effectivePatient]
  );

  const [astState, setAstState] = useState<AstSelectionState>(() => compiled.initialAstState);
  // Protocolo ao qual o astState atual pertence (evita serializar AST nova com estado antigo no frame da troca)
  const [astStateProtocolId, setAstStateProtocolId] = useState<string>(activeProtocol.id);
  const prevProtocolIdRef = useRef<string>(activeProtocol.id);
  const prevProtocolTitleRef = useRef<string>(activeProtocol.title);
  const mainRef = useRef<HTMLElement | null>(null);
  const latestDraftRef = useRef<{
    astState: AstSelectionState;
    editedTexts: Record<string, string>;
    editedBaseTexts: Record<string, string>;
    sectionNotes: Record<string, string>;
  }>({ astState, editedTexts, editedBaseTexts, sectionNotes });
  latestDraftRef.current = { astState, editedTexts, editedBaseTexts, sectionNotes };

  // Reinicia AST limpa ao trocar de protocolo. Peso/idade são SEMPRE limpos na troca para
  // impedir que o peso de um paciente vaze para a prescrição do próximo.
  useEffect(() => {
    if (prevProtocolIdRef.current !== activeProtocol.id) {
      const prevId = prevProtocolIdRef.current;
      const prevTitle = prevProtocolTitleRef.current;
      prevProtocolIdRef.current = activeProtocol.id;
      prevProtocolTitleRef.current = activeProtocol.title;

      const prevDraft = latestDraftRef.current;
      const hadUserEdits =
        Object.keys(prevDraft.astState.userEditedNodes).length > 0 ||
        Object.values(prevDraft.astState.excludedBlocks ?? {}).some(Boolean) ||
        Object.keys(prevDraft.editedTexts).length > 0 ||
        Object.values(prevDraft.sectionNotes).some((v) => v.trim().length > 0);

      const pendingRestore = pendingRestoreRef.current;
      const isRestoringThis = pendingRestore?.protocolId === activeProtocol.id;
      if (isRestoringThis) {
        pendingRestoreRef.current = null;
      }

      if (hadUserEdits && !isRestoringThis) {
        setLastDraftSnapshot({
          protocolId: prevId,
          title: prevTitle,
          astState: prevDraft.astState,
          editedTexts: prevDraft.editedTexts,
          editedBaseTexts: prevDraft.editedBaseTexts,
          sectionNotes: prevDraft.sectionNotes,
        });
      } else if (isRestoringThis) {
        setLastDraftSnapshot(null);
      }

      const hadPatientValues = patientContextHasValues(patient);
      const nextCompiled = hadPatientValues
        ? compileProtocolForDisplay(activeProtocol, EMPTY_PATIENT_CONTEXT)
        : compiled;
      if (hadPatientValues) {
        setPatient(EMPTY_PATIENT_CONTEXT);
        onNotify('Dados do paciente limpos ao trocar de protocolo — informe os deste paciente.');
      }

      if (isRestoringThis && pendingRestore) {
        setAstState(
          applyPatientContextToAstState(
            nextCompiled.ast,
            pendingRestore.astState,
            nextCompiled.clinicalContext
          )
        );
        setEditedTexts(pendingRestore.editedTexts);
        setEditedBaseTexts(pendingRestore.editedBaseTexts);
        setSectionNotes(pendingRestore.sectionNotes);
        const restoredOpenNotes: Record<string, boolean> = {};
        for (const [secId, note] of Object.entries(pendingRestore.sectionNotes)) {
          if (note.trim()) restoredOpenNotes[secId] = true;
        }
        setOpenNoteSections(restoredOpenNotes);
      } else {
        setAstState(nextCompiled.initialAstState);
        setEditedTexts({});
        setEditedBaseTexts({});
        setSectionNotes({});
        setOpenNoteSections({});
      }

      setAstStateProtocolId(activeProtocol.id);
      setCkdEpiOpen(false);
      setMobilePatientExpanded(false);
      setGuiaOpen(false);
      setActiveSectionId(null);
      setEditingBlockIds({});
      setCopiedKey(null);
      setPendingCopyKey(null);
      mainRef.current?.scrollTo({ top: 0 });
    } else {
      setAstState((prev) =>
        applyPatientContextToAstState(compiled.ast, prev, compiled.clinicalContext)
      );
    }
  }, [activeProtocol, compiled, patient]);

  // Destaca a seção visível no índice lateral direito durante a rolagem
  useEffect(() => {
    const root = mainRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const sectionEls = compiled.sections
      .map((s) => document.getElementById(`pep-section-${s.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sectionEls.length === 0) return;

    const visibleIds = new Set<PepSectionId>();
    const pickActive = () => {
      if (root.scrollTop < 40) {
        setActiveSectionId(compiled.sections[0]?.id ?? null);
        return;
      }
      for (const sec of compiled.sections) {
        if (visibleIds.has(sec.id)) {
          setActiveSectionId(sec.id);
          return;
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace('pep-section-', '') as PepSectionId;
          if (entry.isIntersecting) {
            visibleIds.add(id);
          } else {
            visibleIds.delete(id);
          }
        }
        pickActive();
      },
      { root, rootMargin: '-5% 0px -45% 0px', threshold: [0, 0.1, 0.25] }
    );
    const handleScroll = () => {
      if (root.scrollTop < 40) {
        setActiveSectionId(compiled.sections[0]?.id ?? null);
      }
    };
    root.addEventListener('scroll', handleScroll, { passive: true });
    for (const el of sectionEls) observer.observe(el);
    return () => {
      root.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [activeProtocol.id, compiled.sections]);

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

  // Agrupamento superior por Área (GO, UPA, Enfermaria, Pediatria) para abas retráteis na barra lateral
  const areaGroupedProtocols = useMemo(() => {
    const areas: Array<{
      modId: ClinicalProtocolItem['mod_id'];
      label: string;
      totalCount: number;
      groups: typeof groupedProtocols;
    }> = [];
    const byMod = new Map<ClinicalProtocolItem['mod_id'], (typeof areas)[number]>();
    for (const grp of groupedProtocols) {
      let area = byMod.get(grp.modId);
      if (!area) {
        area = {
          modId: grp.modId,
          label: MOD_LABELS[grp.modId] || grp.modId.toUpperCase(),
          totalCount: 0,
          groups: [],
        };
        byMod.set(grp.modId, area);
        areas.push(area);
      }
      area.groups.push(grp);
      area.totalCount += grp.items.length;
    }
    return areas;
  }, [groupedProtocols]);

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
    setAstState((prev) => {
      const next: AstSelectionState = {
        ...prev,
        choiceSelections: {
          ...prev.choiceSelections,
          [group.id]: nextIndices,
        },
        userEditedNodes: {
          ...prev.userEditedNodes,
          [group.id]: true,
        },
      };
      // Recalcula imediatamente doses dependentes de apresentação/intervalo (ex.: Amoxicilina 400 vs 250 mg/5 mL)
      return applyPatientContextToAstState(compiled.ast, next, compiled.clinicalContext);
    });
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

  const handleToggleExcludeBlock = (blockId: string) => {
    setAstState((prev) => ({
      ...prev,
      excludedBlocks: {
        ...(prev.excludedBlocks ?? {}),
        [blockId]: !prev.excludedBlocks?.[blockId],
      },
    }));
  };

  const getSectionSerializedText = (section: PepAstSection): string => {
    const base = serializeProtocolSection(compiled.ast, astState, compiled.clinicalContext, section);
    const note = (sectionNotes[section.id] ?? '').trim();
    if (!note) return base;
    return base ? `${base}\n${note}` : note;
  };

  const getBlockText = (section: PepAstSection): string => {
    return editedTexts[section.id] !== undefined
      ? editedTexts[section.id]
      : getSectionSerializedText(section);
  };

  // Auditor de prescrição sobre o texto que de fato será copiado (inclui edição livre e observação)
  const prescriptionAudit = useMemo(() => {
    const texts: Partial<Record<PepSectionId, string>> = {};
    for (const sec of compiled.sections) {
      if (sec.id === 'receita' || sec.id === 'conduta') texts[sec.id] = getBlockText(sec);
    }
    return auditProtocolPrescription(activeProtocol, texts, compiled.clinicalContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProtocol, compiled, astState, editedTexts, sectionNotes]);

  /** Alertas "block" da Prescrição e Conduta que seguram a cópia. */
  const getGuardBlockingAlerts = (key: CopyKey) => {
    const out = [];
    if (key === 'all' || key === 'receita') {
      out.push(...(prescriptionAudit.receita?.alerts ?? []).filter((a) => a.severity === 'block'));
    }
    if (key === 'all' || key === 'conduta') {
      out.push(...(prescriptionAudit.conduta?.alerts ?? []).filter((a) => a.severity === 'block'));
    }
    return out;
  };

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
   * e a Conduta (peso ausente com dose/kg e campos clínicos abertos em itens ativos).
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
            openFields: secReport.openFields,
            missingWeightForDoses: secReport.missingWeightForDoses,
            total: secReport.openFields + (secReport.missingWeightForDoses ? 1 : 0),
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
      if (sidebarCollapsed) setSidebarCollapsed(false);
      if (mobileShowDetail) onBackToList();
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
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

  // Mantém o item selecionado visível na lista ao navegar por ↑/↓ ou Ctrl+K (após expandir a área)
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const el = listPaneRef.current?.querySelector<HTMLElement>(
        `[data-protocol-id="${CSS.escape(activeProtocol.id)}"]`
      );
      el?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeProtocol.id, collapsedAreas]);

  const pendingGap = pendingCopyKey ? getCopyGapReport(pendingCopyKey).report : null;
  const pendingGuard = pendingCopyKey ? getGuardBlockingAlerts(pendingCopyKey) : [];
  const pendingBlocking = Boolean(pendingGap && (pendingGap.total > 0 || pendingGuard.length > 0));

  const handleClearPatient = () => {
    setPatient(EMPTY_PATIENT_CONTEXT);
    setCkdEpiOpen(false);
    setEditedTexts({});
    setEditedBaseTexts({});
    setEditingBlockIds({});
    setSectionNotes({});
    setOpenNoteSections({});
    setLastDraftSnapshot(null);
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
      {/* COLUNA ESQUERDA: Lista de Protocolos dividida por abas retráteis de área (GO, UPA, Enfermaria, Pediatria) */}
      <aside
        aria-label="Lista de protocolos clínicos"
        className={`${
          mobileShowDetail
            ? 'hidden'
            : 'flex'
        } ${sidebarCollapsed ? 'lg:hidden' : 'lg:flex'} h-full w-full shrink-0 flex-col border-r border-zinc-200/80 bg-[#FAFAFA] lg:w-[272px] xl:w-[292px] dark:border-white/[0.07] dark:bg-[#0F1115]`}
      >
        <div className="space-y-2.5 border-b border-zinc-200/80 p-3 dark:border-white/[0.07]">
          {/* Busca + botão discreto de estrela (Favoritos) + recolher barra lateral */}
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
                placeholder="Filtrar protocolo ou CID..."
                title="Atalho: /  ·  ↑↓ escolhe o protocolo  ·  Enter volta ao documento"
                aria-label="Filtrar protocolos"
                className="w-full rounded-lg border border-zinc-200/90 bg-white py-1.5 pr-8 pl-8 text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar filtro"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F3F4F6]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] leading-none text-zinc-400 dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#6B7280]"
                >
                  /
                </kbd>
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

            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Recolher barra lateral"
              title="Recolher barra lateral"
              className="hidden h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-700 lg:inline-flex dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:border-white/[0.15] dark:hover:text-[#F3F4F6]"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
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
                  onClick={() => {
                    setAreaFilter(f.id);
                    if (f.id !== 'todos') {
                      setCollapsedAreas((prev) => ({ ...prev, [f.id]: false }));
                    }
                  }}
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

        {/* Contador discreto + Expandir/Recolher todas as abas */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/[0.06] dark:text-[#9CA3AF]">
          <span className="tabular-nums">
            {filteredProtocols.length}{' '}
            {filteredProtocols.length === 1 ? 'protocolo' : 'protocolos'}
            {onlyFavorites ? ' · favoritos' : ''}
          </span>
          {areaFilter !== 'todos' || onlyFavorites ? (
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
          ) : (
            !searchQuery.trim() &&
            areaGroupedProtocols.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const anyCollapsed = areaGroupedProtocols.some((a) => collapsedAreas[a.modId]);
                  const nextState: Record<string, boolean> = {};
                  for (const a of areaGroupedProtocols) {
                    nextState[a.modId] = !anyCollapsed;
                  }
                  setCollapsedAreas(nextState);
                }}
                className="text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
              >
                {areaGroupedProtocols.some((a) => collapsedAreas[a.modId])
                  ? 'Expandir todas'
                  : 'Recolher todas'}
              </button>
            )
          )}
        </div>

        {/* Lista dividida por abas retráteis de área (GO, UPA, Enfermaria, Pediatria) + subcategorias */}
        <div ref={listPaneRef} className="flex-1 overflow-y-auto">
          {filteredProtocols.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-zinc-500 dark:text-[#9CA3AF]">
              {onlyFavorites
                ? 'Nenhum protocolo favoritado neste filtro.'
                : 'Nenhum protocolo encontrado.'}
            </div>
          ) : (
            areaGroupedProtocols.map((area) => {
              const forceExpanded =
                Boolean(searchQuery.trim()) || onlyFavorites || areaFilter !== 'todos';
              const isAreaOpen = forceExpanded || !collapsedAreas[area.modId];
              const areaDot = AREA_DOT_CLASS[area.modId];
              const hasActiveChild = area.groups.some((g) =>
                g.items.some((item) => item.id === activeProtocol.id)
              );

              return (
                <section key={area.modId} className="border-b border-zinc-200/70 dark:border-white/[0.07]">
                  {forceExpanded ? (
                    <div className="flex w-full items-center justify-between gap-2 bg-zinc-100/80 px-3 py-2 text-left text-zinc-900 dark:bg-[#15181F] dark:text-[#F3F4F6]">
                      <span className="flex min-w-0 items-center gap-2">
                        {areaDot && (
                          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${areaDot}`} />
                        )}
                        <span className="truncate text-xs font-semibold tracking-tight">
                          {area.label}
                        </span>
                      </span>
                      <span className="rounded-full bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600 dark:bg-white/[0.08] dark:text-[#9CA3AF]">
                        {area.totalCount}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={isAreaOpen}
                      onClick={() =>
                        setCollapsedAreas((prev) => ({
                          ...prev,
                          [area.modId]: !prev[area.modId],
                        }))
                      }
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                        isAreaOpen
                          ? 'bg-zinc-100/80 text-zinc-900 dark:bg-[#15181F] dark:text-[#F3F4F6]'
                          : 'bg-[#FAFAFA] text-zinc-700 hover:bg-zinc-100/70 dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:bg-[#15181F]/80'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {areaDot && (
                          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${areaDot}`} />
                        )}
                        <span className="truncate text-xs font-semibold tracking-tight">
                          {area.label}
                        </span>
                        {hasActiveChild && !isAreaOpen && (
                          <span className="rounded bg-[#0F766E]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#0F766E] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF]">
                            ativo
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600 dark:bg-white/[0.08] dark:text-[#9CA3AF]">
                          {area.totalCount}
                        </span>
                        {isAreaOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-[#9CA3AF]" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-400 dark:text-[#9CA3AF]" />
                        )}
                      </span>
                    </button>
                  )}

                  {isAreaOpen &&
                    area.groups.map((group) => (
                      <div key={group.key}>
                        <div className="sticky top-0 z-10 flex items-center gap-1.5 border-y border-zinc-200/60 bg-[#FAFAFA]/95 px-3 py-1 text-[10px] font-semibold tracking-[0.06em] text-zinc-500 uppercase backdrop-blur-xs dark:border-white/[0.06] dark:bg-[#0F1115]/95 dark:text-[#9CA3AF]">
                          <span className="truncate">{group.label}</span>
                        </div>
                        {group.items.map((item) => {
                          const isSelected = item.id === activeProtocol.id;
                          const isFav = favoriteSet.has(item.id);
                          const activeAreaBorder =
                            AREA_ACTIVE_BORDER_CLASS[item.mod_id] ||
                            'border-l-[#0F766E] dark:border-l-[#2DD4BF]';
                          return (
                            <button
                              key={item.id}
                              type="button"
                              data-protocol-id={item.id}
                              aria-current={isSelected ? 'true' : undefined}
                              title={item.title}
                              onClick={() => onSelectProtocol(item.id)}
                              className={`group flex w-full items-start justify-between gap-2.5 border-b border-l-2 border-b-zinc-200/40 px-3 py-2.5 text-left transition-colors last:border-b-0 dark:border-b-white/[0.05] ${
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
                                {formatCompactProtocolTitle(item.title)}
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
                    ))}
                </section>
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

        <div className="mx-auto flex max-w-[1260px] items-start gap-6 px-4 py-5 sm:px-6 sm:py-7">
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

          {/* Aviso de recuperação de rascunho ao sair de um protocolo com alterações */}
          {lastDraftSnapshot && lastDraftSnapshot.protocolId !== activeProtocol.id && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-xs text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#D1D5DB]">
              <span className="min-w-0 flex-1 truncate">
                Você saiu de <strong className="font-semibold text-zinc-900 dark:text-[#F3F4F6]">{lastDraftSnapshot.title}</strong> com alterações.
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    pendingRestoreRef.current = lastDraftSnapshot;
                    onSelectProtocol(lastDraftSnapshot.protocolId);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[#0F766E]/40 bg-teal-50/70 px-2 py-0.5 text-[11px] font-semibold text-[#0F766E] transition-colors hover:bg-teal-100/80 dark:border-[#2DD4BF]/40 dark:bg-teal-500/12 dark:text-[#2DD4BF] dark:hover:bg-teal-500/20"
                >
                  <RotateCcw className="h-3 w-3" />
                  Voltar ao rascunho
                </button>
                <button
                  type="button"
                  onClick={() => setLastDraftSnapshot(null)}
                  aria-label="Dispensar aviso de rascunho"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Cabeçalho Editorial do Protocolo */}
          <header className="border-b border-zinc-200/80 pb-5 dark:border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[#9CA3AF]">
              {sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Abrir barra lateral de protocolos"
                  title="Abrir barra lateral de protocolos"
                  className="mr-1 hidden items-center gap-1 rounded-md border border-zinc-200/90 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] lg:inline-flex dark:border-white/[0.1] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:text-[#2DD4BF]"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                  Protocolos
                </button>
              )}
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
                {/* No mobile (< lg), colapsa em 1 linha limpa quando ainda vazio para o protocolo começar acima da dobra */}
                {!hasPatientValues && !mobilePatientExpanded && (
                  <button
                    type="button"
                    onClick={() => setMobilePatientExpanded(true)}
                    className="flex w-full items-center justify-between gap-2 text-left text-xs text-zinc-600 lg:hidden dark:text-[#D1D5DB]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                        Paciente
                      </span>
                      <span className="truncate text-zinc-400 dark:text-[#6B7280]">
                        {compiled.needsWeightPersonalization
                          ? 'Peso, Idade, Alergias, TFG...'
                          : 'Alergias, TFG, Gestante...'}
                      </span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  </button>
                )}

                <div
                  className={`${
                    !hasPatientValues && !mobilePatientExpanded ? 'hidden lg:block' : 'block'
                  }`}
                >
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
                      placeholder={activeProtocol.mod_id === 'ped' ? 'Ex: 14' : 'Ex: 70'}
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
                      placeholder={activeProtocol.mod_id === 'ped' ? 'Ex: 3a / 8m' : 'Ex: 54a'}
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
                      placeholder={
                        compiled.clinicalContext.tfgCkdEpi !== null
                          ? String(compiled.clinicalContext.tfgCkdEpi).replace('.', ',')
                          : 'mL/min'
                      }
                      className="w-16 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                    {activeProtocol.mod_id !== 'ped' && (
                      <button
                        type="button"
                        onClick={() => setCkdEpiOpen((v) => !v)}
                        aria-expanded={ckdEpiOpen}
                        title="Calcular TFG por CKD-EPI 2021 (Creatinina + Idade + Sexo)"
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                          ckdEpiOpen || compiled.clinicalContext.tfgCkdEpi !== null
                            ? 'border-[#0F766E]/50 bg-teal-50/70 text-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-teal-500/12 dark:text-[#2DD4BF]'
                            : 'border-zinc-200/90 bg-[#FAFAFA] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                        }`}
                      >
                        {compiled.clinicalContext.tfgCkdEpi !== null
                          ? `CKD-EPI: ${String(compiled.clinicalContext.tfgCkdEpi).replace('.', ',')}`
                          : 'CKD-EPI'}
                      </button>
                    )}
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

                  {hasPatientValues ? (
                    <button
                      type="button"
                      onClick={handleClearPatient}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Novo paciente
                    </button>
                  ) : (
                    mobilePatientExpanded && (
                      <button
                        type="button"
                        onClick={() => setMobilePatientExpanded(false)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-700 lg:hidden dark:hover:text-[#F3F4F6]"
                      >
                        Ocultar
                      </button>
                    )
                  )}
                </div>

                {/* CKD-EPI 2021 Integrada (inline, apenas adulto — não validada em pediatria) */}
                {ckdEpiOpen && activeProtocol.mod_id !== 'ped' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200/70 pt-2.5 text-xs dark:border-white/[0.07]">
                    <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                      CKD-EPI 2021
                    </span>
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="pt-cr" className="text-zinc-500 dark:text-[#9CA3AF]">
                        Cr (mg/dL)
                      </label>
                      <input
                        id="pt-cr"
                        type="text"
                        inputMode="decimal"
                        value={patient.creatinina ?? ''}
                        onChange={(e) => setPatient((p) => ({ ...p, creatinina: e.target.value }))}
                        placeholder="Ex: 1,4"
                        className="w-20 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                      />
                    </div>
                    {!compiled.needsWeightPersonalization && (
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="pt-ckd-idade" className="text-zinc-500 dark:text-[#9CA3AF]">
                          Idade
                        </label>
                        <input
                          id="pt-ckd-idade"
                          type="text"
                          inputMode="numeric"
                          value={patient.idade}
                          onChange={(e) => setPatient((p) => ({ ...p, idade: e.target.value }))}
                          placeholder="Ex: 68"
                          className="w-16 rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                        />
                      </div>
                    )}
                    <div
                      className="inline-flex items-center rounded-md border border-zinc-200/90 bg-[#FAFAFA] p-0.5 dark:border-white/[0.1] dark:bg-[#0F1115]"
                      role="group"
                      aria-label="Sexo biológico para CKD-EPI"
                    >
                      {(['F', 'M'] as const).map((sx) => {
                        const activeSex = (effectivePatient.sexo || '').toUpperCase() === sx;
                        return (
                          <button
                            key={sx}
                            type="button"
                            onClick={() => setPatient((p) => ({ ...p, sexo: sx }))}
                            className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                              activeSex
                                ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                                : 'text-zinc-500 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                            }`}
                          >
                            {sx === 'F' ? 'Fem' : 'Masc'}
                          </button>
                        );
                      })}
                    </div>

                    {compiled.clinicalContext.tfgCkdEpi !== null ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            compiled.clinicalContext.tfgCkdEpi < 30
                              ? 'bg-red-500/15 text-red-800 dark:text-red-300'
                              : compiled.clinicalContext.tfgCkdEpi < 60
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-teal-500/12 text-[#0F766E] dark:text-[#2DD4BF]'
                          }`}
                        >
                          TFGe: {String(compiled.clinicalContext.tfgCkdEpi).replace('.', ',')} mL/min/1,73m²
                          {compiled.clinicalContext.renalStageLabel
                            ? ` · ${compiled.clinicalContext.renalStageLabel}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `TFGe (CKD-EPI 2021): ${String(
                              compiled.clinicalContext.tfgCkdEpi
                            ).replace('.', ',')} mL/min/1,73m² (${
                              compiled.clinicalContext.renalStageLabel || 'KDIGO'
                            }).`;
                            void copyToClipboard(snippet).then((ok) => {
                              if (ok) onNotify('TFGe (CKD-EPI 2021) copiada.');
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:border-[#0F766E]/40 hover:text-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#D1D5DB] dark:hover:text-[#2DD4BF]"
                        >
                          <Copy className="h-3 w-3" />
                          Copiar TFGe
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-400 dark:text-[#6B7280]">
                        Informe Cr, Idade (≥ 18a) e Sexo para calcular e auditar a prescrição automaticamente.
                      </span>
                    )}
                  </div>
                )}

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

                {/* Resumo rápido de doses ponderais (< xl; em ≥ xl vive na coluna fixa direita para evitar duplicação) */}
                {compiled.clinicalContext.weightDoses && (
                  <div className="mt-3 border-t border-zinc-200/70 pt-2.5 xl:hidden dark:border-white/[0.07]">
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
                    <GuardAlertList report={prescriptionAudit.conduta} anchorId="pep-guard-conduta" blocking />
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
                    <>
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
                        onToggleExcludeBlock={handleToggleExcludeBlock}
                      />
                      <div className="border-t border-zinc-100 px-5 py-2 dark:border-white/[0.05]">
                        {openNoteSections[section.id] || (sectionNotes[section.id] ?? '').trim() ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label
                                htmlFor={`pep-note-${section.id}`}
                                className="text-[11px] font-medium text-zinc-500 dark:text-[#9CA3AF]"
                              >
                                {section.id === 'receita'
                                  ? 'Item ou observação adicional (incluído na cópia e auditoria)'
                                  : 'Observação adicional (incluída na cópia)'}
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setSectionNotes((prev) => {
                                    const next = { ...prev };
                                    delete next[section.id];
                                    return next;
                                  });
                                  setOpenNoteSections((prev) => ({ ...prev, [section.id]: false }));
                                }}
                                className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F3F4F6]"
                              >
                                Remover
                              </button>
                            </div>
                            <textarea
                              id={`pep-note-${section.id}`}
                              rows={2}
                              value={sectionNotes[section.id] ?? ''}
                              onChange={(e) =>
                                setSectionNotes((prev) => ({
                                  ...prev,
                                  [section.id]: e.target.value,
                                }))
                              }
                              placeholder={
                                section.id === 'receita'
                                  ? 'Ex: Ondansetrona 4 mg VO se náusea/vômito...'
                                  : 'Anotação complementar sem sair do modo interativo...'
                              }
                              className="w-full resize-y rounded-md border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-1.5 text-xs leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenNoteSections((prev) => ({ ...prev, [section.id]: true }))
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-[#0F766E] dark:text-[#6B7280] dark:hover:text-[#2DD4BF]"
                          >
                            <Plus className="h-3 w-3" />
                            {section.id === 'receita' ? 'Adicionar item / observação' : 'Observação'}
                          </button>
                        )}
                      </div>
                    </>
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
            className="sticky top-6 hidden max-h-[calc(100vh-5rem)] w-56 shrink-0 overflow-y-auto xl:block 2xl:w-60"
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
                  {compiled.sections.map((sec, secIdx) => {
                    const st = SECTION_VISUAL_STYLE[sec.id] || SECTION_VISUAL_STYLE.geral;
                    const shortcut = COPY_SHORTCUT_BY_KEY[sec.id];
                    const isSectionActive =
                      activeSectionId === sec.id || (activeSectionId === null && secIdx === 0);
                    const gapCount =
                      sec.id === 'receita'
                        ? getCopyGapReport('receita').report.total
                        : sec.id === 'conduta'
                          ? getCopyGapReport('conduta').report.total
                          : 0;
                    const guardCount =
                      sec.id === 'receita'
                        ? prescriptionAudit.receita?.blockCount ?? 0
                        : sec.id === 'conduta'
                          ? (prescriptionAudit.conduta?.blockCount ?? 0) + (prescriptionAudit.conduta?.warnCount ?? 0)
                          : 0;
                    const isBlockingGuard =
                      sec.id === 'receita' || (sec.id === 'conduta' && (prescriptionAudit.conduta?.blockCount ?? 0) > 0);
                    return (
                      <li key={sec.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSectionId(sec.id);
                            scrollToElementById(`pep-section-${sec.id}`);
                          }}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors ${
                            isSectionActive
                              ? 'bg-zinc-100 font-semibold text-zinc-950 dark:bg-[#1C2029] dark:text-white'
                              : 'text-zinc-700 hover:bg-zinc-100 dark:text-[#D1D5DB] dark:hover:bg-[#1C2029]'
                          }`}
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
                              title={
                                isBlockingGuard
                                  ? `${guardCount} alerta(s) que bloqueiam a prescrição`
                                  : `${guardCount} alerta(s) informativo(s) na conduta`
                              }
                              className={`${gapCount > 0 ? '' : 'ml-auto '}shrink-0 rounded px-1 font-mono text-[10px] font-semibold ${
                                isBlockingGuard
                                  ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              }`}
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

              {compiled.clinicalContext.weightDoses && (() => {
                const bodyLow = (activeProtocol.pep_body || '').toLowerCase();
                const allItems = compiled.clinicalContext.weightDoses.items;
                const isRelevant = (drugLabel: string) => {
                  const key = drugLabel.split('(')[0].split(' ')[0].trim().toLowerCase();
                  return key.length >= 4 && bodyLow.includes(key);
                };
                const orderedItems = [...allItems].sort((a, b) => {
                  const ra = isRelevant(a.drug) ? 0 : 1;
                  const rb = isRelevant(b.drug) ? 0 : 1;
                  return ra - rb;
                });
                return (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                      Doses ·{' '}
                      <span className="font-mono normal-case">
                        {String(compiled.clinicalContext.weightDoses.weightKg).replace('.', ',')} kg
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-[11px]">
                      {orderedItems.map((d) => {
                        const relevant = isRelevant(d.drug);
                        return (
                          <li key={d.drug} className="leading-tight">
                            <div className="flex items-center justify-between gap-1 text-zinc-600 dark:text-[#9CA3AF]">
                              <span className="truncate">{d.drug.split('(')[0].trim()}</span>
                              {relevant && (
                                <span className="shrink-0 rounded bg-teal-500/10 px-1 text-[9px] font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                                  no PEP
                                </span>
                              )}
                            </div>
                            <div
                              className={`font-mono text-[11px] font-medium ${
                                !d.allowed
                                  ? 'text-red-700 dark:text-red-400'
                                  : d.ceilingHit
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-zinc-900 dark:text-[#F3F4F6]'
                              }`}
                            >
                              {d.formattedDose.split('|')[0].trim()}
                              {d.ceilingHit && d.allowed ? ' · Teto' : ''}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

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
