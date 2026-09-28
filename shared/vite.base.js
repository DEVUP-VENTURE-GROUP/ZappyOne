import { fileURLToPath } from 'node:url';

const SHARED_SRC = fileURLToPath(new URL('./src', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Packages imported by shared/src. Deduping resolves them from the importing
// app's node_modules, so there is one React/Redux instance per bundle.
const SHARED_DEPS = [
  'react', 'react-dom', 'react-redux', 'react-router-dom', '@reduxjs/toolkit',
  'async-mutex', 'react-hot-toast', 'lucide-react', 'framer-motion', 'clsx',
  'mapbox-gl', 'socket.io-client', '@react-google-maps/api',
];

/**
 * Vite config shared by every web app (client, admin, servicepro, rakshak, events).
 *   surface — sent as x-client-type so the API keeps each portal's session in its own cookie
 *   chunks  — extra manualChunks for that app's heavy dependencies
 *   plugins — passed in by the app: shared/ has no node_modules of its own
 */
export function defineZappyApp({ command, port, plugins, surface = '', chunks = {}, optimizeDeps } = {}) {
  return {
    plugins,
    resolve: {
      alias: { '@shared': SHARED_SRC },
      dedupe: SHARED_DEPS,
    },
    define: {
      'import.meta.env.VITE_CLIENT_SURFACE': JSON.stringify(surface),
    },
    optimizeDeps,
    server: {
      port,
      strictPort: true,
      fs: { allow: [REPO_ROOT] },
      proxy: {
        '/api': 'http://localhost:4000',
        '/socket.io': {
          target: 'http://localhost:4000',
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') console.error('[proxy error]', err);
            });
          },
        },
      },
    },
    preview: { port, strictPort: true },
    build: {
      // Android Chrome 85+ / iOS Safari 14+.
      target: ['chrome85', 'safari14', 'firefox90', 'edge88'],
      chunkSizeWarningLimit: 600,
      cssCodeSplit: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-redux': ['@reduxjs/toolkit', 'react-redux'],
            'vendor-motion': ['framer-motion'],
            ...chunks,
          },
        },
      },
    },
    esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  };
}
