import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineZappyApp } from '../shared/vite.base.js';

// Fleet portal: fleet.zappyone.com. Fleet managers run ZappyOne's own staff and
// hubs here; the screens are the admin app's fleet screens, not a copy.
export default defineConfig(({ command }) => {
  const config = defineZappyApp({
    command,
    port: 5176,
    plugins: [react()],
    surface: 'fleet',
    chunks: { 'vendor-leaflet': ['leaflet'] },
  });
  const admin = fileURLToPath(new URL('../admin/src', import.meta.url));
  config.resolve.alias['@'] = admin;
  config.resolve.alias['@admin'] = admin;
  return config;
});
