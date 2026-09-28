import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defineZappyApp } from '../shared/vite.base.js';

// Customer app — zappyone.com
export default defineConfig(({ command }) => defineZappyApp({
  command,
  port: 5173,
  plugins: [react()],
  optimizeDeps: { include: ['mapbox-gl'] },
  chunks: {
    'vendor-map': ['mapbox-gl'],
    'vendor-firebase': ['firebase/app', 'firebase/messaging'],
  },
}));
