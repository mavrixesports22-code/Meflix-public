import { TitleItem, Shelf, NavTab } from '../types';
import { STARTER_CATALOG, STARTER_SHELVES } from '../data/starterCatalog';
import snapshotData from '../data/catalogSnapshot.json';
import { netmirrorService } from './netmirrorService';

type Listener = () => void;

class CatalogService {
  private allItems: TitleItem[] = [];
  private allShelves: Shelf[] = [];
  private itemMap: Map<string, TitleItem> = new Map();
  private listeners: Set<Listener> = new Set();
  private liveLoaded: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // 1. Add starter catalog items first
    for (const item of STARTER_CATALOG) {
      this.itemMap.set(item.id, item);
      if (item.netmirrorId) {
        this.itemMap.set(item.netmirrorId, item);
      }
    }

    // 2. Merge snapshot items
    const snapshotItems = (snapshotData.items || []) as TitleItem[];
    for (const item of snapshotItems) {
      if (!this.itemMap.has(item.id)) {
        this.itemMap.set(item.id, item);
      }
      if (item.netmirrorId && !this.itemMap.has(item.netmirrorId)) {
        this.itemMap.set(item.netmirrorId, item);
      }
    }

    this.allItems = Array.from(new Set(Array.from(this.itemMap.values())));

    // 3. Build shelves: starter shelves + snapshot shelves
    const snapshotShelves = (snapshotData.shelves || []) as { id: string; title: string; items: string[] }[];
    const combinedShelves: Shelf[] = [...STARTER_SHELVES];

    for (const shelf of snapshotShelves) {
      if (!combinedShelves.some(s => s.id === shelf.id)) {
        combinedShelves.push({
          id: shelf.id,
          title: shelf.title,
          items: shelf.items || [],
        });
      }
    }

    this.allShelves = combinedShelves;
  }

  /**
   * Fetches live catalogue from NetMirror in background
   */
  public async loadLiveCatalogue(): Promise<void> {
    try {
      const live = await netmirrorService.fetchHome();
      if (live && live.shelves && live.shelves.length > 0) {
        // Upsert live items
        for (const item of live.items) {
          const existing = this.itemMap.get(item.id);
          if (existing) {
            Object.assign(existing, item);
          } else {
            this.itemMap.set(item.id, item);
            if (item.netmirrorId) {
              this.itemMap.set(item.netmirrorId, item);
            }
          }
        }

        // Upsert live shelves
        const updatedShelves: Shelf[] = [];
        for (const liveShelf of live.shelves) {
          updatedShelves.push(liveShelf);
        }

        // Preserve any custom shelves like Continue Watching
        for (const existing of this.allShelves) {
          if (existing.id === 'continue-watching' && !updatedShelves.some(s => s.id === 'continue-watching')) {
            updatedShelves.unshift(existing);
          }
        }

        this.allShelves = updatedShelves;
        this.allItems = Array.from(new Set(Array.from(this.itemMap.values())));
        this.liveLoaded = true;
        this.notify();
      }
    } catch {
      // Offline fallback: snapshot remains active
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  }

  public getAllItems(): TitleItem[] {
    return this.allItems;
  }

  public getItemById(id: string): TitleItem | undefined {
    return this.itemMap.get(id);
  }

  public getFeaturedTitle(): TitleItem {
    return this.allItems[0] || STARTER_CATALOG[0];
  }

  public async getTitleDetails(id: string): Promise<TitleItem> {
    const existing = this.getItemById(id);
    if (existing && existing.episodes && existing.episodes.length > 0 && existing.cast && existing.cast.length > 0) {
      return existing;
    }

    try {
      const targetId = existing?.netmirrorId || id.replace(/^nm-/, '');
      const liveDetails = await netmirrorService.fetchTitle(targetId);
      if (existing) {
        Object.assign(existing, liveDetails);
      } else {
        this.itemMap.set(liveDetails.id, liveDetails);
        if (liveDetails.netmirrorId) {
          this.itemMap.set(liveDetails.netmirrorId, liveDetails);
        }
      }
      this.notify();
      return liveDetails;
    } catch {
      return existing || STARTER_CATALOG[0];
    }
  }

  public getShelves(tab: NavTab = 'home', myListIds: string[] = []): { shelf: Shelf; items: TitleItem[] }[] {
    let targetShelves = this.allShelves;

    if (tab === 'tv') {
      targetShelves = this.allShelves.filter(s =>
        s.id.includes('tv') || s.id.includes('series') || s.title.toLowerCase().includes('tv') || s.title.toLowerCase().includes('series')
      );
      if (targetShelves.length === 0) {
        targetShelves = this.allShelves;
      }
    } else if (tab === 'movies') {
      targetShelves = this.allShelves.filter(s =>
        s.id.includes('movie') || s.title.toLowerCase().includes('movie')
      );
      if (targetShelves.length === 0) {
        targetShelves = this.allShelves;
      }
    } else if (tab === 'popular') {
      targetShelves = this.allShelves.filter(s =>
        s.id.includes('trend') || s.id.includes('top-10') || s.isTop10
      );
    } else if (tab === 'my-list') {
      const myListItems = myListIds.map(id => this.getItemById(id)).filter((x): x is TitleItem => Boolean(x));
      return [
        {
          shelf: { id: 'my-list-shelf', title: 'My List', items: myListIds },
          items: myListItems,
        },
      ];
    }

    return targetShelves.map(shelf => {
      let items = shelf.items
        .map(id => this.getItemById(id))
        .filter((x): x is TitleItem => Boolean(x));

      // Filter by type if tab is tv or movies
      if (tab === 'tv') {
        items = items.filter(x => x.type === 'series');
      } else if (tab === 'movies') {
        items = items.filter(x => x.type === 'movie');
      }

      return { shelf, items };
    }).filter(group => group.items.length > 0);
  }

  public search(query: string): TitleItem[] {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    return this.allItems.filter(item => {
      const titleMatch = item.title?.toLowerCase().includes(term);
      const tagMatch = item.tags?.some(t => t.toLowerCase().includes(term));
      const genreMatch = item.genres?.some(g => g.toLowerCase().includes(term));
      const castMatch = item.cast?.some(c => c.toLowerCase().includes(term));
      const creatorMatch = item.creator?.toLowerCase().includes(term);
      return titleMatch || tagMatch || genreMatch || castMatch || creatorMatch;
    }).slice(0, 48);
  }

  public async searchLive(query: string): Promise<TitleItem[]> {
    const local = this.search(query);
    try {
      const remote = await netmirrorService.search(query);
      for (const item of remote) {
        if (!this.itemMap.has(item.id)) {
          this.itemMap.set(item.id, item);
          if (item.netmirrorId) {
            this.itemMap.set(item.netmirrorId, item);
          }
        }
      }
      const combined = [...local];
      for (const r of remote) {
        if (!combined.some(c => c.id === r.id)) {
          combined.push(r);
        }
      }
      return combined;
    } catch {
      return local;
    }
  }

  public getMoreLikeThis(item: TitleItem): TitleItem[] {
    if (item.suggestions && item.suggestions.length > 0) {
      return item.suggestions;
    }
    // Fallback: match by genre or tags
    const genres = new Set(item.genres || []);
    return this.allItems
      .filter(other => other.id !== item.id && other.genres?.some(g => genres.has(g)))
      .slice(0, 12);
  }
}

export const catalogService = new CatalogService();
