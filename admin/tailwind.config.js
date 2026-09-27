import base from '../client/tailwind.config.js';

// Same brand system as the customer app; only the scanned files differ.
export default {
  ...base,
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    '../client/src/components/common/**/*.{js,jsx}',
  ],
};
