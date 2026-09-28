/** @type {import('tailwindcss').Config}
 *
 * Zappy brand system — the preset every app's tailwind.config.js extends.
 * Colors, fonts, spacing all mirror the style guide exactly.
 */
export default {
  theme: {
    extend: {
      colors: {
        // Primary blue ramp — #2563EB is the brand hero
        zappy: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB', // ← Primary Blue (brand hero)
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // Alias so existing code using `brand-*` still works — points at Zappy blue now
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
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
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
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
        'card': '16px',
        'card-lg': '24px',
        'card-xl': '32px',
        'btn': '14px',
      },
      boxShadow: {
        // Premium soft shadows
        'soft':    '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
        'soft-lg': '0 12px 32px -4px rgba(15, 23, 42, 0.08)',
        'card':    '0 2px 8px -1px rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)',
        'glow-blue': '0 8px 24px -4px rgba(37, 99, 235, 0.35)',
        'glow-amber': '0 8px 24px -4px rgba(245, 158, 11, 0.35)',
      },
      backgroundImage: {
        // The signature blue → navy gradient
        'zappy-gradient': 'linear-gradient(135deg, #2563EB 0%, #0F172A 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
