import preset from '../shared/tailwind.preset.js';

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{js,jsx}', '../shared/src/**/*.{js,jsx}'],
};
