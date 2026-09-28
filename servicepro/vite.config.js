import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defineZappyApp } from '../shared/vite.base.js';

// Shop owners and their workers — servicepro.zappyone.com
export default defineConfig(({ command }) => defineZappyApp({
  command,
  port: 5175,
  plugins: [react()],
  surface: 'servicepro',
  optimizeDeps: { include: ['mapbox-gl'] },
  chunks: { 'vendor-map': ['mapbox-gl'] },
}));
