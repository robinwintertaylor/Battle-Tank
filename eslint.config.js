import js from '@eslint/js';

// SEC-19: no HTML sinks anywhere in the shipped code.
const htmlSinks = [
  { property: 'innerHTML', message: 'Use textContent (SEC-19).' },
  { property: 'outerHTML', message: 'Use textContent (SEC-19).' },
  { property: 'insertAdjacentHTML', message: 'Build nodes and use textContent (SEC-19).' },
  { object: 'document', property: 'write', message: 'Not allowed (SEC-19).' },
  { object: 'document', property: 'writeln', message: 'Not allowed (SEC-19).' },
];

// M12 and SEC-17: no network calls from the page (ARCHITECTURE.md section 6.3).
const networkGlobals = [
  { name: 'fetch', message: 'No network calls after load (M12).' },
  { name: 'XMLHttpRequest', message: 'No network calls after load (M12).' },
  { name: 'WebSocket', message: 'No network calls after load (M12).' },
  { name: 'EventSource', message: 'No network calls after load (M12).' },
];

// The same calls reached through a global object, such as window.fetch.
const networkProperties = [
  ...['window', 'self', 'globalThis'].flatMap((object) =>
    ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((property) => ({ object, property }))),
  { object: 'navigator', property: 'sendBeacon' },
].map((rule) => ({ ...rule, message: 'No network calls after load (M12).' }));

// T1 and T3: core/ and the pure render modules stay free of the browser,
// the clock and unseeded randomness (ARCHITECTURE.md section 2).
const pureGlobals = [
  'window', 'self', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'indexedDB',
  'performance', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame',
  'setTimeout', 'setInterval', 'AudioContext', 'HTMLCanvasElement', 'OffscreenCanvas',
].map((name) => ({ name, message: `${name} is not allowed in pure modules (ARCHITECTURE.md section 2).` }));

// Declared so that no-implied-eval and the restricted-globals rules see them.
// tsc -p jsconfig.json checks every other name against the DOM library.
const browserGlobals = {
  window: 'readonly',
  self: 'readonly',
  globalThis: 'readonly',
  document: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
};

export default [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'blob-report/', 'coverage/', 'docs/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['site/**/*.js'],
    languageOptions: { globals: browserGlobals },
    rules: {
      'no-undef': 'off',
      'no-restricted-properties': ['error', ...htmlSinks, ...networkProperties],
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-syntax': ['error', { selector: 'ImportExpression', message: 'Static imports only (ARCHITECTURE.md section 6.3).' }],
    },
  },
  {
    files: ['site/src/core/**/*.js', 'site/src/render/scene.js', 'site/src/render/camera.js', 'site/src/render/hud.js'],
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals, ...pureGlobals],
      'no-restricted-properties': ['error', ...htmlSinks, ...networkProperties,
        { object: 'Math', property: 'random', message: 'Use the seeded rng.js (T3).' },
        { object: 'globalThis', message: 'No global access in pure modules (ARCHITECTURE.md section 2).' },
      ],
    },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...nodeGlobals, document: 'readonly', window: 'readonly' } },
  },
];
