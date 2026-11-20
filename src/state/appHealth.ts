// ============================================================================
// SAÚDE DO APP: atualização do PWA, armazenamento persistente e falhas de gravação
// Pub/sub mínimo, sem dependências, para o App exibir avisos.
// ============================================================================

export type AppHealthEvent =
  | { kind: 'update-available'; apply: () => void }
  | { kind: 'offline-ready' }
  | { kind: 'persist-failed'; key: string };

type Listener = (event: AppHealthEvent) => void;

const listeners = new Set<Listener>();
let pendingUpdate: AppHealthEvent | null = null;
let lastPersistFailureAt = 0;

export function subscribeAppHealth(listener: Listener): () => void {
  listeners.add(listener);
  // Atualização detectada antes do App montar não se perde
  if (pendingUpdate) listener(pendingUpdate);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAppHealth(event: AppHealthEvent): void {
  if (event.kind === 'update-available') pendingUpdate = event;
  for (const l of listeners) l(event);
}

/** Chamado pelo store quando localStorage recusa uma gravação (cota cheia, modo privado, bloqueio). */
export function reportPersistFailure(key: string): void {
  const now = Date.now();
  if (now - lastPersistFailureAt < 10_000) return; // evita enxurrada de avisos
  lastPersistFailureAt = now;
  emitAppHealth({ kind: 'persist-failed', key });
}

/** Pede ao navegador que não descarte os dados locais (Logbook, checklists) sob pressão de espaço. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
