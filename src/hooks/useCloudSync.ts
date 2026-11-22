import { useSyncExternalStore } from 'react';
import { cloudSync, type CloudSyncSnapshot } from '../state/cloudSync.ts';

export function useCloudSync(): CloudSyncSnapshot {
  return useSyncExternalStore(cloudSync.subscribe, cloudSync.getSnapshot, cloudSync.getSnapshot);
}
