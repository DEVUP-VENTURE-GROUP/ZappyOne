import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defineZappyApp } from '../shared/vite.base.js';

// Independent workers (no shop) — rakshak.zappyone.com
export default defineConfig(({ command }) => defineZappyApp({
  command,
  port: 5176,
  plugins: [react()],
  surface: 'rakshak',
  optimizeDeps: { include: ['mapbox-gl'] },
  chunks: { 'vendor-map': ['mapbox-gl'] },
}));
