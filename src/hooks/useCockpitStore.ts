import { useEffect, useSyncExternalStore } from 'react';
import { cockpitStore, type CockpitStoreState } from '../state/store.ts';

export function useCockpitStore(): CockpitStoreState {
  return useSyncExternalStore(
    cockpitStore.subscribe,
    cockpitStore.getSnapshot,
    cockpitStore.getSnapshot
  );
}

export function useThemeSync(theme: 'light' | 'dark'): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const meta = document.getElementById('metaThemeColor');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0b1117' : '#ffffff');
    }
  }, [theme]);
}
