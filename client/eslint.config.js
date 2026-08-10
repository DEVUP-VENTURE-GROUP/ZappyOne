// ESLint flat config focused on the ONE class of bug that keeps reaching prod:
// runtime ReferenceErrors (no-undef) that a green Vite build can't catch — e.g. a
// refactor removes `const X` but a call site still references `X`, and it only
// crashes when that screen loads. `npm run lint` (and CI) fail on these now.
//
// Self-contained on purpose: browser globals are inlined so no `globals` package
// is needed, and the react-hooks rule names are stubbed as no-ops so the existing
// `// eslint-disable ... react-hooks/exhaustive-deps` comments don't error.

const RO = 'readonly';
const browserGlobals = Object.fromEntries([
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'self', 'top', 'parent', 'frames',
  'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Headers', 'Request', 'Response',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'MessageChannel', 'postMessage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'queueMicrotask', 'reportError',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'FileList', 'Image', 'Audio', 'ImageData',
  'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'scrollTo', 'atob', 'btoa', 'crypto',
  'Notification', 'IntersectionObserver', 'ResizeObserver', 'ResizeObserverEntry', 'MutationObserver', 'PerformanceObserver',
  'matchMedia', 'performance', 'structuredClone', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder',
  'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'PointerEvent', 'DragEvent', 'ClipboardEvent',
  'HTMLElement', 'HTMLInputElement', 'HTMLCanvasElement', 'Node', 'Element', 'NodeList', 'getComputedStyle',
  'DOMParser', 'XMLSerializer', 'CSS', 'DataTransfer', 'ClipboardItem', 'createImageBitmap', 'devicePixelRatio',
  'MediaRecorder', 'MediaStream', 'RTCPeerConnection', 'AudioContext',
  'speechSynthesis', 'SpeechSynthesisUtterance', 'webkitSpeechRecognition', 'SpeechRecognition',
  'process', 'global', 'globalThis', 'Intl', 'WeakRef', 'FinalizationRegistry',
  // Third-party runtime globals the app may reference
  'mapboxgl', 'google', 'gtag', 'dataLayer', 'Razorpay', 'Cashfree', 'Stripe',
  'React', 'JSX',
].map((k) => [k, RO]));

const noopRule = { create: () => ({}) };

export default [
  { ignores: ['dist/**', 'node_modules/**', '*.config.js', 'public/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    // Don't flag the many pre-existing `// eslint-disable react-hooks/...` comments
    // as "unused" — we only care about no-undef here, not those directives.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browserGlobals,
    },
    // Stub the react-hooks rule names so existing disable-directives resolve.
    plugins: { 'react-hooks': { rules: { 'exhaustive-deps': noopRule, 'rules-of-hooks': noopRule } } },
    rules: {
      'no-undef': 'error', // the crash class — undefined identifier at runtime
    },
  },
];
