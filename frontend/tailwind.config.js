/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    borderRadius: {
      none: '0px',
      sm: '2px',
      DEFAULT: '4px',
      md: '6px',
      lg: '6px',
      xl: '6px',
      '2xl': '6px',
      '3xl': '6px',
      full: '9999px',
    },
    extend: {
      colors: {
        teal: {
          50: '#eff9f9',
          100: '#d8f0f0',
          200: '#b2e1e1',
          300: '#7cc7c8',
          400: '#3fa3a5',
          500: '#1d8385',
          600: '#147273',
          700: '#0f5959', // Primary accent
          800: '#0d4849',
          900: '#0a3738',
          950: '#052021',
        },
        slate: {
          50: '#f7f9fa',
          100: '#f0f3f4',
          200: '#e2e7e9',
          300: '#cbd3d6',
          400: '#94a2a8',
          500: '#6b777d',
          600: '#515c61',
          700: '#3b464a',
          800: '#283135',
          900: '#1c2326',
          950: '#0f1416',
        },
        status: {
          draft: {
            bg: '#f1f3f5',
            text: '#495057',
            border: '#ced4da',
          },
          pending: {
            bg: '#fff9db',
            text: '#854d0e',
            border: '#fde047',
          },
          approved: {
            bg: '#ecfdf5',
            text: '#065f46',
            border: '#a7f3d0',
          },
          rejected: {
            bg: '#fff1f2',
            text: '#9f1239',
            border: '#fecdd3',
          },
          superseded: {
            bg: '#f4f4f5',
            text: '#71717a',
            border: '#e4e4e7',
          },
          correction: {
            bg: '#fff7ed',
            text: '#9a3412',
            border: '#fed7aa',
          },
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
        xs: ['0.6875rem', { lineHeight: '0.875rem' }],   // 11px
        sm: ['0.75rem', { lineHeight: '1rem' }],         // 12px
        base: ['0.8125rem', { lineHeight: '1.125rem' }], // 13px (Body Default)
        md: ['0.875rem', { lineHeight: '1.25rem' }],      // 14px
        lg: ['0.9375rem', { lineHeight: '1.375rem' }],   // 15px
        xl: ['1.125rem', { lineHeight: '1.5rem' }],      // 18px
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
      },
      boxShadow: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        modal: '0 8px 24px -4px rgba(0, 0, 0, 0.16)',
      },
    },
  },
  plugins: [],
}
