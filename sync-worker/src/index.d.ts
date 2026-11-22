export interface SyncWorkerKv {
  get(key: string, opts?: { type?: 'text' | 'json' }): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SyncWorkerEnv {
  PEP_SYNC_KV?: SyncWorkerKv;
  SYNC_PASSWORD?: string;
  ALLOWED_ORIGINS?: string;
}

declare const worker: {
  fetch(request: Request, env: SyncWorkerEnv): Promise<Response>;
};

export default worker;
