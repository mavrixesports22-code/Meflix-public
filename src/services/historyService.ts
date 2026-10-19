import { WatchHistoryEntry } from '../types';
import { StorageService } from './storageService';

const HISTORY_KEY = 'meflix_watch_history_v1';

type HistoryListener = (entries: WatchHistoryEntry[]) => void;

class MeflixWatchHistoryService {
  private entries: WatchHistoryEntry[] = [];
  private listeners: Set<HistoryListener> = new Set();
  private initialized = false;

  constructor() {
    this.load();
  }

  public async load(): Promise<WatchHistoryEntry[]> {
    if (this.initialized) return this.entries;
    const saved = await StorageService.getItem<any[]>(HISTORY_KEY, []);
    if (Array.isArray(saved)) {
      this.entries = saved
        .map(entry => this.normalize(entry))
        .filter((entry): entry is WatchHistoryEntry => Boolean(entry))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 100);
    }
    this.initialized = true;
    this.notify();
    return this.entries;
  }

  public normalize(value: any): WatchHistoryEntry | null {
    if (!value || typeof value !== 'object' || !value.item?.title || !value.playId || !value.item.netmirrorId) {
      return null;
    }
    if (typeof value.playId !== 'string' || typeof value.item.netmirrorId !== 'string' || typeof value.item.title !== 'string') {
      return null;
    }

    const text = (v: any, limit = 300) => (typeof v === 'string' ? v.slice(0, limit) : '');
    const position = Number(value.position);
    const duration = Number(value.duration);

    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration < 0) {
      return null;
    }

    const artwork = (v: any) => {
      const s = text(v, 2000);
      return /^https?:\/\//i.test(s) || /^\/(?!\/)/.test(s) ? s : '';
    };

    const item = {
      id: text(value.item.id) || 'nm-' + text(value.item.netmirrorId),
      netmirrorId: text(value.item.netmirrorId),
      title: text(value.item.title),
      type: (value.item.type === 'movie' ? 'movie' : 'series') as 'movie' | 'series',
      poster: artwork(value.item.poster),
      backdrop: artwork(value.item.backdrop),
    };

    const playId = text(value.playId);
    const safePosition = duration ? Math.min(position, duration) : position;
    const completed = value.completed === true || (duration > 0 && safePosition / duration >= 0.95);

    return {
      key: `${item.netmirrorId}:${playId}`,
      item,
      playId,
      seasonId: text(value.seasonId),
      episode: text(value.episode),
      position: safePosition,
      duration,
      completed,
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };
  }

  public async record(value: Partial<WatchHistoryEntry> & { item: any; playId: string; position: number; duration: number }): Promise<WatchHistoryEntry | null> {
    await this.load();
    const entry = this.normalize({ ...value, updatedAt: Date.now() });
    if (!entry) return null;

    this.entries = [entry, ...this.entries.filter(e => e.key !== entry.key)].slice(0, 100);
    await this.persist();
    return entry;
  }

  private async persist(): Promise<void> {
    await StorageService.setItem(HISTORY_KEY, this.entries);
    this.notify();
  }

  public getEntries(): WatchHistoryEntry[] {
    return this.entries;
  }

  public recent(limit = 12): WatchHistoryEntry[] {
    const seen = new Set<string>();
    return this.entries
      .filter(entry => {
        const id = (entry.item.netmirrorId || entry.item.id).replace(/^nm-/, '');
        return !seen.has(id) && Boolean(seen.add(id));
      })
      .slice(0, limit);
  }

  public continuing(limit = 12): WatchHistoryEntry[] {
    return this.recent(100)
      .filter(entry => !entry.completed && entry.position >= 5)
      .slice(0, limit);
  }

  public forTitle(id: string): WatchHistoryEntry | undefined {
    const clean = id.replace(/^nm-/, '');
    return this.recent(100).find(entry => {
      const entryId = (entry.item.netmirrorId || entry.item.id).replace(/^nm-/, '');
      return entryId === clean || entry.playId === clean || entry.item.id === id;
    });
  }

  public async remove(key: string): Promise<void> {
    await this.load();
    this.entries = this.entries.filter(entry => entry.key !== key);
    await this.persist();
  }

  public async clear(): Promise<void> {
    this.entries = [];
    await this.persist();
  }

  public subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.entries);
    }
  }
}

export const historyService = new MeflixWatchHistoryService();
