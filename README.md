# Meflix — React Native & Expo Multi-Platform Universal App

Select **Prime Video** on the service profile screen to open the Prime-specific catalog. Its home shelves, featured titles, search, details, seasons, episodes and recommendations come from the connected source's `pv` provider. Netflix uses the separate `nf` provider. Prime no longer imports a bundled sample catalog or falls back to Netflix results. The two providers keep separate metadata caches, content-service sessions and browser media routes.

The Prime interface uses colors, labels and dimensions inspected from the supplied APK. Playback resolves the selected Prime movie/episode through the content service and requires a valid service session; sign-in uses the code you enter. This does not connect an Amazon account. Offline downloads and a live-channel feed are not provided by this integration. See [Prime source evidence](docs/netmirror-prime-source.md) and [UI reference evidence](docs/prime-apk-reference.md).

Web development uses `npm start` / `npm run web`; restart Metro after changing its middleware. Browser requests use the same-origin `/api/prime/` and `/api/netmirror/` APIs to avoid upstream CORS restrictions. For a production web export, run `npm run web:build` then `npm run web:serve` (default `http://127.0.0.1:8090`). Keep `meflix-native` beside the repository's `netmirror-service.js` and `lib` directory, which supply the shared backend. Native clients contact the discovered source directly.

Official React Native + Expo implementation of **Meflix**, built for **Android** (Handset & Tablet), **iOS** (iPhone & iPad), **Windows / Desktop**, and **TV Platforms** (Android TV, Google TV, Apple TV / tvOS, and Fire TV).

---

## ✨ Features & Architecture

- **100% UI and UX Fidelity**:
  - Netflix-accurate Dark Theme (`#101012` slate background, `#E50914` iconic red accents, glassmorphic headers).
  - Modern typography using Google Fonts (Outfit for brand/headings and Inter for UI text).
  - Full billboard hero section with dual gradient vignettes, match rating pills, age maturity badges, resolution tags, and action buttons.
  - 28 dynamic shelves and carousels with smooth horizontal scrolling and Top 10 numbered badges.
- **TV & 10-Foot Experience Engine**:
  - D-Pad spatial focus engine (`Focusable`) with focus scaling and focus rings.
  - Remote control listener (`useTVRemote`) handling Up, Down, Left, Right, Select, Play/Pause, and Back keys.
  - Android & TV hardware back-button integration.
- **Hardware-Accelerated Video Player**:
  - Powered by `expo-video` for native HLS streaming.
  - Custom Netflix HUD with 4-second auto-fade timer.
  - Interactive seek scrubber with real-time timecodes.
  - Audio language and subtitle track switching sheet.
  - Playback speed multiplier (0.5×, 1×, 1.25×, 1.5×, 2×) and aspect ratio fit modes (`contain` / `cover`).
  - Episode drawer for instant episode jumping during series playback.
  - Mini-player (Picture-in-Picture) allowing users to browse the catalog while video plays in the corner.
- **Offline-First Data & Persistence**:
  - 384 curated titles and 28 shelves bundled in `catalogSnapshot.json` for instant browsing with zero network delay.
  - Watch History persistence with 100-entry normalized history, continue-watching progress bars, resume at timestamp, and history management screen.
  - My List watchlist stored locally via `@react-native-async-storage/async-storage`.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20
- npm >= 10

### Running the App

```bash
# Navigate to the React Native project
cd meflix-native

# Start Expo development server (Metro)
npm start

# Run on Android Handset / Tablet / Android TV
npm run android

# Run on iOS / iPad / Apple TV (tvOS)
npm run ios

# Run on Web / Desktop
npm run web
```

### Running the Automated Test Suite

```bash
npm test
```
The test suite performs full TypeScript compile verification and checks:
1. Catalog snapshot integrity (384 titles, 28 shelves)
2. Starter catalog items & metadata
3. Watch History normalization & completion math
4. Multi-field search matching
5. Netflix theme tokens
6. Universal TV & mobile platform configuration in `app.json`

---

## 📁 Directory Structure

```
meflix-native/
├── app.json                    # Universal platform & TV config plugins
├── package.json                # Dependencies and run scripts
├── tsconfig.json               # TypeScript configuration
├── test-runner.cjs             # Unit and integration test suite
├── assets/                     # Brand logos, wordmarks, icons
│   └── brand/
├── src/
│   ├── theme/                  # Theme tokens (colors, typography)
│   ├── types/                  # TypeScript data interfaces
│   ├── services/               # Storage, history & catalog services
│   ├── data/                   # Bundled catalog snapshot & starter data
│   ├── hooks/                  # Custom React hooks (useMyList, useWatchHistory, useTVRemote)
│   ├── components/
│   │   ├── common/             # Focusable, Badge, Toast, Icons
│   │   ├── navigation/         # TopNavbar, MobileTabBar
│   │   ├── home/               # BillboardHero, ShelfRow, TitleCard, ContinueWatchingRow
│   │   ├── search/             # SearchGrid
│   │   ├── history/            # WatchHistoryScreen
│   │   ├── details/            # TitleDetailModal
│   │   └── player/             # CustomVideoPlayer
│   └── App.tsx                 # Root application coordinator
```
