# Netflix APK UI audit

Reference: Netflix Android 9.88.0 build 7 74729 (`f9a3f797ab98c962fb2f605276442e13de17737494e98896e4ec3d2cc3618cc6`). Evidence is from static inspection of the shipped APK. The emulator only reached the logged-out signup screen, so signed-in layouts, account experiments, and exact pixel measurements could not be verified.

## Verified from the APK

- Navigation has Home, Games, My Netflix, Search, Up Next, and Vertical Video Feed variants. The runtime can enable or hide variants; the bottom bar accepts at most five tabs. This does not prove that all tabs appear at once.
- Artwork metadata includes separate portrait boxshots/billboards and landscape stills. Choosing the right artwork shape matters more than copying a guessed universal card size.
- Player metadata names a top bar with Back, Title, and Thumbs slots; play/pause and ten-second seek controls; a seek bar; Audio & Subtitles; and Episodes. Compact and regular control sizes differ by layout.

## Current Meflix comparison

- The primary navigation and profile headers already apply safe-area insets. The app did not seed the provider with the platform's initial inset measurements, which could briefly place the header at the screen edge before measurement. `App.tsx` now passes `initialWindowMetrics` to each provider to prevent that first-frame jump.
- Meflix's mobile three-item tab bar is a reasonable enabled subset of the APK's conditional navigation. The APK does not establish which exact subset this account or device should show.
- Browse cards use separate poster/backdrop fields and the shared cached artwork loader. The Netflix APK has many more artwork variants; exact image-shape matching still depends on the source supplying those variants.
- The Netflix player now has the observed control actions, but its overall screen, details, recommendations, and browse-row geometry remain Meflix reconstructions. The APK evidence does not support claiming a pixel-perfect clone for those screens.

## Remaining work, ordered by evidence

1. Map source artwork to portrait cards and landscape heroes/episode stills consistently; avoid stretching one image shape into every slot.
2. Compare the player on a device with the native APK using the same orientation and playback state. Verify control reveal/hide, subtitle/audio selection, episodes, and fullscreen behavior before tuning spacing.
3. Capture signed-in reference screens for home, search, details, and profile navigation. Without those runtime screens, exact component geometry and enabled navigation cannot be confirmed from the APK alone.

Detailed source observations: [`outputs/netflix-mobile-apk/nav-observations.md`](../../outputs/netflix-mobile-apk/nav-observations.md) and [`outputs/netflix-mobile-apk/player-observations.md`](../../outputs/netflix-mobile-apk/player-observations.md).
