import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { TitleItem, Shelf, Episode } from '../types';

const SESSION_STORAGE_KEY = 'meflix_netmirror_token';
const DISCOVERY_ENDPOINT = 'https://mobiledetect.app/checknewtv.php';
const DEFAULT_OTP = '111111';

// Cross-platform Base64 decoder with zero external dependencies
function decodeBase64(input: string): string {
  if (typeof atob === 'function') {
    try {
      return atob(input.trim());
    } catch {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, idx = 0; (buffer = str.charAt(idx++)); ) {
    const charIndex = chars.indexOf(buffer);
    if (~charIndex) {
      bs = bc % 4 ? bs * 64 + charIndex : charIndex;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }
  }
  return output;
}

export interface PlaybackSource {
  url: string;
  referer: string;
  title: string;
  episode?: string;
  type: 'hls';
  headers: Record<string, string>;
}

export interface AuthInfo {
  authenticated: boolean;
  instructionImage?: string;
  message?: string;
}

export class NetMirrorService {
  constructor(private readonly provider: 'nf' | 'pv' = 'nf') {}
  private get storageKey() { return this.provider === 'pv' ? 'meflix_netmirror_pv_token' : SESSION_STORAGE_KEY; }
  private validId(id: string) { return (this.provider === 'pv' ? /^[A-Za-z0-9_-]{1,128}$/ : /^\d{1,20}$/).test(id); }
  private sourceId(id: string) { return this.provider === 'pv' ? id.replace(/^pv-/, '') : id.replace(/^nm-/, ''); }
  private cardId(id: string) { return `${this.provider === 'pv' ? 'pv' : 'nm'}-${id}`; }
  private artwork(id: string, template?: string, layout: 'v' | 'h' = 'h') {
    const pattern = template || (this.provider === 'pv' ? 'https://imgcdn.kim/pv/341/------------------.jpg' : `https://imgcdn.kim/poster/${layout}/------------------.jpg`);
    return pattern.replace('------------------', encodeURIComponent(id));
  }
  private activeBaseUrl: string | null = null;
  private discoveryUntil: number = 0;
  private discoveringPromise: Promise<string> | null = null;
  private cachedToken: string | null = null;
  private titleCache: Map<string, TitleItem> = new Map();

  // The upstream does not expose browser CORS. Web uses the existing server's
  // same-origin API and HttpOnly session; native clients use the upstream API.
  private async webApi<T = any>(route: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/${this.provider === 'pv' ? 'prime' : 'netmirror'}/${route}`, {
        method: options.method || 'GET', credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'The video service is unavailable.');
        Object.assign(error, { code: data.code || 'SOURCE_UNAVAILABLE' });
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }

  /**
   * Discovers the dynamic upstream base URL via https://mobiledetect.app/checknewtv.php
   * Replicates DeviceProvider.java and netmirror-service.js exactly.
   */
  public async getBaseUrl(refresh = false): Promise<string> {
    if (refresh) {
      this.activeBaseUrl = null;
      this.discoveryUntil = 0;
    }

    if (this.activeBaseUrl && this.discoveryUntil > Date.now()) {
      return this.activeBaseUrl;
    }

    if (this.discoveringPromise) {
      return this.discoveringPromise;
    }

    this.discoveringPromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(DISCOVERY_ENDPOINT, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Discovery failed with status ${response.status}`);
        }

        const data = await response.json();
        const decoded = decodeBase64(data.token_hash || '');
        if (!decoded || !decoded.startsWith('http')) {
          throw new Error('Invalid discovery payload received');
        }

        // Extract origin (e.g., https://tv.imgcdn.kim)
        const parsed = new URL(decoded);
        this.activeBaseUrl = parsed.origin;
        this.discoveryUntil = Date.now() + 300000; // Cache for 5 minutes
        return this.activeBaseUrl;
      } catch (error) {
        // Fallback to verified upstream if discovery host is temporarily unreachable
        if (!this.activeBaseUrl) {
          this.activeBaseUrl = 'https://tv.imgcdn.kim';
          this.discoveryUntil = Date.now() + 60000;
        }
        return this.activeBaseUrl;
      } finally {
        this.discoveringPromise = null;
      }
    })();

    return this.discoveringPromise;
  }

  /**
   * Retrieves the saved session token from storage or memory
   */
  public async getSessionToken(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    try {
      const stored = await AsyncStorage.getItem(this.storageKey);
      if (stored) {
        this.cachedToken = stored;
        return stored;
      }
    } catch {}
    return '';
  }

  /**
   * Persists the session token
   */
  public async setSessionToken(token: string): Promise<void> {
    this.cachedToken = token;
    try {
      if (token) {
        await AsyncStorage.setItem(this.storageKey, token);
      } else {
        await AsyncStorage.removeItem(this.storageKey);
      }
    } catch {}
  }

  /**
   * Clears authenticated session
   */
  public async clearSession(): Promise<void> {
    if (Platform.OS === 'web') await this.webApi('auth', { method: 'DELETE' });
    this.cachedToken = null;
    try {
      await AsyncStorage.removeItem(this.storageKey);
    } catch {}
  }

  /**
   * Core authenticated API requester
   */
  private async api<T = any>(
    route: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const base = await this.getBaseUrl();
    const token = await this.getSessionToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Ott: this.provider,
      Usertoken: token || 'none',
      ...options.headers,
    };

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(`${base}/newtv/${route}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error_msg || 'The video service is unavailable.');
        Object.assign(error, { code: response.status === 401 ? 'AUTH_REQUIRED' : 'SOURCE_UNAVAILABLE' });
        throw error;
      }
      if (this.provider === 'pv' && data.ott && data.ott !== 'pv') throw new Error('The source returned a different content provider.');
      return data;
    } catch (error: any) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') {
        throw new Error('The video service took too long to respond.');
      }
      throw error;
    }
  }

  /**
   * Fetch auth instructions (OTP instructions image & message)
   */
  public async getAuthInstructions(): Promise<AuthInfo> {
    if (Platform.OS === 'web') return this.webApi<AuthInfo>('auth');
    try {
      const token = await this.getSessionToken();
      const info = await this.api('otp.php');
      const image = info?.pub_msg_img?.img || '';
      return {
        authenticated: Boolean(token),
        instructionImage: image,
        message: info?.pub_msg || 'Enter the login code shown below.',
      };
    } catch (err: any) {
      return {
        authenticated: false,
        instructionImage: 'https://tv.imgcdn.kim/otp2.jpg',
        message: 'Enter the login code shown below.',
      };
    }
  }

  /**
   * Authenticate with OTP code (e.g. '111111' or user entered code)
   */
  public async authenticate(otpCode: string): Promise<{ authenticated: boolean; token: string }> {
    if (Platform.OS === 'web') {
      const code = otpCode.trim();
      if (!/^\d{4,10}$/.test(code)) throw new Error('Enter the code shown in the login instructions.');
      const result = await this.webApi<{ authenticated: boolean }>('auth', { method: 'POST', body: { otp: code } });
      return { authenticated: result.authenticated, token: '' };
    }
    const cleanOtp = (otpCode || (this.provider === 'nf' ? DEFAULT_OTP : '')).trim();
    if (!/^\d{4,10}$/.test(cleanOtp)) {
      throw new Error('Enter the code shown in the login instructions.');
    }

    const result = await this.api('otp.php', {
      method: 'POST',
      headers: { Otp: cleanOtp },
      body: { otp: cleanOtp },
    });

    if (result.status === 'ok' && result.usertoken) {
      await this.setSessionToken(String(result.usertoken));
      return { authenticated: true, token: String(result.usertoken) };
    }

    throw new Error(result.error_msg || 'That login code was not accepted. Check the code and retry.');
  }

  /**
   * Disconnect video service
   */
  public async disconnect(): Promise<void> {
    await this.clearSession();
  }

  /**
   * Fetches live catalogue home: slider (featured) and post (shelves)
   */
  public async fetchHome(): Promise<{
    shelves: Shelf[];
    items: TitleItem[];
    featured: string[];
    stale: boolean;
  }> {
    if (Platform.OS === 'web') {
      const home = await this.webApi<any>('home');
      return { ...home, items: (home.items || []).map((item: any) => ({ ...item, type: item.type === 'series' ? 'series' : 'movie', hydrated: Boolean(item.hydrated) })) };
    }
    const data = await this.api('main.php');
    if (!data || !Array.isArray(data.post)) {
      throw new Error('NetMirror did not return any catalogue shelves.');
    }

    const imgcdnV = data.imgcdn_v || 'https://imgcdn.kim/poster/v/------------------.jpg';
    if (this.provider === 'pv' && data.ott !== 'pv') throw new Error('The source did not return a Prime Video catalog.');
    const imgcdnH = (this.provider === 'pv' ? data.imgcdn_h || data.imgcdn : data.detailsimgcdn || data.imgcdn_h) || 'https://imgcdn.kim/poster/h/------------------.jpg';

    const parseIds = (raw: any): string[] => {
      if (Array.isArray(raw)) {
        return raw.map(x => String(x?.id || x || '')).filter(x => this.validId(x));
      }
      return String(raw || '')
        .split(',')
        .map(x => x.trim())
        .filter(x => this.validId(x));
    };

    const buildPoster = (id: string, layout: 'v' | 'h' = 'v'): string => {
      const template = this.provider === 'pv' ? imgcdnH : layout === 'v' ? imgcdnV : imgcdnH;
      if (template.includes('------------------')) {
        return template.replace('------------------', id);
      }
      return `https://imgcdn.kim/poster/${layout}/${id}.jpg`;
    };

    const allCards = new Map<string, TitleItem>();

    // Process featured slider
    const featuredIds: string[] = [];
    if (Array.isArray(data.slider)) {
      for (const item of data.slider) {
        const id = String(item.id || '');
        if (this.validId(id)) {
          featuredIds.push(this.cardId(id));
          allCards.set(this.cardId(id), {
            id: this.cardId(id),
            netmirrorId: id,
            title: item.title || 'Featured Title',
            synopsis: item.desc || '',
            poster: buildPoster(id, 'v'),
            backdrop: item.img || buildPoster(id, 'h'),
            maturity: item.ua || 'U/A 16+',
            type: 'series',
            year: '',
            duration: '',
            isOriginal: true,
            genres: [],
            tags: [],
            cast: [],
            creator: '',
            episodes: [],
            hydrated: false,
          });
        }
      }
    }

    // Process shelves
    const shelves: Shelf[] = [];
    data.post.forEach((row: any, index: number) => {
      const ids = parseIds(row.ids);
      if (ids.length === 0) return;

      const title = String(row.cate || 'Discover').replace(/netflix/gi, 'Meflix');
      const isTop10 = /top\s*10/i.test(title);
      const isVertical = row.row === 'v' || isTop10;

      const itemIds: string[] = [];
      ids.forEach(id => {
        const cardId = this.cardId(id);
        itemIds.push(cardId);
        if (!allCards.has(cardId)) {
          allCards.set(cardId, {
            id: cardId,
            netmirrorId: id,
            title: 'Title ' + id,
            synopsis: '',
            poster: buildPoster(id, 'v'),
            backdrop: buildPoster(id, 'h'),
            maturity: 'U/A 16+',
            type: isVertical ? 'series' : 'movie',
            year: '',
            duration: '',
            genres: [],
            tags: [],
            cast: [],
            creator: '',
            episodes: [],
            hydrated: false,
          });
        }
      });

      shelves.push({
        id: `live-${index}`,
        title,
        items: itemIds,
        isTop10,
        isVertical,
      });
    });

    return {
      shelves,
      items: Array.from(allCards.values()),
      featured: featuredIds,
      stale: Boolean(data.stale),
    };
  }

  /**
   * Fetches detailed metadata for a title (seasons, episodes, crew, cast, suggestions)
   */
  public async fetchTitle(id: string): Promise<TitleItem> {
    const cleanId = this.sourceId(id);
    if (!this.validId(cleanId)) throw new Error('Choose a valid title.');
    if (this.titleCache.has(cleanId)) {
      return this.titleCache.get(cleanId)!;
    }

    if (Platform.OS === 'web') {
      const data = await this.webApi<any>(`title?id=${encodeURIComponent(cleanId)}`);
      const card: TitleItem = { ...data.card, hydrated: true };
      this.titleCache.set(cleanId, card);
      return card;
    }

    const data = await this.api(`post.php?id=${cleanId}`);
    if (!data || !data.title) {
      throw new Error('Title details are unavailable.');
    }

    const details = (key: string): string => {
      const entry = (data.moredetails || []).find((x: any) => String(x.k || '').toLowerCase() === key.toLowerCase());
      return entry?.v || '';
    };

    const splitList = (raw: string): string[] => {
      return raw.split(',').map(x => x.trim()).filter(Boolean);
    };

    const seasons = (data.season || []).filter((s: any) => s && this.validId(String(s.id))).map((s: any) => ({
      id: String(s.id),
      s: s.s || `Season ${s.id}`,
      selected: Boolean(s.selected),
    }));

    const episodes: Episode[] = (data.episodes || []).filter((ep: any) => ep && this.validId(String(ep.id))).map((ep: any) => {
      const duration = (ep.info || []).find((str: string) => /m$/.test(str)) || '';
      return {
        id: 'ep-' + ep.id,
        netmirrorId: String(ep.id),
        num: Number(ep.ep) || 1,
        title: ep.t || `Episode ${ep.ep}`,
        synopsis: ep.ep_desc || '',
        duration,
        thumb: this.artwork(this.provider === 'pv' ? String(ep.id) : cleanId, data.ep_poster),
      };
    });

    const suggestions = (data.suggest || [])
      .map((s: any) => String(s?.id || s || ''))
      .filter((otherId: string) => this.validId(otherId) && otherId !== cleanId);

    const titleItem: TitleItem = {
      id: this.cardId(cleanId),
      netmirrorId: cleanId,
      title: data.title,
      synopsis: data.desc || '',
      year: data.year || '',
      maturity: data.ua || 'U/A 16+',
      duration: data.runtime || '',
      resolution: data.hdsd || 'HD',
      type: data.type === 't' ? 'series' : 'movie',
      poster: this.artwork(cleanId, this.provider === 'pv' ? data.morelike_poster : undefined, 'v'),
      backdrop: this.artwork(cleanId, data.main_poster),
      genres: splitList(details('genre') || details('IMDB Genres')),
      cast: splitList(details('cast')),
      tags: splitList(details('this movie is')),
      creator: details('creator') || details('director') || '',
      seasons,
      selectedSeason: seasons.find((s: any) => s.selected)?.id || seasons[0]?.id,
      episodes,
      suggestions: suggestions.map((otherId: string) => ({
        id: this.cardId(otherId),
        netmirrorId: otherId,
        title: '',
        synopsis: '',
        type: 'movie',
        poster: this.artwork(otherId, data.morelike_poster, 'v'),
        backdrop: this.artwork(otherId, data.morelike_poster),
      })),
      hydrated: true,
    };

    this.titleCache.set(cleanId, titleItem);
    return titleItem;
  }

  /**
   * Fetches episodes for a specific season
   */
  public async fetchEpisodes(seasonId: string): Promise<Episode[]> {
    const cleanId = this.sourceId(seasonId);
    if (!this.validId(cleanId)) throw new Error('Choose a valid season.');
    const data = Platform.OS === 'web'
      ? await this.webApi<any>(`episodes?id=${encodeURIComponent(cleanId)}`)
      : await this.api(`episodes.php?id=${cleanId}`);
    if (!data || !Array.isArray(data.episodes)) {
      throw new Error('No episodes found for this season.');
    }

    return data.episodes.filter((ep: any) => ep && this.validId(String(ep.id))).map((ep: any) => {
      const duration = (ep.info || []).find((str: string) => /m$/.test(str)) || '';
      return {
        id: 'ep-' + ep.id,
        netmirrorId: String(ep.id),
        num: Number(ep.ep) || 1,
        title: ep.t || `Episode ${ep.ep}`,
        synopsis: ep.ep_desc || '',
        duration,
        thumb: this.artwork(this.provider === 'pv' ? String(ep.id) : cleanId, this.provider === 'pv' ? 'https://imgcdn.kim/pvepimg/341/------------------.jpg' : undefined),
      };
    });
  }

  /**
   * Live search query
   */
  public async search(query: string): Promise<TitleItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    if (Platform.OS === 'web') {
      const data = await this.webApi<any>(`search?q=${encodeURIComponent(cleanQuery)}`);
      return (data.items || []).map((item: any) => ({ ...item, type: item.type === 'series' ? 'series' : 'movie', hydrated: Boolean(item.hydrated) }));
    }

    const data = await this.api(`search.php?s=${encodeURIComponent(cleanQuery)}`);
    const results = data.searchResult || [];

    return results
      .filter((x: any) => x && this.validId(String(x.id)))
      .map((x: any) => {
        const id = String(x.id);
        return {
          id: this.cardId(id),
          netmirrorId: id,
          title: x.t || 'Search Result',
          synopsis: '',
          poster: this.artwork(id, undefined, 'v'),
          backdrop: this.artwork(id),
          type: 'movie',
          genres: [],
          tags: [],
          cast: [],
          creator: '',
          episodes: [],
          hydrated: false,
        } as TitleItem;
      });
  }

  /**
   * Resolves the real HLS playback URL from player.php
   * Automatically attempts silent authentication with default code '111111' if needed.
   */
  public async getPlaybackSource(id: string, forceFresh: boolean = false, requireExistingSession = false): Promise<PlaybackSource> {
    const cleanId = this.sourceId(id);
    if (!this.validId(cleanId)) throw new Error('Choose a valid video.');
    if (this.provider === 'pv') requireExistingSession = true;

    if (Platform.OS === 'web') {
      const data = await this.webApi<any>(`playback?id=${encodeURIComponent(cleanId)}`);
      return { url: data.url, title: data.title || '', episode: data.episode === 'MOVIE' ? undefined : data.episode, type: 'hls', referer: '', headers: {} };
    }

    // Invalidate cached token when requesting a fresh stream
    if (forceFresh) {
      this.cachedToken = null;
    }

    let token = await this.getSessionToken();
    if (requireExistingSession && !token) {
      const error = new Error('Connect to video service to continue.');
      Object.assign(error, { code: 'AUTH_REQUIRED' });
      throw error;
    }

    // If no token exists yet or forced fresh, try default silent auth
    if (!requireExistingSession && (!token || forceFresh)) {
      try {
        const authResult = await this.authenticate(DEFAULT_OTP);
        token = authResult.token;
      } catch {}
    }

    // Call player.php
    let result = await this.api(`player.php?id=${cleanId}`);

    // If session expired or requires OTP, attempt renewal or throw AUTH_REQUIRED
    if (result.status === 'otp' && !requireExistingSession) {
      try {
        const renewed = await this.authenticate(DEFAULT_OTP);
        token = renewed.token;
        result = await this.api(`player.php?id=${cleanId}`);
      } catch {
        await this.clearSession();
        const authErr = new Error('Connect to video service to continue.');
        (authErr as any).code = 'AUTH_REQUIRED';
        throw authErr;
      }
    }

    if (result.status === 'otp') {
      await this.clearSession();
      const authErr = new Error('Connect to video service to continue.');
      (authErr as any).code = 'AUTH_REQUIRED';
      throw authErr;
    }

    if (result.status !== 'ok' || !result.video_link) {
      const err = new Error('This video is currently unavailable from the service.');
      (err as any).code = 'SOURCE_UNAVAILABLE';
      throw err;
    }

    // Enforce HTTPS to prevent iOS App Transport Security (ATS) from blocking chunks (-16190)
    let videoUrl = String(result.video_link).trim();
    if (videoUrl.startsWith('http://') && !videoUrl.includes('localhost') && !videoUrl.includes('127.0.0.1')) {
      videoUrl = videoUrl.replace(/^http:\/\//i, 'https://');
    }

    const rawReferer = result.referer || 'https://net52.cc';
    const referer = rawReferer.endsWith('/') ? rawReferer : `${rawReferer}/`;
    const origin = referer.replace(/\/+$/, '');

    return {
      url: videoUrl,
      referer,
      title: result.title || '',
      episode: result.ep_title && result.ep_title !== 'MOVIE' ? result.ep_title : undefined,
      type: 'hls',
      headers: {
        Referer: referer,
        Origin: origin,
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        Accept: '*/*',
        Ott: this.provider,
      },
    };
  }

  /**
   * Seamlessly resolves the playable stream, title metadata, episode list, and resume position.
   * Matches netmirror-player.js architecture:
   * 1. Resolves NetMirror ID (searches catalogue if missing).
   * 2. If series: loads seasons/episodes, matches requested or saved resume episode, and plays that episode.
   * 3. If movie: plays movie directly.
   * 4. Determines exact resume timestamp from watch history.
   */
  public async resolvePlayableTitle(
    item: TitleItem,
    requestedEpisode?: Episode,
    preferredPosition?: number,
    forceFresh: boolean = false,
    requireExistingSession = false
  ): Promise<PlaybackResolution> {
    let cleanId = item.netmirrorId ? this.sourceId(item.netmirrorId) : '';
    if (this.provider === 'pv' && !this.validId(cleanId)) throw new Error('This title has no valid Prime Video source ID.');

    // If ID is missing or non-numeric, search catalogue by title
    if (!cleanId || !this.validId(cleanId)) {
      try {
        const results = await this.search(item.title);
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match =
          results.find(r => norm(r.title) === norm(item.title)) ||
          results.find(r => r.title.toLowerCase().includes(item.title.toLowerCase())) ||
          results[0];
        if (match && match.netmirrorId) {
          cleanId = match.netmirrorId;
          item.netmirrorId = cleanId;
        }
      } catch {}
    }

    if (!cleanId) {
      cleanId = this.sourceId(item.id);
    }

    // If explicit episode netmirrorId provided
    if (requestedEpisode?.netmirrorId && this.validId(requestedEpisode.netmirrorId)) {
      const source = await this.getPlaybackSource(requestedEpisode.netmirrorId, forceFresh, requireExistingSession);
      const resumePos = preferredPosition !== undefined ? preferredPosition : 0;
      return {
        source,
        item,
        currentEpisode: requestedEpisode,
        allEpisodes: item.episodes || [],
        resumePosition: resumePos,
      };
    }

    // Fetch full title metadata to see if it's a series or movie
    let titleDetails: TitleItem;
    try {
      titleDetails = await this.fetchTitle(cleanId);
    } catch {
      titleDetails = item;
    }

    const isSeries =
      titleDetails.type === 'series' ||
      Boolean(titleDetails.seasons && titleDetails.seasons.length > 0) ||
      Boolean(titleDetails.episodes && titleDetails.episodes.length > 0);

    let targetPlayableId = cleanId;
    let targetEpisode: Episode | undefined = requestedEpisode;
    let episodesList = titleDetails.episodes || item.episodes || [];

    if (isSeries) {
      // If title has seasons but episodes are empty, load episodes for first/selected season
      if ((!episodesList || episodesList.length === 0) && titleDetails.seasons && titleDetails.seasons.length > 0) {
        const seasonId = titleDetails.selectedSeason || titleDetails.seasons[0].id;
        try {
          episodesList = await this.fetchEpisodes(seasonId);
          titleDetails.episodes = episodesList;
        } catch {}
      }

      if (episodesList.length > 0) {
        if (targetEpisode) {
          const matched = episodesList.find(
            ep => ep.netmirrorId === targetEpisode!.netmirrorId || ep.num === targetEpisode!.num
          );
          if (matched) {
            targetEpisode = matched;
          }
        } else {
          // Take first episode
          targetEpisode = episodesList[0];
        }

        if (targetEpisode?.netmirrorId) {
          targetPlayableId = targetEpisode.netmirrorId;
        }
      }
    }

    const source = await this.getPlaybackSource(targetPlayableId, forceFresh, requireExistingSession);

    return {
      source,
      item: {
        ...item,
        ...titleDetails,
        episodes: episodesList,
      },
      currentEpisode: targetEpisode,
      allEpisodes: episodesList,
      resumePosition: preferredPosition || 0,
    };
  }

  /** Prime shares the configured service/session but never submits a default OTP. */
  public resolveAuthorizedTitle(item: TitleItem, episode?: Episode, position?: number, forceFresh = false): Promise<PlaybackResolution> {
    return this.resolvePlayableTitle(item, episode, position, forceFresh, true);
  }
}

export interface PlaybackResolution {
  source: PlaybackSource;
  item: TitleItem;
  currentEpisode?: Episode;
  allEpisodes: Episode[];
  resumePosition: number;
}

export const netmirrorService = new NetMirrorService();

