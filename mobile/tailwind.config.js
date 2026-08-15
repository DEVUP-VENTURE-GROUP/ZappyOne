/** @type {import('tailwindcss').Config}
 *
 * Mirrors client/tailwind.config.js so a class name means the same thing on the
 * website and in the app. Values were verified against the live client config,
 * not copied from memory.
 *
 * NativeWind v4 caveats: `boxShadow` does not map to React Native elevation and
 * gradients need SVG — both are handled by the `theme/` tokens and the Zappy
 * primitives rather than here.
 */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        zappy: {
          50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
          400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8',
          800: '#1E40AF', 900: '#1E3A8A',
        },
        // Kept so existing upstream screens using `bg-primary` still work.
        primary: '#2563EB',
        navy: {
          DEFAULT: '#0F172A', 50: '#F8FAFC', 100: '#F1F5F9',
          700: '#334155', 800: '#1E293B', 900: '#0F172A',
        },
        success: {
          DEFAULT: '#22C55E', 50: '#F0FDF4', 100: '#DCFCE7',
          500: '#22C55E', 600: '#16A34A', 700: '#15803D',
        },
        // Amber — the website's real accent. NOT #F97316.
        accent: {
          DEFAULT: '#F59E0B', 50: '#FFFBEB', 100: '#FEF3C7',
          500: '#F59E0B', 600: '#D97706', 700: '#B45309',
        },
        lightBg: '#FAFAFB',
      },
      fontFamily: {
        sans: ['Poppins-Regular'],
        medium: ['Poppins-Medium'],
        semibold: ['Poppins-SemiBold'],
        bold: ['Poppins-Bold'],
        extrabold: ['Poppins-ExtraBold'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px' }],
        h1: ['26px', { lineHeight: '34px' }],
        h2: ['20px', { lineHeight: '28px' }],
        h3: ['17px', { lineHeight: '24px' }],
        body: ['15px', { lineHeight: '22px' }],
        small: ['13px', { lineHeight: '20px' }],
      },
      borderRadius: { btn: '14px', card: '16px', 'card-lg': '24px', 'card-xl': '32px' },
      spacing: { 18: '72px' },
    },
  },
  plugins: [],
};
