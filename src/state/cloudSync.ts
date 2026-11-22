// ============================================================================
// MOTOR DE SINCRONIZAÇÃO NA NUVEM (OFFLINE-FIRST · SENHA ÚNICA · REVISÃO)
// Conversa com o Cloudflare Worker (sync-worker/) via GET /sync e PUT /sync.
// ============================================================================

import { cockpitStore, type BackupPayload } from './store.ts';

export type CloudSyncStatus =
  | 'disconnected'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'conflict'
  | 'error';

export interface CloudSyncConflict {
  revision: number;
  updatedAt: string | null;
  payload: BackupPayload;
}

export interface CloudSyncSnapshot {
  connected: boolean;
  status: CloudSyncStatus;
  url: string;
  defaultUrl: string;
  rememberDevice: boolean;
  revision: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  conflict: CloudSyncConflict | null;
}

interface StoredSyncConfig {
  url: string;
  password?: string;
  rememberDevice: boolean;
}

interface StoredSyncMeta {
  lastRevision: number;
  lastSyncedAt: string | null;
  lastSyncedFingerprint: string | null;
}

type SyncListener = (snapshot: CloudSyncSnapshot) => void;

const KEYS = {
  CONFIG: 'mq_cloud_sync_cfg_v1',
  SESSION_PASSWORD: 'mq_cloud_sync_pw_session_v1',
  META: 'mq_cloud_sync_meta_v1',
} as const;

const PUSH_DEBOUNCE_MS = 2500;
const VISIBILITY_PULL_MIN_INTERVAL_MS = 30_000;

const DEFAULT_FALLBACK_SYNC_URL = 'https://novo-pep-sync.moraes-wagg.workers.dev';

function readEnvDefaultSyncUrl(): string {
  try {
    const raw = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SYNC_URL;
    return normalizeSyncBaseUrl(raw || '') || DEFAULT_FALLBACK_SYNC_URL;
  } catch {
    return DEFAULT_FALLBACK_SYNC_URL;
  }
}

export function normalizeSyncBaseUrl(raw: string): string {
  const clean = String(raw || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  return clean.replace(/\/sync$/i, '');
}

export function computeBackupFingerprint(payload: BackupPayload): string {
  const { exportedAt: _ignored, ...stable } = payload;
  return JSON.stringify(stable);
}

/**
 * Detecta se o aparelho local já tem algum dado preenchido pelo usuário
 * (usado no 1º login de um aparelho novo para evitar pedir resolução de conflito à toa).
 */
export function hasMeaningfulLocalData(payload: BackupPayload): boolean {
  if (payload.favoriteIds.length > 0) return true;
  if (Object.keys(payload.habChecklists).length > 0) return true;
  const c = payload.central6AnoState;
  if ((c.logbookEntries || []).length > 0) return true;
  if (Object.values(c.procCountsById || {}).some((n) => (n || 0) > 0)) return true;
  if (Object.values(c.curriculumEntries || {}).some((e) => (e?.value || 0) > 0)) return true;
  if (Object.values(c.teoriaStatusById || {}).some((s) => s !== 'nao_iniciado')) return true;
  if (Object.values(c.ritualDomingoDoneIds || {}).some(Boolean)) return true;
  if ((c.treinoClinico?.logs || []).length > 0) return true;
  if ((c.treinoClinico?.naoPodePassar || []).length > 0) return true;
  return false;
}

function getStorage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const s = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return s || null;
  } catch {
    return null;
  }
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Falha silenciosa em ambientes sem storage
  }
}

function removeKey(storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignora
  }
}

export class CloudSyncManager {
  private snapshot: CloudSyncSnapshot;
  private password = '';
  private lastSyncedFingerprint: string | null = null;
  private listeners = new Set<SyncListener>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private applyingRemote = false;
  private lastActivityMs = 0;
  private fetchImpl: typeof fetch;
  private defaultUrl: string;

  constructor(options: { fetchImpl?: typeof fetch; defaultUrl?: string } = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.defaultUrl = normalizeSyncBaseUrl(options.defaultUrl ?? readEnvDefaultSyncUrl());
    this.snapshot = this.hydrate();
    this.bindEvents();
  }

  private hydrate(): CloudSyncSnapshot {
    const local = getStorage('local');
    const session = getStorage('session');

    const cfg = readJson<StoredSyncConfig>(local, KEYS.CONFIG);
    const meta = readJson<StoredSyncMeta>(local, KEYS.META);
    const sessionPw = session?.getItem(KEYS.SESSION_PASSWORD) || '';

    const url = normalizeSyncBaseUrl(cfg?.url || '') || this.defaultUrl;
    const rememberDevice = cfg?.rememberDevice ?? true;
    this.password = rememberDevice ? cfg?.password || sessionPw || '' : sessionPw || '';
    this.lastSyncedFingerprint = meta?.lastSyncedFingerprint ?? null;

    const connected = Boolean(url && this.password);
    return {
      connected,
      status: connected ? 'idle' : 'disconnected',
      url,
      defaultUrl: this.defaultUrl,
      rememberDevice,
      revision: Number(meta?.lastRevision) || 0,
      lastSyncedAt: meta?.lastSyncedAt || null,
      errorMessage: null,
      conflict: null,
    };
  }

  private bindEvents(): void {
    cockpitStore.subscribe(() => {
      if (this.applyingRemote) return;
      if (!this.snapshot.connected) return;
      if (this.snapshot.status === 'conflict') return;
      this.schedulePush();
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        if (this.snapshot.connected) {
          void this.syncNow();
        }
      });
      window.addEventListener('offline', () => {
        if (this.snapshot.connected) {
          this.updateSnapshot({ status: 'offline', errorMessage: 'Sem internet — salvando localmente.' });
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          this.snapshot.connected &&
          Date.now() - this.lastActivityMs >= VISIBILITY_PULL_MIN_INTERVAL_MS
        ) {
          void this.syncNow();
        }
      });
    }
  }

  public getSnapshot = (): CloudSyncSnapshot => this.snapshot;

  public subscribe = (listener: SyncListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private updateSnapshot(patch: Partial<CloudSyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private saveMeta(revision: number, syncedAt: string, fingerprint: string): void {
    this.lastSyncedFingerprint = fingerprint;
    writeJson(getStorage('local'), KEYS.META, {
      lastRevision: revision,
      lastSyncedAt: syncedAt,
      lastSyncedFingerprint: fingerprint,
    } satisfies StoredSyncMeta);
  }

  private persistCredentials(url: string, password: string, rememberDevice: boolean): void {
    const local = getStorage('local');
    const session = getStorage('session');
    if (rememberDevice) {
      writeJson(local, KEYS.CONFIG, { url, password, rememberDevice: true } satisfies StoredSyncConfig);
      removeKey(session, KEYS.SESSION_PASSWORD);
    } else {
      writeJson(local, KEYS.CONFIG, { url, rememberDevice: false } satisfies StoredSyncConfig);
      try {
        session?.setItem(KEYS.SESSION_PASSWORD, password);
      } catch {
        // Ignora
      }
    }
  }

  public reloadFromStorage(): CloudSyncSnapshot {
    this.cancelScheduledPush();
    this.snapshot = this.hydrate();
    this.emit();
    return this.snapshot;
  }

  public setFetchImpl(fn: typeof fetch): void {
    this.fetchImpl = fn;
  }

  private cancelScheduledPush(): void {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
  }

  private schedulePush(): void {
    this.cancelScheduledPush();
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.pushLocalChanges();
    }, PUSH_DEBOUNCE_MS);
  }

  private hasLocalUnsyncedChanges(localPayload: BackupPayload): boolean {
    const fp = computeBackupFingerprint(localPayload);
    if (!this.lastSyncedFingerprint) {
      return hasMeaningfulLocalData(localPayload);
    }
    return fp !== this.lastSyncedFingerprint;
  }

  private applyRemotePayload(remote: { revision: number; updatedAt: string | null; payload: BackupPayload }): void {
    this.applyingRemote = true;
    try {
      cockpitStore.importBackupJson(remote.payload as unknown as Record<string, unknown>);
      const freshLocal = cockpitStore.exportBackupJson();
      const fp = computeBackupFingerprint(freshLocal);
      const syncedAt = remote.updatedAt || new Date().toISOString();
      this.saveMeta(remote.revision, syncedAt, fp);
      this.updateSnapshot({
        status: 'synced',
        revision: remote.revision,
        lastSyncedAt: syncedAt,
        errorMessage: null,
        conflict: null,
      });
    } finally {
      this.applyingRemote = false;
    }
  }

  private async requestSync(
    method: 'GET' | 'PUT',
    body?: Record<string, unknown>
  ): Promise<{ status: number; data: Record<string, unknown> }> {
    const endpoint = `${this.snapshot.url}/sync`;
    const resp = await this.fetchImpl(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${this.password}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await resp.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { status: resp.status, data };
  }

  public async connect(input: {
    url?: string;
    password: string;
    rememberDevice: boolean;
  }): Promise<{ ok: boolean; message: string }> {
    const cleanUrl = normalizeSyncBaseUrl(input.url || this.snapshot.url || this.defaultUrl);
    const cleanPw = String(input.password || '').trim();

    if (!cleanUrl) {
      const msg = 'Informe a URL do seu Cloudflare Worker.';
      this.updateSnapshot({ status: 'error', errorMessage: msg });
      return { ok: false, message: msg };
    }
    if (!cleanPw) {
      const msg = 'Digite sua senha de sincronização.';
      this.updateSnapshot({ status: 'error', errorMessage: msg });
      return { ok: false, message: msg };
    }

    this.password = cleanPw;
    this.updateSnapshot({
      url: cleanUrl,
      rememberDevice: input.rememberDevice,
      connected: true,
      status: 'syncing',
      errorMessage: null,
      conflict: null,
    });

    const result = await this.syncNow({ persistOnSuccess: true });
    if (!result.ok && result.authFailed) {
      this.password = '';
      this.updateSnapshot({
        connected: false,
        status: 'error',
        errorMessage: result.message,
      });
      return { ok: false, message: result.message };
    }

    return { ok: result.ok, message: result.message };
  }

  public disconnect(): void {
    this.cancelScheduledPush();
    this.password = '';
    const local = getStorage('local');
    const session = getStorage('session');
    removeKey(session, KEYS.SESSION_PASSWORD);
    // Mantém apenas a URL (não é segredo) para facilitar reconexão, apagando a senha
    if (this.snapshot.url && this.snapshot.url !== this.defaultUrl) {
      writeJson(local, KEYS.CONFIG, { url: this.snapshot.url, rememberDevice: false } satisfies StoredSyncConfig);
    } else {
      removeKey(local, KEYS.CONFIG);
    }
    this.updateSnapshot({
      connected: false,
      status: 'disconnected',
      errorMessage: null,
      conflict: null,
    });
  }

  public async syncNow(
    options: { persistOnSuccess?: boolean } = {}
  ): Promise<{ ok: boolean; message: string; authFailed?: boolean }> {
    if (!this.snapshot.url || !this.password) {
      return { ok: false, message: 'Sincronização não configurada.' };
    }
    if (this.inFlight) {
      return { ok: true, message: 'Sincronização já em andamento.' };
    }

    this.inFlight = true;
    this.cancelScheduledPush();
    this.updateSnapshot({ status: 'syncing', errorMessage: null });

    try {
      const res = await this.requestSync('GET');
      this.lastActivityMs = Date.now();

      if (res.status === 401) {
        const msg = String(res.data.message || 'Senha incorreta.');
        this.updateSnapshot({ status: 'error', errorMessage: msg });
        return { ok: false, message: msg, authFailed: true };
      }
      if (res.status === 429) {
        const msg = String(res.data.message || 'Muitas tentativas. Aguarde alguns minutos.');
        this.updateSnapshot({ status: 'error', errorMessage: msg });
        return { ok: false, message: msg, authFailed: true };
      }
      if (res.status < 200 || res.status >= 300) {
        const msg = String(res.data.message || `Erro HTTP ${res.status} ao sincronizar.`);
        this.updateSnapshot({ status: 'error', errorMessage: msg });
        return { ok: false, message: msg };
      }

      if (options.persistOnSuccess) {
        this.persistCredentials(this.snapshot.url, this.password, this.snapshot.rememberDevice);
      }

      const localPayload = cockpitStore.exportBackupJson();
      const localFp = computeBackupFingerprint(localPayload);
      const localDirty = this.hasLocalUnsyncedChanges(localPayload);

      const exists = Boolean(res.data.exists && res.data.payload);
      if (!exists) {
        // Primeira vez na nuvem: envia o estado atual automaticamente
        this.inFlight = false;
        return await this.pushLocalChanges({ force: false, overrideBaseRevision: 0 });
      }

      const remoteRev = Number(res.data.revision) || 1;
      const remoteUpdatedAt = typeof res.data.updatedAt === 'string' ? res.data.updatedAt : null;
      const remotePayload = res.data.payload as BackupPayload;
      const remoteFp = computeBackupFingerprint(remotePayload);

      if (remoteFp === localFp) {
        const syncedAt = remoteUpdatedAt || new Date().toISOString();
        this.saveMeta(remoteRev, syncedAt, localFp);
        this.updateSnapshot({
          status: 'synced',
          revision: remoteRev,
          lastSyncedAt: syncedAt,
          errorMessage: null,
          conflict: null,
        });
        return { ok: true, message: 'Dados já sincronizados.' };
      }

      // Caso 1: nuvem avançou (ou é primeiro login num aparelho vazio) e não há alteração local não sincronizada
      if (!localDirty) {
        this.applyRemotePayload({ revision: remoteRev, updatedAt: remoteUpdatedAt, payload: remotePayload });
        return { ok: true, message: 'Dados restaurados da nuvem.' };
      }

      // Caso 2: mesmo número de revisão da nuvem, mas há alterações locais pendentes (ex.: editou offline)
      if (remoteRev === this.snapshot.revision) {
        this.inFlight = false;
        return await this.pushLocalChanges({ force: false, overrideBaseRevision: remoteRev });
      }

      // Caso 3: conflito real (nuvem mudou em outro aparelho E há alterações locais diferentes)
      this.updateSnapshot({
        status: 'conflict',
        errorMessage: 'Há alterações diferentes neste aparelho e na nuvem. Escolha qual versão manter.',
        conflict: {
          revision: remoteRev,
          updatedAt: remoteUpdatedAt,
          payload: remotePayload,
        },
      });
      return { ok: false, message: 'Conflito detectado — escolha qual versão manter.' };
    } catch {
      this.updateSnapshot({
        status: 'offline',
        errorMessage: 'Sem conexão com o servidor de sync. Alterações continuam salvas localmente.',
      });
      return { ok: false, message: 'Sem conexão com a nuvem (modo offline).' };
    } finally {
      this.inFlight = false;
    }
  }

  public async pushLocalChanges(
    options: { force?: boolean; overrideBaseRevision?: number } = {}
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.snapshot.connected || !this.snapshot.url || !this.password) {
      return { ok: false, message: 'Sincronização não conectada.' };
    }
    if (this.inFlight) {
      return { ok: true, message: 'Sincronização já em andamento.' };
    }

    const localPayload = cockpitStore.exportBackupJson();
    const localFp = computeBackupFingerprint(localPayload);
    if (!options.force && this.lastSyncedFingerprint && localFp === this.lastSyncedFingerprint) {
      this.updateSnapshot({ status: 'synced', errorMessage: null });
      return { ok: true, message: 'Nenhuma alteração pendente.' };
    }

    this.inFlight = true;
    this.updateSnapshot({ status: 'syncing', errorMessage: null });

    try {
      const baseRevision = options.overrideBaseRevision ?? this.snapshot.revision;
      const res = await this.requestSync('PUT', {
        baseRevision,
        force: options.force === true,
        payload: localPayload,
      });
      this.lastActivityMs = Date.now();

      if (res.status === 409 && res.data.payload) {
        this.updateSnapshot({
          status: 'conflict',
          errorMessage: 'Outro dispositivo atualizou os dados antes. Escolha qual versão manter.',
          conflict: {
            revision: Number(res.data.revision) || baseRevision + 1,
            updatedAt: typeof res.data.updatedAt === 'string' ? res.data.updatedAt : null,
            payload: res.data.payload as BackupPayload,
          },
        });
        return { ok: false, message: 'Conflito detectado ao enviar.' };
      }

      if (res.status === 401) {
        this.updateSnapshot({ status: 'error', errorMessage: 'Senha recusada pelo servidor.' });
        return { ok: false, message: 'Senha recusada pelo servidor.' };
      }

      if (res.status < 200 || res.status >= 300) {
        const msg = String(res.data.message || `Erro HTTP ${res.status} ao salvar na nuvem.`);
        this.updateSnapshot({ status: 'error', errorMessage: msg });
        return { ok: false, message: msg };
      }

      const nextRev = Number(res.data.revision) || baseRevision + 1;
      const updatedAt = typeof res.data.updatedAt === 'string' ? res.data.updatedAt : new Date().toISOString();
      this.saveMeta(nextRev, updatedAt, localFp);
      this.updateSnapshot({
        status: 'synced',
        revision: nextRev,
        lastSyncedAt: updatedAt,
        errorMessage: null,
        conflict: null,
      });
      return { ok: true, message: 'Sincronizado na nuvem.' };
    } catch {
      this.updateSnapshot({
        status: 'offline',
        errorMessage: 'Offline — alterações salvas localmente e serão enviadas ao reconectar.',
      });
      return { ok: false, message: 'Offline.' };
    } finally {
      this.inFlight = false;
    }
  }

  public resolveConflictUseRemote(): { ok: boolean; message: string } {
    const conflict = this.snapshot.conflict;
    if (!conflict) return { ok: false, message: 'Nenhum conflito ativo.' };
    this.applyRemotePayload(conflict);
    return { ok: true, message: 'Versão da nuvem aplicada neste aparelho.' };
  }

  public async resolveConflictUseLocal(): Promise<{ ok: boolean; message: string }> {
    return await this.pushLocalChanges({ force: true });
  }
}

export const cloudSync = new CloudSyncManager();
