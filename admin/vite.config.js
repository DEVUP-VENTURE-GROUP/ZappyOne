import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineZappyApp } from '../shared/vite.base.js';

// Admin portal — admin.zappyone.com
export default defineConfig(({ command }) => {
  const config = defineZappyApp({
    command,
    port: 5174,
    plugins: [react()],
    surface: 'admin',
    chunks: { 'vendor-map': ['mapbox-gl'], 'vendor-leaflet': ['leaflet'] },
  });
  config.resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url));
  // Admin → Fleet shows the Fleet portal's screens, which live in fleet/src.
  config.resolve.alias['@fleet'] = fileURLToPath(new URL('../fleet/src', import.meta.url));
  // The Fleet screens import admin's console kit as @admin, in both apps.
  config.resolve.alias['@admin'] = config.resolve.alias['@'];
  return config;
});
