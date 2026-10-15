import preset from '../shared/tailwind.preset.js';

// The Fleet portal shows the admin app's fleet screens (../admin/src/features/fleet).
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{js,jsx}', '../admin/src/**/*.{js,jsx}', '../shared/src/**/*.{js,jsx}'],
};
