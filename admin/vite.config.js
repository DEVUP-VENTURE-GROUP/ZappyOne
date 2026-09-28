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
  return config;
});
