/** @type {import('tailwindcss').Config}
 *
 * ZappyOne design system — the preset every app extends.
 *
 *   colour     one brand blue (the logo's own, not a framework default), the
 *              logo's amber for location/live state only, a cool neutral ink
 *              scale, and surfaces: canvas → surface → sunken, with hairlines
 *   type       Figtree; scale 12 / 13 / 15 / 17 / 20 / 24 / 30
 *   radius     6 chips · 10 controls · 14 cards · 20 sheets; full only for
 *              avatars and toggles
 *   elevation  borders first; shadow only on what floats (sheets, sticky bars)
 *
 * Token NAMES are kept from the old system so every screen picks up the new
 * values at once; the values are what changed.
 */
export default {
  theme: {
    extend: {
      colors: {
        // Primary blue ramp — #2563EB is the brand hero
        // ZappyOne blue, taken from the logo mark. 600 is the brand.
        zappy: {
          50: '#EEF3FD',
          100: '#DCE6FB',
          200: '#B9CCF7',
          300: '#8EAAF0',
          400: '#5B82E6',
          500: '#3463DD',
          600: '#1F4FD8',
          700: '#1A41B4',
          800: '#173891',
          900: '#142F73',
        },
        brand: {
          50: '#EEF3FD',
          100: '#DCE6FB',
          500: '#3463DD',
          600: '#1F4FD8',
          700: '#1A41B4',
        },
        // Surfaces and hairlines. canvas = page, surface = cards, sunken = wells/tiles.
        canvas: '#F5F6F8',
        surface: '#FFFFFF',
        sunken: '#EEF0F3',
        line: { DEFAULT: '#E3E6EB', strong: '#D2D7DE' },
        // Text on surfaces, darkest to faintest.
        ink: {
          DEFAULT: '#101828',
          900: '#101828',
          700: '#344054',
          500: '#5B6474',
          400: '#8A92A0',
          300: '#B4BAC4',
        },
        // Deep navy for headings + gradient target
        navy: {
          DEFAULT: '#0F172A',
          50: '#F8FAFC',
          100: '#F1F5F9',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Success green — #22C55E
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        // Accent orange — #F59E0B
        accent: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
      },
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // Style guide scale
        'h1': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'h2': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'h3': ['20px', { lineHeight: '28px', fontWeight: '500' }],
        'body': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'small': ['14px', { lineHeight: '20px', fontWeight: '400' }],
      },
      spacing: {
        // 8px grid reinforcement
        '18': '4.5rem',   // 72px
      },
      borderRadius: {
        'chip': '6px',
        'btn': '10px',
        'card': '14px',
        'card-lg': '14px',
        'card-xl': '20px',
        'sheet': '20px',
      },
      boxShadow: {
        // Elevation is for things that float. Old names kept, values calmed:
        // nothing glows any more.
        'soft':    '0 1px 2px rgba(16, 24, 40, 0.05)',
        'soft-lg': '0 4px 12px -2px rgba(16, 24, 40, 0.08)',
        'card':    '0 1px 2px rgba(16, 24, 40, 0.04)',
        'float':   '0 8px 24px -6px rgba(16, 24, 40, 0.16)',
        'glow-blue': '0 1px 2px rgba(16, 24, 40, 0.05)',
        'glow-amber': '0 1px 2px rgba(16, 24, 40, 0.05)',
      },
      backgroundImage: {
        // Kept for old call sites: a flat brand fill, no longer a gradient.
        'zappy-gradient': 'linear-gradient(#1F4FD8, #1F4FD8)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
