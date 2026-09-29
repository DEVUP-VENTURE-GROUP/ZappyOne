import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
              console.error('[zi-proxy error]', err);
            }
          });
        },
      },
    },
  },

  // Tell Vite to use zi.html as the root entry instead of index.html
  root: '.',
  build: {
    rollupOptions: {
      input: 'zi.html',
    },
  },
});
