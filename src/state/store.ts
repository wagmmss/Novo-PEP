// ============================================================================
// STORE REATIVO CENTRAL (localStorage Retrocompatível + Backup JSON)
// Preserva chaves de Tema, Favoritos, Checklists Pré-Porta e 6º Ano.
// ============================================================================

import {
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  RITUAL_DOMINGO_DATA,
  RODIZIOS_6ANO,
  getEffectiveRitualDoneMap,
  getRitualCycleKey,
  migrateCentral6AnoState,
  registerProcedureExecution,
  getLocalTodayIso,
  type Central6AnoState,
  type CurriculumEntryState,
  type MarchaId,
  type ProcedureAutonomy,
  type R1Milestone,
} from '../engine/central6ano.ts';
import { WAGNER_BASELINE_CURRICULUM_ENTRIES } from '../data/central6ano_data.ts';
import { sanitizePiiText } from '../utils/piiGuard.ts';
import { reportPersistFailure } from './appHealth.ts';
import {
  applyNppTextEdit,
  canDeleteLogEntry,
  computeVeredito,
  migrateTreinoClinicoState,
  normalizeMecanismo,
  recalculateTreinoDerivedState,
  validateLogEntry,
  validateNppAdd,
  validateNppCheck,
  weekIsoOf,
} from '../engine/treinoClinico.ts';
import type {
  FonteTipo,
  NaoPodePassarItem,
  TreinoClinicoState,
  TreinoLogEntry,
} from '../data/treino_clinico_data.ts';

export type ClinicalTheme = 'light' | 'dark';
export type LogbookRole = 'observou' | ProcedureAutonomy;
export type TeoriaModuleStatus = 'nao_iniciado' | 'estudado' | 'dominado';

const LOGBOOK_ROLE_LABELS: Record<LogbookRole, string> = {
  observou: 'Observou',
  auxiliei: 'Auxiliou',
  supervisionado: 'Supervisionado',
  autonomo: 'Autônomo',
};

function labelToProcedureAutonomy(label: string): ProcedureAutonomy | null {
  const norm = String(label || '').trim().toLowerCase();
  if (norm === 'auxiliou' || norm === 'auxiliei') return 'auxiliei';
  if (norm === 'supervisionado' || norm === 'executou com supervisão') return 'supervisionado';
  if (norm === 'autônomo' || norm === 'autonomo') return 'autonomo';
  return null;
}

export const STORAGE_KEYS = {
  CENTRAL_6ANO: 'mq_central_6ano_state_v1',
  CENTRAL_6ANO_LEGACY: 'central_6ano_v1',
  HAB_CHECKLIST_PREFIX: 'hab_checklist_v1:',
  CLINICAL_THEME: 'mq_clinical_theme_v1',
  FAVORITE_PROTOCOLS: 'mq_favorite_protocols_v1',
} as const;

export interface SharedPatientIdentity {
  nome?: string;
  idade: string;
  sexo?: string;
  pesoKg: string;
  gestante: boolean;
  igSemanas: string;
  creatinina?: string;
  clCr?: string;
  comorbidades?: string;
  alergias?: string;
  medsUso?: string;
}

export interface CockpitStoreState {
  theme: ClinicalTheme;
  favoriteIds: string[];
  habChecklists: Record<string, Record<string, boolean>>;
  central6Ano: Central6AnoState;
}

export interface BackupPayload {
  version: 2;
  exportedAt: string;
  clinicalTheme: ClinicalTheme;
  favoriteIds: string[];
  habChecklists: Record<string, Record<string, boolean>>;
  central6AnoState: Central6AnoState;
}

type StoreListener = (state: CockpitStoreState) => void;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

const memoryLocal = new Map<string, string>();

function createMemoryStorage(map: Map<string, string>): StorageLike {
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (idx) => Array.from(map.keys())[idx] ?? null,
    get length() {
      return map.size;
    },
  };
}

function getLocalStore(): StorageLike {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Fallback em ambientes restritos
  }
  return createMemoryStorage(memoryLocal);
}

function safeGetItem(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Antes era silencioso: o registro sumia sem aviso. Agora o App mostra um alerta.
    reportPersistFailure(key);
    return false;
  }
}

function safeRemoveItem(storage: StorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => typeof v === 'boolean');
}

function listHabStorageKeys(ls: StorageLike): string[] {
  const keys: string[] = [];
  const len = typeof ls.length === 'number' ? ls.length : 0;
  for (let i = 0; i < len; i++) {
    const k = ls.key ? ls.key(i) : null;
    if (k && k.startsWith(STORAGE_KEYS.HAB_CHECKLIST_PREFIX)) {
      keys.push(k);
    }
  }
  return keys;
}

function loadHabChecklistsFromLocal(ls: StorageLike): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  for (const k of listHabStorageKeys(ls)) {
    const habKey = k.slice(STORAGE_KEYS.HAB_CHECKLIST_PREFIX.length);
    try {
      const raw = safeGetItem(ls, k);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isBooleanRecord(parsed) && Object.keys(parsed).length > 0) {
        result[habKey] = { ...parsed };
      }
    } catch {
      // Ignora checklist corrompido
    }
  }
  return result;
}

function loadFavoriteIdsFromLocal(ls: StorageLike): string[] {
  try {
    const raw = safeGetItem(ls, STORAGE_KEYS.FAVORITE_PROTOCOLS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)));
  } catch {
    return [];
  }
}

function loadCentral6AnoFromLocal(ls: StorageLike): Central6AnoState {
  const rawStr =
    safeGetItem(ls, STORAGE_KEYS.CENTRAL_6ANO) ?? safeGetItem(ls, STORAGE_KEYS.CENTRAL_6ANO_LEGACY);
  if (!rawStr) return migrateCentral6AnoState({});
  try {
    const parsed: unknown = JSON.parse(rawStr);
    if (isPlainObject(parsed)) {
      return migrateCentral6AnoState(parsed as Partial<Central6AnoState>);
    }
  } catch {
    // Fallback limpo
  }
  return migrateCentral6AnoState({});
}

function isManagedLocalKey(key: string | null): boolean {
  if (!key) return true;
  if (key.startsWith(STORAGE_KEYS.HAB_CHECKLIST_PREFIX)) return true;
  return (
    key === STORAGE_KEYS.CENTRAL_6ANO ||
    key === STORAGE_KEYS.CLINICAL_THEME ||
    key === STORAGE_KEYS.FAVORITE_PROTOCOLS
  );
}

class ClinicalCockpitStore {
  private state: CockpitStoreState;
  private listeners = new Set<StoreListener>();

  constructor() {
    this.state = this.hydrateFromStorage();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (ev: StorageEvent) => {
        if (isManagedLocalKey(ev.key)) {
          this.reload();
        }
      });
    }
  }

  private hydrateFromStorage(): CockpitStoreState {
    const ls = getLocalStore();
    const rawTheme = safeGetItem(ls, STORAGE_KEYS.CLINICAL_THEME);
    const theme: ClinicalTheme = rawTheme === 'dark' ? 'dark' : 'light';
    const favoriteIds = loadFavoriteIdsFromLocal(ls);
    const habChecklists = loadHabChecklistsFromLocal(ls);
    const central6Ano = loadCentral6AnoFromLocal(ls);

    return {
      theme,
      favoriteIds,
      habChecklists,
      central6Ano,
    };
  }

  public getSnapshot = (): CockpitStoreState => {
    return this.state;
  };

  public reload(): CockpitStoreState {
    this.state = this.hydrateFromStorage();
    this.emit();
    return this.state;
  }

  public subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public setTheme(theme: ClinicalTheme): void {
    const next: ClinicalTheme = theme === 'dark' ? 'dark' : 'light';
    this.state = { ...this.state, theme: next };
    safeSetItem(getLocalStore(), STORAGE_KEYS.CLINICAL_THEME, next);
    this.emit();
  }

  public toggleTheme(): ClinicalTheme {
    const next: ClinicalTheme = this.state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  }

  public toggleFavorite(protocolId: string): boolean {
    const exists = this.state.favoriteIds.includes(protocolId);
    const next = exists
      ? this.state.favoriteIds.filter((id) => id !== protocolId)
      : [...this.state.favoriteIds, protocolId];
    this.state = { ...this.state, favoriteIds: next };
    safeSetItem(getLocalStore(), STORAGE_KEYS.FAVORITE_PROTOCOLS, JSON.stringify(next));
    this.emit();
    return !exists;
  }

  public setHabChecklist(habKey: string, checks: Record<string, boolean>): void {
    const nextChecks = { ...checks };
    this.state = {
      ...this.state,
      habChecklists: {
        ...this.state.habChecklists,
        [habKey]: nextChecks,
      },
    };
    safeSetItem(
      getLocalStore(),
      `${STORAGE_KEYS.HAB_CHECKLIST_PREFIX}${habKey}`,
      JSON.stringify(nextChecks)
    );
    this.emit();
  }

  public toggleHabChecklistItem(habKey: string, itemId: string): void {
    const current = this.state.habChecklists[habKey] || {};
    this.setHabChecklist(habKey, {
      ...current,
      [itemId]: !current[itemId],
    });
  }

  public resetHabChecklist(habKey: string): void {
    const nextMap = { ...this.state.habChecklists };
    delete nextMap[habKey];
    this.state = { ...this.state, habChecklists: nextMap };
    safeRemoveItem(getLocalStore(), `${STORAGE_KEYS.HAB_CHECKLIST_PREFIX}${habKey}`);
    this.emit();
  }

  public setCentral6AnoState(nextState: Central6AnoState): void {
    const normalized = migrateCentral6AnoState(nextState);
    this.state = { ...this.state, central6Ano: normalized };
    safeSetItem(getLocalStore(), STORAGE_KEYS.CENTRAL_6ANO, JSON.stringify(normalized));
    this.emit();
  }

  public updateCentralContext(
    patch: Partial<
      Pick<
        Central6AnoState,
        | 'rodizioId'
        | 'feriasSemana'
        | 'arquetipoId'
        | 'marchaId'
        | 'focoSemanalAncora70'
        | 'focoSemanalTrilha30'
        | 'microHabitoSemanal'
      >
    >
  ): void {
    this.setCentral6AnoState({
      ...this.state.central6Ano,
      ...patch,
    });
  }

  public selectRodizio(rodizioId: string): void {
    const target = RODIZIOS_6ANO.find((r) => r.id === rodizioId);
    if (!target) return;
    const current = this.state.central6Ano;
    const prevRod = RODIZIOS_6ANO.find((r) => r.id === current.rodizioId);
    const currentHabit = (current.microHabitoSemanal || '').trim();
    const isDefaultHabit = !currentHabit || currentHabit === prevRod?.microHabitoSugerido;

    this.setCentral6AnoState({
      ...current,
      rodizioId: target.id,
      focoSemanalAncora70: target.ancora70,
      focoSemanalTrilha30: target.trilha30,
      microHabitoSemanal: isDefaultHabit ? target.microHabitoSugerido : current.microHabitoSemanal,
    });
  }

  public setWeeklyMarcha(marchaId: MarchaId, todayIso = getLocalTodayIso()): void {
    const current = this.state.central6Ano;
    const treino = this.getTreinoState();
    const weekIso = weekIsoOf(todayIso);
    const isPesada = marchaId === '2_pesada' || marchaId === '1_sobrevivencia';

    this.setCentral6AnoState({
      ...current,
      marchaId,
      treinoClinico: {
        ...treino,
        internato: {
          ...treino.internato,
          semanaPesadaByWeek: {
            ...treino.internato.semanaPesadaByWeek,
            [weekIso]: isPesada,
          },
        },
      },
    });
  }

  public toggleRitualDomingoItem(itemId: string, todayIso = getLocalTodayIso()): void {
    const current = this.state.central6Ano;
    const cycleKey = getRitualCycleKey(todayIso);
    const prev = getEffectiveRitualDoneMap(current, todayIso);
    const nextDoneMap: Record<string, boolean> = {
      ...prev,
      [itemId]: !prev[itemId],
    };
    const allCompleted = RITUAL_DOMINGO_DATA.every((it) => Boolean(nextDoneMap[it.id]));

    this.setCentral6AnoState({
      ...current,
      ritualDomingoDoneIds: nextDoneMap,
      ritualDomingoCycleIso: cycleKey,
      ritualDomingoLastCompletedIso: allCompleted ? todayIso : current.ritualDomingoLastCompletedIso,
    });
  }

  public resetRitualDomingo(todayIso = getLocalTodayIso()): void {
    const current = this.state.central6Ano;
    this.setCentral6AnoState({
      ...current,
      ritualDomingoDoneIds: {},
      ritualDomingoCycleIso: getRitualCycleKey(todayIso),
    });
  }

  public recordMatrixProcedure(procId: string, role: LogbookRole, note = ''): string | null {
    const proc = LOGBOOK_PROCEDIMENTOS_MATRIX.find((p) => p.id === procId);
    if (!proc) return null;

    let nextCentral = this.state.central6Ano;
    if (role !== 'observou') {
      nextCentral = registerProcedureExecution(nextCentral, procId, role);
    }

    const roleLabel = LOGBOOK_ROLE_LABELS[role];
    const cleanNote = sanitizePiiText(note.trim()).sanitized;
    const entryId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id: entryId,
      dateIso: getLocalTodayIso(),
      rodizio: proc.rodizioId,
      tipo: 'procedimento' as const,
      titulo: proc.nome,
      papel: roleLabel,
      aprendizado: cleanNote,
      status: 'resolvido' as const,
      gatilhoCorrecao: procId,
    };

    this.setCentral6AnoState({
      ...nextCentral,
      logbookEntries: [entry, ...(nextCentral.logbookEntries || [])],
    });
    return entryId;
  }

  public updateLogbookEntryNote(entryId: string, note: string): { sanitizedCount: number } {
    const current = this.state.central6Ano;
    const res = sanitizePiiText(note.trim());
    const nextEntries = (current.logbookEntries || []).map((entry) =>
      entry.id === entryId ? { ...entry, aprendizado: res.sanitized } : entry
    );
    this.setCentral6AnoState({
      ...current,
      logbookEntries: nextEntries,
    });
    return { sanitizedCount: res.replacedCount };
  }

  public deleteLogbookEntry(
    entryId: string
  ): { entry: NonNullable<Central6AnoState['logbookEntries']>[number]; index: number } | null {
    const current = this.state.central6Ano;
    const entries = current.logbookEntries || [];
    const index = entries.findIndex((e) => e.id === entryId);
    if (index === -1) return null;
    const target = entries[index];

    const nextEntries = entries.filter((e) => e.id !== entryId);
    let nextProcCounts = current.procCountsById ? { ...current.procCountsById } : {};
    let nextProcAuto = current.procAutonomyById ? { ...current.procAutonomyById } : {};

    if (target.tipo === 'procedimento' && target.gatilhoCorrecao) {
      const procId = target.gatilhoCorrecao;
      const roleKey = labelToProcedureAutonomy(target.papel);
      if (roleKey) {
        const curAuto = nextProcAuto[procId] || { auxiliei: 0, supervisionado: 0, autonomo: 0 };
        const updatedAuto = {
          ...curAuto,
          [roleKey]: Math.max(0, (curAuto[roleKey] || 0) - 1),
        };
        nextProcAuto = {
          ...nextProcAuto,
          [procId]: updatedAuto,
        };
        if (roleKey === 'supervisionado' || roleKey === 'autonomo') {
          nextProcCounts = {
            ...nextProcCounts,
            [procId]: Math.max(0, updatedAuto.supervisionado + updatedAuto.autonomo),
          };
        }
      }
    }

    this.setCentral6AnoState({
      ...current,
      procCountsById: nextProcCounts,
      procAutonomyById: nextProcAuto,
      logbookEntries: nextEntries,
    });
    return { entry: target, index };
  }

  public restoreLogbookEntry(
    entry: NonNullable<Central6AnoState['logbookEntries']>[number],
    index = 0
  ): void {
    const current = this.state.central6Ano;
    const existing = current.logbookEntries || [];
    if (existing.some((e) => e.id === entry.id)) return;

    let nextCentral = current;
    if (entry.tipo === 'procedimento' && entry.gatilhoCorrecao) {
      const roleKey = labelToProcedureAutonomy(entry.papel);
      if (roleKey) {
        nextCentral = registerProcedureExecution(nextCentral, entry.gatilhoCorrecao, roleKey);
      }
    }

    const safeIndex = Math.max(0, Math.min(index, existing.length));
    const nextEntries = [
      ...existing.slice(0, safeIndex),
      entry,
      ...existing.slice(safeIndex),
    ];

    this.setCentral6AnoState({
      ...nextCentral,
      logbookEntries: nextEntries,
    });
  }

  public addQuickLogbookEntry(input: {
    titulo: string;
    rodizio: string;
    aprendizado: string;
    autonomy?: LogbookRole;
    procId?: string;
  }): void {
    const cleanTitle = sanitizePiiText(input.titulo.trim()).sanitized;
    if (!cleanTitle) return;

    let nextCentral = this.state.central6Ano;
    if (input.procId && input.autonomy && input.autonomy !== 'observou') {
      nextCentral = registerProcedureExecution(nextCentral, input.procId, input.autonomy);
    }

    const autonomyLabel = input.autonomy ? LOGBOOK_ROLE_LABELS[input.autonomy] : '';
    const cleanNote = sanitizePiiText(input.aprendizado.trim()).sanitized;

    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dateIso: getLocalTodayIso(),
      rodizio: input.rodizio || nextCentral.rodizioId,
      tipo: 'procedimento' as const,
      titulo: cleanTitle,
      papel: autonomyLabel || 'Executado',
      aprendizado: cleanNote,
      status: 'resolvido' as const,
      gatilhoCorrecao: input.procId,
    };

    this.setCentral6AnoState({
      ...nextCentral,
      logbookEntries: [entry, ...(nextCentral.logbookEntries || [])],
    });
  }

  public addBlindSpotEntry(input: {
    titulo: string;
    rodizio: string;
    duvida: string;
    acaoRevisao?: string;
  }): { sanitizedCount: number } {
    const titleRes = sanitizePiiText(input.titulo.trim());
    const duvidaRes = sanitizePiiText(input.duvida.trim());
    const acaoRes = sanitizePiiText((input.acaoRevisao || '').trim());

    if (!titleRes.sanitized) return { sanitizedCount: 0 };

    const current = this.state.central6Ano;
    const entry = {
      id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dateIso: getLocalTodayIso(),
      rodizio: input.rodizio || current.rodizioId,
      tipo: 'ponto_cego' as const,
      titulo: titleRes.sanitized,
      papel: 'Ponto Cego',
      aprendizado: duvidaRes.sanitized,
      status: 'em_treino' as const,
      gatilhoCorrecao: acaoRes.sanitized || undefined,
    };

    this.setCentral6AnoState({
      ...current,
      logbookEntries: [entry, ...(current.logbookEntries || [])],
    });

    return {
      sanitizedCount: titleRes.replacedCount + duvidaRes.replacedCount + acaoRes.replacedCount,
    };
  }

  public updateBlindSpotEntry(
    entryId: string,
    updates: {
      titulo: string;
      rodizio: string;
      duvida: string;
      acaoRevisao?: string;
    }
  ): { sanitizedCount: number } {
    const titleRes = sanitizePiiText(updates.titulo.trim());
    const duvidaRes = sanitizePiiText(updates.duvida.trim());
    const acaoRes = sanitizePiiText((updates.acaoRevisao || '').trim());
    if (!titleRes.sanitized) return { sanitizedCount: 0 };

    const current = this.state.central6Ano;
    const nextEntries = (current.logbookEntries || []).map((entry) => {
      if (entry.id !== entryId || entry.tipo !== 'ponto_cego') return entry;
      return {
        ...entry,
        titulo: titleRes.sanitized,
        rodizio: updates.rodizio || entry.rodizio,
        aprendizado: duvidaRes.sanitized,
        gatilhoCorrecao: acaoRes.sanitized || undefined,
      };
    });

    this.setCentral6AnoState({
      ...current,
      logbookEntries: nextEntries,
    });

    return {
      sanitizedCount: titleRes.replacedCount + duvidaRes.replacedCount + acaoRes.replacedCount,
    };
  }

  public addQuickBlindSpotEntry(input: {
    titulo: string;
    rodizio: string;
    aprendizado: string;
    acaoRevisao?: string;
  }): { sanitizedCount: number } {
    return this.addBlindSpotEntry({
      titulo: input.titulo,
      rodizio: input.rodizio,
      duvida: input.aprendizado,
      acaoRevisao: input.acaoRevisao,
    });
  }

  public toggleBlindSpotStatus(entryId: string): void {
    const current = this.state.central6Ano;
    const nextEntries = (current.logbookEntries || []).map((entry) => {
      if (entry.id !== entryId || entry.tipo !== 'ponto_cego') return entry;
      const nextStatus: 'em_treino' | 'resolvido' =
        entry.status === 'resolvido' ? 'em_treino' : 'resolvido';
      return { ...entry, status: nextStatus };
    });

    this.setCentral6AnoState({
      ...current,
      logbookEntries: nextEntries,
    });
  }

  public setTeoriaModuleStatus(modId: string, status: TeoriaModuleStatus): void {
    const current = this.state.central6Ano;
    this.setCentral6AnoState({
      ...current,
      teoriaStatusById: {
        ...(current.teoriaStatusById || {}),
        [modId]: status,
      },
    });
  }

  public toggleTeoriaExerciseDone(exerciseKey: string): boolean {
    const current = this.state.central6Ano;
    const prev = current.teoriaExercisesDone || {};
    const nextVal = !prev[exerciseKey];
    this.setCentral6AnoState({
      ...current,
      teoriaExercisesDone: {
        ...prev,
        [exerciseKey]: nextVal,
      },
    });
    return nextVal;
  }

  public addR1Milestone(input: Omit<R1Milestone, 'id'>): R1Milestone | null {
    const cleanTitle = input.titulo.trim();
    if (!cleanTitle || !input.dateIso) return null;

    const current = this.state.central6Ano;
    const created: R1Milestone = {
      id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      titulo: cleanTitle,
      dateIso: input.dateIso,
      categoria: input.categoria,
      nota: input.nota?.trim() || undefined,
    };

    this.setCentral6AnoState({
      ...current,
      r1Milestones: [...(current.r1Milestones || []), created],
    });
    return created;
  }

  public updateR1Milestone(id: string, patch: Partial<Omit<R1Milestone, 'id'>>): void {
    const current = this.state.central6Ano;
    const nextMilestones = (current.r1Milestones || []).map((ms) => {
      if (ms.id !== id) return ms;
      return {
        ...ms,
        ...patch,
        titulo: patch.titulo !== undefined ? patch.titulo.trim() : ms.titulo,
        nota: patch.nota !== undefined ? patch.nota.trim() || undefined : ms.nota,
      };
    });

    this.setCentral6AnoState({
      ...current,
      r1Milestones: nextMilestones,
    });
  }

  public deleteR1Milestone(id: string): void {
    const current = this.state.central6Ano;
    const nextMilestones = (current.r1Milestones || []).filter((ms) => ms.id !== id);
    this.setCentral6AnoState({
      ...current,
      r1Milestones: nextMilestones,
    });
  }

  public setR1SubTab(tab: 'plano' | 'r1'): void {
    this.setCentral6AnoState({
      ...this.state.central6Ano,
      r1SubTab: tab === 'r1' ? 'r1' : 'plano',
    });
  }

  public setCurriculumEnamedConcept(concept: 3 | 4 | 5): void {
    this.setCentral6AnoState({
      ...this.state.central6Ano,
      curriculumEnamedConcept: concept,
    });
  }

  public updateCurriculumEntry(itemId: string, patch: Partial<CurriculumEntryState>): void {
    const current = this.state.central6Ano;
    const existing = current.curriculumEntries?.[itemId] || {
      value: 0,
      proofStatus: 'falta' as const,
    };
    const nextValue =
      patch.value !== undefined && Number.isFinite(patch.value)
        ? Math.max(0, patch.value)
        : existing.value;

    const nextNotes =
      patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes;

    const nextEntry: CurriculumEntryState = {
      ...existing,
      ...patch,
      value: nextValue,
      notes: nextNotes,
    };

    this.setCentral6AnoState({
      ...current,
      curriculumEntries: {
        ...(current.curriculumEntries || {}),
        [itemId]: nextEntry,
      },
    });
  }

  public applyBaselineCurriculumInventory(mode: 'merge' | 'replace' = 'merge'): { updatedCount: number } {
    const current = this.state.central6Ano;
    const prev = current.curriculumEntries || {};
    const next: Record<string, CurriculumEntryState> = mode === 'replace' ? {} : { ...prev };
    let updatedCount = 0;

    for (const [itemId, base] of Object.entries(WAGNER_BASELINE_CURRICULUM_ENTRIES)) {
      const existing = prev[itemId];
      if (mode === 'replace' || !existing || (Number(existing.value) || 0) <= 0) {
        next[itemId] = { ...base };
        updatedCount += 1;
      } else {
        const mergedValue = Math.max(Number(existing.value) || 0, base.value);
        const mergedStatus =
          existing.proofStatus === 'pdf_pronto'
            ? 'pdf_pronto'
            : base.proofStatus === 'pdf_pronto'
              ? 'pdf_pronto'
              : existing.proofStatus || base.proofStatus;
        const mergedNotes = existing.notes?.trim() ? existing.notes : base.notes;
        if (
          mergedValue !== existing.value ||
          mergedStatus !== existing.proofStatus ||
          mergedNotes !== existing.notes
        ) {
          next[itemId] = {
            value: mergedValue,
            proofStatus: mergedStatus,
            notes: mergedNotes,
          };
          updatedCount += 1;
        }
      }
    }

    this.setCentral6AnoState({
      ...current,
      curriculumEntries: next,
    });
    return { updatedCount };
  }

  // ---- Ações da Esteira Contínua de Treino Clínico v3.1 ----
  private getTreinoState(): TreinoClinicoState {
    return migrateTreinoClinicoState(this.state.central6Ano.treinoClinico);
  }

  private setTreinoState(next: TreinoClinicoState): void {
    this.setCentral6AnoState({
      ...this.state.central6Ano,
      treinoClinico: next,
    });
  }

  public addTreinoLogEntry(
    input: Omit<TreinoLogEntry, 'id' | 'criadoEm' | 'veredito'>
  ): { ok: true; entry: TreinoLogEntry; warnings: string[] } | { ok: false; error: string } {
    const treino = this.getTreinoState();
    const cleanPemc =
      input.pemc.kind === 'omissao'
        ? { kind: 'omissao' as const, texto: sanitizePiiText(input.pemc.texto).sanitized.trim().slice(0, 160) }
        : input.pemc;
    const cleanScore =
      input.score.kind === 'rubrica'
        ? { ...input.score, ajuste: sanitizePiiText(input.score.ajuste).sanitized.trim().slice(0, 120) }
        : input.score.kind === 'muletas'
          ? { ...input.score, ajuste: sanitizePiiText(input.score.ajuste).sanitized.trim().slice(0, 120) }
          : input.score;

    const entry: TreinoLogEntry = {
      ...input,
      id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      criadoEm: new Date().toISOString(),
      mecanismo: input.mecanismo ? normalizeMecanismo(input.mecanismo) : null,
      pemc: cleanPemc,
      score: cleanScore,
      veredito: 'NA',
    };
    entry.veredito = computeVeredito(entry);

    const validation = validateLogEntry(entry, treino.logs);
    if (!validation.ok) {
      return { ok: false, error: validation.errorMessage || 'Entrada de LOG inválida.' };
    }

    const nextLogs = [...treino.logs, entry];
    const nextState = recalculateTreinoDerivedState({ ...treino, logs: nextLogs }, entry.dateIso);

    this.setTreinoState(nextState);
    return { ok: true, entry, warnings: validation.warnings };
  }

  public deleteTreinoLogEntry(
    logId: string
  ): { ok: true; deleted: TreinoLogEntry; index: number } | { ok: false; error: string } {
    const treino = this.getTreinoState();
    const check = canDeleteLogEntry(logId, treino.naoPodePassar);
    if (!check.ok) {
      return { ok: false, error: check.errorMessage || 'Linha referenciada por Não Pode Passar.' };
    }
    const index = treino.logs.findIndex((l) => l.id === logId);
    if (index === -1) {
      return { ok: false, error: 'Entrada de LOG não encontrada.' };
    }
    const deleted = treino.logs[index];
    const remaining = treino.logs.filter((l) => l.id !== logId);
    const nextState = recalculateTreinoDerivedState({ ...treino, logs: remaining }, deleted.dateIso);
    this.setTreinoState(nextState);
    return { ok: true, deleted, index };
  }

  public restoreTreinoLogEntry(entry: TreinoLogEntry, index?: number): void {
    const treino = this.getTreinoState();
    if (treino.logs.some((l) => l.id === entry.id)) return;
    const nextLogs = [...treino.logs];
    if (typeof index === 'number' && index >= 0 && index <= nextLogs.length) {
      nextLogs.splice(index, 0, entry);
    } else {
      nextLogs.push(entry);
    }
    const nextState = recalculateTreinoDerivedState({ ...treino, logs: nextLogs }, entry.dateIso);
    this.setTreinoState(nextState);
  }

  public addTreinoNppItems(
    items: Array<{ slug: string; texto: string; origemLogId: string }>
  ): { ok: true } | { ok: false; error: string } {
    const treino = this.getTreinoState();
    const sanitized = items
      .map((it) => ({
        ...it,
        texto: sanitizePiiText(it.texto).sanitized.replace(/\r?\n/g, ' ').trim().slice(0, 200),
      }))
      .filter((it) => it.texto.length > 0);
    const val = validateNppAdd(sanitized, treino.naoPodePassar, treino.logs);
    if (!val.ok) return { ok: false, error: val.errorMessage };

    const now = new Date().toISOString();
    const novos: NaoPodePassarItem[] = sanitized.map((it, idx) => ({
      id: `npp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      slug: it.slug,
      texto: it.texto,
      checado: false,
      origemLogId: it.origemLogId,
      criadoEm: now,
    }));
    this.setTreinoState({
      ...treino,
      naoPodePassar: [...treino.naoPodePassar, ...novos],
    });
    return { ok: true };
  }

  public updateTreinoNppText(id: string, newText: string): void {
    const treino = this.getTreinoState();
    this.setTreinoState({
      ...treino,
      naoPodePassar: treino.naoPodePassar.map((it) =>
        it.id === id ? applyNppTextEdit(it, newText) : it
      ),
    });
  }

  public checkTreinoNppItem(
    id: string,
    fonteTipo: FonteTipo,
    fontePrimaria: string,
    checadoEm: string
  ): { ok: true; sanitizedCount: number } | { ok: false; error: string } {
    const piiRes = sanitizePiiText(fontePrimaria);
    const cleanFonte = piiRes.sanitized.replace(/\r?\n/g, ' ').trim();
    const val = validateNppCheck({ fonteTipo, fontePrimaria: cleanFonte, checadoEm });
    if (!val.ok) return { ok: false, error: val.errorMessage };

    const treino = this.getTreinoState();
    this.setTreinoState({
      ...treino,
      naoPodePassar: treino.naoPodePassar.map((it) =>
        it.id === id
          ? {
              ...it,
              checado: true,
              fonteTipo,
              fontePrimaria: cleanFonte,
              checadoEm,
            }
          : it
      ),
    });
    return { ok: true, sanitizedCount: piiRes.replacedCount };
  }

  public uncheckTreinoNppItem(id: string): void {
    const treino = this.getTreinoState();
    this.setTreinoState({
      ...treino,
      naoPodePassar: treino.naoPodePassar.map((it) =>
        it.id === id
          ? { ...it, checado: false, fonteTipo: undefined, fontePrimaria: undefined, checadoEm: undefined }
          : it
      ),
    });
  }

  public deleteTreinoNppItem(id: string): { item: NaoPodePassarItem; index: number } | null {
    const treino = this.getTreinoState();
    const index = treino.naoPodePassar.findIndex((it) => it.id === id);
    if (index === -1) return null;
    const item = treino.naoPodePassar[index];
    this.setTreinoState({
      ...treino,
      naoPodePassar: treino.naoPodePassar.filter((it) => it.id !== id),
    });
    return { item, index };
  }

  public restoreTreinoNppItem(item: NaoPodePassarItem, index?: number): void {
    const treino = this.getTreinoState();
    if (treino.naoPodePassar.some((it) => it.id === item.id)) return;
    const next = [...treino.naoPodePassar];
    if (typeof index === 'number' && index >= 0 && index <= next.length) {
      next.splice(index, 0, item);
    } else {
      next.push(item);
    }
    this.setTreinoState({
      ...treino,
      naoPodePassar: next,
    });
  }

  public markTreinoVisualDone(slug: string, dateIso: string): void {
    const treino = this.getTreinoState();
    this.setTreinoState({
      ...treino,
      visual: { ...treino.visual, [slug]: { feitoEm: dateIso } },
    });
  }

  public markTreinoPilotoAuditado(dateIso: string): void {
    const treino = this.getTreinoState();
    this.setTreinoState({
      ...treino,
      piloto: { ...treino.piloto, auditoriaEm: dateIso },
    });
  }

  public toggleTreinoRitualEf(weekIso: string): void {
    const treino = this.getTreinoState();
    const prev = Boolean(treino.rituais[weekIso]?.efFamiliar);
    this.setTreinoState({
      ...treino,
      rituais: { ...treino.rituais, [weekIso]: { efFamiliar: !prev } },
    });
  }

  public setTreinoInternatoFlag(
    mapKey: keyof TreinoClinicoState['internato'],
    key: string,
    value: boolean
  ): void {
    const current = this.state.central6Ano;
    const treino = this.getTreinoState();
    const nextTreino: TreinoClinicoState = {
      ...treino,
      internato: {
        ...treino.internato,
        [mapKey]: { ...treino.internato[mapKey], [key]: value },
      },
    };

    let nextMarchaId = current.marchaId;
    if (mapKey === 'semanaPesadaByWeek') {
      if (value && (current.marchaId === '3_normal' || current.marchaId === '4_sprint')) {
        nextMarchaId = '2_pesada';
      } else if (!value && (current.marchaId === '2_pesada' || current.marchaId === '1_sobrevivencia')) {
        nextMarchaId = '3_normal';
      }
    }

    this.setCentral6AnoState({
      ...current,
      marchaId: nextMarchaId,
      treinoClinico: nextTreino,
    });
  }

  public exportBackupJson(): BackupPayload {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      clinicalTheme: this.state.theme,
      favoriteIds: [...this.state.favoriteIds],
      habChecklists: JSON.parse(JSON.stringify(this.state.habChecklists)) as Record<
        string,
        Record<string, boolean>
      >,
      central6AnoState: JSON.parse(JSON.stringify(this.state.central6Ano)) as Central6AnoState,
    };
  }

  public importBackupJson(rawInput: string | Record<string, unknown>): BackupPayload {
    let parsed: unknown;
    if (typeof rawInput === 'string') {
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        throw new Error('JSON malformado: verifique a integridade do arquivo selecionado.');
      }
    } else {
      parsed = rawInput;
    }

    if (!isPlainObject(parsed) || parsed.version !== 2) {
      throw new Error('Formato não reconhecido: selecione um arquivo de Backup v2 JSON válido.');
    }

    const centralState =
      parsed.central6AnoState === null || parsed.central6AnoState === undefined
        ? migrateCentral6AnoState({})
        : isPlainObject(parsed.central6AnoState)
          ? migrateCentral6AnoState(parsed.central6AnoState as Partial<Central6AnoState>)
          : (() => {
              throw new Error('Campo central6AnoState inválido no backup.');
            })();

    const habChecklists: Record<string, Record<string, boolean>> = {};
    if (parsed.habChecklists !== undefined) {
      if (!isPlainObject(parsed.habChecklists)) {
        throw new Error('Campo habChecklists inválido no backup.');
      }
      for (const [habKey, checks] of Object.entries(parsed.habChecklists)) {
        if (!isBooleanRecord(checks)) {
          throw new Error(`Checklist "${habKey}" com formato inválido.`);
        }
        habChecklists[habKey] = { ...checks };
      }
    }

    const favoriteIds: string[] = Array.isArray(parsed.favoriteIds)
      ? Array.from(
          new Set(parsed.favoriteIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))
        )
      : [...this.state.favoriteIds];

    const clinicalTheme: ClinicalTheme =
      parsed.clinicalTheme === 'dark' || parsed.clinicalTheme === 'light'
        ? parsed.clinicalTheme
        : this.state.theme;

    const ls = getLocalStore();
    const existingHabKeys = listHabStorageKeys(ls);
    const snapshotKeys = [
      STORAGE_KEYS.CENTRAL_6ANO,
      STORAGE_KEYS.CLINICAL_THEME,
      STORAGE_KEYS.FAVORITE_PROTOCOLS,
      ...existingHabKeys,
    ];
    const previousSnapshot = new Map<string, string | null>();
    for (const k of snapshotKeys) {
      previousSnapshot.set(k, safeGetItem(ls, k));
    }

    const rollback = () => {
      for (const k of listHabStorageKeys(ls)) {
        safeRemoveItem(ls, k);
      }
      for (const [k, v] of previousSnapshot.entries()) {
        if (v === null) safeRemoveItem(ls, k);
        else safeSetItem(ls, k, v);
      }
    };

    try {
      for (const oldKey of existingHabKeys) {
        safeRemoveItem(ls, oldKey);
      }
      if (!safeSetItem(ls, STORAGE_KEYS.CENTRAL_6ANO, JSON.stringify(centralState))) {
        throw new Error('Espaço insuficiente no navegador para gravar o estado do 6º Ano.');
      }
      for (const [habKey, checks] of Object.entries(habChecklists)) {
        if (!safeSetItem(ls, `${STORAGE_KEYS.HAB_CHECKLIST_PREFIX}${habKey}`, JSON.stringify(checks))) {
          throw new Error('Espaço insuficiente no navegador para gravar checklists.');
        }
      }
      if (!safeSetItem(ls, STORAGE_KEYS.FAVORITE_PROTOCOLS, JSON.stringify(favoriteIds))) {
        throw new Error('Espaço insuficiente no navegador para gravar favoritos.');
      }
      if (!safeSetItem(ls, STORAGE_KEYS.CLINICAL_THEME, clinicalTheme)) {
        throw new Error('Espaço insuficiente no navegador para gravar tema.');
      }
    } catch (err) {
      rollback();
      throw err;
    }

    this.reload();

    return {
      version: 2,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
      clinicalTheme,
      favoriteIds,
      habChecklists,
      central6AnoState: centralState,
    };
  }
}

export const cockpitStore = new ClinicalCockpitStore();
