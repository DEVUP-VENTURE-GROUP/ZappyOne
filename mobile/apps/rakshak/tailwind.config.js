/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', '../../packages/ui/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@zappy/ui/tailwind-preset')],
};
