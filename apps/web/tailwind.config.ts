import type { Config } from 'tailwindcss';
import rtl from 'tailwindcss-rtl';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-family)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        surface: 'var(--color-surface)',
        background: 'var(--color-background)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#b6d5ff',
          300: '#86b8ff',
          400: '#5494ff',
          500: '#2f74ff',
          600: '#1558e6',
          700: '#1046bd',
          800: '#123e99',
          900: '#143a7a',
        },
      },
      spacing: {
        'base': 'var(--spacing-base)',
        '1': 'calc(var(--spacing-base) * 1)',
        '2': 'calc(var(--spacing-base) * 2)',
        '3': 'calc(var(--spacing-base) * 3)',
        '4': 'calc(var(--spacing-base) * 4)',
        '5': 'calc(var(--spacing-base) * 5)',
        '6': 'calc(var(--spacing-base) * 6)',
        '8': 'calc(var(--spacing-base) * 8)',
        '10': 'calc(var(--spacing-base) * 10)',
        '12': 'calc(var(--spacing-base) * 12)',
        '16': 'calc(var(--spacing-base) * 16)',
        '20': 'calc(var(--spacing-base) * 20)',
        '24': 'calc(var(--spacing-base) * 24)',
      },
    },
  },
  plugins: [rtl],
};

export default config;
