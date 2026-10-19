export interface Episode {
  id?: string;
  num: number;
  netmirrorId?: string;
  title: string;
  synopsis?: string;
  duration?: string;
  thumb?: string;
}

export interface Season {
  s: string;
  id: string;
  selected?: boolean;
}

export interface TitleItem {
  id: string;
  netmirrorId?: string;
  title: string;
  type: 'movie' | 'series';
  synopsis: string;
  year?: string;
  maturity?: string;
  duration?: string;
  match?: string;
  resolution?: string;
  audio?: string;
  tags?: string[];
  genres?: string[];
  cast?: string[];
  creator?: string;
  isOriginal?: boolean;
  poster?: string;
  backdrop?: string;
  seasons?: Season[];
  selectedSeason?: string;
  episodes?: Episode[];
  suggestions?: TitleItem[];
  hydrated?: boolean;
}

export interface Shelf {
  id: string;
  title: string;
  badge?: string;
  isTop10?: boolean;
  isVertical?: boolean;
  items: string[]; // array of title IDs
}

export interface WatchHistoryEntry {
  key: string;
  item: {
    id: string;
    netmirrorId?: string;
    title: string;
    type: 'movie' | 'series';
    poster?: string;
    backdrop?: string;
  };
  playId: string;
  seasonId?: string;
  episode?: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

export type NavTab = 'home' | 'tv' | 'movies' | 'popular' | 'my-list' | 'history';

export interface StreamingServiceOption {
  id: string;
  name: string;
  tag: string;
  color: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon?: string;
  avatarImage?: any;
  isKids?: boolean;
  services?: string[]; // array of enabled service IDs: 'netflix' | 'prime' | 'hotstar' | 'appletv' | 'hbomax' | 'jiocinema'
  primaryService?: string;
}

