import { useEffect, useRef, useState } from 'react';
import { Check, Download, Upload, X, AlertCircle } from 'lucide-react';
import { cockpitStore } from '../state/store.ts';
import { getLocalTodayIso } from '../engine/central6ano.ts';

interface BackupModalProps {
  open: boolean;
  onClose: () => void;
}

export function BackupModal({ open, onClose }: BackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 id="backup-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Configurações e Backup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exporte ou restaure seus dados salvos localmente neste navegador.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleExport}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-teal-600/40 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1117] dark:hover:border-teal-400/40 dark:hover:bg-slate-900"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Exportar Backup JSON
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Inclui favoritos, Pré-Porta, Logbook 3x, Pontos Cegos, Teoria, Prazos R1, Currículo e tema.
                </div>
              </div>
              <Download className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-teal-600/40 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1117] dark:hover:border-teal-400/40 dark:hover:bg-slate-900"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Importar Backup JSON
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Substitui os dados locais a partir de um arquivo .json exportado.
                </div>
              </div>
              <Upload className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Selecionar arquivo de backup JSON"
            />
          </div>

          {feedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                feedback.kind === 'success'
                  ? 'border-teal-200 bg-teal-50/70 text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200'
                  : 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
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
        </div>
      </div>
    </div>
  );
}
