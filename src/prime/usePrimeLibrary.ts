import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PrimeLibraryStore, primeContinuing } from './primeState';

const stores = new Map<string, PrimeLibraryStore>();

function getStore(profileId: string) {
  let store = stores.get(profileId);
  if (!store) {
    store = new PrimeLibraryStore(AsyncStorage, profileId);
    stores.set(profileId, store);
  }
  return store;
}

/** Pass the active Meflix profile ID; Prime state never shares Netflix keys. */
export function usePrimeLibrary(profileId = 'default') {
  const store = useMemo(() => getStore(profileId), [profileId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); }, [store]);
  const continuing = useMemo(() => primeContinuing(snapshot.history), [snapshot.history]);
  return {
    ...snapshot,
    continuing,
    isInWatchlist: (id: string) => snapshot.watchlist.includes(id),
    toggleWatchlist: store.toggleWatchlist,
    clearWatchlist: store.clearWatchlist,
    updatePreferences: store.updatePreferences,
    recordProgress: store.recordProgress,
    removeProgress: store.removeProgress,
    clearHistory: store.clearHistory,
    setSource: store.setSource,
  };
}
