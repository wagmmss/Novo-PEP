import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Download,
  LogOut,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { cockpitStore } from '../state/store.ts';
import { cloudSync } from '../state/cloudSync.ts';
import { useCloudSync } from '../hooks/useCloudSync.ts';
import { getLocalTodayIso } from '../engine/central6ano.ts';

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupModal({ open, onClose }: BackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sync = useCloudSync();

  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [urlInput, setUrlInput] = useState<string>(sync.url || sync.defaultUrl || '');
  const [showUrlField, setShowUrlField] = useState<boolean>(!(sync.url || sync.defaultUrl));
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [rememberDevice, setRememberDevice] = useState<boolean>(sync.rememberDevice);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      setPasswordInput('');
      return;
    }
    const existingUrl = sync.url || sync.defaultUrl || '';
    setUrlInput(existingUrl);
    setShowUrlField(!existingUrl);
    setRememberDevice(sync.rememberDevice);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, sync.url, sync.defaultUrl, sync.rememberDevice]);

  if (!open) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const res = await cloudSync.connect({
      url: urlInput,
      password: passwordInput,
      rememberDevice,
    });
    setBusy(false);
    if (res.ok) {
      setPasswordInput('');
      setFeedback({ kind: 'success', text: res.message });
    } else {
      setFeedback({ kind: 'error', text: res.message });
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setFeedback(null);
    const res = await cloudSync.syncNow();
    setBusy(false);
    setFeedback({ kind: res.ok ? 'success' : 'error', text: res.message });
  };

  const handleUseRemote = () => {
    const res = cloudSync.resolveConflictUseRemote();
    setFeedback({ kind: res.ok ? 'success' : 'error', text: res.message });
  };

  const handleUseLocal = async () => {
    setBusy(true);
    const res = await cloudSync.resolveConflictUseLocal();
    setBusy(false);
    setFeedback({ kind: res.ok ? 'success' : 'error', text: res.message });
  };

  const handleDisconnect = () => {
    cloudSync.disconnect();
    setPasswordInput('');
    setFeedback({
      kind: 'success',
      text: 'Sessão encerrada neste navegador. Seus dados locais foram mantidos.',
    });
  };

  const handleExport = () => {
    try {
      const payload = cockpitStore.exportBackupJson();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `protocolos-clinicos-backup-${getLocalTodayIso()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({
        kind: 'success',
        text: 'Backup JSON exportado com sucesso.',
      });
    } catch {
      setFeedback({
        kind: 'error',
        text: 'Não foi possível gerar o arquivo de backup.',
      });
    }
  };

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const imported = cockpitStore.importBackupJson(content);
      const logCount = imported.central6AnoState.logbookEntries?.length || 0;
      const favCount = imported.favoriteIds.length;
      const chkCount = Object.keys(imported.habChecklists).length;
      const currCount = Object.values(imported.central6AnoState.curriculumEntries || {}).filter(
        (e) => (e?.value || 0) > 0
      ).length;
      setFeedback({
        kind: 'success',
        text: `Backup restaurado: ${favCount} favoritos, ${chkCount} checklists, ${logCount} registros no 6º Ano e ${currCount} itens de currículo.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Falha ao importar o arquivo JSON.',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200/80 bg-white shadow-xl dark:border-white/[0.08] dark:bg-[#15181F]">
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3.5 dark:border-white/[0.07]">
          <div>
            <h2 id="backup-modal-title" className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
              Nuvem &amp; Backup
            </h2>
            <p className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
              Sincronize entre aparelhos só com senha ou exporte um backup JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* ==============================================================
              1. SINCRONIZAÇÃO NA NUVEM (SENHA ÚNICA)
             ============================================================== */}
          <section aria-labelledby="cloud-sync-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {sync.status === 'offline' ? (
                  <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Cloud
                    className={`h-4 w-4 ${
                      sync.connected
                        ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                        : 'text-zinc-400 dark:text-[#6B7280]'
                    }`}
                  />
                )}
                <h3
                  id="cloud-sync-heading"
                  className="text-xs font-semibold tracking-[0.04em] text-zinc-700 uppercase dark:text-[#D1D5DB]"
                >
                  Sincronização na Nuvem
                </h3>
              </div>

              {sync.connected && (
                <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-[#9CA3AF]">
                  {sync.status === 'syncing'
                    ? 'Sincronizando...'
                    : sync.status === 'conflict'
                      ? 'Conflito'
                      : sync.status === 'offline'
                        ? 'Offline'
                        : `rev ${sync.revision} · ${formatSyncTime(sync.lastSyncedAt)}`}
                </span>
              )}
            </div>

            {!sync.connected ? (
              <form
                onSubmit={handleConnect}
                className="space-y-3 rounded-lg border border-zinc-200/80 bg-[#FAFAFA] p-3.5 dark:border-white/[0.07] dark:bg-[#0F1115]"
              >
                {showUrlField ? (
                  <div>
                    <label
                      htmlFor="sync-worker-url"
                      className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
                    >
                      URL do Cloudflare Worker
                    </label>
                    <input
                      id="sync-worker-url"
                      type="url"
                      required
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://novo-pep-sync.seuusuario.workers.dev"
                      className="w-full rounded-lg border border-zinc-200/90 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-[#9CA3AF]">
                    <span className="truncate font-mono">{urlInput}</span>
                    <button
                      type="button"
                      onClick={() => setShowUrlField(true)}
                      className="shrink-0 font-medium text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                    >
                      Alterar URL
                    </button>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="sync-password"
                    className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]"
                  >
                    Senha de sincronização (sem e-mail)
                  </label>
                  <input
                    id="sync-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full rounded-lg border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-[#9CA3AF]">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-300 accent-[#0F766E] dark:accent-[#2DD4BF]"
                  />
                  <span>
                    <strong className="font-medium text-zinc-800 dark:text-[#E5E7EB]">
                      Lembrar neste aparelho
                    </strong>{' '}
                    (desmarque em PC compartilhado do hospital — apaga ao fechar a aba)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0D655E] disabled:opacity-50 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-[#5EEAD4]"
                >
                  {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                  {busy ? 'Conectando...' : 'Conectar e sincronizar'}
                </button>
              </form>
            ) : (
              <div className="space-y-3 rounded-lg border border-zinc-200/80 bg-[#FAFAFA] p-3.5 dark:border-white/[0.07] dark:bg-[#0F1115]">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-zinc-800 dark:text-[#F3F4F6]">
                    {sync.rememberDevice ? 'Conectado neste aparelho' : 'Sessão temporária (PC compartilhado)'}
                  </span>
                  <span className="truncate font-mono text-[11px] text-zinc-400 dark:text-[#6B7280]">
                    {sync.url.replace(/^https?:\/\//, '')}
                  </span>
                </div>

                {sync.status === 'conflict' && sync.conflict && (
                  <div className="space-y-2.5 rounded-lg border border-amber-300/80 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                      <div>
                        <div className="font-semibold">Conflito entre este aparelho e a nuvem</div>
                        <p className="mt-0.5 text-[11px] opacity-90">
                          Nuvem está na revisão {sync.conflict.revision} ({formatSyncTime(sync.conflict.updatedAt)}).
                          Escolha qual versão manter:
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleUseRemote}
                        className="flex-1 rounded-md bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-400 dark:text-[#0F1115] dark:hover:bg-amber-300"
                      >
                        Usar versão da nuvem
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleUseLocal}
                        className="flex-1 rounded-md border border-amber-700/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100/60 disabled:opacity-50 dark:border-amber-400/40 dark:bg-[#15181F] dark:text-amber-200 dark:hover:bg-[#1C2029]"
                      >
                        Enviar deste aparelho
                      </button>
                    </div>
                  </div>
                )}

                {sync.errorMessage && sync.status !== 'conflict' && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{sync.errorMessage}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || sync.status === 'syncing'}
                    onClick={handleSyncNow}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-[#0F766E]/40 hover:text-[#0F766E] disabled:opacity-50 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-[#2DD4BF]/40 dark:hover:text-[#2DD4BF]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${busy || sync.status === 'syncing' ? 'animate-spin' : ''}`} />
                    Sincronizar agora
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-white/[0.09] dark:bg-[#15181F] dark:text-[#9CA3AF] dark:hover:border-red-500/40 dark:hover:text-red-400"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sair
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ==============================================================
              2. BACKUP JSON LOCAL (PLANO B OFFLINE)
             ============================================================== */}
          <section
            aria-labelledby="local-backup-heading"
            className="space-y-2.5 border-t border-zinc-200/80 pt-4 dark:border-white/[0.07]"
          >
            <h3
              id="local-backup-heading"
              className="text-xs font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]"
            >
              Backup JSON Local
            </h3>

            <button
              type="button"
              onClick={handleExport}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200/80 bg-[#FAFAFA] px-4 py-3 text-left transition-colors hover:border-[#0F766E]/40 hover:bg-zinc-100/70 dark:border-white/[0.07] dark:bg-[#0F1115] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029]"
            >
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                  Exportar Backup JSON
                </div>
                <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                  Salva favoritos, Pré-Porta, Logbook 3x, Pontos Cegos, Esteira v3.1, Plano 6º Ano e Currículo.
                </div>
              </div>
              <Download className="h-4 w-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200/80 bg-[#FAFAFA] px-4 py-3 text-left transition-colors hover:border-[#0F766E]/40 hover:bg-zinc-100/70 dark:border-white/[0.07] dark:bg-[#0F1115] dark:hover:border-[#2DD4BF]/40 dark:hover:bg-[#1C2029]"
            >
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-[#F3F4F6]">
                  Importar Backup JSON
                </div>
                <div className="text-xs text-zinc-500 dark:text-[#9CA3AF]">
                  Substitui os dados locais a partir de um arquivo .json exportado.
                </div>
              </div>
              <Upload className="h-4 w-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Selecionar arquivo de backup JSON"
            />
          </section>

          {feedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                feedback.kind === 'success'
                  ? 'border-teal-200 bg-teal-50/70 text-teal-900 dark:border-[#2DD4BF]/30 dark:bg-teal-500/12 dark:text-teal-200'
                  : 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-500/30 dark:bg-red-500/12 dark:text-red-200'
              }`}
            >
              {feedback.kind === 'success' ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="border-t border-zinc-200/70 pt-3 text-center font-mono text-[11px] text-zinc-400 dark:border-white/[0.06] dark:text-[#6B7280]">
            Versão {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'} · build{' '}
            {typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : 'dev'} (
            {typeof __APP_GIT_SHA__ !== 'undefined' ? __APP_GIT_SHA__ : 'local'})
          </div>
        </div>
      </div>
    </div>
  );
}
