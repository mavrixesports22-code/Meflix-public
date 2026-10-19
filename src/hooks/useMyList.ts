import { useState, useEffect, useCallback } from 'react';
import { StorageService } from '../services/storageService';

const MY_LIST_KEY = 'netflix_my_list';
const DEFAULT_MY_LIST = ['stranger-things', 'wednesday', 'arcane'];

export function useMyList() {
  const [myList, setMyList] = useState<string[]>(DEFAULT_MY_LIST);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    StorageService.getItem<string[]>(MY_LIST_KEY, DEFAULT_MY_LIST).then(saved => {
      if (Array.isArray(saved)) {
        setMyList(saved);
      }
    });
  }, []);

  const isInMyList = useCallback((id: string) => {
    return myList.includes(id);
  }, [myList]);

  const toggleMyList = useCallback((id: string, title?: string) => {
    setMyList(prev => {
      const exists = prev.includes(id);
      let updated: string[];
      if (exists) {
        updated = prev.filter(item => item !== id);
        if (title) setToastMessage(`Removed "${title}" from My List`);
      } else {
        updated = [...prev, id];
        if (title) setToastMessage(`Added "${title}" to My List`);
      }
      StorageService.setItem(MY_LIST_KEY, updated);
      return updated;
    });
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  return {
    myList,
    isInMyList,
    toggleMyList,
    toastMessage,
    clearToast,
  };
}
