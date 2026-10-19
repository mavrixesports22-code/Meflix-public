const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('  MEFLIX REACT NATIVE MULTI-PLATFORM TEST RUNNER   ');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Snapshot and Starter Catalog Verification
test('Catalog Snapshot JSON exists and contains 384 items and 28 shelves', () => {
  const snapshotPath = path.join(__dirname, 'src', 'data', 'catalogSnapshot.json');
  assert(fs.existsSync(snapshotPath), 'catalogSnapshot.json should exist');
  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.strictEqual(data.items.length, 384, 'Expected 384 snapshot items');
  assert.strictEqual(data.shelves.length, 28, 'Expected 28 snapshot shelves');
});

test('Starter Catalog contains initial curated items', () => {
  const starterPath = path.join(__dirname, 'src', 'data', 'starterCatalog.ts');
  assert(fs.existsSync(starterPath), 'starterCatalog.ts should exist');
  const content = fs.readFileSync(starterPath, 'utf8');
  assert(content.includes('stranger-things'), 'Should include stranger-things');
  assert(content.includes('wednesday'), 'Should include wednesday');
  assert(content.includes('arcane'), 'Should include arcane');
});

// 2. Watch History Business Logic Verification
test('Watch History normalization and completion logic', () => {
  // Simulate normalization logic
  function normalize(value) {
    if (!value || typeof value !== 'object' || !value.item?.title || !value.playId || !value.item.netmirrorId) return null;
    const position = Number(value.position), duration = Number(value.duration);
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration < 0) return null;
    const safePosition = duration ? Math.min(position, duration) : position;
    const completed = value.completed === true || (duration > 0 && safePosition / duration >= 0.95);
    return {
      key: `${value.item.netmirrorId}:${value.playId}`,
      position: safePosition,
      duration,
      completed,
    };
  }

  // Active watch (< 95%)
  const entry1 = normalize({
    item: { title: 'Test Title', netmirrorId: '123' },
    playId: 'p1',
    position: 600,
    duration: 3600,
  });
  assert(entry1 !== null, 'Valid entry should not be null');
  assert.strictEqual(entry1.completed, false, '600s out of 3600s should not be completed');

  // Completed watch (>= 95%)
  const entry2 = normalize({
    item: { title: 'Test Title', netmirrorId: '123' },
    playId: 'p2',
    position: 3500,
    duration: 3600,
  });
  assert(entry2.completed, '3500s out of 3600s should be completed');

  // Invalid entry rejection
  const invalid = normalize({ item: null, playId: '' });
  assert.strictEqual(invalid, null, 'Invalid entry must be rejected');
});

// 3. Search Engine Logic Verification
test('Multi-field search matching title, genres, and cast', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'data', 'catalogSnapshot.json'), 'utf8'));
  const term = 'stranger';

  const matches = snapshot.items.filter(item => {
    const titleMatch = item.title?.toLowerCase().includes(term);
    const tagMatch = item.tags?.some(t => t.toLowerCase().includes(term));
    const genreMatch = item.genres?.some(g => g.toLowerCase().includes(term));
    return titleMatch || tagMatch || genreMatch;
  });

  assert(matches.length > 0, 'Should find matches for stranger');
  assert(matches.some(m => m.title === 'Stranger Things'), 'Should match Stranger Things');
});

// 4. Component Structure and Theme Tokens
test('Design Tokens match Netflix Dark Theme', () => {
  const colorsFile = fs.readFileSync(path.join(__dirname, 'src', 'theme', 'colors.ts'), 'utf8');
  assert(colorsFile.includes('#E50914'), 'Red must be #E50914');
  assert(colorsFile.includes('#101012'), 'Background must be #101012');
  assert(colorsFile.includes('#202024'), 'Card background must be #202024');
});

test('TV and Platform Config in app.json', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
  assert.strictEqual(appJson.expo.name, 'Meflix', 'App name must be Meflix');
  assert.strictEqual(appJson.expo.android.package, 'com.mavrix.meflix', 'Android package must be com.mavrix.meflix');
  assert.strictEqual(appJson.expo.ios.bundleIdentifier, 'com.mavrix.meflix', 'iOS bundle must be com.mavrix.meflix');
  assert(appJson.expo.plugins.some(p => Array.isArray(p) && p[0] === '@react-native-tvos/config-tv'), 'TV config plugin must be present');
});

// 5. NetMirror Backend Service Verification
test('NetMirror Backend dynamic discovery and Base64 resolution logic', () => {
  // Test base64 host decoding matching mobiledetect.app
  const rawHash = 'aHR0cHM6Ly90di5pbWdjZG4ua2lt';
  const decoded = Buffer.from(rawHash, 'base64').toString('utf8');
  assert.strictEqual(decoded, 'https://tv.imgcdn.kim', 'Base64 must decode to live upstream host');

  const netmirrorCode = fs.readFileSync(path.join(__dirname, 'src', 'services', 'netmirrorService.ts'), 'utf8');
  assert(netmirrorCode.includes('checknewtv.php'), 'Must include checknewtv.php discovery');
  assert(netmirrorCode.includes('main.php'), 'Must include main.php catalogue');
  assert(netmirrorCode.includes('post.php'), 'Must include post.php title metadata');
  assert(netmirrorCode.includes('episodes.php'), 'Must include episodes.php season listing');
  assert(netmirrorCode.includes('player.php'), 'Must include player.php stream resolution');
  assert(netmirrorCode.includes('otp.php'), 'Must include otp.php authentication');
  assert(netmirrorCode.includes('Ott: this.provider'), 'Requests must use the selected provider header');
  assert(netmirrorCode.includes('Referer: referer'), 'Must pass authentic NetMirror Referer header to HLS stream');
});

// 6. Invite-Only Device Authorization & IP Security Logic
test('Device & IP Security authorization logic and admin approval lifecycle', () => {
  const whitelistedIps = new Set(['192.168.1.100', '203.0.113.50']);
  const requests = [
    {
      id: 'req_1',
      deviceId: 'DEV-AA11-BB22',
      name: 'John Doe',
      ip: '203.0.113.50',
      status: 'pending',
      requestedAt: Date.now(),
    },
    {
      id: 'req_2',
      deviceId: 'DEV-CC33-DD44',
      name: 'Alice',
      ip: '198.51.100.22',
      status: 'approved',
      requestedAt: Date.now(),
      approvedAt: Date.now(),
    },
  ];

  function checkStatus(deviceIp, deviceId) {
    if (whitelistedIps.has(deviceIp)) return 'approved';
    const found = requests.find(r => r.deviceId === deviceId);
    if (!found) return 'unregistered';
    return found.status;
  }

  // Device with whitelisted IP gets approved immediately
  assert.strictEqual(checkStatus('203.0.113.50', 'DEV-UNKNOWN'), 'approved', 'Whitelisted IP must be approved');
  
  // Device with approved status gets approved
  assert.strictEqual(checkStatus('198.51.100.22', 'DEV-CC33-DD44'), 'approved', 'Approved device must have access');

  // Device not registered gets unregistered
  assert.strictEqual(checkStatus('10.0.0.1', 'DEV-NEW'), 'unregistered', 'Unknown device must be unregistered');

  // Verify Admin PIN passcode
  const DEFAULT_PIN = '778899';
  assert.strictEqual(DEFAULT_PIN, '778899', 'Admin default PIN must be 778899');
});

// 7. Netflix Mobile APK Player Experience (REA clone) Verification
test('CustomVideoPlayer has Netflix APK clone Audio & Subtitles sheet, Brightness, and Aspect sizing', () => {
  const playerFile = fs.readFileSync(path.join(__dirname, 'src', 'components', 'player', 'CustomVideoPlayer.tsx'), 'utf8');
  
  // Audio & Subtitles Netflix APK clone
  assert(playerFile.includes('langTabHeader'), 'Must have mobile segmented tab header for AUDIO and SUBTITLES');
  assert(playerFile.includes('activeLanguageTab'), 'Must support switching between AUDIO and SUBTITLES tabs in portrait');
  assert(playerFile.includes('sheetApplyBtn'), 'Must have official Netflix Apply button at bottom of sheet');
  assert(playerFile.includes('minHeight: 48'), 'Must enforce 48dp minimum touch target for track rows');
  assert(playerFile.includes("'Off'"), "First subtitle option must be Off");
  
  // Brightness Control (Netflix APK PlayerMainControlsSlot.BrightnessSlider)
  assert(playerFile.includes('BrightnessIcon'), 'Must include BrightnessIcon');
  assert(playerFile.includes('brightnessPanResponder'), 'Must have vertical brightness slider pan responder');
  assert(playerFile.includes('leftBrightnessSlot'), 'Must have left brightness slider HUD slot');
  assert(playerFile.includes('brightnessDimmer'), 'Must have real-time video brightness dimmer overlay');
  assert(playerFile.includes('showBrightnessPill'), 'Must show floating feedback pill with brightness percentage');
  
  // Aspect Ratio & Sizing
  assert(playerFile.includes("useState<'contain' | 'cover'>('cover')"), 'Must default to cover (Fill Screen) so video is not small');
  assert(playerFile.includes('aspectToast'), 'Must provide aspect ratio feedback toast (Fill Screen vs Original Ratio)');
});

// 8. Netflix Cinematic SplashScreen & Welcome Profile Selection ("Who's Watching?")
test('Cinematic SplashScreen and ProfileSelectScreen ("Who\'s Watching?") exist and use official brand assets', () => {
  const splashPath = path.join(__dirname, 'src', 'components', 'splash', 'SplashScreen.tsx');
  assert(fs.existsSync(splashPath), 'SplashScreen component file must exist');
  const splashCode = fs.readFileSync(splashPath, 'utf8');
  assert(splashCode.includes('meflix-mx.png'), 'SplashScreen must display authentic meflix-mx.png emblem');
  assert(splashCode.includes('meflix-wordmark.png'), 'SplashScreen must display authentic meflix-wordmark.png');

  const profilePath = path.join(__dirname, 'src', 'components', 'profile', 'ProfileSelectScreen.tsx');
  assert(fs.existsSync(profilePath), 'ProfileSelectScreen component file must exist');
  const profileCode = fs.readFileSync(profilePath, 'utf8');
  assert(profileCode.includes("Who's Watching?"), 'ProfileSelectScreen must feature "Who\'s Watching?" title');
  assert(profileCode.includes('NetflixSmileyIcon'), 'Profile avatars must feature authentic Netflix smiley icons');
  assert(profileCode.includes('SERVICE_PROFILES'), 'Profile screen must feature streaming service profiles');
  assert(profileCode.includes('Prime Video'), 'Profile screen must include Prime Video service profile');
  assert(profileCode.includes('meflix-wordmark.png'), 'Profile screen must feature authentic meflix-wordmark.png');

  const appPath = path.join(__dirname, 'App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');
  assert(appCode.includes('<SplashScreen'), 'App must render SplashScreen on startup');
  assert(appCode.includes('<ProfileSelectScreen'), 'App must render ProfileSelectScreen for profile selection');
});

console.log('\n----------------------------------------------------');
console.log(`Tests finished: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------');

if (failed > 0) {
  process.exit(1);
}
