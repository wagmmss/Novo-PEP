import { useMemo, useState } from 'react';
import {
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  type Central6AnoState,
} from '../engine/central6ano.ts';
import type { PraticaRouteSubTab } from '../state/hashRoute.ts';
import { LogbookTool } from './LogbookTool.tsx';
import { PontosCegosTool } from './PontosCegosTool.tsx';
import type { QuickCaptureRequest } from './QuickCaptureModal.tsx';

interface PraticaViewProps {
  central6Ano: Central6AnoState;
  subTab?: PraticaRouteSubTab;
  onChangeSubTab?: (tab: PraticaRouteSubTab) => void;
  onOpenPrePorta: (habId: string) => void;
  onOpenProtocol?: (protocolId: string) => void;
  onOpenQuickCapture?: (req: QuickCaptureRequest) => void;
  onNotify: (message: string) => void;
  shortcutsEnabled?: boolean;
}

const SUB_TABS: ReadonlyArray<{ id: PraticaRouteSubTab; label: string }> = [
  { id: 'logbook', label: 'Logbook 3x' },
  { id: 'pontos-cegos', label: 'Pontos Cegos' },
];

export const PROC_TO_HAB_ID: Record<string, string> = Object.fromEntries(
  LOGBOOK_PROCEDIMENTOS_MATRIX.filter((p) => Boolean(p.habId)).map((p) => [p.id, p.habId!])
);

export function PraticaView({
  central6Ano,
  subTab: controlledSubTab,
  onChangeSubTab,
  onOpenPrePorta,
  onOpenProtocol,
  onOpenQuickCapture,
  onNotify,
  shortcutsEnabled = true,
}: PraticaViewProps) {
  const [internalSubTab, setInternalSubTab] = useState<PraticaRouteSubTab>('logbook');
  const activeSubTab = controlledSubTab ?? internalSubTab;
  const setSubTab = onChangeSubTab ?? setInternalSubTab;

  const pendingBlindCount = useMemo(
    () =>
      (central6Ano.logbookEntries || []).filter(
        (e) => e.tipo === 'ponto_cego' && e.status !== 'resolvido'
      ).length,
    [central6Ano.logbookEntries]
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[#0F1115]">
      {/* Barra de sub-abas limpa — sincronizada com a URL (#/6ano/pratica e #/6ano/pratica/pontos-cegos) */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-[#FAFAFA]/95 backdrop-blur-sm dark:border-white/[0.10] dark:bg-[#0F1115]/95">
        <div
          role="tablist"
          aria-label="Ferramentas de prática clínica"
          className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 sm:px-8"
        >
          {SUB_TABS.map((tab) => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(tab.id)}
                className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'pontos-cegos' && pendingBlindCount > 0 && (
                  <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                    {pendingBlindCount}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
        {activeSubTab === 'logbook' && (
          <LogbookTool
            central6Ano={central6Ano}
            onOpenPrePorta={onOpenPrePorta}
            onOpenQuickCapture={onOpenQuickCapture}
            onNotify={onNotify}
            shortcutsEnabled={shortcutsEnabled}
          />
        )}
        {activeSubTab === 'pontos-cegos' && (
          <PontosCegosTool
            central6Ano={central6Ano}
            onOpenPrePorta={onOpenPrePorta}
            onOpenProtocol={onOpenProtocol}
            onNotify={onNotify}
            shortcutsEnabled={shortcutsEnabled}
          />
        )}
      </div>
    </main>
  );
}
