const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function loadCatalog(backend) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(require.resolve('./src/prime/primeCatalog.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Promise, Map, Set, Error,
    require(name) {
      assert.equal(name, '../services/primeSourceService', 'catalog must depend only on the dedicated Prime source service');
      return { primeSourceService: backend };
    },
  });
  return module.exports;
}
const card = (id, extra = {}) => ({ id: String(id), netmirrorId: String(id), title: `Title ${id}`, type: 'movie', synopsis: '', ...extra });
const home = (ids, extra = {}) => ({ items: ids.map(id => card(id)), featured: ids.slice(0, 1).map(id => String(id)), shelves: [{ id: 'row', title: 'Source shelf', items: ids.map(id => String(id)) }], stale: false, ...extra });
const backend = (extra = {}) => ({ fetchHome: async () => home(['1']), fetchTitle: async id => card(id, { title: `Real ${id}` }), search: async () => [], fetchEpisodes: async () => [], ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));

test('initial live-only snapshot is stable and loading updates preserve source IDs', async () => {
  const calls = [];
  const serviceBackend = backend({
    fetchHome: async () => home(['17']),
    fetchTitle: async id => {
      calls.push(id);
      return card(id, { title: 'Live series', type: 'series', episodes: [{ id: 'ep-501', netmirrorId: '501', num: 1, title: 'Pilot' }], suggestions: [card('18')] });
    },
  });
  const { primeCatalogService: service } = loadCatalog(serviceBackend);
  const initial = service.getSnapshot();
  assert.equal(service.getSnapshot(), initial);
  assert.equal(initial.status, 'idle');
  assert.equal(initial.items.length, 0);
  let updates = 0;
  const stop = service.subscribe(() => updates++);
  const pending = service.loadHome();
  assert.equal(service.loadHome(), pending, 'concurrent load callers share the request');
  await pending;
  assert.ok(updates > 1);
  const item = service.getItemById('prime-pv-17');
  assert.equal(item.id, 'prime-pv-17');
  assert.equal(item.netmirrorId, '17');
  assert.equal(item.title, 'Live series');
  assert.equal(item.episodes[0].id, 'prime-pv-ep-501');
  assert.equal(item.episodes[0].netmirrorId, '501');
  assert.equal(item.suggestions[0].id, 'prime-pv-18');
  assert.equal(service.getItemById('nm-17'), undefined);
  assert.equal(service.getItemById('17'), item);
  assert.equal(service.getItemById('prime-old-demo'), undefined);
  assert.equal(service.getSnapshot().shelves[0].items[0], item);
  assert.deepEqual(calls, ['17']);
  stop();
  assert.equal(service.getSnapshot(), service.getSnapshot());
});

test('authoritative search empty stays empty and title types hydrate before filtering', async () => {
  const searched = [];
  const { primeCatalogService: service, filterPrimeItems } = loadCatalog(backend({
    search: async query => { searched.push(query); return query === 'show' ? [card('52')] : []; },
    fetchTitle: async id => card(id, { title: 'A live TV show', type: 'series' }),
  }));
  await service.loadHome();
  const results = await service.search('  show  ');
  assert.equal(results[0].type, 'series');
  assert.equal(results[0].hydrated, true);
  assert.equal(filterPrimeItems(results, 'tv').length, 1);
  assert.equal(service.getItemById('52'), results[0]);
  assert.equal((await service.search('Live')).length, 0, 'matching cached title does not override empty live results');
  assert.deepEqual(searched, ['show', 'Live']);
});

test('search and details failures reject instead of substituting cached or sample results', async () => {
  const { primeCatalogService: service } = loadCatalog(backend({
    search: async () => { throw new Error('Search unavailable'); },
    fetchTitle: async () => { throw new Error('Metadata unavailable'); },
  }));
  await assert.rejects(service.search('query'), /Search unavailable/);
  await assert.rejects(service.getTitleDetails('5'), /Metadata unavailable/);
  await assert.rejects(service.loadHome(), /Metadata unavailable/);
  assert.match(service.getSnapshot().hydrationError, /Metadata unavailable/);
  assert.equal(service.getSnapshot().error, null);
  assert.equal(service.getItemById('1').hydrated, false);
});

test('search metadata remains authoritative when home refreshes during a query', async () => {
  const metadata = deferred();
  const { primeCatalogService: service } = loadCatalog(backend({
    search: async () => [card('50')],
    fetchTitle: id => id === '50' ? metadata.promise : Promise.resolve(card(id)),
  }));
  const search = service.search('show');
  await tick();
  await service.loadHome(true);
  metadata.resolve(card('50', { title: 'Actual show', type: 'series' }));
  const results = await search;
  assert.equal(results[0].type, 'series');
  assert.equal(results[0].hydrated, true);
  assert.equal(service.getItemById('50'), results[0]);
});

test('source home errors are explicit and retry succeeds without bundled fallback', async () => {
  let failing = true;
  const { primeCatalogService: service } = loadCatalog(backend({ fetchHome: async () => {
    if (failing) throw new Error('Source offline');
    return home(['4'], { stale: true });
  } }));
  await assert.rejects(service.loadHome(), /Source offline/);
  assert.equal(service.getSnapshot().status, 'error');
  assert.equal(service.getSnapshot().items.length, 0);
  failing = false;
  await service.loadHome(true);
  assert.equal(service.getSnapshot().status, 'ready');
  assert.equal(service.getSnapshot().stale, true);
  failing = true;
  await assert.rejects(service.loadHome(true), /Source offline/);
  assert.equal(service.getSnapshot().items[0].netmirrorId, '4');
  assert.equal(service.getSnapshot().stale, true);
  assert.match(service.getSnapshot().error, /Source offline/);
});

test('latest refresh wins even if older home completes last', async () => {
  const older = deferred(), newer = deferred();
  let calls = 0;
  const { primeCatalogService: service } = loadCatalog(backend({ fetchHome: () => (++calls === 1 ? older.promise : newer.promise) }));
  const first = service.loadHome(), second = service.loadHome(true);
  newer.resolve(home(['2']));
  await second;
  older.resolve(home(['1'], { stale: true }));
  await first;
  assert.equal(service.getSnapshot().featured[0].netmirrorId, '2');
  assert.equal(service.getSnapshot().stale, false);
  assert.equal(service.getItemById('1'), undefined);
});

test('superseded hydration cannot publish stale title details', async () => {
  const detail = deferred();
  let calls = 0;
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchHome: async () => home([++calls === 1 ? '1' : '2']),
    fetchTitle: id => id === '1' ? detail.promise : Promise.resolve(card(id, { title: 'Newest' })),
  }));
  const first = service.loadHome();
  await tick();
  await service.loadHome(true);
  detail.resolve(card('1', { title: 'Superseded detail' }));
  await first;
  assert.equal(service.getSnapshot().featured[0].title, 'Newest');
  assert.equal(service.getItemById('1').title, 'Title 1');
});

test('hydration deduplicates requests, limits concurrency and loads only the initial rows', async () => {
  let active = 0, maxActive = 0;
  const requested = [];
  const ids = Array.from({ length: 120 }, (_, index) => String(index + 1));
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchHome: async () => home(ids, { shelves: Array.from({ length: 10 }, (_, index) => ({ id: `row-${index}`, title: `Row ${index}`, items: ids.slice(index * 12, index * 12 + 12).map(id => String(id)) })) }),
    fetchTitle: async id => { active++; maxActive = Math.max(maxActive, active); requested.push(id); await tick(); active--; return card(id, { title: `Hydrated ${id}` }); },
  }));
  await service.loadHome();
  assert.equal(requested.length, 18, 'first three shelves, six each; featured deduplicated');
  assert.ok(maxActive <= 4, `maximum simultaneous metadata calls: ${maxActive}`);
  assert.equal(service.getItemById('120').hydrated, false);
  const title = service.getItemById('120');
  await Promise.all([service.ensureTitles([title]), service.getTitleDetails(title.id)]);
  assert.equal(requested.filter(id => id === '120').length, 1);
  assert.equal(service.getItemById('120').hydrated, true);
  const current = service.getSnapshot();
  await service.ensureTitles([service.getItemById('120')]);
  assert.equal(service.getSnapshot(), current, 'cached hydration must not cause a render loop');
});

test('recommendations use exactly backend suggestions and episodes preserve playback identity', async () => {
  const detailCalls = [], seasonCalls = [];
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchTitle: async id => {
      detailCalls.push(id);
      return card(id, { title: `Live ${id}`, suggestions: id === '7' ? [card('9'), card('10')] : [] });
    },
    fetchEpisodes: async id => { seasonCalls.push(id); return [{ id: 'ep-900', netmirrorId: '900', num: 1, title: 'Live episode' }]; },
  }));
  const suggestions = await service.getMoreLikeThis(card('7'));
  assert.deepEqual(plain(suggestions.map(item => item.netmirrorId)), ['9', '10']);
  assert.deepEqual(detailCalls, ['7', '9', '10']);
  assert.equal((await service.getMoreLikeThis(card('10'))).length, 0, 'no guessed genre recommendations');
  const episodes = await service.fetchEpisodes('88');
  assert.deepEqual(seasonCalls, ['88']);
  assert.equal(episodes[0].id, 'prime-pv-ep-900');
  assert.equal(episodes[0].netmirrorId, '900');
});

test('Prime opaque title, season, episode and recommendation IDs preserve exact case', async () => {
  const id = '0HBE4W5I7RRPPPB63C8GBBZ5I8', seasonId = 'Season_Ab-2', episodeId = 'B0Episode_Xy9';
  const calls = [], seasonCalls = [];
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchHome: async () => home([id]),
    fetchTitle: async rawId => {
      calls.push(rawId);
      return card(rawId, {
        title: `Prime ${rawId}`, type: 'series', seasons: [{ id: seasonId, s: 'Season 2' }], selectedSeason: seasonId,
        episodes: [{ id: episodeId, netmirrorId: episodeId, num: 1, title: 'Episode one' }],
        suggestions: rawId === id ? [card('B0Suggested_aB')] : [],
      });
    },
    fetchEpisodes: async rawId => { seasonCalls.push(rawId); return [{ id: episodeId, num: 1, title: 'Episode one' }]; },
  }));
  await service.loadHome();
  const item = service.getItemById(`prime-pv-${id}`);
  assert.equal(item.netmirrorId, id);
  assert.equal(item.id, `prime-pv-${id}`);
  assert.equal(item.seasons[0].id, seasonId);
  assert.equal(item.episodes[0].id, `prime-pv-ep-${episodeId}`);
  assert.equal(item.episodes[0].netmirrorId, episodeId);
  assert.equal(service.getItemById(id.toLowerCase()), undefined, 'provider IDs are case sensitive');
  assert.equal((await service.getMoreLikeThis(item))[0].netmirrorId, 'B0Suggested_aB');
  assert.equal((await service.fetchEpisodes(seasonId))[0].netmirrorId, episodeId);
  assert.deepEqual(calls, [id, 'B0Suggested_aB']);
  assert.deepEqual(seasonCalls, [seasonId]);
});

test('only exact display prefixes are stripped; raw IDs with similar prefixes remain opaque', async () => {
  const ids = ['nm-B0Raw', 'pv-B0Raw', 'ep-B0Raw', 'prime-pv-B0Raw', 'prime-pv-ep-B0Raw'];
  const requested = [];
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchHome: async () => home(ids),
    fetchTitle: async id => { requested.push(id); return card(id, { episodes: [{ id: 'prime-pv-ep-B0Exact', num: 1, title: 'Episode' }] }); },
  }));
  await service.loadHome();
  assert.deepEqual(requested, ids, 'no provider prefix is removed from raw netmirrorId fields');
  for (const id of ids) assert.equal(service.getItemById(`prime-pv-${id}`).netmirrorId, id);
  assert.equal(service.getItemById('prime-pv-nm-B0Raw').episodes[0].netmirrorId, 'B0Exact');
  assert.equal(service.getItemById('prime-pv-ep-B0Raw').netmirrorId, 'ep-B0Raw', 'title and episode namespace parsing uses its declared context');
});

test('unsafe opaque IDs fail before any provider request', async () => {
  let requested = 0;
  const { primeCatalogService: service } = loadCatalog(backend({
    fetchTitle: async id => { requested++; return card(id); },
    fetchEpisodes: async () => { requested++; return []; },
  }));
  for (const id of ['', 'B0/title', 'B0\\title', '..', 'B0..title', 'B0%2ftitle', 'B0?x', 'B0#x', 'B0&x', 'B0:x', 'B0 title', ' B0', 'B0\nX', 'B0\u0000X', "B0'x", 'x'.repeat(129)]) {
    await assert.rejects(service.getTitleDetails(id), /invalid content ID/);
    await assert.rejects(service.fetchEpisodes(id), /invalid content ID/);
    assert.equal(service.getItemById(id), undefined);
  }
  assert.equal(requested, 0);
  await assert.rejects(service.ensureTitles([card('B0/unsafe')]), /invalid content ID/);
  const malformed = loadCatalog(backend({ fetchEpisodes: async () => [{ id: 'unsafe/id', num: 1, title: 'Invalid episode' }] }));
  await assert.rejects(malformed.primeCatalogService.fetchEpisodes('Season_1'), /invalid content ID/);
});

test('unhydrated cards remain in both type filters until provider metadata determines their type', async () => {
  const { filterPrimeItems } = loadCatalog(backend());
  const unknown = card('B0Unknown', { type: 'movie', hydrated: false });
  const movie = card('B0Movie', { type: 'movie', hydrated: true });
  const series = card('B0Series', { type: 'series', hydrated: true });
  const items = [unknown, movie, series];
  assert.deepEqual(plain(filterPrimeItems(items, 'movies').map(item => item.netmirrorId)), ['B0Unknown', 'B0Movie']);
  assert.deepEqual(plain(filterPrimeItems(items, 'tv').map(item => item.netmirrorId)), ['B0Unknown', 'B0Series']);
  assert.equal(filterPrimeItems(items, 'all').length, 3);
});
