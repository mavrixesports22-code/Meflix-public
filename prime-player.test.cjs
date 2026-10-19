const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the real component functions with a small hook host and a controllable
// video player. No device codecs or network are required for these lifecycle tests.
let host;
let activePlayer;
let activeSource;
const serviceCalls = [];
const authCodes = [];
const service = {
  async resolveAuthorizedTitle(...args) { serviceCalls.push(args); throw new Error('Not configured'); },
  async getAuthInstructions() { return { authenticated: false, message: 'Use your account code.', instructionImage: 'https://example.com/signin.png' }; },
  async authenticate(code) { authCodes.push(code); return { authenticated: true }; },
};
const platform = { OS: 'android' };
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const hooks = {
  useState(initial) {
    const owner = host, index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], value => { owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value; }];
  },
  useRef(initial) {
    const owner = host, index = owner.cursor++;
    return owner.slots[index] ||= { current: initial };
  },
  useMemo(create, deps) {
    const owner = host, index = owner.cursor++;
    const old = owner.slots[index];
    if (!old || !sameDeps(old.deps, deps)) owner.slots[index] = { value: create(), deps };
    return owner.slots[index].value;
  },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(effect, deps) {
    const owner = host, index = owner.cursor++;
    if (!sameDeps(owner.slots[index]?.deps, deps)) owner.pending.push(() => {
      owner.slots[index]?.cleanup?.();
      owner.slots[index] = { deps, cleanup: effect() };
    });
  },
};
const createElement = (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children } });
const react = { __esModule: true, default: { createElement }, ...hooks };
const native = { Platform: platform, StyleSheet: { create: value => value } };
for (const name of ['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'View']) native[name] = name;
const output = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require.resolve('./src/prime/PrimeVideoPlayer.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, {
  exports: output.exports, module: output, URL,
  globalThis: { addEventListener() {}, removeEventListener() {}, location: { origin: 'https://app.example.com' } },
  require(name) {
    if (name === '../../assets/brand/meflix-wordmark.png') return 'meflix-wordmark';
    if (name === 'react') return react;
    if (name === 'react-native') return native;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-video') return { useVideoPlayer: source => { activeSource = source; return activePlayer; }, VideoView: 'VideoView' };
    if (name === '../services/primeSourceService') return { primeSourceService: service };
    if (name === '../services/netmirrorService') return { netmirrorService: service };
    if (name === '../hooks/useTVRemote') return { useTVRemote() {} };
    if (name === './primeTheme') return { PrimeColors: { blue: '#0070F0' } };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const { PrimeVideoPlayer, normalizePrimeSource, normalizePrimeServiceSource } = output.exports;

function mount(component, props) {
  const owner = { slots: [], cursor: 0, pending: [], props };
  owner.render = (next = owner.props) => {
    owner.props = next; owner.cursor = 0; owner.pending = []; host = owner;
    try { owner.tree = component(next); } finally { host = null; }
    owner.pending.forEach(effect => effect());
    return owner.tree;
  };
  owner.unmount = () => owner.slots.forEach(slot => slot?.cleanup?.());
  owner.render();
  return owner;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  for (const child of (tree.props?.children || []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
function fakePlayer() {
  const listeners = new Map();
  return {
    status: 'idle', currentTime: 0, duration: 0, isLive: false, playing: false, plays: 0, pauses: 0,
    play() { this.plays++; this.playing = true; },
    pause() { this.pauses++; this.playing = false; },
    addListener(name, fn) {
      const group = listeners.get(name) || new Set(); group.add(fn); listeners.set(name, group);
      return { remove: () => group.delete(fn) };
    },
    emit(name, value) { for (const fn of [...(listeners.get(name) || [])]) fn(value); },
    listenerCount() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); },
  };
}
const item = { id: 'prime-test', title: 'Test', type: 'movie', synopsis: '' };
const props = { item, sourceUri: 'https://example.com/a.mp4', resumePosition: 90, onClose() {} };

assert.equal(normalizePrimeSource(' https://example.com/movie.mp4?token=abc '), 'https://example.com/movie.mp4?token=abc');
assert.equal(normalizePrimeSource('http://localhost:8080/stream.m3u8'), 'http://localhost:8080/stream.m3u8');
for (const bad of [undefined, null, 23, '', 'not a URL', '//example.com/movie.mp4', 'file:///tmp/video.mp4', 'javascript:alert(1)', 'ftp://example.com/video', 'https://user:pass@example.com/video', 'https://example.com/video\n.mp4', `https://example.com/${'x'.repeat(4000)}`]) {
  assert.equal(normalizePrimeSource(bad), null, String(bad).slice(0, 80));
}
assert.equal(PrimeVideoPlayer(props).key, PrimeVideoPlayer({ ...props, sourceUri: 'https://example.com/b.mp4' }).key, 'persisting a URI must not remount the session');

const updates = [], sources = [];
const sessionElement = PrimeVideoPlayer(props);
const session = mount(sessionElement.type, { ...props, onProgress: (...values) => updates.push(values), onSourceChange: uri => sources.push(uri) });
session.tree.props.onProgress(125, 600);
session.tree.props.onChangeSource();
session.render();
find(session.tree, node => node.type === 'TextInput').props.onChangeText('https://example.com/b.mp4');
session.render();
find(session.tree, node => node.props?.label === 'Play video').props.onPress();
session.render({ ...session.props, sourceUri: sources.at(-1), resumePosition: 125 });
assert.equal(session.tree.props.uri, 'https://example.com/b.mp4');
assert.equal(session.tree.props.resumePosition, 0, 'new source starts at zero after its URI is persisted');
assert.deepEqual(updates.at(-1), [0, 0], 'new source also clears saved progress before loading');
session.tree.props.onProgress(45, 600);
session.tree.props.onChangeSource(); session.render();
find(session.tree, node => node.props?.label === 'Play video').props.onPress(); session.render();
assert.equal(session.tree.props.resumePosition, 45, 'resubmitting the same source retains progress');

for (const order of ['ready-first', 'metadata-first']) {
  activePlayer = fakePlayer();
  const player = activePlayer;
  const reports = [];
  const playbackElement = mount(sessionElement.type, props).tree;
  const playback = mount(playbackElement.type, { ...playbackElement.props, onProgress: (...values) => reports.push(values) });
  if (order === 'ready-first') {
    player.status = 'readyToPlay'; player.emit('statusChange', { status: 'readyToPlay' });
    player.emit('timeUpdate', { currentTime: 0 });
    assert.equal(player.plays, 0, 'saved seek waits for metadata');
    assert.equal(reports.length, 0, 'an unresolved resume must not overwrite saved progress with zero');
    player.emit('sourceLoad', { duration: 600 });
  } else {
    player.emit('sourceLoad', { duration: 600 });
    assert.equal(player.currentTime, 0, 'metadata alone does not seek before ready');
    player.status = 'readyToPlay'; player.emit('statusChange', { status: 'readyToPlay' });
  }
  assert.equal(player.currentTime, 90, `${order}: restores saved seek`);
  assert.equal(player.plays, 1, `${order}: starts only once`);
  player.currentTime = 95; player.duration = 600; player.emit('timeUpdate', { currentTime: 95 });
  assert.deepEqual(reports.at(-1), [95, 600]);
  playback.unmount();
  assert.equal(player.listenerCount(), 0, 'unmount removes all player listeners');
}

platform.OS = 'web'; activePlayer = fakePlayer();
const browserPlayer = activePlayer;
const browserPlaybackElement = mount(sessionElement.type, { ...props, resumePosition: 0 }).tree;
const browserReports = [];
const browserPlayback = mount(browserPlaybackElement.type, { ...browserPlaybackElement.props, onProgress: (...values) => browserReports.push(values) });
browserPlayer.currentTime = 27; browserPlayer.duration = 600; browserPlayer.playing = true;
browserPlayback.unmount();
assert.equal(browserPlayer.playing, false, 'web unmount pauses media');
assert.equal(browserPlayer.timeUpdateEventInterval, 0, 'web unmount clears the owned progress interval');
assert.equal(browserPlayer.listenerCount(), 0);
assert.deepEqual(browserReports.at(-1), [27, 600], 'web unmount captures final position');
async function serviceTests() {
  const flush = () => new Promise(resolve => setImmediate(resolve));
  platform.OS = 'android';
  const backendItem = { ...item, id: 'prime-opaque-title', netmirrorId: 'amzn.title.ABC', type: 'series' };
  const episode = { id: 'prime-ep-opaque-episode', netmirrorId: 'amzn.episode.DEF', num: 2, title: 'Episode 2' };
  const result = {
    source: { url: 'https://example.com/stream.m3u8', headers: { Referer: 'https://example.com/', Usertoken: 'test-session' }, type: 'hls' },
    item: { ...backendItem, hydrated: true }, currentEpisode: episode, allEpisodes: [episode], resumePosition: 90,
  };
  service.resolveAuthorizedTitle = async (...args) => { serviceCalls.push(args); return result; };
  const resolved = [];
  const backendProps = { ...props, item: backendItem, initialEpisode: episode, onResolved: (...values) => resolved.push(values) };
  const backendElement = PrimeVideoPlayer(backendProps);
  assert.notEqual(backendElement.key, PrimeVideoPlayer({ ...backendProps, initialEpisode: { ...episode, netmirrorId: '125' } }).key, 'switching episodes creates a new playback session');
  const backend = mount(backendElement.type, backendProps);
  assert.equal(find(backend.tree, node => node.type === 'TextInput'), undefined, 'backend title never asks for a video URL');
  await flush(); backend.render();
  assert.equal(serviceCalls.at(-1)[0], backendItem);
  assert.equal(serviceCalls.at(-1)[1], episode);
  assert.equal(serviceCalls.at(-1)[2], 90);
  assert.equal(serviceCalls.at(-1)[3], false);
  assert.equal(resolved.at(-1)[0], result.item);
  assert.equal(resolved.at(-1)[1], episode);
  assert.equal(backend.tree.props.uri, result.source.url);
  assert.equal(backend.tree.props.onChangeSource, undefined, 'backend player has no manual source switch');
  activePlayer = fakePlayer();
  const playing = mount(backend.tree.type, backend.tree.props);
  assert.equal(activeSource.headers, result.source.headers, 'native media requests receive service headers');
  assert.equal(activeSource.contentType, 'hls', 'native player receives HLS content type');
  playing.unmount();
  backend.tree.props.onProgress(180, 600);
  backend.tree.props.onRetry(); backend.render(); await flush(); backend.render();
  assert.equal(serviceCalls.at(-1)[2], 180, 'fresh resolution resumes latest progress');
  assert.equal(serviceCalls.at(-1)[3], true, 'retry refreshes the service stream');
  backend.unmount();

  platform.OS = 'web';
  assert.equal(normalizePrimeServiceSource('/api/prime/media/opaque-handle'), 'https://app.example.com/api/prime/media/opaque-handle');
  assert.equal(normalizePrimeServiceSource('/api/prime/media/../../../outside'), null, 'opaque media handle cannot escape its route');
  assert.equal(normalizePrimeServiceSource('//other.example.com/api/prime/media/opaque-handle'), null, 'protocol-relative cross-origin URLs are rejected');
  assert.equal(normalizePrimeServiceSource('/api/netmirror/media/opaque-handle'), null, 'Prime cannot use a Netflix-provider media handle');
  assert.equal(normalizePrimeServiceSource('https://app.example.com/api/netmirror/media/opaque-handle'), null, 'absolute Netflix-provider media handles are rejected');
  service.resolveAuthorizedTitle = async () => ({ ...result, source: { ...result.source, url: '/api/prime/media/opaque-handle' } });
  const web = mount(backendElement.type, backendProps);
  await flush(); web.render();
  assert.equal(web.tree.props.uri, 'https://app.example.com/api/prime/media/opaque-handle', 'Prime service media handles resolve against the app origin');
  activePlayer = fakePlayer();
  const webPlayback = mount(web.tree.type, web.tree.props);
  assert.equal(activeSource.headers, undefined, 'browser playback does not expose native authentication headers');
  webPlayback.unmount(); web.unmount(); platform.OS = 'android';
  assert.equal(normalizePrimeServiceSource('/api/prime/media/opaque-handle'), null, 'relative handles are web-only');

  let signedIn = false;
  service.resolveAuthorizedTitle = async (...args) => {
    serviceCalls.push(args);
    if (!signedIn) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
    return result;
  };
  service.authenticate = async code => { authCodes.push(code); signedIn = true; return { authenticated: true }; };
  const signIn = mount(backendElement.type, backendProps);
  await flush(); signIn.render();
  assert.equal(authCodes.length, 0, 'auth-required never submits a default code automatically');
  const codeInput = find(signIn.tree, node => node.type === 'TextInput');
  assert.equal(codeInput.props.accessibilityLabel, 'Sign-in code');
  find(signIn.tree, node => node.props?.label === 'Sign in and play').props.onPress();
  await flush(); signIn.render();
  assert.equal(authCodes.length, 0, 'empty sign-in code is not submitted');
  codeInput.props.onChangeText(' 654321 '); signIn.render();
  await find(signIn.tree, node => node.props?.label === 'Sign in and play').props.onPress();
  signIn.render(); await flush(); signIn.render();
  assert.deepEqual(authCodes, ['654321'], 'authentication uses exactly the user-entered code');
  assert.equal(signIn.tree.props.uri, result.source.url, 'authenticated session retries resolution');
  signIn.unmount();

  service.resolveAuthorizedTitle = async () => { throw new Error('Service unavailable'); };
  const failure = mount(backendElement.type, backendProps);
  await flush(); failure.render();
  assert.ok(find(failure.tree, node => node.props?.label === 'Try again'), 'service failures offer a retry');
  assert.equal(find(failure.tree, node => node.type === 'TextInput'), undefined, 'service failures do not fall back to a demo URL form');
  failure.unmount();
  assert.equal(find(PrimeVideoPlayer({ item, onClose() {} }), node => node.type === 'TextInput'), undefined, 'titles without a connected source do not ask for video URLs');
  console.log('Prime player tests passed: service resolution, explicit sign-in, stream headers, episode resume, errors, source validation and player cleanup.');
}
serviceTests().catch(error => { console.error(error); process.exitCode = 1; });
