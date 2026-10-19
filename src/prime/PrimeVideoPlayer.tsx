import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoPlayerStatus } from 'expo-video';
import { useTVRemote } from '../hooks/useTVRemote';
import type { Episode, TitleItem } from '../types';
import { primeSourceService } from '../services/primeSourceService';
import { netmirrorService, NetMirrorService } from '../services/netmirrorService';
import type { AuthInfo, PlaybackResolution } from '../services/netmirrorService';
import { PrimeColors } from './primeTheme';
import { BRAND_ASSETS } from '../theme/brandAssets';

type PlayerTheme = { background: string; surface: string; accent: string; muted: string; overlay: string };
const PRIME_PLAYER_THEME: PlayerTheme = { background: '#00050D', surface: '#192330', accent: PrimeColors.blue, muted: '#8996a7', overlay: 'rgba(0,5,13,0.45)' };
const NETFLIX_PLAYER_THEME: PlayerTheme = { background: '#101012', surface: '#202024', accent: '#E50914', muted: '#A3A3A3', overlay: 'rgba(16,16,18,0.55)' };

export interface PrimeVideoPlayerProps {
  item: TitleItem;
  initialEpisode?: Episode;
  sourceUri?: string;
  resumePosition?: number;
  onClose: () => void;
  onProgress?: (position: number, duration: number) => void;
  onResolved?: (item: TitleItem, episode?: Episode) => void;
  onSourceChange?: (uri: string) => void;
  sourceService?: NetMirrorService;
  silentDefaultAuth?: boolean;
  visualTheme?: PlayerTheme;
}

/** Only an explicitly supplied network video source can start playback. */
export function normalizePrimeSource(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4000) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The web service returns only an opaque handle on the app's own media route. */
export function normalizePrimeServiceSource(value: unknown): string | null {
  if (Platform.OS === 'web') {
    if (typeof value !== 'string' || !value.startsWith('/api/prime/media/')) return null;
    try {
      const origin = globalThis.location.origin;
      const resolved = new URL(value, origin);
      if (resolved.origin !== origin || !resolved.pathname.startsWith('/api/prime/media/')) return null;
      return normalizePrimeSource(resolved.toString());
    } catch { return null; }
  }
  return normalizePrimeSource(value);
}

function Action({ label, onPress, secondary = false, theme = NETFLIX_PLAYER_THEME }: { label: string; onPress: () => void; secondary?: boolean; theme?: PlayerTheme }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed, focused }: any) => [styles.button, { backgroundColor: secondary ? theme.surface : theme.accent }, (pressed || focused) && styles.focused]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

export function PrimeVideoPlayer(props: PrimeVideoPlayerProps) {
  return ServiceVideoPlayer({ ...props, sourceService: primeSourceService, visualTheme: PRIME_PLAYER_THEME });
}

export function NetflixVideoPlayer(props: Omit<PrimeVideoPlayerProps, 'sourceService'>) {
  return ServiceVideoPlayer({ ...props, sourceService: netmirrorService, silentDefaultAuth: true, visualTheme: NETFLIX_PLAYER_THEME });
}

function ServiceVideoPlayer(props: PrimeVideoPlayerProps) {
  const sourceService = props.sourceService || primeSourceService;
  const theme = props.visualTheme || PRIME_PLAYER_THEME;
  // Source edits are owned by the mounted session. Persisting its URI must not
  // remount it with the previous source's position from the parent's history.
  const serviceTitle = !!props.item.netmirrorId || /^nm-/.test(props.item.id);
  const sessionKey = JSON.stringify([props.item.id, props.initialEpisode?.netmirrorId ?? props.initialEpisode?.id ?? props.initialEpisode?.num]);
  if (serviceTitle) return <ServicePlayerSession key={sessionKey} {...props} sourceService={sourceService} visualTheme={theme} />;
  if (props.sourceUri) return <PlayerSession key={props.item.id} {...props} visualTheme={theme} />;
  return <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}><Header title={props.item.title} onClose={props.onClose} theme={theme} />
    <View style={styles.failure}><Text style={styles.heading}>Video unavailable</Text>
      <Text style={styles.description}>This title has no connected playback source.</Text></View></SafeAreaView>;
}

function ServicePlayerSession({ item, initialEpisode, resumePosition = 0, onClose, onProgress, onResolved, sourceService, silentDefaultAuth = false, visualTheme = PRIME_PLAYER_THEME }: PrimeVideoPlayerProps) {
  const service = sourceService || primeSourceService;
  const [resolution, setResolution] = useState<PlaybackResolution | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const request = useRef({ item, initialEpisode });
  const position = useRef(Number.isFinite(resumePosition) ? Math.max(0, resumePosition) : 0);
  const resolvedCallback = useRef(onResolved);
  resolvedCallback.current = onResolved;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const report = useCallback((current: number, duration: number) => {
    position.current = current;
    onProgress?.(current, duration);
  }, [onProgress]);
  useTVRemote(useMemo(() => ({ onBack: () => { onClose(); return true; } }), [onClose]), !resolution);

  useEffect(() => {
    let active = true;
    setLoading(true); setMessage(''); setResolution(null); setAuth(null);
    (silentDefaultAuth
      ? service.resolvePlayableTitle(request.current.item, request.current.initialEpisode, position.current, attempt > 0)
      : service.resolveAuthorizedTitle(request.current.item, request.current.initialEpisode, position.current, attempt > 0))
      .then(result => {
        if (!active) return;
        const uri = normalizePrimeServiceSource(result.source.url);
        if (!uri) throw new Error('INVALID_SOURCE');
        position.current = Number.isFinite(result.resumePosition) ? Math.max(0, result.resumePosition) : position.current;
        resolvedCallback.current?.(result.item, result.currentEpisode);
        setResolution({ ...result, source: { ...result.source, url: uri } });
      }).catch(async error => {
        if (!active) return;
        if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') {
          if (silentDefaultAuth) {
            setMessage('Playback is temporarily unavailable. Tap Retry to try again.');
            return;
          }
          const instructions = await service.getAuthInstructions().catch(() => ({ authenticated: false }));
          if (active) { setAuth(instructions); setMessage('Sign in to the connected video service to play this title.'); }
        } else {
          setMessage('The connected video service could not load this title. Please try again.');
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, service]);

  const authenticate = async () => {
    const enteredCode = code.trim();
    if (!enteredCode) { setMessage('Enter your sign-in code.'); return; }
    if (authenticating) return;
    setAuthenticating(true); setMessage('');
    try {
      const result = await service.authenticate(enteredCode);
      if (!mounted.current) return;
      if (!result.authenticated) { setMessage('The sign-in code was not accepted.'); return; }
      setCode(''); setAttempt(value => value + 1);
    } catch {
      if (mounted.current) setMessage('Unable to sign in. Check your code and try again.');
    } finally { if (mounted.current) setAuthenticating(false); }
  };

  if (resolution) return <Playback key={attempt} item={resolution.item} uri={resolution.source.url}
    headers={resolution.source.headers} contentType={resolution.source.type} resumePosition={position.current}
    onClose={onClose} onProgress={report} onRetry={() => setAttempt(value => value + 1)} theme={visualTheme} />;

  return <SafeAreaView style={[styles.root, { backgroundColor: visualTheme.background }]}>
    <Header title={item.title} onClose={onClose} theme={visualTheme} />
    <KeyboardAvoidingView style={styles.formArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Image accessibilityLabel="Meflix" source={BRAND_ASSETS.wordmark} resizeMode="contain" style={styles.brand} />
        {loading ? <><ActivityIndicator size="large" color={visualTheme.accent} /><Text style={[styles.description, { color: visualTheme.muted }]}>Connecting to video service…</Text></> : <>
        <Text style={styles.heading}>{auth ? 'Sign in to play' : 'Unable to load video'}</Text>
          {!!message && <Text accessibilityRole="alert" style={[styles.description, { color: visualTheme.muted }]}>{message}</Text>}
          {auth ? <>
            {!!auth.message && <Text style={[styles.description, { color: visualTheme.muted }]}>{auth.message}</Text>}
            {!!auth.instructionImage && <Image source={{ uri: auth.instructionImage }} style={styles.authImage} resizeMode="contain" accessibilityLabel="Service sign-in instructions" />}
            <TextInput accessibilityLabel="Sign-in code" value={code} onChangeText={setCode} placeholder="Enter your code"
              placeholderTextColor={visualTheme.muted} style={[styles.input, { backgroundColor: visualTheme.surface, borderColor: visualTheme.accent }]} autoCapitalize="none" autoCorrect={false}
              editable={!authenticating} onSubmitEditing={authenticate} secureTextEntry />
            {authenticating ? <ActivityIndicator color={visualTheme.accent} /> : <Action theme={visualTheme} label="Sign in and play" onPress={authenticate} />}
          </> : <Action theme={visualTheme} label="Try again" onPress={() => setAttempt(value => value + 1)} />}
        </>}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function PlayerSession({ item, sourceUri, resumePosition = 0, onClose, onProgress, onSourceChange, visualTheme = NETFLIX_PLAYER_THEME }: PrimeVideoPlayerProps) {
  const [initialSource] = useState(() => normalizePrimeSource(sourceUri));
  const [uri, setUri] = useState<string | null>(initialSource);
  const [draft, setDraft] = useState(sourceUri ?? '');
  const [validation, setValidation] = useState(sourceUri && !initialSource ? 'Enter a valid HTTP or HTTPS video URL.' : '');
  const [attempt, setAttempt] = useState(0);
  const previousSource = useRef(initialSource);
  const position = useRef(Number.isFinite(resumePosition) ? Math.max(0, resumePosition) : 0);
  const report = useCallback((current: number, duration: number) => {
    position.current = current;
    onProgress?.(current, duration);
  }, [onProgress]);
  const remote = useMemo(() => ({ onBack: () => { onClose(); return true; } }), [onClose]);
  useTVRemote(remote, !uri);

  if (uri) return <Playback key={JSON.stringify([uri, attempt])} item={item} uri={uri} resumePosition={position.current}
    onClose={onClose} onProgress={report} onRetry={() => setAttempt(value => value + 1)} onChangeSource={() => setUri(null)} theme={visualTheme} />;

  const submit = () => {
    const next = normalizePrimeSource(draft);
    if (!next) { setValidation('Enter a valid HTTP or HTTPS video URL.'); return; }
    setValidation('');
    const changedSource = next !== previousSource.current;
    if (changedSource) position.current = 0;
    previousSource.current = next;
    setUri(next);
    onSourceChange?.(next);
    // Clear the previous source's persisted position even if this one fails to
    // load or the user closes before metadata arrives.
    if (changedSource) onProgress?.(0, 0);
  };
  return <SafeAreaView style={[styles.root, { backgroundColor: visualTheme.background }]}>
    <Header title={item.title} onClose={onClose} theme={visualTheme} />
    <KeyboardAvoidingView style={styles.formArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Image accessibilityLabel="Meflix" source={BRAND_ASSETS.wordmark} resizeMode="contain" style={styles.brand} />
        <Text style={styles.heading}>Add a video source</Text>
        <Text style={[styles.description, { color: visualTheme.muted }]}>Use a video URL you own or have permission to play.</Text>
        <Text style={styles.label}>Video URL</Text>
        <TextInput accessibilityLabel="Video URL" value={draft} onChangeText={value => { setDraft(value); setValidation(''); }}
          placeholder="https://example.com/video.mp4" placeholderTextColor={visualTheme.muted} style={[styles.input, { backgroundColor: visualTheme.surface, borderColor: visualTheme.accent }]}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={submit} />
        {!!validation && <Text accessibilityRole="alert" style={styles.errorText}>{validation}</Text>}
        <Action theme={visualTheme} label="Play video" onPress={submit} />
        <Text style={[styles.hint, { color: visualTheme.muted }]}>Direct MP4, HLS or DASH sources supported by your device. Audio and subtitles depend on the source.</Text>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

interface PlaybackProps {
  item: TitleItem;
  uri: string;
  headers?: Record<string, string>;
  contentType?: 'auto' | 'hls' | 'dash' | 'progressive';
  resumePosition: number;
  onClose: () => void;
  onProgress: (position: number, duration: number) => void;
  onRetry: () => void;
  onChangeSource?: () => void;
  theme?: PlayerTheme;
}

function Playback({ item, uri, headers, contentType, resumePosition, onClose, onProgress, onRetry, onChangeSource, theme = NETFLIX_PLAYER_THEME }: PlaybackProps) {
  const source = useMemo(() => ({ uri, headers: Platform.OS === 'web' ? undefined : headers, contentType,
    metadata: { title: item.title, artwork: item.backdrop ?? item.poster } }), [uri, headers, contentType, item.title, item.backdrop, item.poster]);
  const player = useVideoPlayer(source, instance => {
    instance.loop = false;
  });
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  const [message, setMessage] = useState('');
  const callback = useRef(onProgress);
  callback.current = onProgress;
  const initialPosition = useRef(Number.isFinite(resumePosition) ? Math.max(0, resumePosition) : 0);
  const snapshot = useRef({ position: initialPosition.current, duration: 0 });
  const resumed = useRef(initialPosition.current === 0);
  const readySeen = useRef(false);
  const started = useRef(false);
  const closed = useRef(false);
  const emit = useCallback(() => {
    const current = snapshot.current;
    if (resumed.current && current.duration > 0) callback.current(current.position, current.duration);
  }, []);
  const capture = useCallback(() => {
    try {
      const duration = player.duration;
      const current = player.currentTime;
      snapshot.current = {
        position: resumed.current && Number.isFinite(current) ? Math.max(0, current) : snapshot.current.position,
        duration: Number.isFinite(duration) && duration > 0 ? duration : snapshot.current.duration,
      };
    } catch { /* A released native player must never be read during teardown. */ }
  }, [player]);
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    capture();
    emit();
    player.pause();
    onClose();
  }, [capture, emit, onClose, player]);
  const toggle = useCallback(() => {
    if (player.status !== 'readyToPlay') return;
    if (player.playing) player.pause(); else player.play();
  }, [player]);
  const remote = useMemo(() => ({ onBack: () => { close(); return true; }, onPlayPause: toggle }), [close, toggle]);
  useTVRemote(remote);

  useEffect(() => {
    const restoreAndStart = (metadataDuration = player.duration) => {
      // readyToPlay and sourceLoad may arrive in either order. Do not mark a
      // saved seek as applied until the duration is known (or this is live).
      if (Number.isFinite(metadataDuration) && metadataDuration > 0) snapshot.current.duration = metadataDuration;
      let justRestored = false;
      if (!resumed.current && readySeen.current) {
        if (player.isLive) resumed.current = true;
        else if (snapshot.current.duration > 0) {
          const target = Math.min(initialPosition.current, Math.max(0, snapshot.current.duration - 1));
          player.currentTime = target;
          snapshot.current.position = target;
          resumed.current = true;
          justRestored = true;
        }
      }
      if (!justRestored) capture();
      if (readySeen.current && resumed.current && !started.current) {
        started.current = true;
        if (Platform.OS !== 'web') player.play();
      }
    };
    const subscriptions = [
      player.addListener('statusChange', event => {
        setStatus(event.status);
        if (event.status === 'error') setMessage('The video could not be played. Check the URL, connection and media format.');
        if (event.status === 'readyToPlay') { readySeen.current = true; restoreAndStart(); }
      }),
      player.addListener('sourceLoad', event => { restoreAndStart(event.duration); }),
      player.addListener('timeUpdate', () => { restoreAndStart(); emit(); }),
      player.addListener('playingChange', event => { if (!event.isPlaying && !closed.current) { capture(); emit(); } }),
      player.addListener('playToEnd', () => {
        capture();
        if (snapshot.current.duration > 0) snapshot.current.position = snapshot.current.duration;
        emit();
      }),
    ];
    player.timeUpdateEventInterval = 5;
    // A cached source can become ready before subscriptions are registered.
    setStatus(player.status);
    if (player.status === 'readyToPlay') { readySeen.current = true; restoreAndStart(); }
    if (player.status === 'error') setMessage('The video could not be played. Check the URL, connection and media format.');
    return () => {
      subscriptions.forEach(subscription => subscription.remove());
      // Web players have no automatic release hook; stop both media and timer.
      if (Platform.OS === 'web') {
        capture();
        player.pause();
        player.timeUpdateEventInterval = 0;
      }
      // useVideoPlayer owns native release; persist only cached values here.
      if (!closed.current) emit();
    };
  }, [capture, emit, player]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key === 'Escape') close();
      else if (event.key === ' ' && target?.tagName !== 'BUTTON' && target?.getAttribute('role') !== 'button') { event.preventDefault(); toggle(); }
      // Native controls own arrow keys while focused, including their seek bar.
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  }, [close, toggle]);

  const leaveSource = () => { closed.current = true; capture(); emit(); player.pause(); onChangeSource?.(); };
  const retry = () => { closed.current = true; capture(); emit(); player.pause(); onRetry(); };
  return <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
    <Header title={item.title} onClose={close} theme={theme} />
    <View style={styles.stage}>
      <VideoView style={styles.video} player={player} nativeControls contentFit="contain" playsInline
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        buttonOptions={{ showSubtitles: undefined, showSettings: true, showSeekBackward: true, showSeekForward: true }} />
      {(status === 'loading' || status === 'idle') && <View pointerEvents="none" style={[styles.loading, { backgroundColor: theme.overlay }]}>
        <ActivityIndicator size="large" color={theme.accent} /><Text style={[styles.loadingText, { color: theme.muted }]}>Loading video…</Text>
      </View>}
      {status === 'error' && <View style={[styles.failure, { backgroundColor: theme.background }]}>
        <Text style={styles.heading}>Unable to play video</Text><Text accessibilityRole="alert" style={[styles.description, { color: theme.muted }]}>{message}</Text>
        {Platform.OS === 'web' && <Text style={[styles.description, { color: theme.muted }]}>Browser playback depends on HLS support and the service allowing browser access. Try the Android app if this stream cannot play here.</Text>}
        <View style={styles.actions}><Action theme={theme} label="Try again" onPress={retry} />{onChangeSource && <Action theme={theme} label="Change source" onPress={leaveSource} secondary />}</View>
      </View>}
    </View>
    <View style={[styles.footer, { backgroundColor: theme.background }]}><Text style={[styles.footerText, { color: theme.muted }]}>Audio & subtitles are available in the player controls.</Text>
      {onChangeSource && <Action theme={theme} label="Change source" onPress={leaveSource} secondary />}
    </View>
  </SafeAreaView>;
}

function Header({ title, onClose, theme = NETFLIX_PLAYER_THEME }: { title: string; onClose: () => void; theme?: PlayerTheme }) {
  return <View style={[styles.header, { backgroundColor: theme.background }]}>
    <Action label="‹ Close" onPress={onClose} secondary theme={theme} />
    <Text style={styles.title} numberOfLines={1}>{title}</Text>
    <Image accessibilityLabel="Meflix" source={BRAND_ASSETS.wordmark} resizeMode="contain" style={styles.headerBrand} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00050d' },
  header: { minHeight: 72, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#00050d' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },
  headerBrand: { width: 92, height: 28 },
  brand: { width: 160, height: 48, marginBottom: 24 },
  formArea: { flex: 1, justifyContent: 'center', padding: 24 },
  form: { width: '100%', maxWidth: 580, alignSelf: 'center', gap: 16 },
  heading: { color: '#fff', fontSize: 26, fontWeight: '700' },
  description: { color: '#bbc5d2', fontSize: 16, lineHeight: 24 },
  label: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: '#192330', borderColor: '#8197ae', borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16 },
  authImage: { width: '100%', height: 180 },
  button: { backgroundColor: PrimeColors.blue, paddingVertical: 13, paddingHorizontal: 20, minHeight: 48, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  secondary: { backgroundColor: '#1b2738' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryText: { color: '#fff' },
  focused: { borderColor: '#fff', opacity: 0.9 },
  errorText: { color: '#ffb4aa', fontSize: 14 },
  hint: { color: '#8996a7', lineHeight: 21, fontSize: 13 },
  stage: { flex: 1, backgroundColor: '#000', minHeight: 140 },
  video: { width: '100%', height: '100%' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: 'rgba(0,5,13,0.45)' },
  loadingText: { color: '#fff', fontSize: 15 },
  failure: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00050d', padding: 24, justifyContent: 'center', alignItems: 'center', gap: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  footerText: { flex: 1, minWidth: 180, color: '#8996a7', fontSize: 12, lineHeight: 18 },
});
