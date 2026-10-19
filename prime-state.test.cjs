const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

// Execute the actual pure TypeScript modules; no React Native runtime is needed.
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
const {
  PrimeLibraryStore, primeStorageKeys, primeContinuing,
  normalizePrimeProgress, normalizePrimePreferences, normalizePrimeSource,
} = require('./src/prime/primeState.ts');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
  };
}

test('edits during hydration preserve saved entries and the visible add intent', async () => {
  const keys = primeStorageKeys('alice');
  const gate = deferred();
  const storage = memoryStorage({ [keys.watchlist]: JSON.stringify(['prime-saved', 'prime-new']) });
  const read = storage.getItem;
  storage.getItem = async key => { const value = await read(key); await gate.promise; return value; };
  const store = new PrimeLibraryStore(storage, 'alice');
  const load = store.load();
  store.toggleWatchlist('prime-new');
  store.updatePreferences({ autoplay: false });
  store.setSource('prime-new', 'https://example.test/my-video.mp4');
  gate.resolve();
  await load;
  await store.flush();
  assert.deepEqual(store.getSnapshot().watchlist, ['prime-new', 'prime-saved']);
  assert.equal(store.getSnapshot().preferences.autoplay, false);
  assert.equal(store.getSnapshot().sources['prime-new'], 'https://example.test/my-video.mp4');
  assert.deepEqual(JSON.parse(storage.data.get(keys.watchlist)), ['prime-new', 'prime-saved']);
});

test('clearing progress during hydration cannot restore old history', async () => {
  const gate = deferred();
  const keys = primeStorageKeys('alice');
  const storage = memoryStorage({ [keys.history]: JSON.stringify([
    { titleId: 'prime-film', position: 10, duration: 100, updatedAt: 1 },
  ]) });
  const read = storage.getItem;
  storage.getItem = async key => { const value = await read(key); await gate.promise; return value; };
  const store = new PrimeLibraryStore(storage, 'alice');
  store.clearHistory();
  gate.resolve();
  await store.flush();
  assert.deepEqual(store.getSnapshot().history, []);
  assert.deepEqual(JSON.parse(storage.data.get(keys.history)), []);
});

test('rapid updates serialize persistence, including when an individual write fails', async () => {
  const storage = memoryStorage();
  const store = new PrimeLibraryStore(storage, 'alice');
  await store.load();
  const gate = deferred();
  const save = storage.setItem;
  let count = 0;
  storage.setItem = async (key, value) => {
    const call = count++;
    if (call === 0) throw new Error('temporary disk error');
    if (call < 4) await gate.promise;
    await save(key, value);
  };
  store.toggleWatchlist('prime-first');
  store.toggleWatchlist('prime-second');
  await new Promise(done => setImmediate(done));
  assert.equal(count, 4, 'the second batch waits for every first-batch write');
  gate.resolve();
  await store.flush();
  assert.deepEqual(JSON.parse(storage.data.get(primeStorageKeys('alice').watchlist)), ['prime-second', 'prime-first']);
  assert.equal(store.getSnapshot().storageError, null);
});

test('watchlist, preferences and direct sources stay isolated per profile', async () => {
  const storage = memoryStorage();
  const alice = new PrimeLibraryStore(storage, 'alice');
  const bob = new PrimeLibraryStore(storage, 'bob');
  alice.toggleWatchlist('prime-film');
  alice.setSource('prime-film', 'https://example.test/video.m3u8');
  alice.updatePreferences({ autoplay: false });
  await alice.flush();
  await bob.load();
  assert.deepEqual(bob.getSnapshot().watchlist, []);
  assert.deepEqual(bob.getSnapshot().sources, {});
  assert.equal(bob.getSnapshot().preferences.autoplay, true);
  assert.notEqual(primeStorageKeys('alice:bob').watchlist, primeStorageKeys('alice').watchlist);
});

test('progress clamps overshoot, rejects invalid numbers and separates episodes', async () => {
  assert.equal(normalizePrimeProgress({ titleId: 'prime-film', position: NaN, duration: 100 }), null);
  assert.equal(normalizePrimeProgress({ titleId: 'stranger-things', position: 10, duration: 100 }), null);
  const complete = normalizePrimeProgress({ titleId: 'prime-film', position: 110, duration: 100 });
  assert.equal(complete.position, 100);
  assert.equal(complete.completed, true);
  const store = new PrimeLibraryStore(memoryStorage(), 'alice');
  const item = { id: 'prime-show', title: 'A show', type: 'series', synopsis: '' };
  store.recordProgress(item, 20, 100, { num: 1, title: 'Pilot' }, 'season-1');
  store.recordProgress(item, 30, 100, { num: 1, title: 'Return' }, 'season-2');
  await store.flush();
  assert.equal(store.getSnapshot().history.length, 2);
  assert.notEqual(store.getSnapshot().history[0].key, store.getSnapshot().history[1].key);
  assert.equal(primeContinuing(store.getSnapshot().history).length, 1);
});

test('corrupt persistence loads defaults without losing the ability to save', async () => {
  const keys = primeStorageKeys('alice');
  const storage = memoryStorage({ [keys.watchlist]: '{broken' });
  const store = new PrimeLibraryStore(storage, 'alice');
  await store.load();
  assert.equal(store.getSnapshot().loaded, true);
  assert.ok(store.getSnapshot().storageError);
  store.toggleWatchlist('prime-film');
  await store.flush();
  assert.deepEqual(store.getSnapshot().watchlist, ['prime-film']);
  assert.equal(store.getSnapshot().storageError, null);
  assert.equal(normalizePrimePreferences({ autoplay: 'yes', streamingQuality: 'unlimited' }).autoplay, true);
});

test('direct sources accept HTTP(S) and reject executable or credential-bearing URLs', () => {
  assert.equal(normalizePrimeSource('javascript:alert(1)'), null);
  assert.equal(normalizePrimeSource('file:///private/file.mp4'), null);
  assert.equal(normalizePrimeSource('https://user:secret@example.test/video'), null);
  assert.equal(normalizePrimeSource('https://example.test/line\nbreak.mp4'), null);
  assert.equal(normalizePrimeSource('https://example.test/movie.mp4'), 'https://example.test/movie.mp4');
});

test('replacing a source resets only that source timeline and persists the reset', async () => {
  const storage = memoryStorage();
  const store = new PrimeLibraryStore(storage, 'alice');
  const movie = { id: 'prime-film', title: 'A film', type: 'movie', synopsis: '' };
  const series = { id: 'prime-show', title: 'A show', type: 'series', synopsis: '' };
  const episode1 = { id: 'prime-show-episode-1', num: 1, title: 'Pilot' };
  const episode2 = { id: 'prime-show-episode-2', num: 2, title: 'Return' };
  store.setSource(movie.id, 'https://example.test/film.mp4');
  store.setSource(episode1.id, 'https://example.test/episode-1.mp4');
  store.setSource(episode2.id, 'https://example.test/episode-2.mp4');
  store.recordProgress(movie, 50, 100);
  store.recordProgress(series, 60, 100, episode1);
  store.recordProgress(series, 70, 100, episode2);
  await store.flush();
  store.setSource(movie.id, 'https://example.test/film.mp4');
  assert.equal(store.getSnapshot().history.length, 3, 'same URL preserves resume time');
  store.setSource(movie.id, 'https://example.test/replacement.mp4');
  assert.equal(store.getSnapshot().history.length, 2);
  store.setSource(episode1.id, 'https://example.test/replacement-episode.mp4');
  assert.equal(store.getSnapshot().history.length, 1);
  assert.equal(store.getSnapshot().history[0].episodeId, episode2.id);
  await store.flush();
  const restored = new PrimeLibraryStore(storage, 'alice');
  await restored.load();
  assert.equal(restored.getSnapshot().history.length, 1);
  assert.equal(restored.getSnapshot().sources[movie.id], 'https://example.test/replacement.mp4');
});

