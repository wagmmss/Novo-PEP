import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar, type AppWorld, type BeiraLeitoTab, type SextoAnoTab } from './components/TopBar.tsx';
import { ProtocolosView } from './components/ProtocolosView.tsx';
import { PrePortaView } from './components/PrePortaView.tsx';
import { PraticaView } from './components/PraticaView.tsx';
import { TeoriaView } from './components/TeoriaView.tsx';
import { R1CurriculoView } from './components/R1CurriculoView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { BackupModal } from './components/BackupModal.tsx';
import { QuickCaptureModal, type QuickCaptureRequest } from './components/QuickCaptureModal.tsx';
import { ShortcutsHelp } from './components/ShortcutsHelp.tsx';
import {
  COMMAND_PALETTE_ITEMS,
  COMMAND_PALETTE_SEARCH_INDEX,
  HAB_PROTOCOLS,
  PEP_PROTOCOLS,
  resolveKnownRouteId,
} from './data/protocolsRepo.ts';
import { FORMACAO_TEORICA_MODULOS } from './data/formacao_teorica_data.ts';
import {
  formatHashRoute,
  parseHashRoute,
  type AppRoute,
  type PraticaRouteSubTab,
  type TeoriaSubMode,
  type TreinoSectionRoute,
} from './state/hashRoute.ts';
import { subscribeAppHealth } from './state/appHealth.ts';

function readInitialRoute(): AppRoute | null {
  if (typeof window === 'undefined') return null;
  return parseHashRoute(window.location.hash, resolveKnownRouteId);
}
import type { ClinicalProtocolItem } from './data/clinical_data.ts';
import { useCockpitStore, useThemeSync } from './hooks/useCockpitStore.ts';
import { useCloudSync } from './hooks/useCloudSync.ts';
import { cockpitStore } from './state/store.ts';
import { cloudSync } from './state/cloudSync.ts';

export function App() {
  const storeState = useCockpitStore();
  const syncState = useCloudSync();
  useThemeSync(storeState.theme);

  // Pull inicial silencioso se a sincronização na nuvem já estiver conectada
  useEffect(() => {
    if (cloudSync.getSnapshot().connected) {
      void cloudSync.syncNow();
    }
  }, []);

  // Estado inicial lido da URL (#/p/<id>, #/hab/<id>, #/6ano/<aba>)
  const [initialRoute] = useState<AppRoute | null>(readInitialRoute);
  const [world, setWorld] = useState<AppWorld>(initialRoute?.world ?? 'beira-leito');
  const [beiraLeitoTab, setBeiraLeitoTab] = useState<BeiraLeitoTab>(
    initialRoute?.world === 'beira-leito' ? initialRoute.tab : 'protocolos'
  );
  const [sextoAnoTab, setSextoAnoTab] = useState<SextoAnoTab>(
    initialRoute?.world === 'sexto-ano' ? initialRoute.tab : 'pratica'
  );
  const [praticaSubTab, setPraticaSubTab] = useState<PraticaRouteSubTab>(
    initialRoute?.world === 'sexto-ano' && initialRoute.tab === 'pratica' && initialRoute.subTab
      ? initialRoute.subTab
      : 'logbook'
  );

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(
    initialRoute?.world === 'beira-leito' && initialRoute.tab === 'protocolos' && initialRoute.id
      ? initialRoute.id
      : PEP_PROTOCOLS[0]?.id ?? null
  );
  const [mobileProtocolDetail, setMobileProtocolDetail] = useState(
    initialRoute?.world === 'beira-leito' && initialRoute.tab === 'protocolos' && initialRoute.detail
  );

  const [selectedHabId, setSelectedHabId] = useState<string | null>(
    initialRoute?.world === 'beira-leito' && initialRoute.tab === 'pre-porta' && initialRoute.id
      ? initialRoute.id
      : HAB_PROTOCOLS[0]?.id ?? null
  );
  const [mobileHabDetail, setMobileHabDetail] = useState(
    initialRoute?.world === 'beira-leito' && initialRoute.tab === 'pre-porta' && initialRoute.detail
  );

  const [teoriaSubMode, setTeoriaSubMode] = useState<TeoriaSubMode>(
    initialRoute?.world === 'sexto-ano' &&
      initialRoute.tab === 'teoria' &&
      initialRoute.teoriaMode === 'guias'
      ? 'guias'
      : 'treino'
  );
  const [selectedTeoriaModId, setSelectedTeoriaModId] = useState<string>(
    initialRoute?.world === 'sexto-ano' &&
      initialRoute.tab === 'teoria' &&
      initialRoute.teoriaModId
      ? initialRoute.teoriaModId
      : FORMACAO_TEORICA_MODULOS[0]?.id ?? 'mod-01'
  );
  const [mobileTeoriaDetail, setMobileTeoriaDetail] = useState<boolean>(
    Boolean(
      initialRoute?.world === 'sexto-ano' &&
        initialRoute.tab === 'teoria' &&
        initialRoute.teoriaDetail
    )
  );
  const [treinoSection, setTreinoSection] = useState<TreinoSectionRoute>(
    initialRoute?.world === 'sexto-ano' &&
      initialRoute.tab === 'teoria' &&
      initialRoute.treinoSection
      ? initialRoute.treinoSection
      : 'esteira'
  );
  const [treinoSlug, setTreinoSlug] = useState<string | null>(
    initialRoute?.world === 'sexto-ano' &&
      initialRoute.tab === 'teoria' &&
      initialRoute.treinoSlug
      ? initialRoute.treinoSlug
      : null
  );
  const [mobileTreinoDetail, setMobileTreinoDetail] = useState<boolean>(
    Boolean(
      initialRoute?.world === 'sexto-ano' &&
        initialRoute.tab === 'teoria' &&
        initialRoute.treinoDetail
    )
  );

  // ---- Sincronização estado ⇄ URL --------------------------------------------
  const currentHash = formatHashRoute(
    world === 'sexto-ano'
      ? sextoAnoTab === 'pratica'
        ? { world, tab: 'pratica', subTab: praticaSubTab }
        : sextoAnoTab === 'teoria'
          ? {
              world,
              tab: 'teoria',
              teoriaMode: teoriaSubMode,
              teoriaModId: selectedTeoriaModId,
              teoriaDetail: mobileTeoriaDetail,
              treinoSection,
              treinoSlug,
              treinoDetail: mobileTreinoDetail,
            }
          : { world, tab: sextoAnoTab }
      : beiraLeitoTab === 'protocolos'
        ? { world, tab: 'protocolos', id: selectedProtocolId, detail: mobileProtocolDetail }
        : { world, tab: 'pre-porta', id: selectedHabId, detail: mobileHabDetail }
  );
  const lastPushAtRef = useRef(0);

  useEffect(() => {
    if (window.location.hash === currentHash) return;
    const now = Date.now();
    const sameShape =
      window.location.hash.split('/').slice(0, 2).join('/') === currentHash.split('/').slice(0, 2).join('/') &&
      window.location.hash.split('/').length === currentHash.split('/').length;
    // Trocas rápidas no mesmo tipo de tela (↑/↓ na lista) substituem a entrada em vez de empilhar
    const coalesce = sameShape && now - lastPushAtRef.current < 800;
    const url = `${window.location.pathname}${window.location.search}${currentHash}`;
    if (!window.location.hash || coalesce) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
    lastPushAtRef.current = now;
  }, [currentHash]);

  useEffect(() => {
    const applyFromLocation = () => {
      const route = parseHashRoute(window.location.hash, resolveKnownRouteId);
      if (!route) return;
      setWorld(route.world);
      if (route.world === 'sexto-ano') {
        setSextoAnoTab(route.tab);
        if (route.tab === 'pratica') {
          setPraticaSubTab(route.subTab ?? 'logbook');
        } else if (route.tab === 'teoria') {
          setTeoriaSubMode(route.teoriaMode === 'guias' ? 'guias' : 'treino');
          if (route.teoriaModId) setSelectedTeoriaModId(route.teoriaModId);
          setMobileTeoriaDetail(Boolean(route.teoriaDetail));
          if (route.teoriaMode !== 'guias') {
            setTreinoSection(route.treinoSection ?? 'esteira');
            if (route.treinoSlug) setTreinoSlug(route.treinoSlug);
            setMobileTreinoDetail(Boolean(route.treinoDetail));
          }
        }
        return;
      }
      setBeiraLeitoTab(route.tab);
      if (route.tab === 'protocolos') {
        if (route.id) setSelectedProtocolId(route.id);
        setMobileProtocolDetail(route.detail);
      } else {
        if (route.id) setSelectedHabId(route.id);
        setMobileHabDetail(route.detail);
      }
    };
    window.addEventListener('popstate', applyFromLocation);
    window.addEventListener('hashchange', applyFromLocation);
    return () => {
      window.removeEventListener('popstate', applyFromLocation);
      window.removeEventListener('hashchange', applyFromLocation);
    };
  }, []);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickCapture, setQuickCapture] = useState<QuickCaptureRequest | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Shift+Enter na Command Palette: pede "Copiar tudo" ao abrir o protocolo
  const [copyRequest, setCopyRequest] = useState<{ protocolId: string; nonce: number } | null>(null);

  const anyModalOpen = cmdOpen || settingsOpen || helpOpen || quickCapture !== null;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;

  const notify = useCallback((message: string) => {
    setToastMsg(message);
  }, []);

  // Nova versão do app / falha ao gravar no navegador
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  const [persistWarning, setPersistWarning] = useState(false);
  useEffect(
    () =>
      subscribeAppHealth((event) => {
        if (event.kind === 'update-available') setApplyUpdate(() => event.apply);
        else if (event.kind === 'persist-failed') setPersistWarning(true);
      }),
    []
  );

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
        return;
      }
      // "?" abre a ajuda de atalhos (fora de campos de texto e sem outro modal aberto)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        const editable =
          !!el && (el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
        if (!editable && !anyModalOpenRef.current) {
          e.preventDefault();
          setHelpOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectFromPalette = useCallback(
    (item: ClinicalProtocolItem, options?: { copyAll?: boolean }) => {
      setWorld('beira-leito');
      if (item.mod_id === 'hab') {
        setBeiraLeitoTab('pre-porta');
        setSelectedHabId(item.id);
        setMobileHabDetail(true);
      } else {
        setBeiraLeitoTab('protocolos');
        setSelectedProtocolId(item.id);
        setMobileProtocolDetail(true);
        if (options?.copyAll) {
          setCopyRequest({ protocolId: item.id, nonce: Date.now() });
        }
      }
    },
    []
  );

  const handleOpenPrePortaFromProtocol = useCallback((habId: string) => {
    setWorld('beira-leito');
    setBeiraLeitoTab('pre-porta');
    setSelectedHabId(habId);
    setMobileHabDetail(true);
  }, []);

  const handleOpenProtocolFromPrePorta = useCallback((protocolId: string) => {
    setWorld('beira-leito');
    setBeiraLeitoTab('protocolos');
    setSelectedProtocolId(protocolId);
    setMobileProtocolDetail(true);
  }, []);

  const handleOpenTeoriaModule = useCallback((modId: string) => {
    setSelectedTeoriaModId(modId);
    setTeoriaSubMode('guias');
    setMobileTeoriaDetail(true);
    setWorld('sexto-ano');
    setSextoAnoTab('teoria');
  }, []);

  const handleChangeSextoAnoTab = useCallback((tab: SextoAnoTab) => {
    setSextoAnoTab(tab);
    if (tab === 'teoria') {
      setTeoriaSubMode('treino');
      setMobileTeoriaDetail(false);
    }
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#FAFAFA] text-zinc-900 dark:bg-[#0F1115] dark:text-[#F3F4F6]">
      <TopBar
        world={world}
        beiraLeitoTab={beiraLeitoTab}
        sextoAnoTab={sextoAnoTab}
        theme={storeState.theme}
        syncStatus={syncState.status}
        onChangeWorld={setWorld}
        onChangeBeiraLeitoTab={setBeiraLeitoTab}
        onChangeSextoAnoTab={handleChangeSextoAnoTab}
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
          shortcutsEnabled={!anyModalOpen}
          copyRequest={copyRequest}
          onCopyRequestHandled={() => setCopyRequest(null)}
        />
      )}

      {world === 'beira-leito' && beiraLeitoTab === 'pre-porta' && (
        <PrePortaView
          selectedId={selectedHabId}
          mobileShowDetail={mobileHabDetail}
          favoriteIds={storeState.favoriteIds}
          habChecklists={storeState.habChecklists}
          onSelectHab={(id) => {
            setSelectedHabId(id);
            setMobileHabDetail(true);
          }}
          onBackToList={() => setMobileHabDetail(false)}
          onOpenQuickCapture={setQuickCapture}
          onOpenProtocol={handleOpenProtocolFromPrePorta}
          onOpenTeoria={handleOpenTeoriaModule}
          onNotify={notify}
          shortcutsEnabled={!anyModalOpen}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'pratica' && (
        <PraticaView
          central6Ano={storeState.central6Ano}
          subTab={praticaSubTab}
          onChangeSubTab={setPraticaSubTab}
          onOpenPrePorta={handleOpenPrePortaFromProtocol}
          onOpenProtocol={handleOpenProtocolFromPrePorta}
          onOpenQuickCapture={setQuickCapture}
          onNotify={notify}
          shortcutsEnabled={!anyModalOpen}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'teoria' && (
        <TeoriaView
          central6Ano={storeState.central6Ano}
          subMode={teoriaSubMode}
          selectedModId={selectedTeoriaModId}
          mobileShowDetail={mobileTeoriaDetail}
          treinoSection={treinoSection}
          treinoSlug={treinoSlug}
          mobileTreinoDetail={mobileTreinoDetail}
          shortcutsEnabled={!anyModalOpen}
          onChangeSubMode={(mode) => {
            setTeoriaSubMode(mode);
            if (mode === 'treino') {
              setMobileTeoriaDetail(false);
            }
          }}
          onSelectModId={(modId) => {
            setSelectedTeoriaModId(modId);
            setMobileTeoriaDetail(true);
          }}
          onBackToList={() => setMobileTeoriaDetail(false)}
          onChangeTreinoRoute={(sec, slug, detail) => {
            setTreinoSection(sec);
            if (slug !== undefined) setTreinoSlug(slug);
            setMobileTreinoDetail(detail);
          }}
          onOpenPrePorta={handleOpenPrePortaFromProtocol}
          onNotify={notify}
        />
      )}

      {world === 'sexto-ano' && sextoAnoTab === 'r1-curriculo' && (
        <R1CurriculoView
          central6Ano={storeState.central6Ano}
          onNavigateSextoAnoTab={handleChangeSextoAnoTab}
          onNotify={notify}
        />
      )}

      <CommandPalette
        open={cmdOpen}
        items={COMMAND_PALETTE_ITEMS}
        searchIndex={COMMAND_PALETTE_SEARCH_INDEX}
        teoriaModules={FORMACAO_TEORICA_MODULOS}
        onClose={() => setCmdOpen(false)}
        onSelectItem={handleSelectFromPalette}
        onSelectTeoriaModule={handleOpenTeoriaModule}
      />

      <BackupModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <QuickCaptureModal
        request={quickCapture}
        activeRodizioId={storeState.central6Ano.rodizioId}
        onClose={() => setQuickCapture(null)}
        onSaved={notify}
      />

      {(applyUpdate || persistWarning) && (
        <div className="fixed bottom-4 left-4 z-50 flex max-w-sm flex-col gap-2">
          {applyUpdate && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg border border-teal-200 bg-white px-3.5 py-2.5 text-xs text-zinc-800 shadow-lg dark:border-teal-500/30 dark:bg-[#15181F] dark:text-[#F3F4F6]"
            >
              <span className="flex-1">Nova versão dos protocolos disponível.</span>
              <button
                type="button"
                onClick={() => applyUpdate()}
                className="rounded-md bg-[#0F766E] px-2.5 py-1 font-semibold text-white hover:bg-teal-800 dark:bg-[#2DD4BF] dark:text-[#0F1115]"
              >
                Atualizar
              </button>
            </div>
          )}
          {persistWarning && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 shadow-lg dark:border-red-500/30 dark:bg-[#2A1515] dark:text-red-200"
            >
              <span className="flex-1">
                O navegador recusou salvar seus dados (armazenamento cheio ou bloqueado). Exporte um backup em
                Configurações antes de fechar a aba.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPersistWarning(false);
                  setSettingsOpen(true);
                }}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                Backup
              </button>
            </div>
          )}
        </div>
      )}

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
