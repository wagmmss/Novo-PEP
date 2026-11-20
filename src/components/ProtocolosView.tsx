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
  applyPatientContextToAstState,
  compileProtocolForDisplay,
  EMPTY_PATIENT_CONTEXT,
  GLOBAL_SEARCH_INDEX,
  PEP_PROTOCOLS,
  PROTOCOL_BY_ID,
  serializeProtocolSection,
  splitGuiaIntoSections,
  walkInlineNodes,
  type PatientContextInput,
  type PepAstSection,
  type PepSectionId,
} from '../data/protocolsRepo.ts';
import type { AstSelectionState, ChoiceGroupNode, InlineInputNode } from '../engine/pepAst.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
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
  const prevProtocolIdRef = useRef<string>(activeProtocol.id);
  const mainRef = useRef<HTMLElement | null>(null);

  // Reinicia AST limpa ao trocar de protocolo; limpa peso/idade automaticamente ao sair para protocolo sem cálculo ponderal
  useEffect(() => {
    if (prevProtocolIdRef.current !== activeProtocol.id) {
      prevProtocolIdRef.current = activeProtocol.id;
      if (!compiled.needsWeightPersonalization && (patient.idade.trim() || patient.pesoKg.trim() || patient.gestante || patient.igSemanas.trim())) {
        setPatient(EMPTY_PATIENT_CONTEXT);
      }
      setGuiaOpen(false);
      setEditingBlockIds({});
      setEditedTexts({});
      setEditedBaseTexts({});
      setCopiedKey(null);
      setAstState(compiled.initialAstState);
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

  const hasPatientValues = Boolean(patient.idade.trim() || patient.pesoKg.trim());

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

  const handleCopyBlock = async (key: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } else {
      onNotify('Não foi possível copiar automaticamente.');
    }
  };

  const handleCopyAll = async () => {
    const combined = compiled.sections
      .map((sec) => getBlockText(sec))
      .filter((t) => t.trim().length > 0)
      .join('\n\n');
    await handleCopyBlock('all', combined);
  };

  const handleClearPatient = () => {
    setPatient(EMPTY_PATIENT_CONTEXT);
    setEditedTexts({});
    setEditedBaseTexts({});
    setEditingBlockIds({});
    const fresh = compileProtocolForDisplay(activeProtocol, EMPTY_PATIENT_CONTEXT);
    setAstState(fresh.initialAstState);
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
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar protocolo, queixa ou CID..."
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
        <div className="flex-1 overflow-y-auto">
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
        className={`${
          mobileShowDetail ? 'block' : 'hidden lg:block'
        } h-full flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]`}
      >
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-7">
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
                onClick={handleCopyAll}
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
                className="mt-3 flex flex-wrap items-center gap-1.5"
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

            {/* Faixa contextual: exibida exclusivamente em protocolos com cálculo de dose por peso */}
            {compiled.needsWeightPersonalization && (
              <div className="mt-4 rounded-lg border border-zinc-200/80 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#15181F]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                    Doses por peso
                  </span>

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
                        onClick={() => handleCopyBlock(section.id, currentText)}
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
      </main>
    </div>
  );
}
