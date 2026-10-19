import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TitleItem, Episode, UserProfile } from '../types';
import { Focusable } from '../components/common/Focusable';
import { BackIcon, CheckIcon, CloseIcon, HomeIcon, PlayIcon, PlusIcon, SearchIcon, SettingsIcon, UserIcon } from '../components/common/Icons';
import { useTVRemote } from '../hooks/useTVRemote';
import { PrimeColors as C } from './primeTheme';
import { MeflixLogo, PrimeArtwork, PrimeButton, PrimeCard, PrimeEmpty } from './PrimeComponents';
import { PrimeFilter, filterPrimeItems, getPrimeTitle } from './primeCatalog';
import { usePrimeCatalog } from './usePrimeCatalog';
import { usePrimeLibrary } from './usePrimeLibrary';
import { PrimeVideoPlayer } from './PrimeVideoPlayer';

type Page = 'home' | 'find' | 'stuff' | 'settings';
type DetailTab = 'episodes' | 'related' | 'details';
const NAV: { id: Page; title: string; icon: string }[] = [
  { id: 'home', title: 'Home', icon: '⌂' }, { id: 'find', title: 'Search', icon: 'search' },
  { id: 'stuff', title: 'My List', icon: 'user' },
];

export function PrimeVideoApp({ profile, onSwitchProfile, onOpenAdmin }: {
  profile: UserProfile; onSwitchProfile: () => void; onOpenAdmin?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 768;
  const gutter = compact ? 18 : 48;
  const cardWidth = compact ? Math.min(238, width * 0.63) : 278;
  const gridColumns = width < 600 ? 2 : width < 1100 ? 3 : 5;
  const gridWidth = (width - gutter * 2 - (gridColumns - 1) * 12) / gridColumns;
  const library = usePrimeLibrary(profile.id);
  const catalog = usePrimeCatalog();
  const [page, setPage] = useState<Page>('home');
  const [filter, setFilter] = useState<PrimeFilter>('all');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [selected, setSelected] = useState<TitleItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('episodes');
  const [playing, setPlaying] = useState<{ item: TitleItem; episode?: Episode } | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [rowWindows, setRowWindows] = useState<Record<string, number>>({});
  const [collection, setCollection] = useState<{ title: string; items: TitleItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [searchState, setSearchState] = useState<{ query: string; status: 'idle' | 'loading' | 'ready' | 'error'; items: TitleItem[]; error: string }>({ query: '', status: 'idle', items: [], error: '' });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [related, setRelated] = useState<TitleItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [seasonLoading, setSeasonLoading] = useState(false);
  const seasonRequest = useRef(0);
  const playbackContext = useRef<{ item: TitleItem; episode?: Episode } | null>(null);
  const rowLayouts = useRef(new Map<string, { top: number; items: TitleItem[] }>());
  const scrollOffset = useRef(0);
  const ensured = useRef(new Set<string>());
  const shelves = useMemo(() => catalog.shelves.map(shelf => ({ ...shelf, items: filterPrimeItems(shelf.items, filter) })).filter(shelf => shelf.items.length), [catalog.shelves, filter]);
  const heroItems = useMemo(() => filterPrimeItems(catalog.featured, filter).slice(0, 5), [catalog.featured, filter]);
  const hero = heroItems[heroIndex % Math.max(1, heroItems.length)];
  const results = useMemo(() => filterPrimeItems(query.trim() ? searchState.query === query.trim() ? searchState.items : [] : catalog.items, filter).filter(item => !genre || item.genres?.includes(genre)), [query, filter, genre, searchState, catalog.items]);
  const genres = useMemo(() => [...new Set(catalog.items.flatMap(item => item.genres || []))].sort(), [catalog.items]);
  const watchlist = library.watchlist.map(getPrimeTitle).filter((item): item is TitleItem => !!item);
  const openDetail = (item: TitleItem) => { setSelected(item); setDetailTab(item.type === 'series' ? 'episodes' : 'related'); setDetailError(''); setSeasonId(''); };
  const navigate = (next: Page) => { scrollOffset.current = 0; setPage(next); setCollection(null); setMessage(''); setShowCategories(false); };
  const changeFilter = (next: PrimeFilter) => { setFilter(next); setHeroIndex(0); setCollection(null); };
  const play = (item: TitleItem, episode?: Episode) => {
    const continuing = library.continuing.find(entry => entry.titleId === item.id);
    const nextEpisode = episode || item.episodes?.find(candidate => candidate.id === continuing?.episodeId) || item.episodes?.[0];
    playbackContext.current = { item, episode: nextEpisode };
    setPlaying({ item, episode: nextEpisode });
  };
  const ensure = (items: TitleItem[]) => {
    const pending = items.filter(item => !item.hydrated && !ensured.current.has(item.id));
    pending.forEach(item => ensured.current.add(item.id));
    if (pending.length) void catalog.ensureTitles(pending).catch(() => {}); // catalog publishes the failure and Retry action.
  };
  const ensureVisibleRows = () => {
    for (const row of rowLayouts.current.values()) {
      if (row.top >= scrollOffset.current - 300 && row.top <= scrollOffset.current + height * 1.5) ensure(row.items.slice(0, Math.ceil(width / (cardWidth + 12)) + 2));
    }
  };
  const refresh = () => { ensured.current.clear(); void catalog.reload().finally(ensureVisibleRows).catch(() => {}); };

  useEffect(() => {
    if (page !== 'find' || !query.trim()) { setSearchState({ query: '', status: 'idle', items: [], error: '' }); return; }
    let active = true;
    const term = query.trim();
    setSearchState({ query: term, status: 'loading', items: [], error: '' });
    const timer = setTimeout(() => {
      catalog.search(term).then(items => { if (active) setSearchState({ query: term, status: 'ready', items, error: '' }); })
        .catch(() => { if (active) setSearchState({ query: term, status: 'error', items: [], error: 'Search could not reach the video service.' }); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, page, searchAttempt, catalog.search]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetailLoading(true); setDetailError(''); setRelated([]); setRelatedError('');
    catalog.getTitleDetails(selected.id).then(item => {
      if (!active) return;
      setSelected(item); setDetailTab(item.type === 'series' ? 'episodes' : 'related');
      setSeasonId(item.selectedSeason || item.seasons?.[0]?.id || '');
    }).catch(() => { if (active) setDetailError('Title details could not be loaded from the service.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; seasonRequest.current++; };
  }, [selected?.id, detailAttempt, catalog.getTitleDetails]);

  useEffect(() => {
    if (!selected || detailLoading || detailError || detailTab !== 'related') return;
    let active = true;
    setRelatedLoading(true); setRelatedError('');
    catalog.getMoreLikeThis(selected).then(items => { if (active) setRelated(items); })
      .catch(() => { if (active) setRelatedError('Recommendations could not be loaded from the service.'); })
      .finally(() => { if (active) setRelatedLoading(false); });
    return () => { active = false; };
  }, [selected?.id, detailLoading, detailError, detailTab, detailAttempt, catalog.getMoreLikeThis]);

  const savedIds = [...new Set([...library.watchlist, ...library.history.map(entry => entry.titleId)])].filter(id => /^prime-pv-[A-Za-z0-9_-]+$/.test(id)).join(',');
  useEffect(() => {
    for (const id of savedIds.split(',').filter(Boolean)) void catalog.getTitleDetails(id).catch(() => {});
  }, [savedIds, catalog.getTitleDetails]);
  useEffect(() => { if (collection) ensure(collection.items.slice(0, 24)); }, [collection?.title]);

  const selectSeason = async (id: string) => {
    if (!selected) return;
    const titleId = selected.id, requestId = ++seasonRequest.current;
    setSeasonId(id); setSeasonLoading(true); setDetailError('');
    try {
      const episodes = await catalog.fetchEpisodes(id);
      if (seasonRequest.current === requestId) setSelected(current => current?.id === titleId ? { ...current, selectedSeason: id, episodes } : current);
    } catch { if (seasonRequest.current === requestId) setDetailError('Episodes could not be loaded. Choose the season to retry.'); }
    finally { if (seasonRequest.current === requestId) setSeasonLoading(false); }
  };
  const back = () => {
    if (playing) return false; // The mounted player owns Android Back while open.
    if (selected) { setSelected(null); return true; }
    if (showCategories) { setShowCategories(false); return true; }
    if (collection) { setCollection(null); return true; }
    if (page !== 'home') { navigate('home'); return true; }
    onSwitchProfile(); return true;
  };
  useTVRemote({ onBack: back }, !playing);

  const grid = (items: TitleItem[]) => <View style={[s.grid, { paddingHorizontal: gutter }]}>
    {items.map(original => {
      const item = getPrimeTitle(original.id) || original;
      return <PrimeCard key={item.id} item={item} width={gridWidth} onPress={() => openDetail(item)} />;
    })}
  </View>;
  const row = (title: string, items: TitleItem[], id: string, continuing = false) => items.length > 0 && <View key={id} style={s.shelf}
    onLayout={event => { rowLayouts.current.set(id, { top: event.nativeEvent.layout.y, items }); ensureVisibleRows(); }}>
    <View style={[s.rowHeading, { paddingHorizontal: gutter }]}><Text style={s.shelfTitle}>{title}</Text>
      <Focusable accessibilityRole="button" accessibilityLabel={`See all ${title}`} onPress={() => setCollection({ title, items })} style={s.seeAll}><Text style={s.blue}>See all ›</Text></Focusable></View>
    <FlatList horizontal data={items.slice(0, rowWindows[id] || 6)} keyExtractor={item => item.id} initialNumToRender={Math.ceil(width / (cardWidth + 12)) + 1}
      style={{ height: cardWidth * 0.5625 + 68 }} getItemLayout={(_, index) => ({ length: cardWidth + 12, offset: (cardWidth + 12) * index, index })}
      maxToRenderPerBatch={4} windowSize={3} ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
      showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: 8 }}
      scrollEventThrottle={150} onScroll={event => {
        const first = Math.floor(event.nativeEvent.contentOffset.x / (cardWidth + 12));
        const needed = first + Math.ceil(width / (cardWidth + 12)) + 2;
        if (needed > (rowWindows[id] || 6) && (rowWindows[id] || 6) < items.length) setRowWindows(current => ({ ...current, [id]: Math.min(items.length, Math.max((current[id] || 6) + 6, needed)) }));
        ensure(items.slice(first, needed));
      }}
      renderItem={({ item }) => {
        const progress = continuing ? library.continuing.find(entry => entry.titleId === item.id) : undefined;
        return <PrimeCard key={item.id} item={item} width={cardWidth} onPress={() => openDetail(item)}
          progress={progress && progress.duration > 0 ? progress.position / progress.duration * 100 : undefined} />;
      }} />
  </View>;

  const renderBody = () => {
    if (collection) return <><View style={[s.pageHeading, { paddingHorizontal: gutter }]}><PrimeButton label="Back" onPress={() => setCollection(null)} icon={<BackIcon />} /><Text style={s.heading}>{collection.title}</Text></View>{grid(collection.items)}</>;
    if (page === 'settings') return <View style={[s.settings, { paddingHorizontal: gutter }]}>
      <Text style={s.heading}>Settings</Text>
      <Text style={s.sectionTitle}>Your profile</Text><Text style={s.body}>{profile.name}</Text>
      <PrimeButton label="Switch profile" onPress={onSwitchProfile} icon={<UserIcon />} />
      <PrimeButton label="Watch history" onPress={() => setCollection({ title: 'Watch history', items: [...new Set(library.history.map(entry => entry.titleId))].map(getPrimeTitle).filter((item): item is TitleItem => !!item) })} />
      <PrimeButton label="Refresh catalog" onPress={refresh} />
      {onOpenAdmin && <PrimeButton label="Meflix admin" onPress={onOpenAdmin} />}
    </View>;
    if (page === 'stuff') return <>
      <View style={[s.pageHeading, { paddingHorizontal: gutter }]}><Text style={s.heading}>My List</Text><PrimeButton label="Settings" onPress={() => navigate('settings')} icon={<SettingsIcon />} /></View>
      <View style={[s.rowHeading, { paddingHorizontal: gutter, marginBottom: 22 }]}><Text style={s.sectionTitle}>Watchlist</Text><Text style={s.body}>{watchlist.length} titles</Text></View>
      {watchlist.length ? grid(watchlist) : <PrimeEmpty title="Your watchlist is empty" description="Add movies and TV shows to find them here." action="Browse movies & TV" onAction={() => navigate('home')} />}
      {row('Continue watching', [...new Set(library.continuing.map(entry => entry.titleId))].map(getPrimeTitle).filter((item): item is TitleItem => !!item), 'stuff-continue', true)}
    </>;
    if (page === 'find') return <>
      <View style={[s.searchHeader, { paddingHorizontal: gutter }]}><Text style={s.heading}>Search</Text>
        <View style={s.searchBox}><SearchIcon color={C.secondary} /><TextInput accessibilityLabel="Search movies and TV" placeholder="Search movies, TV shows, actors" placeholderTextColor={C.secondary} value={query} onChangeText={setQuery} style={s.searchInput} autoCorrect={false} returnKeyType="search" />
          {!!query && <Focusable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={s.iconButton}><CloseIcon size={18} /></Focusable>}</View>
        <View style={s.wrap}>{(['all', 'movies', 'tv'] as PrimeFilter[]).map(value => <PrimeButton key={value} label={value === 'all' ? 'All' : value === 'movies' ? 'Movies' : 'TV shows'} selected={filter === value} onPress={() => changeFilter(value)} />)}
          {!!genre && <PrimeButton label={`${genre} ×`} onPress={() => setGenre('')} selected />}</View>
        {!query && !genre && <><Text style={s.sectionTitle}>Categories</Text><View style={s.wrap}>{genres.slice(0, 12).map(value => <PrimeButton key={value} label={value} onPress={() => setGenre(value)} />)}</View></>}
        <Text style={s.body}>{query.trim() ? searchState.status === 'ready' && searchState.query === query.trim() ? `${results.length} results for “${query}”` : `Searching for “${query}”` : genre ? genre : 'Browse movies & TV'}</Text>
      </View>
      {query.trim() && (searchState.status === 'loading' || searchState.query !== query.trim()) ? <View style={s.loading}><ActivityIndicator color={C.blue} /><Text style={s.body}>Searching the connected source…</Text></View>
        : query.trim() && searchState.status === 'error' ? <PrimeEmpty title="Search unavailable" description={searchState.error} action="Retry search" onAction={() => setSearchAttempt(value => value + 1)} />
        : results.length ? grid(results) : <PrimeEmpty title="No results found" description="Try another title, actor or genre." action="Clear filters" onAction={() => { setQuery(''); setGenre(''); changeFilter('all'); }} />}
    </>;
    if (!catalog.items.length && (catalog.status === 'loading' || catalog.status === 'idle')) return <View style={s.loading}><ActivityIndicator color={C.blue} /><Text style={s.body}>Loading the connected catalog…</Text></View>;
    if (!catalog.items.length && catalog.error) return <PrimeEmpty title="Catalog unavailable" description={catalog.error} action="Retry catalog" onAction={refresh} />;
    return <>
      {hero && <View style={[s.hero, { height: compact ? 430 : 530 }]}>
        <PrimeArtwork key={hero.id} item={hero} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', C.background]} locations={[0.1, 1]} style={StyleSheet.absoluteFill} />
        {!compact && <LinearGradient colors={[C.background, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />}
        <View style={[s.heroInfo, { paddingHorizontal: gutter, maxWidth: compact ? undefined : 720 }]}>
          <Text style={s.featureLabel}>FEATURED</Text><Text style={[s.heroTitle, { fontSize: compact ? 36 : 58 }]}>{hero.title || 'Loading title…'}</Text>
          <Text style={s.heroMeta}>{[hero.year, hero.maturity, hero.duration].filter(Boolean).join('  ·  ')}</Text>
          {!compact && <Text numberOfLines={3} style={s.heroSynopsis}>{hero.synopsis}</Text>}
          <View style={s.wrap}><PrimeButton primary label="Watch now" onPress={() => play(hero)} icon={<PlayIcon color={C.background} size={20} />} />
            <PrimeButton label="More details" onPress={() => openDetail(hero)} /><Focusable accessibilityRole="button" accessibilityLabel={library.isInWatchlist(hero.id) ? 'Remove featured title from watchlist' : 'Add featured title to watchlist'} onPress={() => library.toggleWatchlist(hero.id)} style={s.roundButton}>{library.isInWatchlist(hero.id) ? <CheckIcon /> : <PlusIcon />}</Focusable></View>
        </View>
        <View style={s.dots}>{heroItems.map((item, index) => <Focusable key={item.id} accessibilityRole="button" accessibilityLabel={`Feature ${index + 1}: ${item.title}`} accessibilityState={{ selected: index === heroIndex }} onPress={() => setHeroIndex(index)} style={s.dotTarget}><View style={[s.dot, heroIndex === index && s.activeDot]} /></Focusable>)}</View>
      </View>}
      {catalog.stale && <Text accessibilityRole="alert" style={[s.catalogNote, { paddingHorizontal: gutter }]}>The source is showing previously fetched data. Refresh to check for updates.</Text>}
      {row('Continue watching', [...new Set(library.continuing.map(entry => entry.titleId))].map(getPrimeTitle).filter((item): item is TitleItem => !!item), 'continue', true)}
      {shelves.map(shelf => row(shelf.title, shelf.items, shelf.id))}
      {!shelves.length && <PrimeEmpty title="No titles in this category" description="Try another filter or refresh the catalog." action="Show all" onAction={() => changeFilter('all')} />}
    </>;
  };

  const sourceKey = playing?.episode?.id || playing?.item.id || '';
  const progress = playing ? library.history.find(entry => entry.titleId === playing.item.id && entry.episodeId === playing.episode?.id) : undefined;
  const selectedProgress = selected ? library.continuing.find(entry => entry.titleId === selected.id) : undefined;
  const selectedEpisode = selected?.episodes?.find(episode => episode.id === selectedProgress?.episodeId);

  return <View testID="prime-video-app" style={[s.container, { paddingTop: insets.top }]}>
    <StatusBar style="light" />
    <View style={[s.header, { paddingHorizontal: gutter }]}><MeflixLogo />
      {!compact && <View style={s.desktopNav}>{NAV.map(nav => <Focusable key={nav.id} accessibilityRole="tab" accessibilityLabel={nav.title} accessibilityState={{ selected: page === nav.id }} onPress={() => navigate(nav.id)} style={[s.navItem, page === nav.id && s.desktopSelected]}><Text style={[s.navText, page === nav.id && { color: '#fff' }]}>{nav.title}</Text></Focusable>)}</View>}
      <View style={s.headerActions}><Focusable accessibilityRole="button" accessibilityLabel="Switch streaming profile" onPress={onSwitchProfile} style={s.iconButton}><Image source={profile.avatarImage || require('../../assets/brand/prime-profile.jpg')} style={s.avatar} /></Focusable>
        <Focusable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => navigate('settings')} style={s.iconButton}><SettingsIcon /></Focusable></View>
    </View>
    {page === 'home' && !collection && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 54, maxHeight: 54 }} contentContainerStyle={[s.filters, { paddingHorizontal: gutter }]}>
      {(['all', 'movies', 'tv'] as PrimeFilter[]).map(value => <Focusable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => changeFilter(value)} style={[s.filter, filter === value && s.filterSelected]}><Text style={[s.filterText, filter === value && { color: C.background }]}>{value === 'all' ? 'All' : value === 'movies' ? 'Movies' : 'TV shows'}</Text></Focusable>)}
      <PrimeButton label="Categories ⌄" onPress={() => setShowCategories(value => !value)} style={s.categoryButton} selected={showCategories} />
    </ScrollView>}
    {showCategories && <ScrollView horizontal style={{ flexGrow: 0, flexShrink: 0, height: 72 }} contentContainerStyle={[s.categoryTray, { paddingHorizontal: gutter }]}>{genres.map(value => <PrimeButton key={value} label={value} onPress={() => { setGenre(value); navigate('find'); }} />)}</ScrollView>}
    {!library.loaded ? <View style={s.loading}><ActivityIndicator color={C.blue} /><Text style={s.body}>Loading your library…</Text></View> : <ScrollView key={`${page}-${collection?.title || ''}`} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}
      scrollEventThrottle={150} onScroll={event => {
        scrollOffset.current = event.nativeEvent.contentOffset.y; ensureVisibleRows();
        if (collection) { const start = Math.max(0, Math.floor(scrollOffset.current / (gridWidth * 0.5625 + 85)) * gridColumns); ensure(collection.items.slice(start, start + gridColumns * 6)); }
        if (page === 'find' && !query.trim()) { const start = Math.max(0, Math.floor(scrollOffset.current / (gridWidth * 0.5625 + 85)) * gridColumns); ensure(results.slice(start, start + gridColumns * 6)); }
      }}>{renderBody()}</ScrollView>}
    {!!(catalog.error || catalog.hydrationError) && catalog.items.length > 0 && <View accessibilityRole="alert" style={s.notice}><Text style={s.body}>{catalog.error || catalog.hydrationError}</Text><PrimeButton label="Retry catalog" onPress={refresh} /></View>}
    {(message || library.storageError) && <View accessibilityRole="alert" style={s.notice}><Text style={s.body}>{message || library.storageError}</Text>{!!message && <PrimeButton label="Dismiss" onPress={() => setMessage('')} />}</View>}
    {compact && <View accessibilityRole="tablist" style={[s.bottomNav, { paddingBottom: insets.bottom }]}>{NAV.map(nav => <Focusable key={nav.id} accessibilityRole="tab" accessibilityLabel={nav.title} accessibilityState={{ selected: page === nav.id }} onPress={() => navigate(nav.id)} style={s.bottomItem}>
      {nav.icon === 'search' ? <SearchIcon size={22} color={page === nav.id ? C.blue : C.secondary} /> : nav.icon === 'user' ? <UserIcon size={22} color={page === nav.id ? C.blue : C.secondary} /> : nav.id === 'home' ? <HomeIcon size={22} color={page === nav.id ? C.blue : C.secondary} /> : <Text style={[s.navSymbol, { color: page === nav.id ? C.blue : C.secondary }]}>{nav.icon}</Text>}
      <Text numberOfLines={1} style={[s.bottomLabel, { color: page === nav.id ? '#fff' : C.secondary }]}>{nav.title}</Text>
    </Focusable>)}</View>}

    <Modal visible={!!selected || !!playing} animationType="slide" onRequestClose={() => playing ? setPlaying(null) : setSelected(null)} presentationStyle="fullScreen">
      {playing ? <PrimeVideoPlayer key={sourceKey} item={playing.item} initialEpisode={playing.episode} resumePosition={progress?.completed ? 0 : progress?.position}
        onResolved={(item, episode) => { playbackContext.current = { item: { ...item, id: playing.item.id }, episode: episode ? { ...episode, id: `prime-pv-ep-${episode.netmirrorId || episode.id?.replace(/^(prime-pv-)?ep-/, '') || episode.num}` } : undefined }; }}
        onClose={() => setPlaying(null)} onProgress={(position, duration) => { const context = playbackContext.current; if (context) library.recordProgress(context.item, position, duration, context.episode); }} /> : selected && <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={[s.detailHeader, { paddingHorizontal: gutter }]}><PrimeButton label="Back to browse" icon={<BackIcon />} onPress={() => setSelected(null)} /><MeflixLogo /></View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 35 }}>
          <View style={{ height: compact ? 220 : 360 }}><PrimeArtwork key={selected.id} item={selected} style={StyleSheet.absoluteFill} /><LinearGradient colors={['transparent', C.background]} style={StyleSheet.absoluteFill} /></View>
          <View style={[s.detailContent, { paddingHorizontal: gutter }]}>
            <Text style={s.detailTitle}>{selected.title}</Text><Text style={s.body}>{[selected.year, selected.maturity, selected.duration, selected.resolution].filter(Boolean).join('  ·  ')}</Text>
            {detailLoading && <ActivityIndicator accessibilityLabel="Loading title details" color={C.blue} />}
            {!!detailError && <><Text accessibilityRole="alert" style={s.body}>{detailError}</Text><PrimeButton label="Retry details" onPress={() => setDetailAttempt(value => value + 1)} /></>}
            <PrimeButton primary disabled={detailLoading || seasonLoading || !!detailError} label={selectedProgress ? `Resume · ${Math.floor(selectedProgress.position / 60)} min` : selected.type === 'series' && selected.episodes?.length ? 'Play episode 1' : 'Watch now'} icon={<PlayIcon size={20} color={C.background} />} onPress={() => play(selected, selectedEpisode || selected.episodes?.[0])} />
            <View style={s.wrap}><PrimeButton label={library.isInWatchlist(selected.id) ? 'Remove from Watchlist' : 'Add to Watchlist'} onPress={() => library.toggleWatchlist(selected.id)} icon={library.isInWatchlist(selected.id) ? <CheckIcon /> : <PlusIcon />} />
            </View><Text style={s.synopsis}>{selected.synopsis}</Text>
            <View style={s.detailTabs}>{(selected.type === 'series' ? ['episodes', 'related', 'details'] as DetailTab[] : ['related', 'details'] as DetailTab[]).map(tab => <Focusable key={tab} accessibilityRole="tab" accessibilityLabel={tab === 'related' ? 'More like this' : tab === 'details' ? 'Details' : 'Episodes'} accessibilityState={{ selected: tab === detailTab }} onPress={() => setDetailTab(tab)} style={[s.detailTab, detailTab === tab && s.activeDetailTab]}><Text style={s.buttonText}>{tab === 'related' ? 'More like this' : tab === 'details' ? 'Details' : 'Episodes'}</Text></Focusable>)}</View>
            {detailTab === 'episodes' && !!selected.seasons?.length && <View style={s.wrap}>{selected.seasons.map(season => <PrimeButton key={season.id} label={season.s} selected={seasonId === season.id} onPress={() => void selectSeason(season.id)} />)}</View>}
            {detailTab === 'episodes' && seasonLoading && <ActivityIndicator color={C.blue} />}
            {detailTab === 'episodes' && !seasonLoading && (selected.episodes?.length ? selected.episodes.map(episode => <Focusable key={episode.id || episode.num} accessibilityRole="button" accessibilityLabel={`Play episode ${episode.num}: ${episode.title}`} onPress={() => play(selected, episode)} style={[s.episode, compact && { flexDirection: 'column' }]}>
              <PrimeArtwork item={{ ...selected, backdrop: episode.thumb || selected.backdrop }} style={{ width: compact ? '100%' : 200, height: compact ? 160 : 112, borderRadius: 4, overflow: 'hidden' }} />
              <View style={s.episodeInfo}><Text style={s.sectionTitle}>{episode.num}. {episode.title}</Text><Text style={s.body}>{episode.duration}</Text><Text style={s.body}>{episode.synopsis}</Text></View><PlayIcon />
            </Focusable>) : !detailLoading && <Text style={s.body}>No episodes were returned by the connected service.</Text>)}
            {detailTab === 'details' && <View style={s.metadata}>{[['Cast', selected.cast?.join(', ')], ['Creator', selected.creator], ['Genres', selected.genres?.join(', ')], ['Audio', selected.audio]].map(([label, value]) => value ? <View key={label}><Text style={s.sectionTitle}>{label}</Text><Text style={s.body}>{value}</Text></View> : null)}</View>}
          </View>
          {detailTab === 'related' && (relatedLoading ? <ActivityIndicator color={C.blue} /> : relatedError ? <PrimeEmpty title="Recommendations unavailable" description={relatedError} action="Retry recommendations" onAction={() => setDetailAttempt(value => value + 1)} /> : related.length ? grid(related) : !detailLoading && <PrimeEmpty title="No recommendations" description="The source returned no suggestions for this title." />)}
        </ScrollView>
      </View>}
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center' }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, avatar: { width: 28, height: 28, borderRadius: 14 }, desktopNav: { flexDirection: 'row', alignItems: 'center', gap: 8 }, navItem: { paddingHorizontal: 16, paddingVertical: 18, borderBottomWidth: 2, borderBottomColor: 'transparent' }, desktopSelected: { borderBottomColor: '#fff' }, navText: { color: C.secondary, fontSize: 16, fontWeight: '600' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10, paddingTop: 4 }, filter: { paddingHorizontal: 15, height: 40, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }, filterSelected: { backgroundColor: '#fff', borderColor: '#fff' }, filterText: { color: '#fff', fontSize: 14, fontWeight: '600' }, categoryButton: { minHeight: 40, borderRadius: 22, backgroundColor: 'transparent', paddingHorizontal: 10 }, categoryTray: { gap: 10, paddingVertical: 12 },
  hero: { justifyContent: 'flex-end' }, heroInfo: { paddingBottom: 46, gap: 16 }, heroTitle: { color: '#fff', fontWeight: '800', letterSpacing: -1.4, lineHeight: undefined }, featureLabel: { color: '#fff', fontSize: 11, letterSpacing: 2.3, fontWeight: '700' }, heroMeta: { color: '#d1d4d8', fontSize: 13 }, heroSynopsis: { color: '#e0e2e4', fontSize: 17, lineHeight: 26, maxWidth: 580 }, roundButton: { width: 48, height: 48, backgroundColor: C.elevated, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }, dots: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' }, dotTarget: { width: 28, height: 36, justifyContent: 'center', alignItems: 'center' }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#626970' }, activeDot: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
  catalogNote: { color: C.secondary, fontSize: 11, lineHeight: 17, paddingVertical: 14 }, shelf: { marginTop: 12, marginBottom: 14 }, rowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, shelfTitle: { fontSize: 20, color: '#fff', fontWeight: '700', flex: 1 }, seeAll: { paddingVertical: 10, paddingLeft: 12 }, blue: { color: '#65B7FF', fontSize: 13 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 24, paddingBottom: 20 },
  pageHeading: { paddingVertical: 28, gap: 18, alignItems: 'flex-start' }, heading: { color: '#fff', fontSize: 30, fontWeight: '700' }, sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '600' }, body: { color: C.secondary, fontSize: 14, lineHeight: 22 }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' }, settings: { paddingVertical: 30, gap: 20, maxWidth: 760 }, searchHeader: { paddingTop: 26, paddingBottom: 24, gap: 22 }, searchBox: { backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, borderRadius: 6, borderWidth: 1, borderColor: C.border, minHeight: 52 }, searchInput: { color: '#fff', flex: 1, fontSize: 16, padding: 13, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }, notice: { backgroundColor: C.surface, padding: 12, gap: 8 }, bottomNav: { backgroundColor: '#000', flexDirection: 'row', minHeight: 56, borderTopWidth: 1, borderTopColor: '#1a2028' }, bottomItem: { flex: 1, minHeight: 56, paddingVertical: 7, gap: 3, justifyContent: 'center', alignItems: 'center' }, bottomLabel: { fontSize: 10 }, navSymbol: { fontSize: 23, lineHeight: 25 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }, detailContent: { gap: 18, paddingBottom: 22 }, detailTitle: { color: '#fff', fontSize: 32, fontWeight: '800' }, synopsis: { color: '#e1e3e6', fontSize: 16, lineHeight: 25 }, detailTabs: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: C.surface }, detailTab: { paddingVertical: 17, borderBottomWidth: 3, borderBottomColor: 'transparent' }, activeDetailTab: { borderBottomColor: C.blue }, episode: { flexDirection: 'row', gap: 18, alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.surface }, episodeInfo: { flex: 1, gap: 7 }, metadata: { gap: 22 },
});

