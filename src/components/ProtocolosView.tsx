import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import { resolveClinicalLinksForPep } from '../data/clinical_links.ts';
import {
  compileProtocolForDisplay,
  EMPTY_PATIENT_CONTEXT,
  GLOBAL_SEARCH_INDEX,
  PEP_PROTOCOLS,
  PROTOCOL_BY_ID,
  protocolRequiresWeightCalculation,
  splitGuiaIntoSections,
  type CopyablePepBlock,
  type PatientContextInput,
} from '../data/protocolsRepo.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import { classifyGuiaSectionTheme, renderGuiaSectionBodyHtml } from '../engine/diretrizes.ts';
import { cockpitStore } from '../state/store.ts';
import { copyToClipboard } from '../utils/clipboard.ts';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

type AreaFilter = 'todos' | 'go' | 'upa' | 'enf' | 'ped' | 'favoritos';

const AREA_FILTERS: Array<{ id: AreaFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'go', label: 'GO' },
  { id: 'upa', label: 'UPA' },
  { id: 'enf', label: 'Enfermaria' },
  { id: 'ped', label: 'Pediatria' },
  { id: 'favoritos', label: 'Favoritos' },
];

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
  const [patient, setPatient] = useState<PatientContextInput>(EMPTY_PATIENT_CONTEXT);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [guiaOpen, setGuiaOpen] = useState(false);

  // Estado local de edição opcional por bloco (limpa ao trocar de protocolo ou limpar paciente)
  const [editingBlockIds, setEditingBlockIds] = useState<Record<string, boolean>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const activeProtocol = useMemo<ClinicalProtocolItem>(() => {
    if (selectedId) {
      const found = PROTOCOL_BY_ID.get(selectedId);
      if (found && found.mod_id !== 'hab') return found;
    }
    return PEP_PROTOCOLS[0];
  }, [selectedId]);

  const mainRef = useRef<HTMLElement | null>(null);

  // Auto-expandir Personalizar paciente apenas quando o protocolo exige cálculo ponderal/pediátrico
  useEffect(() => {
    const requiresWeight = protocolRequiresWeightCalculation(activeProtocol);
    setPersonalizeOpen(requiresWeight);
    setGuiaOpen(false);
    setEditingBlockIds({});
    setEditedTexts({});
    setCopiedKey(null);
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeProtocol]);

  const filteredProtocols = useMemo(() => {
    const base =
      areaFilter === 'todos'
        ? PEP_PROTOCOLS
        : areaFilter === 'favoritos'
          ? PEP_PROTOCOLS.filter((p) => favoriteSet.has(p.id))
          : PEP_PROTOCOLS.filter((p) => p.mod_id === areaFilter);

    const q = searchQuery.trim();
    if (!q) return base;
    return searchClinicalProtocols(GLOBAL_SEARCH_INDEX, base, q, base.length).map((r) => r.item);
  }, [areaFilter, favoriteSet, searchQuery]);

  const compiled = useMemo(
    () => compileProtocolForDisplay(activeProtocol, patient),
    [activeProtocol, patient]
  );

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

  const hasPatientValues = Boolean(
    patient.idade.trim() || patient.pesoKg.trim() || patient.gestante || patient.igSemanas.trim()
  );

  const isFavorite = favoriteSet.has(activeProtocol.id);

  const getBlockText = (block: CopyablePepBlock): string => {
    return editedTexts[block.id] !== undefined ? editedTexts[block.id] : block.text;
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
    const combined = compiled.blocks.map((b) => getBlockText(b)).join('\n\n');
    await handleCopyBlock('all', combined);
  };

  const handleClearPatient = () => {
    setPatient(EMPTY_PATIENT_CONTEXT);
    setEditedTexts({});
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.25rem)] w-full overflow-hidden">
      {/* COLUNA ESQUERDA: Lista de Protocolos (300px em >=1024px; 100% em <1024px quando lista ativa) */}
      <aside
        aria-label="Lista de protocolos clínicos"
        className={`${
          mobileShowDetail ? 'hidden lg:flex' : 'flex'
        } h-full w-full shrink-0 flex-col border-r border-slate-200/90 bg-slate-50/40 lg:w-[300px] dark:border-slate-800 dark:bg-[#0d141c]`}
      >
        <div className="space-y-2.5 border-b border-slate-200/80 p-3 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar protocolo, queixa ou CID..."
              aria-label="Filtrar protocolos"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-8 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 dark:border-slate-800 dark:bg-[#0b1117] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar filtro"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtros rápidos por área */}
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por área">
            {AREA_FILTERS.map((f) => {
              const active = areaFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAreaFilter(f.id)}
                  aria-pressed={active}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {f.label}
                  {f.id === 'favoritos' && favoriteIds.length > 0 ? ` (${favoriteIds.length})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contador discreto */}
        <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
          <span>
            {filteredProtocols.length}{' '}
            {filteredProtocols.length === 1 ? 'protocolo' : 'protocolos'}
          </span>
          {areaFilter !== 'todos' && (
            <button
              type="button"
              onClick={() => setAreaFilter('todos')}
              className="text-teal-700 hover:underline dark:text-teal-400"
            >
              Ver todos
            </button>
          )}
        </div>

        {/* Lista limpa */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredProtocols.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {areaFilter === 'favoritos'
                ? 'Nenhum protocolo favoritado ainda.'
                : 'Nenhum protocolo encontrado.'}
            </div>
          ) : (
            filteredProtocols.map((item) => {
              const isSelected = item.id === activeProtocol.id;
              const isFav = favoriteSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectProtocol(item.id)}
                  className={`group flex w-full items-start justify-between gap-2 border-b border-slate-100/80 px-3 py-2.5 text-left transition-colors dark:border-slate-800/50 ${
                    isSelected
                      ? 'bg-teal-50/70 text-slate-950 dark:bg-teal-950/35 dark:text-slate-50'
                      : 'text-slate-700 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[13px] leading-snug ${
                        isSelected ? 'font-semibold text-teal-900 dark:text-teal-200' : 'font-medium'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{MOD_LABELS[item.mod_id]}</span>
                      <span>·</span>
                      <span className="truncate">{item.category}</span>
                      {item.cid10 && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[10px]">{item.cid10}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isFav && (
                    <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* COLUNA DIREITA: Documento Único Editorial (max-w-3xl centrado) */}
      <main
        ref={mainRef}
        className={`${
          mobileShowDetail ? 'block' : 'hidden lg:block'
        } h-full flex-1 overflow-y-auto bg-white dark:bg-[#0b1117]`}
      >
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-7 sm:py-7">
          {/* Botão Voltar em meia tela / tablet (< 1024px) */}
          <div className="mb-3 lg:hidden">
            <button
              type="button"
              onClick={onBackToList}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Protocolos
            </button>
          </div>

          {/* Cabeçalho Editorial do Protocolo */}
          <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {MOD_LABELS[activeProtocol.mod_id]}
              </span>
              <span>·</span>
              <span>{activeProtocol.category}</span>
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
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl dark:text-slate-50">
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
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
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

              <button
                type="button"
                onClick={() => setPersonalizeOpen((v) => !v)}
                aria-expanded={personalizeOpen}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  personalizeOpen || hasPatientValues
                    ? 'border-teal-600/40 bg-teal-50/70 text-teal-800 dark:border-teal-400/40 dark:bg-teal-950/35 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-[#0b1117] dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Personalizar paciente
              </button>

              {linkedPrePorta && (
                <button
                  type="button"
                  onClick={() => onOpenPrePorta(linkedPrePorta.id)}
                  title={`Pré-Porta: ${linkedPrePorta.title.replace(/^[^\wÀ-ÿ]+/, '')}`}
                  className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-[#0b1117] dark:text-slate-300 dark:hover:bg-slate-800/70"
                >
                  <Stethoscope className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span className="truncate">
                    Pré-Porta: {linkedPrePorta.title.replace(/^[^\wÀ-ÿ]+/, '')}
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
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ponto Cego
                </button>
              </div>
            </div>

            {/* Faixa horizontal compacta: Personalização Dinâmica do Paciente */}
            {personalizeOpen && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-[#111827]">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-24">
                    <label
                      htmlFor="pt-idade"
                      className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      Idade
                    </label>
                    <input
                      id="pt-idade"
                      type="text"
                      value={patient.idade}
                      onChange={(e) => setPatient((p) => ({ ...p, idade: e.target.value }))}
                      placeholder="Ex: 5a / 8m"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                    />
                  </div>

                  <div className="w-24">
                    <label
                      htmlFor="pt-peso"
                      className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
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
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                    />
                  </div>

                  <label className="flex h-[30px] cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
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
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-700 dark:accent-teal-400"
                    />
                    Gestante
                  </label>

                  {(patient.gestante || activeProtocol.mod_id === 'go') && (
                    <div className="w-24">
                      <label
                        htmlFor="pt-ig"
                        className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                      >
                        IG (sem)
                      </label>
                      <input
                        id="pt-ig"
                        type="text"
                        inputMode="numeric"
                        value={patient.igSemanas}
                        onChange={(e) =>
                          setPatient((p) => ({
                            ...p,
                            igSemanas: e.target.value,
                            gestante: Boolean(e.target.value.trim()) || p.gestante,
                          }))
                        }
                        placeholder="Ex: 32"
                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                      />
                    </div>
                  )}

                  {hasPatientValues && (
                    <button
                      type="button"
                      onClick={handleClearPatient}
                      className="ml-auto inline-flex h-[30px] items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar
                    </button>
                  )}
                </div>

                {/* Alerta de plausibilidade clínica Idade x Peso */}
                {compiled.plausibilityAlert && (
                  <div
                    role="alert"
                    className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                      compiled.plausibilityAlert.severity === 'critical'
                        ? 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
                        : 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
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
                  <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
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
                          <span className="truncate text-slate-600 dark:text-slate-400">
                            {doseItem.drug.split('(')[0].trim()}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[11px] font-medium ${
                              !doseItem.allowed
                                ? 'text-red-700 dark:text-red-400'
                                : doseItem.ceilingHit
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
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

          {/* BLOCOS COPIÁVEIS DO PEP */}
          <div className="mt-6 space-y-6">
            {compiled.blocks.map((block) => {
              const isEditing = Boolean(editingBlockIds[block.id]);
              const isEdited = editedTexts[block.id] !== undefined && editedTexts[block.id] !== block.text;
              const currentText = getBlockText(block);
              const isCopied = copiedKey === block.id;

              return (
                <section
                  key={block.id}
                  aria-label={block.title}
                  className="rounded-lg border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#0f1620]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300">
                        {block.title}
                      </h2>
                      {isEdited && (
                        <span className="text-[11px] text-teal-700 dark:text-teal-400">
                          · Editado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isEdited && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditedTexts((prev) => {
                              const next = { ...prev };
                              delete next[block.id];
                              return next;
                            })
                          }
                          title="Restaurar texto original do protocolo"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setEditingBlockIds((prev) => ({
                            ...prev,
                            [block.id]: !prev[block.id],
                          }))
                        }
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          isEditing
                            ? 'bg-slate-200/80 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Edit3 className="h-3 w-3" />
                        {isEditing ? 'Concluir' : 'Editar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyBlock(block.id, currentText)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isCopied
                            ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-teal-600/50 hover:text-teal-800 dark:border-slate-700 dark:bg-[#0b1117] dark:text-slate-200 dark:hover:border-teal-400/50 dark:hover:text-teal-300'
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

                  <div className="p-4">
                    {isEditing ? (
                      <textarea
                        value={currentText}
                        onChange={(e) =>
                          setEditedTexts((prev) => ({
                            ...prev,
                            [block.id]: e.target.value,
                          }))
                        }
                        rows={Math.min(24, Math.max(5, currentText.split('\n').length + 1))}
                        aria-label={`Editar ${block.title}`}
                        className="w-full resize-y rounded-md border border-teal-600/40 bg-slate-50/50 p-3 font-sans text-[14px] leading-relaxed text-slate-900 outline-none focus:border-teal-600 dark:border-teal-400/40 dark:bg-[#0b1117] dark:text-slate-100 dark:focus:border-teal-400"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-[14px] leading-[1.68] text-slate-800 dark:text-slate-200">
                        {currentText}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* DIRETRIZES & FUNDAMENTAÇÃO CLÍNICA (Colapsável fechada por padrão) */}
          {guiaSections.length > 0 && (
            <section className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGuiaOpen((v) => !v)}
                aria-expanded={guiaOpen}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Diretrizes &amp; Fundamentação Clínica
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({guiaSections.length} {guiaSections.length === 1 ? 'seção' : 'seções'})
                  </span>
                </div>
                {guiaOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
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
                            ? 'rounded-lg border border-amber-200/90 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20'
                            : 'space-y-2'
                        }
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                            {cleanTitle}
                          </h3>
                          <span
                            className={`shrink-0 text-[11px] font-medium ${
                              isDanger
                                ? 'text-amber-800 dark:text-amber-300'
                                : 'text-slate-400 dark:text-slate-500'
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
