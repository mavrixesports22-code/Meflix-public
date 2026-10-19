const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const { createWebServer } = require('./web-server.cjs');

const filename = path.join(__dirname, 'src/services/netmirrorService.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  fileName: filename,
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function loadService(platform, responses = [], initial = {}) {
  const calls = [], reads = [], writes = [], storage = new Map(Object.entries(initial));
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, URL, AbortController, setTimeout, clearTimeout,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    require(name) {
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === '@react-native-async-storage/async-storage') return {
        async getItem(key) { reads.push(key); return storage.get(key) ?? null; },
        async setItem(key, value) { writes.push(key); storage.set(key, value); },
        async removeItem(key) { writes.push(key); storage.delete(key); },
      };
      throw new Error('Unexpected import: ' + name);
    },
    async fetch(url, options = {}) {
      calls.push({ url, options });
      assert.ok(responses.length, 'Unexpected fetch: ' + url);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return { ok: response.status === undefined || response.status < 400, status: response.status || 200,
        async json() { if (response.jsonError) throw response.jsonError; return response.data; } };
    },
  };
  vm.runInNewContext(compiled, context, { filename });
  return { service: module.exports.netmirrorService, calls, reads, writes, storage };
}
const discovery = { data: { token_hash: Buffer.from('https://catalog.example.test/newtv').toString('base64') } };

test('web catalogue retains live metadata and uses only the same-origin cookie API', async () => {
  const home = { shelves: [{ id: 'live-0', title: 'Source row', items: ['nm-12'] }],
    items: [{ id: 'nm-12', title: 'Returned title', type: 'series', hydrated: true }, { id: 'nm-13', type: 'title' }],
    featured: ['nm-12'], stale: true, updatedAt: '2026-10-19T00:00:00Z' };
  const { service, calls, reads, writes } = loadService('web', [{ data: home }]);
  const result = await service.fetchHome();
  assert.deepEqual(plain(result.shelves), home.shelves);
  assert.deepEqual(plain(result.featured), home.featured);
  assert.equal(result.items[0].title, 'Returned title');
  assert.equal(result.items[0].type, 'series');
  assert.equal(result.items[1].type, 'movie');
  assert.equal(result.items[1].hydrated, false);
  assert.equal(result.stale, true);
  assert.equal(result.updatedAt, home.updatedAt);
  assert.equal(calls[0].url, '/api/netmirror/home');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers.Usertoken, undefined);
  assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});

test('web details preserve seasons, episodes and source suggestions and cache hydrated metadata', async () => {
  const card = { id: 'nm-42', netmirrorId: '42', title: 'Live series', type: 'series',
    seasons: [{ id: '77', s: 'Season 2' }], selectedSeason: '77',
    episodes: [{ netmirrorId: '88', num: 1, title: 'Source episode' }],
    suggestions: [{ id: 'nm-43', netmirrorId: '43', title: 'Suggested title' }] };
  const { service, calls } = loadService('web', [{ data: { card } }]);
  const result = await service.fetchTitle('nm-42');
  assert.deepEqual(plain(result), { ...card, hydrated: true });
  assert.strictEqual(await service.fetchTitle('42'), result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/netmirror/title?id=42');
});

test('web search encodes the query and maps source results; blank search sends no request', async () => {
  const { service, calls } = loadService('web', [{ data: { items: [
    { id: 'nm-12', title: 'Source title', type: 'series' }, { id: 'nm-13', type: 'title', hydrated: true },
  ] } }]);
  assert.deepEqual(plain(await service.search('   ')), []);
  assert.equal(calls.length, 0);
  const result = await service.search('  Space & time?  ');
  assert.equal(calls[0].url, '/api/netmirror/search?q=Space%20%26%20time%3F');
  assert.equal(result[0].type, 'series');
  assert.equal(result[0].hydrated, false);
  assert.equal(result[1].type, 'movie');
});

test('web season results map real episode IDs, descriptions and duration', async () => {
  const { service, calls } = loadService('web', [{ data: { episodes: [
    { id: '91', ep: '3', t: 'Episode name', ep_desc: 'Episode description', info: ['HD', '48m'] },
  ] } }]);
  const episodes = await service.fetchEpisodes('nm-77');
  assert.deepEqual(plain(episodes[0]), { id: 'ep-91', netmirrorId: '91', num: 3, title: 'Episode name',
    synopsis: 'Episode description', duration: '48m', thumb: 'https://imgcdn.kim/poster/h/77.jpg' });
  assert.equal(calls[0].url, '/api/netmirror/episodes?id=77');
});

test('web HTTP errors retain backend error codes and malformed responses reject', async () => {
  const { service } = loadService('web', [
    { status: 401, data: { error: 'Connect first.', code: 'AUTH_REQUIRED' } },
    { status: 502, data: {} }, { jsonError: new SyntaxError('Invalid JSON') },
  ]);
  await assert.rejects(service.getPlaybackSource('12'), error => error.code === 'AUTH_REQUIRED' && error.message === 'Connect first.');
  await assert.rejects(service.fetchHome(), error => error.code === 'SOURCE_UNAVAILABLE');
  await assert.rejects(service.search('name'), /Invalid JSON/);
});

test('web auth keeps session material in HttpOnly server cookies rather than storage or response tokens', async () => {
  const { service, calls, writes } = loadService('web', [
    { data: { authenticated: false, message: 'Use the source instructions.' } },
    { data: { authenticated: true } }, { data: { authenticated: false } },
  ]);
  assert.equal((await service.getAuthInstructions()).authenticated, false);
  const result = await service.authenticate(' 246810 ');
  assert.deepEqual(plain(result), { authenticated: true, token: '' });
  assert.equal(calls[1].options.body, JSON.stringify({ otp: '246810' }));
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(writes, []);
  await service.disconnect();
  assert.equal(calls[2].options.method, 'DELETE');
  for (const { url, options } of calls) {
    assert.equal(url, '/api/netmirror/auth');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.Usertoken, undefined);
  }
});

test('native title metadata maps seasons, episode IDs, cast and recommendations from the source', async () => {
  const { service, calls } = loadService('android', [discovery, { data: {
    title: 'Remote show', type: 't', year: '2026', desc: 'Remote synopsis', runtime: '50m',
    season: [{ id: 77, s: 'Season 2', selected: true }],
    episodes: [{ id: 88, ep: 1, t: 'Opening', ep_desc: 'Real description', info: ['50m'] }],
    moredetails: [{ k: 'genre', v: 'Drama, Mystery' }, { k: 'cast', v: 'A, B' }, { k: 'creator', v: 'Creator' }],
    suggest: [{ id: 43 }, { id: 42 }, { id: 'invalid' }],
  } }]);
  const result = await service.fetchTitle('nm-42');
  assert.equal(result.title, 'Remote show'); assert.equal(result.type, 'series');
  assert.equal(result.selectedSeason, '77'); assert.equal(result.episodes[0].netmirrorId, '88');
  assert.deepEqual(plain(result.genres), ['Drama', 'Mystery']);
  assert.deepEqual(plain(result.cast), ['A', 'B']); assert.equal(result.creator, 'Creator');
  assert.deepEqual(plain(result.suggestions.map(item => item.netmirrorId)), ['43']);
  assert.equal(calls[1].url, 'https://catalog.example.test/newtv/post.php?id=42');
  assert.equal(calls[1].options.headers.Ott, 'nf');
});

test('authorized native playback without a session never submits a default OTP', async () => {
  const { service, calls } = loadService('android', [discovery, { data: { title: 'Remote movie', type: 'm' } }]);
  await assert.rejects(service.resolveAuthorizedTitle({ id: 'nm-42', netmirrorId: '42', title: 'Remote movie', type: 'movie' }),
    error => error.code === 'AUTH_REQUIRED');
  assert.equal(calls.length, 2, 'Only discovery and public metadata should be requested.');
  assert.ok(calls.every(({ url }) => !url.includes('otp.php') && !url.includes('player.php')));
});

test('authorized native playback uses saved session and clears an expired session without silent renewal', async () => {
  const { service, calls, storage } = loadService('android', [discovery, { data: { status: 'otp' } }],
    { meflix_netmirror_token: 'test-session-placeholder' });
  await assert.rejects(service.getPlaybackSource('42', false, true), error => error.code === 'AUTH_REQUIRED');
  assert.equal(storage.has('meflix_netmirror_token'), false);
  assert.equal(calls[1].options.headers.Usertoken, 'test-session-placeholder');
  assert.ok(calls.every(({ url }) => !url.includes('otp.php')));
});

test('native and web reject invalid IDs before any discovery, authentication or playback request', async () => {
  for (const platform of ['android', 'web']) {
    const { service, calls } = loadService(platform);
    for (const id of ['', '../42', '42&other=1', '123456789012345678901', 'https://example.test']) {
      await assert.rejects(service.getPlaybackSource(id, false, true), /valid video/);
      await assert.rejects(service.fetchTitle(id), /valid title/);
      await assert.rejects(service.fetchEpisodes(id), /valid season/);
    }
    assert.equal(calls.length, 0);
  }
});

test('authorized native playback resolves an explicit source episode and retains resume position', async () => {
  const { service, calls } = loadService('android', [discovery, { data: {
    status: 'ok', video_link: 'https://media.example.test/episode.m3u8', referer: 'https://player.example.test',
    title: 'Show', ep_title: 'Episode 2',
  } }], { meflix_netmirror_token: 'test-session-placeholder' });
  const episode = { id: 'ep-88', netmirrorId: '88', num: 2, title: 'Episode 2' };
  const item = { id: 'nm-42', netmirrorId: '42', title: 'Show', episodes: [episode] };
  const result = await service.resolveAuthorizedTitle(item, episode, 123);
  assert.equal(calls[1].url, 'https://catalog.example.test/newtv/player.php?id=88');
  assert.equal(result.resumePosition, 123); assert.equal(result.currentEpisode.netmirrorId, '88');
  assert.equal(result.source.url, 'https://media.example.test/episode.m3u8');
});

test('export server serves browser routes, MIME, HEAD and byte ranges and delegates only its API', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'meflix-web-test-'));
  const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'meflix-web-outside-'));
  await fsp.writeFile(path.join(root, 'index.html'), '<main>Export</main>');
  await fsp.writeFile(path.join(root, 'bundle.js'), 'abcdefghij');
  await fsp.writeFile(path.join(outside, 'private.txt'), 'outside the export');
  // Windows junctions do not require Developer Mode or symlink privileges.
  await fsp.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const seen = [];
  const server = createWebServer({ staticRoot: root, async handleNetMirror(req, res, url) {
    seen.push(url.pathname);
    if (!url.pathname.startsWith('/api/netmirror/')) return false;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return true;
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(outside, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(base + '/prime/title/42');
  assert.equal(response.status, 200); assert.equal(await response.text(), '<main>Export</main>');
  response = await fetch(base + '/bundle.js', { method: 'HEAD' });
  assert.match(response.headers.get('content-type'), /javascript/); assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-length'), '10');
  response = await fetch(base + '/bundle.js', { headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await response.text(), 'cdef');
  response = await fetch(base + '/bundle.js', { headers: { Range: 'bytes=-3' } });
  assert.equal(response.status, 206); assert.equal(await response.text(), 'hij');
  for (const range of ['bytes=50-', 'bytes=3-1', 'bytes=1-2,4-5', 'bytes=-0']) {
    response = await fetch(base + '/bundle.js', { headers: { Range: range } }); assert.equal(response.status, 416);
  }
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  assert.equal((await fetch(base + '/linked/private.txt')).status, 403);
  assert.equal((await fetch(base + '/%2e%2e%2foutside.txt')).status, 403);
  assert.equal((await fetch(base + '/%5coutside.txt')).status, 403);
  assert.equal((await fetch(base + '/%GG')).status, 400);
  assert.equal((await fetch(base + '/bundle.js', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/netmirror/home')).status, 200);
  assert.equal((await fetch(base + '/api/unrelated')).status, 404);
  assert.deepEqual(seen, ['/api/netmirror/home', '/api/unrelated']);
});
