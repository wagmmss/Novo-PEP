import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { RODIZIOS_6ANO } from '../engine/central6ano.ts';
import { cockpitStore, type LogbookRole } from '../state/store.ts';
import { detectPiiIssues } from '../utils/piiGuard.ts';

export interface QuickCaptureRequest {
  kind: 'logbook' | 'ponto_cego';
  defaultTitle: string;
  defaultRodizio?: string;
  defaultNota?: string;
}

interface QuickCaptureModalProps {
  request: QuickCaptureRequest | null;
  activeRodizioId: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

const AUTONOMY_OPTIONS: Array<{ value: LogbookRole; label: string }> = [
  { value: 'observou', label: 'Observou' },
  { value: 'auxiliei', label: 'Auxiliou' },
  { value: 'supervisionado', label: 'Supervis.' },
  { value: 'autonomo', label: 'Autônomo' },
];

export function QuickCaptureModal({
  request,
  activeRodizioId,
  onClose,
  onSaved,
}: QuickCaptureModalProps) {
  const [titulo, setTitulo] = useState('');
  const [rodizio, setRodizio] = useState(activeRodizioId);
  const [autonomy, setAutonomy] = useState<LogbookRole>('supervisionado');
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (!request) return;
    setTitulo(request.defaultTitle);
    setRodizio(request.defaultRodizio || activeRodizioId || RODIZIOS_6ANO[0]?.id || 'cm');
    setAutonomy('supervisionado');
    setNota(request.defaultNota || '');

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [request, activeRodizioId, onClose]);

  const piiIssues = useMemo(
    () => detectPiiIssues(`${titulo} ${nota}`),
    [titulo, nota]
  );

  if (!request) return null;

  const isLogbook = request.kind === 'logbook';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;

    if (isLogbook) {
      cockpitStore.addQuickLogbookEntry({
        titulo: titulo.trim(),
        rodizio,
        autonomy,
        aprendizado: nota.trim(),
      });
      onSaved?.('Registrado no Logbook.');
    } else {
      const res = cockpitStore.addQuickBlindSpotEntry({
        titulo: titulo.trim(),
        rodizio,
        aprendizado: nota.trim(),
      });
      onSaved?.(
        res.sanitizedCount > 0
          ? 'Ponto cego salvo com dados pessoais anonimizados.'
          : 'Ponto cego salvo para revisão.'
      );
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-capture-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-zinc-200/80 bg-white shadow-xl dark:border-white/[0.08] dark:bg-[#15181F]"
      >
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3.5 dark:border-white/[0.07]">
          <h2 id="quick-capture-title" className="text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
            {isLogbook ? 'Registrar no Logbook' : 'Salvar Ponto Cego'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label htmlFor="qc-title" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]">
              {isLogbook ? 'Procedimento ou caso' : 'Tema / dúvida clínica'}
            </label>
            <input
              id="qc-title"
              type="text"
              required
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="qc-rodizio" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]">
                Rodízio
              </label>
              <select
                id="qc-rodizio"
                value={rodizio}
                onChange={(e) => setRodizio(e.target.value)}
                className="w-full rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:focus:border-[#2DD4BF]"
              >
                {RODIZIOS_6ANO.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>

            {isLogbook && (
              <div>
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]">
                  Papel / Autonomia
                </span>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-zinc-200/80 bg-[#FAFAFA] p-0.5 dark:border-white/[0.08] dark:bg-[#0F1115]">
                  {AUTONOMY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAutonomy(opt.value)}
                      className={`whitespace-nowrap rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                        autonomy === opt.value
                          ? 'bg-[#0F766E] text-white dark:bg-[#2DD4BF] dark:text-[#0F1115]'
                          : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="qc-note" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-[#9CA3AF]">
              {isLogbook ? 'Aprendizado ou detalhe rápido (opcional)' : 'O que travou ou precisa revisar?'}
            </label>
            <textarea
              id="qc-note"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={
                isLogbook
                  ? 'Ex.: punção em 1ª tentativa, ajuste de dose confirmado.'
                  : 'Ex.: critério de internação ou dose de ataque na gestante (sem nome ou CPF).'
              }
              className="w-full resize-none rounded-lg border border-zinc-200/90 bg-[#FAFAFA] px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0F766E] dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6] dark:placeholder:text-[#6B7280] dark:focus:border-[#2DD4BF]"
            />
          </div>

          {piiIssues.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Possível dado identificável detectado ({Array.from(new Set(piiIssues.map((i) => i.label))).join(', ')}).
                Será anonimizado automaticamente ao salvar.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200/80 px-5 py-3 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115] dark:hover:bg-teal-300"
          >
            <Check className="h-3.5 w-3.5" />
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

