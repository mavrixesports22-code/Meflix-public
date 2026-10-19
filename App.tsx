import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from './src/theme/colors';
import { TitleItem, Episode, NavTab, WatchHistoryEntry } from './src/types';
import { catalogService } from './src/services/catalogService';
import { netmirrorService } from './src/services/netmirrorService';
import { useMyList } from './src/hooks/useMyList';
import { useWatchHistory } from './src/hooks/useWatchHistory';
import { useTVRemote } from './src/hooks/useTVRemote';

import { TopNavbar } from './src/components/navigation/TopNavbar';
import { MobileTabBar } from './src/components/navigation/MobileTabBar';
import { BillboardHero } from './src/components/home/BillboardHero';
import { ShelfRow } from './src/components/home/ShelfRow';
import { ContinueWatchingRow } from './src/components/home/ContinueWatchingRow';
import { TitleDetailModal } from './src/components/details/TitleDetailModal';
import { NetflixVideoPlayer } from './src/prime/PrimeVideoPlayer';
import { SearchGrid } from './src/components/search/SearchGrid';
import { WatchHistoryScreen } from './src/components/history/WatchHistoryScreen';
import { Toast } from './src/components/common/Toast';
import { Focusable } from './src/components/common/Focusable';
import { deviceAuthService, DeviceAccessRequest } from './src/services/deviceAuthService';
import { DeviceAccessGate } from './src/components/admin/DeviceAccessGate';
import { AdminPanelModal } from './src/components/admin/AdminPanelModal';
import { SplashScreen } from './src/components/splash/SplashScreen';
import { ProfileSelectScreen } from './src/components/profile/ProfileSelectScreen';
import { UserProfile } from './src/types';
import { PrimeVideoApp } from './src/prime/PrimeVideoApp';

export default function App() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Navigation & View State
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'Stranger Things',
    'Arcane',
    'Wednesday',
    'Sci-Fi',
    'Anime',
  ]);

  // Modal & Player State
  const [selectedTitle, setSelectedTitle] = useState<TitleItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playingTitle, setPlayingTitle] = useState<TitleItem | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<Episode | undefined>(undefined);
  const [playingResumePosition, setPlayingResumePosition] = useState<number | undefined>(undefined);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [customToast, setCustomToast] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Cinematic Splash Screen & Welcome Profile Select Screen States
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);

  // Device Security & Authorization State (Invite-Only & IP Protection)
  const [authStatus, setAuthStatus] = useState<
    'checking' | 'approved' | 'pending' | 'rejected' | 'unregistered'
  >('checking');
  const [deviceIp, setDeviceIp] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [existingRequest, setExistingRequest] = useState<DeviceAccessRequest | undefined>(
    undefined
  );
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const checkDeviceAuth = useCallback(async () => {
    try {
      const res = await deviceAuthService.checkDeviceStatus();
      setAuthStatus(res.status);
      setDeviceIp(res.ip);
      setDeviceId(res.deviceId);
      setExistingRequest(res.request);
    } catch {
      setAuthStatus('unregistered');
    }
  }, []);

  useEffect(() => {
    checkDeviceAuth();

    // Subscribe to live real-time authorization changes (instant revocation from admin)
    const unsub = deviceAuthService.subscribeToDeviceStatus((status, req) => {
      setAuthStatus(status);
      if (req) {
        setExistingRequest(req);
        if (req.ip) setDeviceIp(req.ip);
      }
    });

    // Re-verify authorization whenever the app is brought to foreground
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        checkDeviceAuth();
      }
    });

    return () => {
      unsub();
      appStateSub.remove();
    };
  }, [checkDeviceAuth]);

  // Subscribe to live NetMirror catalogue updates
  useEffect(() => {
    return catalogService.subscribe(() => {
      setCatalogVersion(v => v + 1);
    });
  }, []);

  useEffect(() => {
    if (activeProfile?.primaryService === 'netflix') void catalogService.loadLiveCatalogue();
  }, [activeProfile?.primaryService]);

  // Custom Hooks for Storage & State
  const { myList, isInMyList, toggleMyList, toastMessage, clearToast } = useMyList();
  const { entries: historyEntries, continuing, removeEntry, clearHistory, recordProgress } = useWatchHistory();
  const playbackContext = useRef<{ item: TitleItem; episode?: Episode } | null>(null);

  // Featured Billboard Title
  const featuredTitle = useMemo(() => {
    return catalogService.getFeaturedTitle();
  }, [catalogVersion]);

  // Shelves based on current navigation tab
  const shelfGroups = useMemo(() => {
    return catalogService.getShelves(currentTab, myList);
  }, [currentTab, myList, catalogVersion]);

  // Live Search Results
  const [liveSearchResults, setLiveSearchResults] = useState<TitleItem[]>([]);
  useEffect(() => {
    if (!searchQuery.trim()) {
      setLiveSearchResults([]);
      return;
    }
    let active = true;
    catalogService.searchLive(searchQuery).then(results => {
      if (active) setLiveSearchResults(results);
    });
    return () => {
      active = false;
    };
  }, [searchQuery]);

  const searchResults = useMemo(() => {
    if (liveSearchResults.length > 0) return liveSearchResults;
    return catalogService.search(searchQuery);
  }, [searchQuery, liveSearchResults, catalogVersion]);

  // Watch progress map for card progress bars
  const watchProgressMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of historyEntries) {
      if (entry.duration > 0) {
        const percent = Math.min(100, Math.round((entry.position / entry.duration) * 100));
        if (entry.item.netmirrorId) {
          map[entry.item.netmirrorId] = percent;
        }
        if (entry.item.id) {
          map[entry.item.id] = percent;
        }
      }
    }
    return map;
  }, [historyEntries]);

  // Player handlers
  const handlePlayTitle = useCallback((item: TitleItem, episode?: Episode, resumePosition?: number) => {
    playbackContext.current = { item, episode };
    setPlayingTitle(item);
    setPlayingEpisode(episode);
    setPlayingResumePosition(resumePosition);
    setIsPlayerOpen(true);
    setIsModalOpen(false);
  }, []);

  const handleClosePlayer = useCallback(() => {
    setIsPlayerOpen(false);
    setPlayingTitle(null);
    setPlayingEpisode(undefined);
    setPlayingResumePosition(undefined);
  }, []);

  // Detail Modal handlers with NetMirror live metadata hydration
  const handleOpenDetail = useCallback((item: TitleItem) => {
    setSelectedTitle(item);
    setIsModalOpen(true);
    catalogService.getTitleDetails(item.id).then(hydrated => {
      setSelectedTitle(prev => (prev?.id === item.id ? hydrated : prev));
    });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsModalOpen(false);
    setSelectedTitle(null);
  }, []);

  const handleDisconnectService = useCallback(async () => {
    await netmirrorService.disconnect();
    setCustomToast('Disconnected from video service.');
  }, []);

  // Continue Watching Resume handler
  const handleResumeHistory = useCallback((entry: WatchHistoryEntry) => {
    const rawId = entry.item.netmirrorId || entry.item.id.replace(/^nm-/, '');
    const item =
      catalogService.getItemById('nm-' + rawId) ||
      catalogService.getItemById(rawId) ||
      catalogService.getItemById(entry.item.id) || {
        id: entry.item.id,
        netmirrorId: entry.item.netmirrorId || rawId,
        title: entry.item.title,
        type: entry.item.type,
        synopsis: '',
        poster: entry.item.poster,
        backdrop: entry.item.backdrop,
      };

    const targetEp: Episode | undefined = entry.playId
      ? {
          id: 'ep-' + entry.playId,
          netmirrorId: entry.playId,
          num: 1,
          title: entry.episode || 'Episode',
        }
      : undefined;

    handlePlayTitle(item, targetEp, entry.position);
  }, [handlePlayTitle]);

  // Search handlers
  const handleToggleSearch = useCallback(() => {
    setIsSearchOpen(prev => {
      if (prev) {
        setSearchQuery('');
      }
      return !prev;
    });
  }, []);

  const handleSearchSubmit = useCallback((term: string) => {
    setSearchQuery(term);
    setIsSearchOpen(true);
    if (term.trim() && !recentSearches.includes(term.trim())) {
      setRecentSearches(prev => [term.trim(), ...prev.slice(0, 7)]);
    }
  }, [recentSearches]);

  // Hardware TV / Android Back handler
  useTVRemote({
    onBack: () => {
      if (isPlayerOpen) {
        handleClosePlayer();
        return true;
      }
      if (isModalOpen) {
        handleCloseDetail();
        return true;
      }
      if (isSearchOpen || searchQuery) {
        setIsSearchOpen(false);
        setSearchQuery('');
        return true;
      }
      if (currentTab !== 'home') {
        setCurrentTab('home');
        return true;
      }
      return false; // Exit app
    },
  }, activeProfile?.primaryService !== 'prime');

  const categoryTitles: Record<NavTab, { eyebrow: string; title: string; subtitle: string }> = {
    home: { eyebrow: 'FEATURED', title: 'Home', subtitle: '' },
    tv: { eyebrow: 'FIND YOUR NEXT FAVORITE', title: 'TV Shows', subtitle: 'Great stories. One more episode. Something for every mood.' },
    movies: { eyebrow: 'BLOCKBUSTER ENTERTAINMENT', title: 'Movies', subtitle: 'From critically acclaimed hits to big screen spectacles.' },
    popular: { eyebrow: 'TRENDING WORLDWIDE', title: 'New & Popular', subtitle: 'The most watched and talked about movies & series right now.' },
    'my-list': { eyebrow: 'YOUR PERSONAL COLLECTION', title: 'My List', subtitle: 'Your saved watchlist, ready whenever you are.' },
    history: { eyebrow: 'RECENT ACTIVITY', title: 'Watch history', subtitle: '' },
  };

  // 1. Cinematic Splash Screen
  if (isSplashActive) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SplashScreen onFinish={() => setIsSplashActive(false)} minDurationMs={2100} />
      </SafeAreaProvider>
    );
  }

  // 2. Initial Auth Verification State (smooth black transition)
  if (authStatus === 'checking') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SplashScreen onFinish={() => {}} minDurationMs={999999} />
      </SafeAreaProvider>
    );
  }

  // 3. Security Access Gate (Invite-Only & IP Whitelist)
  if (authStatus !== 'approved') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={styles.container}>
          <StatusBar style="light" />
          <DeviceAccessGate
            status={authStatus}
            ip={deviceIp}
            deviceId={deviceId}
            existingRequest={existingRequest}
            onAccessApproved={checkDeviceAuth}
            onOpenAdmin={() => setIsAdminOpen(true)}
          />
          <AdminPanelModal
            visible={isAdminOpen}
            onClose={() => setIsAdminOpen(false)}
            onDeviceApproved={checkDeviceAuth}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  // 4. Welcome Profile Selection Screen ("Who's Watching?")
  if (!activeProfile) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ProfileSelectScreen
          onSelectProfile={profile => setActiveProfile(profile)}
          onOpenAdmin={() => setIsAdminOpen(true)}
        />
        <AdminPanelModal
          visible={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          onDeviceApproved={checkDeviceAuth}
        />
      </SafeAreaProvider>
    );
  }

  if (activeProfile.primaryService === 'prime') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <PrimeVideoApp
          profile={activeProfile}
          onSwitchProfile={() => setActiveProfile(null)}
          onOpenAdmin={() => setIsAdminOpen(true)}
        />
        <AdminPanelModal
          visible={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          onDeviceApproved={checkDeviceAuth}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* Sticky Glassmorphic Top Navbar */}
        <TopNavbar
          currentTab={currentTab}
          onSelectTab={tab => {
            setCurrentTab(tab);
            setIsSearchOpen(false);
            setSearchQuery('');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearchOpen={isSearchOpen}
          onToggleSearch={handleToggleSearch}
          onOpenHistory={() => {
            setCurrentTab('history');
            setIsSearchOpen(false);
          }}
          onShowToast={msg => setCustomToast(msg)}
          onDisconnectService={handleDisconnectService}
          onOpenAdmin={() => setIsAdminOpen(true)}
          activeProfile={activeProfile}
          onSwitchProfile={() => setActiveProfile(null)}
        />

        {/* Main Body Content */}
        <View style={styles.body}>
          {isSearchOpen || searchQuery ? (
            /* Live Search Screen */
            <SearchGrid
              query={searchQuery}
              results={searchResults}
              recentSearches={recentSearches}
              onSelectTitle={handleOpenDetail}
              onSelectRecent={handleSearchSubmit}
              onClearRecent={() => setRecentSearches([])}
            />
          ) : currentTab === 'history' ? (
            /* Watch History Screen */
            <WatchHistoryScreen
              entries={historyEntries}
              onResume={handleResumeHistory}
              onRemove={removeEntry}
              onClear={clearHistory}
              onStartBrowsing={() => setCurrentTab('home')}
            />
          ) : (
            /* Home / TV / Movies / Popular / My List Screen */
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Featured Billboard Hero (Only on Home) */}
              {currentTab === 'home' && (
                <BillboardHero
                  item={featuredTitle}
                  onPlay={handlePlayTitle}
                  onMoreInfo={handleOpenDetail}
                  isInList={isInMyList(featuredTitle.id)}
                  onToggleList={toggleMyList}
                  isMuted={isMuted}
                  onToggleMute={() => setIsMuted(prev => !prev)}
                />
              )}

              {/* Category Browse Heading (When browsing TV Shows, Movies, Popular, My List) */}
              {currentTab !== 'home' && (
                <View style={styles.browseHeading}>
                  <Text style={styles.browseEyebrow}>
                    {categoryTitles[currentTab]?.eyebrow}
                  </Text>
                  <Text style={styles.browseTitle}>
                    {categoryTitles[currentTab]?.title}
                  </Text>
                  <Text style={styles.browseSubtitle}>
                    {categoryTitles[currentTab]?.subtitle}
                  </Text>
                </View>
              )}

              {/* Continue Watching Carousel (Only on Home) */}
              {currentTab === 'home' && continuing.length > 0 && (
                <ContinueWatchingRow
                  entries={continuing}
                  onResume={handleResumeHistory}
                  onRemove={removeEntry}
                  onViewHistory={() => setCurrentTab('history')}
                />
              )}

              {/* Empty My List State */}
              {currentTab === 'my-list' && myList.length === 0 ? (
                <View style={styles.emptyMyList}>
                  <Text style={styles.emptySymbol}>＋</Text>
                  <Text style={styles.emptyEyebrow}>YOUR PERSONAL COLLECTION</Text>
                  <Text style={styles.emptyTitle}>Your next watch, all in one place.</Text>
                  <Text style={styles.emptySubtitle}>
                    Save movies and shows with the + button. They will be waiting for you here.
                  </Text>
                  <Focusable
                    onPress={() => setCurrentTab('home')}
                    style={styles.findBtn}
                  >
                    <Text style={styles.findBtnText}>Find something to watch</Text>
                  </Focusable>
                </View>
              ) : (
                /* Shelves List */
                shelfGroups.map(({ shelf, items }) => (
                  <ShelfRow
                    key={shelf.id}
                    shelf={shelf}
                    items={items}
                    onSelectTitle={handleOpenDetail}
                    watchProgressMap={watchProgressMap}
                  />
                ))
              )}

              {/* Footer */}
              <View style={styles.footer}>
                <Image
                  source={require('./assets/brand/meflix-wordmark.png')}
                  style={styles.footerLogo}
                  resizeMode="contain"
                />
                <Text style={styles.footerTagline}>
                  A good night starts with a great story.
                </Text>
                <View style={styles.footerLinks}>
                  <Focusable onPress={() => setCurrentTab('home')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>Browse</Text>
                  </Focusable>
                  <Focusable onPress={() => setCurrentTab('my-list')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>My List</Text>
                  </Focusable>
                  <Focusable onPress={() => setCurrentTab('history')} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>Watch history</Text>
                  </Focusable>
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Mobile Bottom Tab Bar */}
        {isMobile && (
          <MobileTabBar
            currentTab={currentTab}
            onSelectTab={tab => {
              setCurrentTab(tab);
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
          />
        )}

        {/* Title Details Modal */}
        <TitleDetailModal
          item={selectedTitle}
          visible={isModalOpen}
          onClose={handleCloseDetail}
          onPlay={handlePlayTitle}
          isInList={selectedTitle ? isInMyList(selectedTitle.id) : false}
          onToggleList={toggleMyList}
          onSelectRelated={handleOpenDetail}
        />

        <Modal visible={isPlayerOpen && !!playingTitle} animationType="slide" onRequestClose={handleClosePlayer} presentationStyle="fullScreen">
          {playingTitle && <NetflixVideoPlayer key={`${playingTitle.id}:${playingEpisode?.netmirrorId || playingEpisode?.id || ''}`}
            item={playingTitle} initialEpisode={playingEpisode} resumePosition={playingResumePosition} onClose={handleClosePlayer}
            onResolved={(resolvedItem, resolvedEpisode) => { playbackContext.current = { item: { ...resolvedItem, id: playingTitle.id }, episode: resolvedEpisode }; }}
            onProgress={(position, duration) => {
              const context = playbackContext.current;
              if (!context) return;
              const playId = context.episode?.netmirrorId || context.episode?.id?.replace(/^ep-/, '') || context.item.netmirrorId || context.item.id.replace(/^nm-/, '');
              void recordProgress({ item: context.item, playId, position, duration, seasonId: context.item.selectedSeason, episode: context.episode?.title });
            }} />}
        </Modal>

        {/* Toast Notifications */}
        <Toast
          message={toastMessage || customToast}
          onDismiss={() => {
            clearToast();
            setCustomToast(null);
          }}
        />

        {/* Admin Management Dashboard */}
        <AdminPanelModal
          visible={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          onDeviceApproved={checkDeviceAuth}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  body: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  browseHeading: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 4,
  },
  browseEyebrow: {
    color: Colors.gray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  browseTitle: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  browseSubtitle: {
    color: Colors.grayLight,
    fontSize: 13,
    marginTop: 2,
  },
  emptyMyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptySymbol: {
    color: Colors.red,
    fontSize: 48,
    fontWeight: '900',
  },
  emptyEyebrow: {
    color: Colors.gray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.gray,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 20,
  },
  findBtn: {
    marginTop: 12,
    backgroundColor: Colors.red,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  findBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 32,
  },
  footerLogo: {
    width: 100,
    height: 32,
    opacity: 0.8,
  },
  footerTagline: {
    color: Colors.gray,
    fontSize: 13,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 6,
  },
  footerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  footerBtnText: {
    color: Colors.grayLight,
    fontSize: 13,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 180,
    height: 56,
  },
});
