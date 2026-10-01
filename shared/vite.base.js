import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const SHARED_SRC = fileURLToPath(new URL('./src', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
// The one place for images, shared by every app (see assets/README.md).
const ASSETS = path.join(REPO_ROOT, 'assets');
const ASSETS_WEB = path.join(ASSETS, 'web');

const TYPES = { '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/**
 * assets/web/ is served at the root of EVERY app: in dev from the folder, in a
 * build copied into dist/. An app's own public/ keeps only what is its own
 * (robots.txt, sitemap, manifest, service worker) and wins on a clash.
 */
function globalWebAssets() {
  let outDir = null;
  return {
    name: 'zappy-global-web-assets',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]);
        const file = path.join(ASSETS_WEB, rel);
        if (!file.startsWith(ASSETS_WEB) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      const copy = (from, to) => {
        for (const name of fs.readdirSync(from)) {
          const src = path.join(from, name);
          const dest = path.join(to, name);
          if (fs.statSync(src).isDirectory()) { fs.mkdirSync(dest, { recursive: true }); copy(src, dest); }
          else if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
        }
      };
      if (outDir && fs.existsSync(ASSETS_WEB)) copy(ASSETS_WEB, outDir);
    },
  };
}

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
    plugins: [...(plugins || []), globalWebAssets()],
    resolve: {
      alias: { '@shared': SHARED_SRC, '@assets': ASSETS },
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
