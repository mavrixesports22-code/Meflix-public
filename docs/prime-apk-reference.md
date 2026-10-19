# Supplied Prime Video APK reference

The current implementation uses the live Prime-specific `pv` provider. The initial sample-catalog implementation and its earlier checks below are historical; that sample catalog has been removed. See [current source integration and verification](netmirror-prime-source.md).

This is an offline reconstruction reference for `meflix-native`, not a claim of Prime Video service integration or complete behavioral parity. No APK execution, account sign-in, network request, entitlement, or DRM operation was performed.

## Source and provenance

- Supplied file: `C:\Users\ASUS\Downloads\prime-video-3-0-477-1147.apk`
- SHA-256 (REA open_binary): `8c3fbd177fc634037012e44db52c1b4d07f1afc3b547d22ac5aac80307c832f7`
- REA inspect_artifact summary evidence: `ev_d5fcf087dfc2d4fef54e44f4bde5581d755d044c65e6d785d82a9d409118c618`
- REA parent evidence: `ev_a57587e5e14a5f998de42dee03a8f7a1c8ae03483f62c1605303d7dd7bf2b13a`
- REA summary reported 7,232 archive graph entries; Python ZIP member inventory reports 7,231 names. These are distinct inventory representations, not a verified corrupt archive.
- Existing Android SDK `build-tools\36.0.0\aapt.exe` was used for read-only `dump badging` and `dump --values resources` fallback.
- Package: `com.amazon.avod.thirdpartyclient`; version `3.0.477.1147` / `477001147`; minimum SDK 28; target and compile SDK 36.
- `inspect_android_package` unavailable because `REA_JADX_MCP_JAR` is missing; `decode_android_resources` unavailable because apktool is missing. No REA configuration changes or prerequisite installation were performed.

Raw evidence is retained outside the app source at `E:\ria\outputs\prime-video-reference`: `badging.txt`, `resources.txt`, `archive-members.txt`, `default-resources.json`, `feature-strings.json`, `colors.json`, and `focused-ui-resources.json`. JSON extracts retain Android resource IDs and names; `resolved` follows references within the default resource configuration. Config-specific overrides may differ.

## Observed packaged design tokens

These are exact default resource values, including resolved aliases. Presence does not prove use in a particular live screen.

- `fable_color_background`: `#00050D`.
- `fable_color_brand`: `#0070F0`.
- `fable_color_text_primary` and `fable_color_text_metadata_emphasis`: `#FFFFFF`.
- `fable_color_text_metadata_subtle` and `fable_color_text_carousel_header`: `#999999`.
- `pvui_bottom_navigation_color_background`: `#000000`.
- Entitled navigation glow: `#0070F0`; unentitled glow start is 50% white and center line is 40% white.
- `bottom_navigation_bar_height`: 56dp.
- `fable_button_height_min`: 44dp; icon surface size 48dp; avatar size 24dp.
- Label button border radius: 8dp; size-100 minimum label height: 40dp; horizontal/vertical padding: 11dp/8dp.
- Dark pill icon: 18dp; horizontal/vertical padding: 16dp/8dp.

## Observed feature vocabulary

Exact English labels are shipped in the APK default strings: `Home`, `Movies`, `TV shows`, `Live`, `Downloads`, `My Stuff`, `Watchlist`, `Categories`, `Who's watching?`, `Create profile`, `Add to Watchlist`, `Remove from Watchlist`, `No videos downloaded`, `Auto Downloads`, `Skip Intro`, `Next episode`, `Subtitles`, `Streaming quality`, `Best`, `Better`, `Good`, and `Data Saver`.

Resource families also cover adult/teen/kid profiles, profile PINs, casting/device linking, X-Ray, audio/subtitle choices, downloads and automatic episode downloads, parental controls, live sports, ads, subscriptions, rentals/purchases, playback speed, and next-up playback. These establish packaged capability vocabulary only. They do not prove enabled features for the user's region/account or active navigation ordering.

The APK contains `assets/index.android.bundle` (1,171,544 bytes) and `assets/index.jsi.bundle` (51,952 bytes). Their binary headers are consistent with Hermes bytecode, not readable JavaScript source; no original React Native source was recovered from them.

## Implementation and verification boundary

A local UI can reuse the observed labels, color tokens, navigation vocabulary and interaction patterns with the existing MeFlix catalog and player. Actual Amazon authentication, customer profiles, licensed catalog metadata/artwork, watch history, purchases, subscriptions, casting behavior, streaming licenses and offline DRM downloads remain external service capabilities. No such integration is established by inspecting this APK.

Pixel-perfect screen structure, server-driven page ordering, animations, timing and all-feature parity remain unknown without authorized runtime observations and working service dependencies. Local watchlist or settings changes should be described as MeFlix state; a download action must reflect actual downloaded local media before showing completion. Do not collect Amazon credentials in a recreated local sign-in form or imply the APK contains reusable service authorization.

## Implemented and checked in Meflix

The Prime Video service profile now routes to `src/prime/PrimeVideoApp.tsx`. It has responsive mobile/desktop navigation, a featured carousel, movie/TV filters, genre browsing, search, title and episode details, related titles, profile switching and a separate persistent watchlist. Direct source URLs and viewing progress use Prime/profile-specific storage. Replacing a source resets only its own timeline. The Expo player provides device-native playback controls and source validation/error/retry behavior.

`npm test` passes TypeScript, the 10 existing checks, 9 Prime state/catalog tests, and player lifecycle assertions. Production Expo web and Android/Hermes bundle exports pass. No Android APK was built or installed in this task; browser verification does not establish native-device, iOS, casting or DRM behavior.

REA controlled browser runs against the existing app at `http://localhost:8081/` verified:

- 320px mobile: profile selection → Prime → details → add to watchlist → My Stuff → search → details → source validation. Evidence `ev_3117ec852817c41e69f532fcc3c29aba7b310445c7a3fed6bef9268ae50a5906`.
- 390px mobile: Downloads/Live states, category browsing, settings → profile switch → existing Meflix experience. Evidence `ev_91ec4df24010c1ec56358541604aeecb72780460ca5cf34384b38c3546f0bcc9`.
- 1440px desktop: TV filter → title details → episode source form → close → restored details → browsing. Evidence `ev_3a642356eb55e63837da5ede27796cb184f50d35b02690a07403d585eb025b93`.
- Actual video decode/playback using a locally served copy of MDN's CC0 flower test video. The screenshot shows the flower frame, a pause control and elapsed time. This tests user-source playback, not Prime content. Evidence `ev_662c59c1d82ea452b38796184600b6de51d3d2e31d6e52950708f5e0215f1b1d`.
- Final 320px/1440px layout checks after correcting the filter-row height: `ev_f8cf1b1cd6661067e2ecf3af7cb01c816e9d09e81260222f4e8771938f099090` and `ev_73d06c6526a56cfdc60a93770d939d9f00dfb222669d3108d3059bd8a615fe54`.

These runs recorded no page errors. Runtime JSON and screenshots are saved beside the static evidence in `outputs/prime-video-reference`. External title artwork requires network access and may load after the screen becomes interactive. The fixture media server was stopped after verification.
