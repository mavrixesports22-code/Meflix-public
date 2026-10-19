# NetMirror APK source investigation

The supplied mobile APK is a React Native WebView shell. Its packaged code discovers a web application URL remotely, then loads that URL in a WebView. Subsequent read-only checks independently confirmed a Prime-specific catalog on the repository's existing TV backend using the `Ott: pv` provider selector. That confirmation comes from public metadata responses, not from literal API routes in this mobile APK.

## Confirmed Prime catalog on the existing backend

The implementation source is the existing backend with provider header `Ott: pv`. The `/newtv/ott.php` provider inventory response listed `nf`, `pv`, and `hs`; `navbar.php` and `main.php` confirmed `ott: pv`. Read-only Node `fetch` requests independently verified the following exact metadata routes on `https://tv.imgcdn.kim`, with `Accept: application/json`, `Ott: pv`, and anonymous sentinel `Usertoken: none`. All returned HTTP 200. The metadata investigation did not request player or OTP routes.

- `/newtv/main.php`: `ott: pv`, four featured slides and 29 catalog rows. Rows include `Top 10 Series in Prime`, `Top 10 Movies in Prime`, `Recently Added Movies`, and `Romance Series`. Slider objects contain `id`, `img`, `desc`, `ua`, `namelogo`, and sometimes an empty `title`; row objects contain comma-separated `ids`, `cate`, and `row`.
- `/newtv/search.php?s=The%20Boys`: `ott: pv`, `searchResult` with ten `{id, t}` results. Search-result IDs must retain provider identity. Two results are named The Boys; the first resolves to a movie record, the second to the series, so title text alone cannot choose a series ID.
- `/newtv/post.php?id=0HBE4W5I7RRPPPB63C8GBBZ5I8`: movie record, `type: m`, `title: Awarapan 2`, metadata and suggestions. Its `episodes` array is `[null]` and must be filtered before mapping.
- `/newtv/post.php?id=0KRGHGZCHKS920ZQGY5LBRF7MA`: The Boys series, `type: t`, five seasons. Seasons are `{s, id, selected}`; selected season `0N9BB22P2FZ8UD2BBLNX07RP22` includes eight episode records.
- `/newtv/episodes.php?id=0N9BB22P2FZ8UD2BBLNX07RP22`: `ott: pv`, eight episodes; each contains `id`, `t`, `ep` (number string), `ep_desc`, and `info` (air date, maturity, duration such as `63m`). Response includes `d_lang`, `lang: [{l,s}]`, `nextPageShow`, `nextPage`, and `nextPageSeason`. The observed response has `nextPageShow: 0` and `nextPage: 2`; page number alone does not imply another page exists.

The observed Prime title, season, episode, slider, search, and recommendation IDs are 26-character uppercase alphanumeric strings, for example `0KRGHGZCHKS920ZQGY5LBRF7MA`. They are opaque provider IDs, not numeric Netflix IDs or TMDB IDs. Provider identity must accompany IDs, artwork, requests, cached metadata, history, and playback resolution.

Home artwork fields are `imgcdn`/`imgcdn_h: https://imgcdn.kim/pv/341/------------------.jpg`, `imgcdn_v: https://imgcdn.kim/poster/v/------------------.jpg`, and `detailsimgcdn: https://imgcdn.kim/poster/h/------------------.jpg`. Detail responses provide `main_poster: https://imgcdn.kim/pv/c/------------------.jpg`, `ep_poster: https://imgcdn.kim/pvepimg/341/------------------.jpg`, and `morelike_poster: https://imgcdn.kim/pv/341/------------------.jpg`. Preserve these source templates and `img_referer: https://net52.cc`; a generic numeric-ID artwork path is insufficient. Detail genre information is under `moredetails` key `IMDB Genres`; cast and director keys are `Cast` and `Director`. Suggestions are `{id}` records and require public detail hydration for names.

Raw public metadata snapshots and request provenance are retained under `outputs/netmirror-prime-source/prime-home.json`, `prime-search.json`, `prime-title.json`, `prime-title-0KRGHGZCHKS920ZQGY5LBRF7MA.json`, and `prime-episodes.json`. These are supplemental Node network observations, not REA browser captures. Returned `usertoken` values were the anonymous `none` sentinel. These observations establish public catalog behavior only; authentication and authorized Prime playback availability remain untested.

## Implemented integration and verification

Prime now instantiates the shared source transport with provider `pv`, while Netflix retains `nf`. Prime uses opaque IDs under `prime-pv-*`/`prime-pv-ep-*`, its own native session key, `prime_session` browser cookie, `.runtime/prime-catalog.json`, and `/api/prime/` browser routes. Metadata responses from the wrong provider are rejected. Bundled sample titles and substitute recommendations were removed from the Prime catalog. Metadata loads in bounded batches as rows/collections become visible; failures show a retry state.

Live local API checks returned `ott: pv`, 29 shelves and 429 title IDs. Search for The Boys returned ten provider results, preserving the distinction between its film and series records. The series resolved to five seasons, eight episodes in the selected season and nine source suggestions. These counts describe the observed response and can change upstream.

REA browser verification against the running Meflix app:

- Prime profile → live Prime home: `ev_e367c8bfbb7fd90618079d112f480328d86c8dc9a73d857ea616168152adaffe`.
- Search → The Boys series → Season 1 → play selected episode → source sign-in screen at 320px: `ev_5fa9573f09b56c3148ddc9dba401012c29e5ab25346648cd1e498d1939db04d0`.
- Search → series → save watchlist → source recommendations → My Stuff at 1440px: `ev_a73aa23fc5da9b3fe4883534be5dbb4cd2352f8f1272d77acdf1a3ee49811ca3`.

All of these flows recorded zero `/api/netmirror/` requests and no page errors. The sign-in check submitted no code and made no authentication POST. Playback resolution is connected to the Prime provider, but actual authenticated Prime media playback remains unverified without a valid service session. No live-channel feed was established and no offline download feature was added.

Verification summaries and screenshots are saved as `prime-live-*.json/png` under `outputs/netmirror-prime-source/`. `npm test` passes TypeScript, 10 existing checks, 42 state/catalog/source/server tests and player lifecycle assertions. The shared backend's five offline regression scripts pass, including `tools/check-prime-provider.cjs`. Production web export and Android/Hermes export both pass; no native APK was built or installed during this change.

## Mobile discovery and rejected alternative

An ordinary REA Chrome visit to `https://mobiledetect.app/check.php` returned HTTP 200 and a decoded public page URL `https://net52.cc/mobile/home?app=1` (Evidence `ev_42bf3b14d8da187b05aef3eb8a1d09145f6d796d04f03fcd887186d065f079eb`). That page returned HTTP 404 (Evidence `ev_a5bfa4bcb4056cf967e4ea8f3a1e22e4ab8114631d80bc4c5471a0a5b5690a14`). A normal origin-root visit redirected through `/home` to `https://net77.cc/verify2`, which displayed a human verification challenge with HTTP 403 (Evidence `ev_78d37b85c47d8b0598da3857b0c390db0e80587cc20b5ec3491dad0fa3c84585`). No challenge was bypassed or answered. `netmirror.app` timed out.

A prior separate public snapshot from `net27.cc` redirected to `net79.cc`. Its public Astro JavaScript contains `/api/catalog/discover?platform=PrimeVideo...`; an independent browser check confirmed this catalog returns TMDB IDs. This alternate site is not proven to belong to the supplied APK's remote application and is **not** the selected implementation source. Its IDs must never be passed to the existing NetMirror player. The public-script SHA-256 `e3db4746887e678d773ef539145d7f842c4d8f489e23ea27d97e553a8720d8a8` was independently verified against the current URL. Sanitized browser network observations are in `outputs/netmirror-prime-source/public-network-observations.json`.

## Artifact identity

- Input: `C:\Users\ASUS\Downloads\NetMirror.apk`
- APK SHA-256: `e78acd9ebabdfd765b7060f2b2f4fd46731baa3e501a978e7ddefde54417233d`
- Embedded member: `assets/index.android.bundle`, 1,215,172 bytes, Hermes bytecode version 96.
- Embedded member SHA-256: `f3045d1397843d6301b1a731ed221657f3c29d7e1559ad6951f438fbc9f92fdd`
- Prior `outputs/netmirror-tv-inspection/index.android.bundle` SHA-256: `d3704d01360f322381264f46d171728c42e2da33e93ce23ee4b43c93b76816db`. It is a different bundle; its disassembly and captured JSON are not evidence for this supplied APK.

## Observed static behavior

The custom version-96 Hermes decoder found 9,809 string entries and decoded function instructions without executing the APK or its bytecode.

1. `App`, function 5439, creates a list of encoded origin candidates. The string table includes `https://mobiledetect.app`, `https://mobiledetects.com`, and multiple `mobidetect`/`mobidetects` alternative domains encoded as base64. These are candidate origins, not verified active sources.
2. Generator function 5444 iterates candidates, decodes an origin, appends the decoded literal `/check.php` (string 258), and calls HTTP GET with a 5-second timeout. It reads the response fields `token_hash`, `stape`, and `u`. The decoded `token_hash` value is assigned to the state later used as the WebView URI. The later browser discovery observation above confirms that this field encodes a public page URL; reusable authentication material was not acquired.
3. `App` function 5439 renders `WebView` with that URI as `source.uri`, an empty `X-Requested-With` header value, JavaScript enabled, DOM storage enabled, and a device-derived user agent.
4. Function 5448 derives the user agent from the device user agent and appends an app-specific suffix. This observation does not establish a server authentication requirement.
5. Function 5501 receives WebView bridge messages beginning `downloadStart`; function 5505 injects a call to the page's `pressfromAPP` function for Android back navigation. Catalog, search, and title UI are consequently capable of living on the remote page rather than in the bundle.
6. `https://netmirror.app` is shown in the error UI; it is not directly used as a demonstrated catalog JSON API in the inspected code.

## Initial static questions and remaining limits

These limits describe what the supplied mobile APK alone establishes. The independently verified Prime metadata observations above answer catalog questions for the existing TV backend.

- **Home/catalog source:** Partially answered. The remote-page discovery route is `/check.php`; the actual returned page and downstream catalog routes were not acquired.
- **Search/results/details/episodes/suggestions/recommendations:** Unresolved from the supplied APK. No literal `/newtv/`, `/main.php`, `/post.php`, `/episodes.php`, or `/search.php` API route was found in the inspected Hermes string table. This bounded negative search does not exclude dynamically constructed or remotely delivered routes.
- **Prime versus Netflix provider IDs:** Unresolved from this APK. It supplies no statically demonstrated `nf`/`pv` catalog selector in the inspected application flow. Existing repository TV-source routes and selectors need their own source or response evidence.
- **Authentication:** Unknown. A discovery response field named `token_hash` is used, but static code alone does not prove whether the remote page requires user authentication, cookies, a device check, or an access challenge. No token was recovered and no access check was bypassed.
- **Live functionality:** Static inspection alone does not establish availability. The later read-only metadata requests above establish observed Prime catalog responses; they do not establish streaming, login, downloads, or DRM behavior.

## Evidence and reproducibility

REA archive inspection retained these identities:

- Inspection parent: `ev_ff1467630522c7b5cb56bd1a911946074cc14a4b9e935331b85014fddaa29ae7`.
- Summary view: `ev_7793d4978209380b34630a148b5c514de8797a7440889bc691efde50754e21ec`.
- Inventory: `ev_f1e406477cd30af9897c0c062f147129a0aaaa4c668778114da7c470a8b7e047`.
- Manifest: `agm_63ea20f212a4c1958250ad46d471f945c4959f90f07b32a45f32864cc21a478e`, 556 occurrences, no declared integrity contradictions.

Supplemental read-only analyst artifacts are in `outputs/netmirror-prime-source/`: `identity.json`, `focused-static-evidence.json`, the extracted bundle, the string table, and custom Hermes instruction decoding. These decoder outputs are not a REA decompiler result; static instruction interpretation remains subject to decoder limitations. The version-96 opcode description is reused from the existing inspection tooling; the inspected bundle itself is taken from the supplied APK and digest-verified. JADX was unavailable, so native Android class-level analysis was not performed. No APK or extracted code was executed, no credentials were extracted, and no DRM behavior was modified.
