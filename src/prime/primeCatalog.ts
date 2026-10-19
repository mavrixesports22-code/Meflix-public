import type { Episode, Shelf, TitleItem } from '../types';
import { primeSourceService } from '../services/primeSourceService';

export type PrimeFilter = 'all' | 'movies' | 'tv';
export interface PrimeShelf { id: string; title: string; items: TitleItem[] }
export interface PrimeCatalogSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: TitleItem[];
  shelves: PrimeShelf[];
  featured: TitleItem[];
  error: string | null;
  hydrationError: string | null;
  stale: boolean;
}

export interface PrimeBackend {
  fetchHome(): Promise<{ shelves: Shelf[]; items: TitleItem[]; featured: string[]; stale: boolean }>;
  fetchTitle(id: string): Promise<TitleItem>;
  search(query: string): Promise<TitleItem[]>;
  fetchEpisodes(seasonId: string): Promise<Episode[]>;
}
type ShelfIds = { id: string; title: string; items: string[] };
const TITLE_PREFIX = 'prime-pv-';
const EPISODE_PREFIX = 'prime-pv-ep-';
const rawSourceId = (id: string) => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('The Prime source returned an invalid content ID.');
  return id;
};
// Strip only our exact display namespace; provider IDs stay opaque and case sensitive.
const sourceId = (id: string) => {
  return rawSourceId(id.startsWith(TITLE_PREFIX) ? id.slice(TITLE_PREFIX.length) : id);
};
const primeId = (rawId: string) => `${TITLE_PREFIX}${rawSourceId(rawId)}`;
const itemId = (item: TitleItem) => item.netmirrorId ? primeId(item.netmirrorId) : primeId(sourceId(item.id));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The catalogue source is unavailable. Try again.';

function primeEpisode(episode: Episode): Episode {
  const id = episode.netmirrorId !== undefined ? rawSourceId(episode.netmirrorId)
    : rawSourceId(episode.id?.startsWith(EPISODE_PREFIX) ? episode.id.slice(EPISODE_PREFIX.length) : episode.id || '');
  return { ...episode, id: `${EPISODE_PREFIX}${id}`, netmirrorId: id };
}

function primeItem(item: TitleItem, hydrated = false, includeSuggestions = true): TitleItem {
  const id = item.netmirrorId !== undefined ? rawSourceId(item.netmirrorId) : sourceId(item.id);
  return {
    ...item, id: primeId(id), netmirrorId: id, hydrated,
    episodes: item.episodes?.map(primeEpisode),
    suggestions: includeSuggestions ? item.suggestions?.map(suggestion => primeItem(suggestion, false, false)) : undefined,
  };
}

/** Prime provider metadata only. No Netflix catalog, bundled titles or substitute recommendations. */
export class PrimeCatalogService {
  private snapshot: PrimeCatalogSnapshot = { status: 'idle', items: [], shelves: [], featured: [], error: null, hydrationError: null, stale: false };
  private listeners = new Set<() => void>();
  private items = new Map<string, TitleItem>();
  private shelves: ShelfIds[] = [];
  private featuredIds: string[] = [];
  private generation = 0;
  private homeRequest: Promise<void> | null = null;
  private detailRequests = new Map<string, Promise<TitleItem>>();
  private searchRequests = new Map<string, Promise<TitleItem[]>>();
  private activeDetails = 0;
  private detailQueue: (() => void)[] = [];

  constructor(private backend: PrimeBackend = primeSourceService) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = (): PrimeCatalogSnapshot => this.snapshot;
  getItemById = (id: string): TitleItem | undefined => {
    try { return this.items.get(primeId(sourceId(id))); } catch { return undefined; }
  };

  private publish(patch: Partial<PrimeCatalogSnapshot> = {}) {
    const resolve = (ids: string[]) => ids.map(id => this.items.get(id)).filter((item): item is TitleItem => Boolean(item));
    this.snapshot = {
      ...this.snapshot, ...patch, items: Array.from(this.items.values()),
      shelves: this.shelves.map(shelf => ({ ...shelf, items: resolve(shelf.items) })),
      featured: resolve(this.featuredIds),
    };
    this.listeners.forEach(listener => listener());
  }

  private upsert(item: TitleItem): TitleItem {
    const existing = this.items.get(item.id);
    // Home and search carry incomplete metadata and guessed content types.
    const next = existing?.hydrated && !item.hydrated ? { ...item, ...existing } : { ...existing, ...item };
    this.items.set(next.id, next);
    for (const suggestion of next.suggestions || []) {
      const previous = this.items.get(suggestion.id);
      this.items.set(suggestion.id, previous?.hydrated ? previous : { ...previous, ...suggestion });
    }
    return next;
  }

  loadHome = (force = false): Promise<void> => {
    if (this.homeRequest && !force) return this.homeRequest;
    if (this.snapshot.status === 'ready' && !force) return Promise.resolve();
    const generation = ++this.generation;
    this.publish({ status: 'loading', error: null, hydrationError: null });
    const request = (async () => {
      let homeLoaded = false;
      try {
        const home = await this.backend.fetchHome();
        if (generation !== this.generation) return;
        const references = new Map<string, string>();
        for (const item of home.items) {
          const mapped = this.upsert(primeItem(item));
          references.set(item.id, mapped.id);
          if (item.netmirrorId) references.set(item.netmirrorId, mapped.id);
        }
        const resolveReference = (id: string) => references.get(id) || primeId(sourceId(id));
        this.shelves = home.shelves.map(shelf => ({ id: `prime-${shelf.id}`, title: shelf.title, items: shelf.items.map(resolveReference) }));
        this.featuredIds = home.featured.map(resolveReference);
        this.publish({ status: 'ready', stale: home.stale, error: null });
        homeLoaded = true;
        // Load only the initial viewport. Collections/visible rows call ensureTitles.
        const priorityIds = [...this.featuredIds.slice(0, 6), ...this.shelves.slice(0, 3).flatMap(shelf => shelf.items.slice(0, 6))];
        const priority = [...new Set(priorityIds)].map(id => this.items.get(id)).filter((item): item is TitleItem => Boolean(item));
        await this.hydrateTitles(priority, generation);
      } catch (error) {
        if (generation !== this.generation) return;
        if (!homeLoaded) this.publish({ status: this.shelves.length ? 'ready' : 'error', error: errorMessage(error), stale: this.items.size > 0 });
        throw error;
      }
    })();
    this.homeRequest = request;
    void request.finally(() => { if (this.homeRequest === request) this.homeRequest = null; }).catch(() => {});
    return request;
  };

  private requestTitle(id: string): Promise<TitleItem> {
    const cleanId = sourceId(id);
    const existing = this.items.get(primeId(cleanId));
    if (existing?.hydrated) return Promise.resolve(existing);
    const pending = this.detailRequests.get(cleanId);
    if (pending) return pending;
    const request = new Promise<TitleItem>((resolve, reject) => {
      const start = () => {
        this.activeDetails++;
        void Promise.resolve().then(() => this.backend.fetchTitle(cleanId)).then(
          item => resolve(primeItem(item, true)), reject,
        ).catch(reject).finally(() => { this.activeDetails--; this.detailQueue.shift()?.(); });
      };
      if (this.activeDetails < 4) start();
      else this.detailQueue.push(start);
    });
    this.detailRequests.set(cleanId, request);
    void request.finally(() => { if (this.detailRequests.get(cleanId) === request) this.detailRequests.delete(cleanId); }).catch(() => {});
    return request;
  }

  getTitleDetails = async (id: string): Promise<TitleItem> => {
    const details = await this.requestTitle(id);
    if (this.items.get(details.id) === details) return details;
    const item = this.upsert(details);
    this.publish();
    return item;
  };

  private async hydrateTitles(items: readonly TitleItem[], generation: number): Promise<TitleItem[]> {
    const unique = [...new Map(items.map(item => [itemId(item), item])).values()];
    const results = await Promise.allSettled(unique.map(async item => {
      const details = await this.requestTitle(itemId(item));
      if (generation === this.generation && this.items.get(details.id) !== details) { this.upsert(details); this.publish(); }
      return details;
    }));
    if (generation !== this.generation) return [];
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) {
      const error = new Error(`Some title details could not be loaded. ${errorMessage(failure.reason)}`);
      this.publish({ hydrationError: error.message });
      throw error;
    }
    if (this.snapshot.hydrationError) this.publish({ hydrationError: null });
    return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  }
  ensureTitles = (items: readonly TitleItem[]): Promise<TitleItem[]> => this.hydrateTitles(items, this.generation);

  search = (query: string): Promise<TitleItem[]> => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return Promise.resolve([]);
    const pending = this.searchRequests.get(cleanQuery);
    if (pending) return pending;
    const request = this.backend.search(cleanQuery).then(async results => {
      const items = results.map(item => this.upsert(primeItem(item)));
      this.publish();
      // Search cards guess content type; resolve metadata before UI type filtering.
      const detailed = await Promise.all(items.map(item => this.getTitleDetails(item.id)));
      // Empty live responses stay empty; local titles never masquerade as results.
      return detailed;
    });
    this.searchRequests.set(cleanQuery, request);
    void request.finally(() => { if (this.searchRequests.get(cleanQuery) === request) this.searchRequests.delete(cleanQuery); }).catch(() => {});
    return request;
  };

  fetchEpisodes = async (seasonId: string): Promise<Episode[]> => {
    const episodes = await this.backend.fetchEpisodes(rawSourceId(seasonId));
    return episodes.map(primeEpisode);
  };

  getMoreLikeThis = async (item: TitleItem): Promise<TitleItem[]> => {
    const details = await this.getTitleDetails(itemId(item));
    return Promise.all((details.suggestions || []).map(suggestion => this.getTitleDetails(suggestion.id)));
  };
}

export const primeCatalogService = new PrimeCatalogService();
export const getPrimeTitle = primeCatalogService.getItemById;

export function filterPrimeItems(items: readonly TitleItem[], filter: PrimeFilter = 'all'): TitleItem[] {
  return items.filter(item => !item.hydrated || filter === 'all' || item.type === (filter === 'movies' ? 'movie' : 'series'));
}

const normalized = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Local filtering of live metadata only; use service.search for authoritative text search. */
export function searchPrimeCatalog(query: string, filter: PrimeFilter = 'all', items: readonly TitleItem[] = primeCatalogService.getSnapshot().items): TitleItem[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return filterPrimeItems(items, filter).filter(item => {
    const haystack = normalized([item.title, item.synopsis, ...(item.genres || []), ...(item.tags || []), ...(item.cast || []), item.creator || ''].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}

export function getPrimeShelves(filter: PrimeFilter = 'all'): PrimeShelf[] {
  return primeCatalogService.getSnapshot().shelves.map(shelf => ({ ...shelf, items: filterPrimeItems(shelf.items, filter) })).filter(shelf => shelf.items.length > 0);
}
