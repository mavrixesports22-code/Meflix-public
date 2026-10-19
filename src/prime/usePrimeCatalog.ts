import { useEffect, useSyncExternalStore } from 'react';
import { primeCatalogService } from './primeCatalog';

const reload = () => primeCatalogService.loadHome(true);

export function usePrimeCatalog() {
  const snapshot = useSyncExternalStore(primeCatalogService.subscribe, primeCatalogService.getSnapshot, primeCatalogService.getSnapshot);
  useEffect(() => { void primeCatalogService.loadHome().catch(() => {}); }, []);
  return {
    ...snapshot, reload,
    getTitleDetails: primeCatalogService.getTitleDetails,
    getItemById: primeCatalogService.getItemById,
    search: primeCatalogService.search,
    fetchEpisodes: primeCatalogService.fetchEpisodes,
    getMoreLikeThis: primeCatalogService.getMoreLikeThis,
    ensureTitles: primeCatalogService.ensureTitles,
  };
}
