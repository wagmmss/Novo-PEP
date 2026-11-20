import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './App.tsx';
import { emitAppHealth, requestPersistentStorage } from './state/appHealth.ts';

// Service worker em modo "prompt": avisa quando há versão nova em vez de servir a antiga indefinidamente
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    emitAppHealth({ kind: 'update-available', apply: () => void updateSW(true) });
  },
  onOfflineReady() {
    emitAppHealth({ kind: 'offline-ready' });
  },
});

void requestPersistentStorage();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
