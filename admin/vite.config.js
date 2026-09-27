import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The admin portal is its own app on its own origin (admin.zappyone.com in
// production, :5174 locally). It shares the API layer, auth slice and a few
// helpers with the customer app by importing them from ../client/src — there
// is one copy of that code, not two.
const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// Packages the shared client files import. Deduping forces them to resolve
// from THIS app's node_modules, so there is one React / one Redux instance
// even though the importing file lives outside the admin root.
const SHARED_DEPS = [
  'react', 'react-dom', 'react-redux', 'react-router-dom', '@reduxjs/toolkit',
  'async-mutex', 'react-hot-toast', 'lucide-react', 'framer-motion', 'clsx',
];

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': r('./src'),
      '@client': r('../client/src'),
    },
    dedupe: SHARED_DEPS,
  },

  // Tells the shared API layer it is running inside the admin portal, so it
  // tags requests and the server keeps the admin session in its own cookie.
  define: {
    'import.meta.env.VITE_CLIENT_SURFACE': JSON.stringify('admin'),
  },

  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [r('..')] },
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  preview: { port: 5174, strictPort: true },

  build: {
    target: ['chrome90', 'safari14', 'firefox90', 'edge90'],
    sourcemap: false,
    cssCodeSplit: true,
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-redux': ['@reduxjs/toolkit', 'react-redux'],
          'vendor-motion': ['framer-motion'],
          'vendor-map': ['mapbox-gl'],
          'vendor-leaflet': ['leaflet'],
        },
      },
    },
  },
  esbuild: { drop: ['console', 'debugger'] },
});
