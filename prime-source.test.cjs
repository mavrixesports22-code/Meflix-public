// Sanitized public Ott:pv responses captured 2026-10-19; no credentials or streams.
// Source provenance: docs/netmirror-prime-source.md. Tests never access the network.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, 'src/services/netmirrorService.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
}).outputText;
const copy = value => JSON.parse(JSON.stringify(value));
function harness(platform, responder, initial = {}) {
  const storage = new Map(Object.entries(initial));
  const calls = [], reads = [], writes = [];
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
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
      if (url === 'https://mobiledetect.app/checknewtv.php') return {
        ok: true, status: 200, async json() { return { token_hash: Buffer.from('https://catalog.example.test/newtv').toString('base64') }; },
      };
      const result = await responder(url, options);
      assert.ok(result, 'Unexpected request: ' + url);
      return { ok: !result.status || result.status < 400, status: result.status || 200, async json() { return copy(result.data); } };
    },
  }, { filename });
  const Class = module.exports.NetMirrorService;
  return { prime: new Class('pv'), netflix: new Class(), calls, storage, reads, writes };
}
const sourceCalls = calls => calls.filter(call => call.url.includes('/newtv/'));

test('native Prime home preserves opaque provider IDs and source-specific artwork', async () => {
  const { prime, calls } = harness('android', url => url.endsWith('/main.php') && { data: FIXTURES.home });
  const home = await prime.fetchHome();
  assert.equal(home.shelves.length, FIXTURES.home.post.length);
  assert.deepEqual(copy(home.featured), FIXTURES.home.slider.map(item => 'pv-' + item.id));
  const id = FIXTURES.home.post[0].ids.split(',')[0];
  const card = home.items.find(item => item.netmirrorId === id);
  assert.equal(card.id, 'pv-' + id);
  assert.equal(card.poster, FIXTURES.home.imgcdn_h.replace('------------------', id));
  assert.equal(card.backdrop, FIXTURES.home.imgcdn_h.replace('------------------', id));
  assert.ok(home.shelves.some(shelf => shelf.title === 'Top 10 Series in Prime'));
  assert.ok(home.items.every(item => item.id.startsWith('pv-')));
  assert.equal(sourceCalls(calls)[0].options.headers.Ott, 'pv');
  assert.equal(sourceCalls(calls)[0].options.headers.Usertoken, 'none');
});

test('native Prime movie filters null episodes and uses IMDB Genres and Prime image templates', async () => {
  const movie = FIXTURES.movie;
  const { prime, calls } = harness('android', url => url.endsWith('/post.php?id=' + movie.main_id) && { data: movie });
  const item = await prime.fetchTitle('pv-' + movie.main_id);
  assert.equal(item.id, 'pv-' + movie.main_id); assert.equal(item.netmirrorId, movie.main_id);
  assert.equal(item.type, 'movie'); assert.deepEqual(copy(item.episodes), []);
  const genreText = movie.moredetails.find(detail => detail.k === 'IMDB Genres').v;
  assert.deepEqual(copy(item.genres), genreText.split(',').map(value => value.trim()));
  assert.equal(item.backdrop, movie.main_poster.replace('------------------', movie.main_id));
  assert.equal(item.poster, movie.morelike_poster.replace('------------------', movie.main_id));
  assert.equal(item.suggestions[0].netmirrorId, movie.suggest[0].id);
  assert.equal(item.suggestions[0].poster, movie.morelike_poster.replace('------------------', movie.suggest[0].id));
  assert.equal(sourceCalls(calls)[0].options.headers.Ott, 'pv');
});

test('native Prime series preserves season, episode and recommendation IDs', async () => {
  const fixture = FIXTURES.series;
  const { prime, calls } = harness('android', url => url.endsWith('/post.php?id=' + fixture.main_id) && { data: fixture });
  const item = await prime.fetchTitle(fixture.main_id);
  assert.equal(item.type, 'series');
  assert.equal(item.selectedSeason, fixture.season.find(season => season.selected).id);
  assert.deepEqual(copy(item.seasons.map(season => season.id)), fixture.season.map(season => season.id));
  assert.equal(item.episodes[0].netmirrorId, fixture.episodes[0].id);
  assert.equal(item.episodes[0].thumb, fixture.ep_poster.replace('------------------', fixture.episodes[0].id));
  assert.equal(item.suggestions[0].id, 'pv-' + fixture.suggest[0].id);
  assert.equal(sourceCalls(calls)[0].options.headers.Ott, 'pv');
});

test('native Prime season request and search retain real provider IDs without numeric filtering', async () => {
  const season = FIXTURES.series.season.find(item => item.selected).id;
  const { prime, calls } = harness('android', url => {
    if (url.endsWith('/episodes.php?id=' + season)) return { data: FIXTURES.episodes };
    if (url.endsWith('/search.php?s=The%20Boys')) return { data: FIXTURES.search };
  });
  const episodes = await prime.fetchEpisodes('pv-' + season);
  assert.deepEqual(copy(episodes.map(episode => episode.netmirrorId)), FIXTURES.episodes.episodes.map(episode => episode.id));
  assert.equal(episodes[0].thumb, 'https://imgcdn.kim/pvepimg/341/' + FIXTURES.episodes.episodes[0].id + '.jpg');
  const results = await prime.search(' The Boys ');
  assert.deepEqual(copy(results.map(item => item.id)), FIXTURES.search.searchResult.map(item => 'pv-' + item.id));
  assert.equal(results[0].title, FIXTURES.search.searchResult[0].t);
  assert.ok(sourceCalls(calls).every(call => call.options.headers.Ott === 'pv'));
});

test('Prime and Netflix share transport paths but isolate storage and metadata caches', async () => {
  const { prime, netflix, storage, calls } = harness('android', (url, options) => {
    if (url.endsWith('/post.php?id=42')) return { data: {
      ...FIXTURES.movie, ott: options.headers.Ott, main_id: '42', title: options.headers.Ott === 'pv' ? 'Prime metadata' : 'Netflix metadata',
    } };
  });
  await prime.setSessionToken('prime-test-session'); await netflix.setSessionToken('netflix-test-session');
  assert.equal(storage.get('meflix_netmirror_pv_token'), 'prime-test-session');
  assert.equal(storage.get('meflix_netmirror_token'), 'netflix-test-session');
  assert.equal((await prime.fetchTitle('42')).title, 'Prime metadata');
  assert.equal((await netflix.fetchTitle('42')).title, 'Netflix metadata');
  assert.equal((await prime.fetchTitle('42')).title, 'Prime metadata');
  assert.equal((await netflix.fetchTitle('42')).title, 'Netflix metadata');
  assert.equal(sourceCalls(calls).length, 2);
  assert.deepEqual(sourceCalls(calls).map(call => [call.options.headers.Ott, call.options.headers.Usertoken]),
    [['pv', 'prime-test-session'], ['nf', 'netflix-test-session']]);
  await prime.clearSession();
  assert.equal(storage.has('meflix_netmirror_pv_token'), false);
  assert.equal(await netflix.getSessionToken(), 'netflix-test-session');
  assert.equal(storage.get('meflix_netmirror_token'), 'netflix-test-session');
});

test('Prime never silently authenticates or calls a native player without its own session', async () => {
  const { prime, calls } = harness('android', () => { throw new Error('No source request expected.'); },
    { meflix_netmirror_token: 'netflix-session-must-not-be-used' });
  const id = FIXTURES.series.main_id, episode = { netmirrorId: FIXTURES.series.episodes[0].id, num: 1, title: 'Episode' };
  await assert.rejects(prime.getPlaybackSource(id), error => error.code === 'AUTH_REQUIRED');
  await assert.rejects(prime.resolveAuthorizedTitle({ id: 'pv-' + id, netmirrorId: id, title: 'The Boys' }, episode),
    error => error.code === 'AUTH_REQUIRED');
  await assert.rejects(prime.authenticate(''), /code shown/);
  assert.equal(calls.length, 0, 'No discovery, player, or OTP request should be made.');
});

test('native Prime rejects source metadata from a different provider on every catalog route', async () => {
  const cases = [
    [service => service.fetchHome(), FIXTURES.home],
    [service => service.fetchTitle(FIXTURES.movie.main_id), FIXTURES.movie],
    [service => service.fetchEpisodes(FIXTURES.series.season[0].id), FIXTURES.episodes],
    [service => service.search('The Boys'), FIXTURES.search],
  ];
  for (const [invoke, fixture] of cases) {
    const { prime, calls } = harness('android', () => ({ data: { ...fixture, ott: 'nf' } }));
    await assert.rejects(invoke(prime), /different content provider|Prime Video catalog/);
    assert.ok(sourceCalls(calls).every(call => call.options.headers.Ott === 'pv'));
  }
});

test('web Prime uses only its same-origin cookie API for metadata, seasons, search, auth and playback errors', async () => {
  const id = FIXTURES.series.main_id, season = FIXTURES.series.season[0].id;
  const card = { id: 'pv-' + id, netmirrorId: id, title: 'The Boys', type: 'series', seasons: FIXTURES.series.season };
  const { prime, calls, reads, writes } = harness('web', url => {
    if (url === '/api/prime/home') return { data: { shelves: [], items: [card], featured: [card.id], stale: false } };
    if (url === '/api/prime/title?id=' + id) return { data: { card } };
    if (url === '/api/prime/episodes?id=' + season) return { data: FIXTURES.episodes };
    if (url === '/api/prime/search?q=The%20Boys') return { data: { items: [card] } };
    if (url === '/api/prime/auth') return { data: { authenticated: false } };
    if (url === '/api/prime/playback?id=' + id) return { status: 401, data: { code: 'AUTH_REQUIRED', error: 'Connect first.' } };
  });
  assert.equal((await prime.fetchHome()).items[0].id, card.id);
  assert.equal((await prime.fetchTitle('pv-' + id)).id, card.id);
  assert.equal((await prime.fetchEpisodes(season))[0].netmirrorId, FIXTURES.episodes.episodes[0].id);
  assert.equal((await prime.search('The Boys'))[0].id, card.id);
  assert.equal((await prime.getAuthInstructions()).authenticated, false);
  await assert.rejects(prime.getPlaybackSource(id), error => error.code === 'AUTH_REQUIRED');
  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.ok(call.url.startsWith('/api/prime/'));
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.headers.Ott, undefined);
    assert.equal(call.options.headers.Usertoken, undefined);
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.body, undefined);
  }
  assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});

test('unsafe Prime source IDs reject before source or auth requests', async () => {
  const { prime, calls } = harness('android', () => { throw new Error('No request expected.'); });
  for (const id of ['', '../escape', 'valid&ott=nf', 'https://example.test', 'x'.repeat(129)]) {
    await assert.rejects(prime.fetchTitle(id), /valid title/);
    await assert.rejects(prime.fetchEpisodes(id), /valid season/);
    await assert.rejects(prime.getPlaybackSource(id), /valid video/);
  }
  assert.equal(calls.length, 0);
});

const FIXTURES = {
  "home": {
    "ott": "pv",
    "imgcdn": "https://imgcdn.kim/pv/341/------------------.jpg",
    "imgcdn_v": "https://imgcdn.kim/poster/v/------------------.jpg",
    "imgcdn_h": "https://imgcdn.kim/pv/341/------------------.jpg",
    "detailsimgcdn": "https://imgcdn.kim/poster/h/------------------.jpg",
    "img_referer": "https://net52.cc",
    "slider": [
      {
        "id": "0M1G8W35R6LZYZ25OYBKKX3PBF",
        "img": "https://m.media-amazon.com/images/S/sonata-images-prod/PV_IN_TVOD_Obsession_299/08133256-f821-4b2b-a221-27c5e0e7f90c._UR3840,1440_SX2160_FMjpg_.jpeg",
        "desc": "A hopeless romantic finds himself getting exactly what he wished for but soon discovers that some desires come at a dark, sinister price.",
        "ua": "A 18+",
        "namelogo": "https://m.media-amazon.com/images/S/sonata-images-prod/PV_IN_TVOD_Obsession_299/3e1ce356-5185-4ff0-8533-33c8d469f51e._BR-6_AC_SX1000_FMwebp_.png",
        "title": ""
      }
    ],
    "post": [
      {
        "ids": "0QSVAEL7F2HL7MCGH5EQ6V7G17,0MRS7G4T0LW6PWNXYZRZP97SYH,0GZ76HXP3TQS4E42G5JI9KQR6Q,0RIGXSH2D86B5V2RNHQOZVRGAD,0T4QQ149SJ0V8W8MHKZUZZ70RP,0JB2DO61KP6RCWAHJ0QJWTWLMK,0HMR71WMGNXT1JWWJRC8RF3K9O,0IEWLNTKVQ78JHWWUUA701BFIF,0RGB4PQA5YLV6SITE3FTEYFV3U,0N0VRKCHYKXDHEV50D8IZF3LFU,0JIHKJ9VD04K1S5CAGG2QB7PBO,0N376V6Y5CZUAYUMX5ARI8JLVT,0PC2R6QV7H0ATZY6D6VIJB3EMP,0T0W5IBN2BBDVHNONZV7O56801,0I1O5BWCMBBNZG6D1Y3HOEZV4D,0ND94M0EXAZWY3SCFFU7BBHFE1,0T1VN2I8K77SXY3UPAY4YDHGX5,0JK1EWNIBX6BYI4TSQC94TXS3F,0OXJV2M892DYIEII3H85BZ90YH,0NVBLDPYYPPUYEVJRTZL4TTR69",
        "cate": "Action And Adventure Movies",
        "row": "h"
      },
      {
        "ids": "0OYIPCU5UZ7KN80DC27G5TSG8T,0TMZ739WDSSD02I8AFC7XQ105B,0PRMQ6MT7VCHALCGCT18K1RDKY,0N9MY3FIQAKATNW9JJOILFC6Z7,0QHLPZ8O1W9VTEDNG03QCGAPI2,0RZB1U1IL8TB1J9Z2UN3UF7H2C,0JVRCMM5QX6UT6H68UDP3DKOEP,0G7RB9ZEMVMPQIDSCT7KXFS8II,0RTZ57DQ6PBHH29UN5JS7U7CW4,0GQHG21OFLSHUZDYPB0PSL8UYE",
        "cate": "Top 10 Series in Prime",
        "row": "h"
      }
    ]
  },
  "movie": {
    "ott": "pv",
    "main_id": "0HBE4W5I7RRPPPB63C8GBBZ5I8",
    "title": "Awarapan 2",
    "type": "m",
    "year": "2026",
    "ua": "U/A 16+",
    "runtime": "2h 18m",
    "hdsd": "HD",
    "desc": "Vishesh Bhatt brings to you the second chapter of the blockbuster franchise Awarapan. Once a feared gangster, Shivam lives hidden away from his past, with no faith left in God or himself. But when fate pulls him into Bangkok's cartel war and forces him back into the darkness he swore never to return to, Shivam must choose what he is willing to live for, when there is nothing left to lose.",
    "moredetails": [
      {
        "k": "IMDB Rating",
        "v": "6.4"
      },
      {
        "k": "IMDB Genres",
        "v": "Action, Drama, Romance, Thriller"
      },
      {
        "k": "Cast",
        "v": "Emraan Hashmi, Disha Patani, Shabana Azmi, Shriya Saran, Puran Gabbi, Suvinder Vicky, Anirudha Rawal, Vijayant Kohli"
      },
      {
        "k": "Director",
        "v": "Nitin Kakkar"
      },
      {
        "k": "Writer",
        "v": "Vishesh Bhatt, Nitin Kakkar, Sanjay Masoomm"
      },
      {
        "k": "Producer",
        "v": "Vishesh Bhatt"
      },
      {
        "k": "Studio",
        "v": "Vishesh Pictures"
      },
      {
        "k": "Maturity Desc",
        "v": "Suitable for ages 16+"
      },
      {
        "k": "Maturity Reason",
        "v": "violence, foul language, alcohol use, substance use, tobacco depictions, Imitable behaviour, Fighting"
      }
    ],
    "episodes": [
      null
    ],
    "suggest": [
      {
        "id": "0M14YN301CED8ZG4E3LOW87DMW"
      },
      {
        "id": "0HFA1BPAXG7FK2VZ4CP2WY5U9B"
      },
      {
        "id": "0TXB6FHRNMW0AWPYS454XKX3M4"
      },
      {
        "id": "0NLS9KG005OOBFIYVQM3J0WJL2"
      },
      {
        "id": "0TPJDTY336QK2L2IMMR3LHPF9K"
      },
      {
        "id": "0U9KZW52ZC134PEYXMOJW9K513"
      },
      {
        "id": "0Q2NQ37JYS1O5F6NQYKYQGSWJP"
      },
      {
        "id": "0L48K3ACBRWE9NCRGPNMZ75ILZ"
      },
      {
        "id": "0GLQVG4EP4D1MLL4CPHKSJJ1XZ"
      }
    ],
    "main_poster": "https://imgcdn.kim/pv/c/------------------.jpg",
    "ep_poster": "https://imgcdn.kim/pvepimg/341/------------------.jpg",
    "morelike_poster": "https://imgcdn.kim/pv/341/------------------.jpg"
  },
  "series": {
    "ott": "pv",
    "main_id": "0KRGHGZCHKS920ZQGY5LBRF7MA",
    "title": "The Boys",
    "type": "t",
    "year": "2019",
    "ua": "U/A 18+ [A]",
    "hdsd": "HD",
    "desc": "In a world where superheroes embrace the darker side of their massive celebrity and fame, THE BOYS centers on a group of vigilantes known informally as “The Boys,” who set out to take down corrupt superheroes with no more than their blue collar grit and a willingness to fight dirty.",
    "moredetails": [
      {
        "k": "IMDB Rating",
        "v": "8.7"
      },
      {
        "k": "IMDB Genres",
        "v": "Action, Comedy, Crime, Drama, Sci-Fi"
      },
      {
        "k": "Cast",
        "v": "Karl Urban, Jack Quaid, Antony Starr, Erin Moriarty, Dominique Mcelligott, Jessie T. Usher, Laz Alonso, Chace Crawford, Tomer Capon, Karen Fukuhara, Nathan Mitchell, Elisabeth Shue"
      },
      {
        "k": "Director",
        "v": "Dan Trachtenberg, Matt Shakman, Phil Sgriccia, Fred Toye, Stefan Schwartz, Jennifer Phang, Dan Attias, Eric Kripke"
      },
      {
        "k": "Producer",
        "v": "Eric Kripke, Seth Rogen, Evan Goldberg, James Weaver, Neal Moritz, Ori Marmur, Pavun Shetty, Ken F. Levin, Jason Netter, Garth Ennis, Darick Robertson, Craig Rosenberg, Anne Cofell Saunders, Phil Sgriccia, Rebecca Sonnenshine"
      },
      {
        "k": "Studio",
        "v": "Amazon Studios"
      },
      {
        "k": "Maturity Desc",
        "v": "Suitable for ages 18 and older"
      },
      {
        "k": "Maturity Reason",
        "v": "alcohol use, tobacco depictions, substance use, nudity, sexual content, foul language, violence"
      }
    ],
    "season": [
      {
        "s": "Season 1 (8 EP)",
        "id": "0KRGHGZCHKS920ZQGY5LBRF7MA",
        "selected": false
      },
      {
        "s": "Season 2 (8 EP)",
        "id": "0LTURNRIIF1SFJUX32I7XALS8U",
        "selected": false
      },
      {
        "s": "Season 3 (8 EP)",
        "id": "0HLDL6JTNVIK6GJDH0UIW4TES8",
        "selected": false
      },
      {
        "s": "Season 4 (8 EP)",
        "id": "0SSV1CIYHPUKDFUE5JOYRDKF06",
        "selected": false
      },
      {
        "s": "Season 5 (8 EP)",
        "id": "0N9BB22P2FZ8UD2BBLNX07RP22",
        "selected": true
      }
    ],
    "main_poster": "https://imgcdn.kim/pv/c/------------------.jpg",
    "ep_poster": "https://imgcdn.kim/pvepimg/341/------------------.jpg",
    "morelike_poster": "https://imgcdn.kim/pv/341/------------------.jpg",
    "episodes": [
      {
        "id": "0SXKMY213EM2FCKUVVKUW95I2C",
        "t": "Fifteen Inches of Sheer Dynamite",
        "ep": "1",
        "ep_desc": "ATTENTION FREEDOM CAMPERS: ESCAPE ATTEMPTS WILL BE MET WITH DEADLY FORCE. Have a super day!",
        "info": [
          "Apr 8, 2026",
          "A",
          "63m"
        ]
      },
      {
        "id": "0FX1R3RCDS4LZSFJ9KPUBXJFAA",
        "t": "Teenage Kix",
        "ep": "2",
        "ep_desc": "Tonight at 9/8C a @VoughtNews special report: Is your loved one a secret Starlighter terrorist?",
        "info": [
          "Apr 8, 2026",
          "A",
          "62m"
        ]
      }
    ],
    "suggest": [
      {
        "id": "0KHTC1GRK6A4F475G6H3SRYRIN"
      },
      {
        "id": "0JCCNCJCL2RFSOGXZZZRFC0Z0D"
      }
    ]
  },
  "episodes": {
    "ott": "pv",
    "episodes": [
      {
        "id": "0SXKMY213EM2FCKUVVKUW95I2C",
        "t": "Fifteen Inches of Sheer Dynamite",
        "ep": "1",
        "ep_desc": "ATTENTION FREEDOM CAMPERS: ESCAPE ATTEMPTS WILL BE MET WITH DEADLY FORCE. Have a super day!",
        "info": [
          "Apr 8, 2026",
          "A",
          "63m"
        ]
      },
      {
        "id": "0FX1R3RCDS4LZSFJ9KPUBXJFAA",
        "t": "Teenage Kix",
        "ep": "2",
        "ep_desc": "Tonight at 9/8C a @VoughtNews special report: Is your loved one a secret Starlighter terrorist?",
        "info": [
          "Apr 8, 2026",
          "A",
          "62m"
        ]
      }
    ]
  },
  "search": {
    "ott": "pv",
    "imgcdn": "https://imgcdn.kim/pv/341/------------------.jpg",
    "detailsimgcdn": "https://imgcdn.kim/poster/h/------------------.jpg",
    "img_referer": "https://net52.cc",
    "searchResult": [
      {
        "id": "0NSPK8CXRVWRF9LXT1WGZ9MES0",
        "t": "The Boys"
      },
      {
        "id": "0KRGHGZCHKS920ZQGY5LBRF7MA",
        "t": "The Boys"
      },
      {
        "id": "0OSBERMU4VQ3X8L55GXGKNQYBN",
        "t": "The Boys in The Boat"
      }
    ]
  }
};
