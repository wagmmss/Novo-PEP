import { useCallback, useEffect, useState } from 'react';
import { TopBar, type AppWorld, type BeiraLeitoTab, type SextoAnoTab } from './components/TopBar.tsx';
import { ProtocolosView } from './components/ProtocolosView.tsx';
import { PrePortaView } from './components/PrePortaView.tsx';
import { PraticaView } from './components/PraticaView.tsx';
import { TeoriaView } from './components/TeoriaView.tsx';
import { R1CurriculoView } from './components/R1CurriculoView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { BackupModal } from './components/BackupModal.tsx';
import { QuickCaptureModal, type QuickCaptureRequest } from './components/QuickCaptureModal.tsx';
import {
  ALL_PROTOCOLS,
  GLOBAL_SEARCH_INDEX,
  HAB_PROTOCOLS,
  PEP_PROTOCOLS,
} from './data/protocolsRepo.ts';
import type { ClinicalProtocolItem } from './data/clinical_data.ts';
import { useCockpitStore, useThemeSync } from './hooks/useCockpitStore.ts';
import { cockpitStore } from './state/store.ts';

export function App() {
  const storeState = useCockpitStore();
  useThemeSync(storeState.theme);

  const [world, setWorld] = useState<AppWorld>('beira-leito');
  const [beiraLeitoTab, setBeiraLeitoTab] = useState<BeiraLeitoTab>('protocolos');
  const [sextoAnoTab, setSextoAnoTab] = useState<SextoAnoTab>('pratica');

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(
    PEP_PROTOCOLS[0]?.id ?? null
  );
  const [mobileProtocolDetail, setMobileProtocolDetail] = useState(false);

  const [selectedHabId, setSelectedHabId] = useState<string | null>(
    HAB_PROTOCOLS[0]?.id ?? null
  );
  const [mobileHabDetail, setMobileHabDetail] = useState(false);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickCapture, setQuickCapture] = useState<QuickCaptureRequest | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToastMsg(message);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const id = window.setTimeout(() => setToastMsg(null), 2400);
    return () => window.clearTimeout(id);
  }, [toastMsg]);

  // Atalho global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectFromPalette = useCallback((item: ClinicalProtocolItem) => {
    setWorld('beira-leito');
    if (item.mod_id === 'hab') {
      setBeiraLeitoTab('pre-porta');
      setSelectedHabId(item.id);
      setMobileHabDetail(true);
    } else {
      setBeiraLeitoTab('protocolos');
      setSelectedProtocolId(item.id);
      setMobileProtocolDetail(true);
    }
  }, []);

  const handleOpenPrePortaFromProtocol = useCallback((habId: string) => {
    setWorld('beira-leito');
    setBeiraLeitoTab('pre-porta');
    setSelectedHabId(habId);
    setMobileHabDetail(true);
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#FAFAFA] text-zinc-900 dark:bg-[#0F1115] dark:text-[#F3F4F6]">
      <TopBar
        world={world}
        beiraLeitoTab={beiraLeitoTab}
        sextoAnoTab={sextoAnoTab}
        theme={storeState.theme}
        onChangeWorld={setWorld}
        onChangeBeiraLeitoTab={setBeiraLeitoTab}
        onChangeSextoAnoTab={setSextoAnoTab}
        onOpenSearch={() => setCmdOpen(true)}
        onToggleTheme={() => cockpitStore.toggleTheme()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {world === 'beira-leito' && beiraLeitoTab === 'protocolos' && (
        <ProtocolosView
          selectedId={selectedProtocolId}
          mobileShowDetail={mobileProtocolDetail}
          favoriteIds={storeState.favoriteIds}
          onSelectProtocol={(id) => {
            setSelectedProtocolId(id);
            setMobileProtocolDetail(true);
          }}
          onBackToList={() => setMobileProtocolDetail(false)}
          onOpenPrePorta={handleOpenPrePortaFromProtocol}
          onOpenQuickCapture={setQuickCapture}
          onNotify={notify}
        />
      )}

      {world === 'beira-leito' && beiraLeitoTab === 'pre-porta' && (
        <PrePortaView
          selectedId={selectedHabId}
          mobileShowDetail={mobileHabDetail}
          habChecklists={storeState.habChecklists}
          onSelectHab={(id) => {
            setSelectedHabId(id);
            setMobileHabDetail(true);
          }}
          onBackToList={() => setMobileHabDetail(false)}
          onOpenQuickCapture={setQuickCapture}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'pratica' && (
        <PraticaView
          central6Ano={storeState.central6Ano}
          onOpenPrePorta={handleOpenPrePortaFromProtocol}
          onNotify={notify}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'teoria' && (
        <TeoriaView
          central6Ano={storeState.central6Ano}
          onOpenPrePorta={handleOpenPrePortaFromProtocol}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'r1-curriculo' && (
        <R1CurriculoView central6Ano={storeState.central6Ano} onNotify={notify} />
      )}

      <CommandPalette
        open={cmdOpen}
        items={ALL_PROTOCOLS}
        searchIndex={GLOBAL_SEARCH_INDEX}
        onClose={() => setCmdOpen(false)}
        onSelectItem={handleSelectFromPalette}
      />

      <BackupModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <QuickCaptureModal
        request={quickCapture}
        activeRodizioId={storeState.central6Ano.rodizioId}
        onClose={() => setQuickCapture(null)}
        onSaved={notify}
      />

      {/* Toast discreto */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 z-50 rounded-lg border border-zinc-200/80 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-lg dark:border-white/[0.1] dark:bg-[#1C2029] dark:text-[#F3F4F6]"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
