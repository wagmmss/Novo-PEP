import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../sync-worker/src/index.js';
import { CloudSyncManager, computeBackupFingerprint, normalizeSyncBaseUrl } from '../src/state/cloudSync.ts';
import { cockpitStore } from '../src/state/store.ts';
import { migrateCentral6AnoState } from '../src/engine/central6ano.ts';

function createMockKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string, opts?: { type?: 'text' | 'json' }) {
      const val = store.get(key) ?? null;
      if (val === null) return null;
      return opts?.type === 'json' ? JSON.parse(val) : val;
    },
    async put(key: string, value: string) {
      store.set(key, String(value));
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function createMockWebStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function createWorkerFetch(env: { PEP_SYNC_KV: ReturnType<typeof createMockKv>; SYNC_PASSWORD: string }): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(String(input), {
      ...init,
      headers: {
        Origin: 'https://wagmmss.github.io',
        'CF-Connecting-IP': '203.0.113.10',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    return await worker.fetch(req, env);
  }) as typeof fetch;
}

test('Cloudflare Worker: health, autenticação por senha, rate limit (429), conflito (409) e force', async () => {
  const kv = createMockKv();
  const env = { PEP_SYNC_KV: kv, SYNC_PASSWORD: 'minha-senha-simples' };
  const mockFetch = createWorkerFetch(env);

  // Healthcheck público
  const health = await mockFetch('https://sync.example.workers.dev/health');
  assert.equal(health.status, 200);

  // Senha errada -> 401
  const bad = await mockFetch('https://sync.example.workers.dev/sync', {
    headers: { Authorization: 'Bearer senha-errada' },
  });
  assert.equal(bad.status, 401);

  // GET autenticado com nuvem vazia -> exists: false
  const empty = await mockFetch('https://sync.example.workers.dev/sync', {
    headers: { Authorization: 'Bearer minha-senha-simples' },
  });
  assert.equal(empty.status, 200);
  const emptyJson = (await empty.json()) as { exists: boolean; revision: number };
  assert.equal(emptyJson.exists, false);
  assert.equal(emptyJson.revision, 0);

  // PUT inicial (rev 0 -> 1)
  const payload1 = cockpitStore.exportBackupJson();
  const put1 = await mockFetch('https://sync.example.workers.dev/sync', {
    method: 'PUT',
    headers: { Authorization: 'Bearer minha-senha-simples', 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: 0, payload: payload1 }),
  });
  assert.equal(put1.status, 200);
  const put1Json = (await put1.json()) as { revision: number };
  assert.equal(put1Json.revision, 1);

  // PUT com baseRevision desatualizada (0 != 1) -> 409 Conflict devolvendo payload remoto
  const conflict = await mockFetch('https://sync.example.workers.dev/sync', {
    method: 'PUT',
    headers: { Authorization: 'Bearer minha-senha-simples', 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: 0, payload: payload1 }),
  });
  assert.equal(conflict.status, 409);
  const conflictJson = (await conflict.json()) as { revision: number; payload: { version: number } };
  assert.equal(conflictJson.revision, 1);
  assert.equal(conflictJson.payload.version, 2);

  // PUT com force: true -> sobrescreve e avança para rev 2
  const forced = await mockFetch('https://sync.example.workers.dev/sync', {
    method: 'PUT',
    headers: { Authorization: 'Bearer minha-senha-simples', 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: 0, force: true, payload: payload1 }),
  });
  assert.equal(forced.status, 200);
  assert.equal(((await forced.json()) as { revision: number }).revision, 2);

  // Rate limit após 8 falhas seguidas -> 429
  for (let i = 0; i < 8; i++) {
    const r = await mockFetch('https://sync.example.workers.dev/sync', {
      headers: { Authorization: 'Bearer chute' },
    });
    assert.equal(r.status, 401);
  }
  const blocked = await mockFetch('https://sync.example.workers.dev/sync', {
    headers: { Authorization: 'Bearer minha-senha-simples' },
  });
  assert.equal(blocked.status, 429);
});

test('CloudSyncManager: 1º aparelho envia, 2º aparelho virgem restaura, conflito resolvido e modo PC compartilhado', async () => {
  const origLocal = (globalThis as Record<string, unknown>).localStorage;
  const origSession = (globalThis as Record<string, unknown>).sessionStorage;

  try {
    const kv = createMockKv();
    const env = { PEP_SYNC_KV: kv, SYNC_PASSWORD: 'casa-hospital-2027' };
    const mockFetch = createWorkerFetch(env);

    // ---- Aparelho 1 (PC de casa) ----
    const dev1Local = createMockWebStorage();
    const dev1Session = createMockWebStorage();
    (globalThis as Record<string, unknown>).localStorage = dev1Local;
    (globalThis as Record<string, unknown>).sessionStorage = dev1Session;
    cockpitStore.reload();
    cockpitStore.setCentral6AnoState(migrateCentral6AnoState({ rodizioId: 'cirurgia' }));
    cockpitStore.toggleFavorite('go-1');

    const mgr1 = new CloudSyncManager({ fetchImpl: mockFetch });
    const c1 = await mgr1.connect({
      url: 'https://sync.example.workers.dev/',
      password: 'casa-hospital-2027',
      rememberDevice: true,
    });
    assert.equal(c1.ok, true);
    assert.equal(mgr1.getSnapshot().status, 'synced');
    assert.equal(mgr1.getSnapshot().revision, 1);
    assert.equal(normalizeSyncBaseUrl('https://sync.example.workers.dev/sync/'), 'https://sync.example.workers.dev');

    // ---- Aparelho 2 (PC do hospital — virgem + modo sessão temporária) ----
    const dev2Local = createMockWebStorage();
    const dev2Session = createMockWebStorage();
    (globalThis as Record<string, unknown>).localStorage = dev2Local;
    (globalThis as Record<string, unknown>).sessionStorage = dev2Session;
    cockpitStore.reload();
    assert.equal(cockpitStore.getSnapshot().favoriteIds.length, 0);

    const mgr2 = new CloudSyncManager({ fetchImpl: mockFetch });
    const c2 = await mgr2.connect({
      url: 'https://sync.example.workers.dev',
      password: 'casa-hospital-2027',
      rememberDevice: false,
    });
    assert.equal(c2.ok, true);
    assert.equal(mgr2.getSnapshot().revision, 1);
    // Restaurou automaticamente os dados do Aparelho 1!
    assert.ok(cockpitStore.getSnapshot().favoriteIds.includes('go-1'));
    assert.equal(cockpitStore.getSnapshot().central6Ano.rodizioId, 'cirurgia');
    // Modo PC compartilhado: senha NÃO foi gravada no localStorage, só no sessionStorage
    assert.ok(!String(dev2Local.getItem('mq_cloud_sync_cfg_v1') || '').includes('casa-hospital-2027'));
    assert.equal(dev2Session.getItem('mq_cloud_sync_pw_session_v1'), 'casa-hospital-2027');

    // Aparelho 2 faz alteração e sobe -> rev 2
    cockpitStore.toggleFavorite('upa-1');
    const p2 = await mgr2.pushLocalChanges();
    assert.equal(p2.ok, true);
    assert.equal(mgr2.getSnapshot().revision, 2);

    // Desconectar no PC do hospital apaga a senha da sessão
    mgr2.disconnect();
    assert.equal(dev2Session.getItem('mq_cloud_sync_pw_session_v1'), null);
    assert.equal(mgr2.getSnapshot().connected, false);

    // ---- Volta ao Aparelho 1 (estava na rev 1) e faz edição local -> gera conflito real ----
    (globalThis as Record<string, unknown>).localStorage = dev1Local;
    (globalThis as Record<string, unknown>).sessionStorage = dev1Session;
    cockpitStore.reload();
    cockpitStore.toggleFavorite('ped-1');

    const pushConflict = await mgr1.pushLocalChanges();
    assert.equal(pushConflict.ok, false);
    assert.equal(mgr1.getSnapshot().status, 'conflict');
    assert.equal(mgr1.getSnapshot().conflict?.revision, 2);

    // Resolve escolhendo usar versão da nuvem -> recebe 'upa-1' e limpa conflito
    const resolved = mgr1.resolveConflictUseRemote();
    assert.equal(resolved.ok, true);
    assert.equal(mgr1.getSnapshot().status, 'synced');
    assert.equal(mgr1.getSnapshot().revision, 2);
    assert.ok(cockpitStore.getSnapshot().favoriteIds.includes('upa-1'));

    // Fingerprint ignora exportedAt
    const bA = { ...cockpitStore.exportBackupJson(), exportedAt: '2026-01-01T00:00:00.000Z' };
    const bB = { ...cockpitStore.exportBackupJson(), exportedAt: '2026-12-31T23:59:59.000Z' };
    assert.equal(computeBackupFingerprint(bA), computeBackupFingerprint(bB));
  } finally {
    (globalThis as Record<string, unknown>).localStorage = origLocal;
    (globalThis as Record<string, unknown>).sessionStorage = origSession;
  }
});
