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

/**
 * `no-undef` for JSX components — the half the base rule cannot see.
 *
 * ESLint parses `<CancelSheet />` as a JSXIdentifier, not an Identifier, so
 * `no-undef` never looks at it. A refactor that deletes a component while call
 * sites still render it therefore lints clean, builds clean, and throws
 * "CancelSheet is not defined" the moment the screen opens — which is exactly
 * the crash class this config exists to stop, escaping through the one door it
 * had left open.
 *
 * Lower-case names are HTML tags and are skipped. Member expressions
 * (`<Motion.div>`) are checked on their root object only.
 */
const jsxNoUndef = {
  create(context) {
    function rootName(node) {
      if (node.type === 'JSXIdentifier') return node.name;
      if (node.type === 'JSXMemberExpression') return rootName(node.object);
      return null;   // namespaced (<svg:path>) — not a component reference
    }

    function resolves(scope, name) {
      for (let s = scope; s; s = s.upper) {
        if (s.variables.some((v) => v.name === name)) return true;
      }
      return false;
    }

    return {
      JSXOpeningElement(node) {
        const name = rootName(node.name);
        // Host elements are lower-case by JSX convention; components are not.
        if (!name || !/^[A-Z]/.test(name)) return;

        const scope = context.sourceCode.getScope(node);
        if (resolves(scope, name)) return;
        if (context.sourceCode.scopeManager.globalScope.through.every((r) => r.identifier.name !== name)) {
          context.report({ node, message: `'${name}' is not defined.` });
        }
      },
    };
  },
};

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
    plugins: {
      'react-hooks': { rules: { 'exhaustive-deps': noopRule, 'rules-of-hooks': noopRule } },
      local: { rules: { 'jsx-no-undef': jsxNoUndef } },
    },
    rules: {
      'no-undef': 'error',            // the crash class — undefined identifier
      'local/jsx-no-undef': 'error',  // …and the same class inside JSX

      /**
       * The OTHER crash class: a `const` read before the line that declares it.
       *
       * `no-undef` cannot see this one — the identifier does exist, it is just
       * still in the temporal dead zone — so it lints clean, builds clean, and
       * throws "Cannot access 'x' before initialization" the instant the
       * component renders. Exactly that shipped to the worker's repair job page
       * and took the whole screen down.
       *
       * Functions are exempt because hoisted function declarations are a normal
       * and readable way to keep helpers below the component that uses them;
       * classes and variables are not.
       */
      'no-use-before-define': ['error', {
        functions: false,
        classes: true,
        variables: true,
        allowNamedExports: true,
      }],
    },
  },
];
