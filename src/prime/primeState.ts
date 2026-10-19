import type { Episode, TitleItem } from '../types';

export type PrimeQuality = 'best' | 'better' | 'good';
export interface PrimePreferences {
  autoplay: boolean;
  streamWifiOnly: boolean;
  downloadWifiOnly: boolean;
  streamingQuality: PrimeQuality;
  downloadQuality: PrimeQuality;
  audioLanguage: string;
  subtitleLanguage: string;
}

export const DEFAULT_PRIME_PREFERENCES: PrimePreferences = {
  autoplay: true,
  streamWifiOnly: false,
  downloadWifiOnly: true,
  streamingQuality: 'best',
  downloadQuality: 'better',
  audioLanguage: 'English',
  subtitleLanguage: 'Off',
};

export interface PrimeProgress {
  key: string;
  titleId: string;
  episodeId?: string;
  episodeNumber?: number;
  seasonId?: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

export interface PrimeLibrarySnapshot {
  loaded: boolean;
  watchlist: string[];
  history: PrimeProgress[];
  sources: Record<string, string>;
  preferences: PrimePreferences;
  storageError: string | null;
}

/** Small interface keeps persistence testable without loading React Native. */
export interface PrimeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

export function primeStorageKeys(profileId: string) {
  const prefix = `meflix:prime:v1:profile:${encodeURIComponent(profileId || 'default')}`;
  return {
    watchlist: `${prefix}:watchlist`,
    history: `${prefix}:history`,
    preferences: `${prefix}:preferences`,
    sources: `${prefix}:sources`,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizePrimeWatchlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string =>
    typeof id === 'string' && id.startsWith('prime-') && id.length <= 300))].slice(0, 500);
}

export function normalizePrimeSource(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4000 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url.toString() : null;
  } catch { return null; }
}

export function normalizePrimeSources(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries: [string, string][] = [];
  for (const [id, candidate] of Object.entries(value).slice(0, 500)) {
    const source = normalizePrimeSource(candidate);
    if (normalizePrimeWatchlist([id]).length && source) entries.push([id, source]);
  }
  return Object.fromEntries(entries);
}

export function normalizePrimePreferences(value: unknown): PrimePreferences {
  const result = { ...DEFAULT_PRIME_PREFERENCES };
  if (!isRecord(value)) return result;
  for (const key of ['autoplay', 'streamWifiOnly', 'downloadWifiOnly'] as const) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  for (const key of ['streamingQuality', 'downloadQuality'] as const) {
    if (value[key] === 'best' || value[key] === 'better' || value[key] === 'good') {
      result[key] = value[key];
    }
  }
  for (const key of ['audioLanguage', 'subtitleLanguage'] as const) {
    if (typeof value[key] === 'string' && value[key].trim()) result[key] = value[key].trim().slice(0, 60);
  }
  return result;
}

export function normalizePrimeProgress(value: unknown): PrimeProgress | null {
  if (!isRecord(value) || typeof value.titleId !== 'string' || !value.titleId.startsWith('prime-')) return null;
  if (typeof value.position !== 'number' || !Number.isFinite(value.position) || value.position < 0 ||
    typeof value.duration !== 'number' || !Number.isFinite(value.duration) || value.duration < 0) return null;
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId.slice(0, 300) : undefined;
  const position = value.duration > 0 ? Math.min(value.position, value.duration) : value.position;
  return {
    key: JSON.stringify([value.titleId, episodeId || 'movie']),
    titleId: value.titleId,
    episodeId,
    episodeNumber: typeof value.episodeNumber === 'number' && Number.isInteger(value.episodeNumber) && value.episodeNumber > 0
      ? value.episodeNumber : undefined,
    seasonId: typeof value.seasonId === 'string' ? value.seasonId.slice(0, 300) : undefined,
    position,
    duration: value.duration,
    completed: value.completed === true || (value.duration > 0 && position / value.duration >= 0.95),
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0
      ? value.updatedAt : 0,
  };
}

export function normalizePrimeHistory(value: unknown): PrimeProgress[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, PrimeProgress>();
  for (const candidate of value) {
    const entry = normalizePrimeProgress(candidate);
    if (entry && (!byKey.has(entry.key) || byKey.get(entry.key)!.updatedAt < entry.updatedAt)) byKey.set(entry.key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
}

export function primeContinuing(history: readonly PrimeProgress[]): PrimeProgress[] {
  const seen = new Set<string>();
  return history.filter(entry => {
    if (seen.has(entry.titleId)) return false;
    seen.add(entry.titleId);
    return !entry.completed && entry.position >= 5;
  });
}

type Mutation = (snapshot: PrimeLibrarySnapshot) => PrimeLibrarySnapshot;

/** Replays edits made during hydration and serializes writes so old data cannot win. */
export class PrimeLibraryStore {
  private snapshot: PrimeLibrarySnapshot = {
    loaded: false, watchlist: [], history: [], sources: {}, preferences: { ...DEFAULT_PRIME_PREFERENCES }, storageError: null,
  };
  private readonly keys: ReturnType<typeof primeStorageKeys>;
  private listeners = new Set<() => void>();
  private pending: Mutation[] = [];
  private loading?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();

  constructor(private storage: PrimeStorage, profileId: string) {
    this.keys = primeStorageKeys(profileId);
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: PrimeLibrarySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }

  load = (): Promise<void> => {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const read = async (key: string): Promise<unknown> => {
        try {
          const raw = await this.storage.getItem(key);
          return raw === null ? undefined : JSON.parse(raw);
        } catch {
          this.publish({ ...this.snapshot, storageError: 'Some saved Prime preferences could not be loaded.' });
          return undefined;
        }
      };
      const [watchlist, history, preferences, sources] = await Promise.all([
        read(this.keys.watchlist), read(this.keys.history), read(this.keys.preferences), read(this.keys.sources),
      ]);
      let loaded: PrimeLibrarySnapshot = {
        loaded: true,
        watchlist: normalizePrimeWatchlist(watchlist),
        history: normalizePrimeHistory(history),
        sources: normalizePrimeSources(sources),
        preferences: normalizePrimePreferences(preferences),
        storageError: this.snapshot.storageError,
      };
      const hadPending = this.pending.length > 0;
      for (const mutation of this.pending) loaded = mutation(loaded);
      this.pending = [];
      this.publish(loaded);
      if (hadPending) this.persist();
    })();
    return this.loading;
  };

  private mutate(mutation: Mutation) {
    if (!this.snapshot.loaded) this.pending.push(mutation);
    this.publish(mutation(this.snapshot));
    if (this.snapshot.loaded) this.persist();
    else void this.load();
  }
  private persist() {
    // Capture the payload now; queue writes in interaction order.
    const payload = {
      watchlist: JSON.stringify(this.snapshot.watchlist),
      history: JSON.stringify(this.snapshot.history),
      preferences: JSON.stringify(this.snapshot.preferences),
      sources: JSON.stringify(this.snapshot.sources),
    };
    this.writes = this.writes.then(async () => {
      try {
        const results = await Promise.allSettled([
          this.storage.setItem(this.keys.watchlist, payload.watchlist),
          this.storage.setItem(this.keys.history, payload.history),
          this.storage.setItem(this.keys.preferences, payload.preferences),
          this.storage.setItem(this.keys.sources, payload.sources),
        ]);
        if (results.some(result => result.status === 'rejected')) throw new Error('Persistence failed');
        if (this.snapshot.storageError) this.publish({ ...this.snapshot, storageError: null });
      } catch {
        this.publish({ ...this.snapshot, storageError: 'Changes are available now but could not be saved on this device.' });
      }
    });
  }
  flush = async () => { await this.load(); await this.writes; };

  toggleWatchlist = (id: string) => {
    if (!normalizePrimeWatchlist([id]).length) return;
    const shouldAdd = !this.snapshot.watchlist.includes(id);
    this.mutate(state => ({ ...state, watchlist: shouldAdd
      ? normalizePrimeWatchlist([id, ...state.watchlist]) : state.watchlist.filter(saved => saved !== id) }));
  };
  clearWatchlist = () => this.mutate(state => ({ ...state, watchlist: [] }));
  updatePreferences = (patch: Partial<PrimePreferences>) => {
    this.mutate(state => ({ ...state, preferences: normalizePrimePreferences({ ...state.preferences, ...patch }) }));
  };
  recordProgress = (item: TitleItem, position: number, duration: number, episode?: Episode, seasonId?: string) => {
    const entry = normalizePrimeProgress({
      titleId: item.id,
      episodeId: episode ? (episode.id || `${seasonId || '1'}:${episode.num}`) : undefined,
      episodeNumber: episode?.num, seasonId, position, duration, updatedAt: Date.now(),
    });
    if (!entry) return;
    this.mutate(state => ({ ...state, history: normalizePrimeHistory([entry, ...state.history.filter(old => old.key !== entry.key)]) }));
  };
  removeProgress = (key: string) => this.mutate(state => ({ ...state, history: state.history.filter(entry => entry.key !== key) }));
  clearHistory = () => this.mutate(state => ({ ...state, history: [] }));
  /** Direct URLs are supplied by the user; no provider discovery or DRM resolution. */
  setSource = (id: string, value: string | null): boolean => {
    if (!normalizePrimeWatchlist([id]).length) return false;
    const source = value === null || value.trim() === '' ? null : normalizePrimeSource(value);
    if (value !== null && value.trim() !== '' && !source) return false;
    this.mutate(state => {
      const sources = { ...state.sources };
      const changed = sources[id] !== (source || undefined);
      if (source) sources[id] = source;
      else delete sources[id];
      // A replacement file has a different timeline. Preserve progress for all
      // other movies/episodes, but never seek a new source to the old file's time.
      const history = changed ? state.history.filter(entry =>
        entry.episodeId !== id && !(entry.titleId === id && !entry.episodeId)) : state.history;
      return { ...state, sources, history };
    });
    return true;
  };
}
