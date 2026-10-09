/**
 * The ZappyOne design tokens for NativeWind — the same names and values as
 * the website (shared/tailwind.preset.js), so a class means the same thing in
 * every app. Change a value there and here together.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        zappy: {
          50: '#EEF3FD', 100: '#DCE6FB', 200: '#B9CCF7', 300: '#8EAAF0', 400: '#5B82E6',
          500: '#3463DD', 600: '#1F4FD8', 700: '#1A41B4', 800: '#173891', 900: '#142F73',
        },
        brand: { 50: '#EEF3FD', 100: '#DCE6FB', 500: '#3463DD', 600: '#1F4FD8', 700: '#1A41B4' },
        canvas: '#F5F6F8',
        surface: '#FFFFFF',
        sunken: '#EEF0F3',
        line: { DEFAULT: '#E3E6EB', strong: '#D2D7DE' },
        ink: { DEFAULT: '#101828', 900: '#101828', 700: '#344054', 500: '#5B6474', 400: '#8A92A0', 300: '#B4BAC4' },
        success: { DEFAULT: '#22C55E', 50: '#F0FDF4', 100: '#DCFCE7', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
        accent: { DEFAULT: '#F59E0B', 50: '#FFFBEB', 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706', 700: '#B45309' },
      },
      fontFamily: {
        sans: ['Figtree-Regular'],
        medium: ['Figtree-Medium'],
        semibold: ['Figtree-SemiBold'],
        bold: ['Figtree-Bold'],
        extrabold: ['Figtree-ExtraBold'],
      },
      borderRadius: { chip: '6px', btn: '10px', card: '14px', sheet: '20px' },
    },
  },
};
