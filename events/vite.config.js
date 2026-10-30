import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defineZappyApp } from '../shared/vite.base.js';

// Event partners (decorators, planners) — events.zappyone.com
export default defineConfig(({ command }) => defineZappyApp({
  command,
  port: 5177,
  plugins: [react()],
  surface: 'events',
  chunks: { 'vendor-firebase': ['firebase/app', 'firebase/auth'] },
}));
