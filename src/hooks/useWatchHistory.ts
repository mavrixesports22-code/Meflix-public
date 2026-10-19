import { useState, useEffect } from 'react';
import { WatchHistoryEntry } from '../types';
import { historyService } from '../services/historyService';

export function useWatchHistory() {
  const [entries, setEntries] = useState<WatchHistoryEntry[]>([]);
  const [continuing, setContinuing] = useState<WatchHistoryEntry[]>([]);

  useEffect(() => {
    historyService.load().then(loaded => {
      setEntries(loaded);
      setContinuing(historyService.continuing());
    });

    const unsubscribe = historyService.subscribe(updated => {
      setEntries([...updated]);
      setContinuing(historyService.continuing());
    });

    return unsubscribe;
  }, []);

  const recordProgress = (data: { item: any; playId: string; position: number; duration: number; seasonId?: string; episode?: string }) => {
    return historyService.record(data);
  };

  const removeEntry = (key: string) => {
    return historyService.remove(key);
  };

  const clearHistory = () => {
    return historyService.clear();
  };

  return {
    entries,
    continuing,
    recordProgress,
    removeEntry,
    clearHistory,
  };
}
