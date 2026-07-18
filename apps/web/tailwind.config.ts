import type { Config } from 'tailwindcss';
import rtl from 'tailwindcss-rtl';

/**
 * Maps a Material-3 token (stored as space-separated RGB channels in
 * design-tokens.css) to a Tailwind color that honours opacity modifiers, e.g.
 * `bg-primary/20`, `ring-primary/30`, `text-on-surface/70`.
 */
const md = (token: string) => `rgb(var(--md-${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-family)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // ---- Material-3 surface & neutral tokens ----
        background: md('background'),
        surface: {
          DEFAULT: md('surface'),
          dim: md('surface-dim'),
          bright: md('surface-bright'),
          'container-lowest': md('surface-container-lowest'),
          'container-low': md('surface-container-low'),
          container: md('surface-container'),
          'container-high': md('surface-container-high'),
          'container-highest': md('surface-container-highest'),
        },
        'on-surface': md('on-surface'),
        'on-surface-variant': md('on-surface-variant'),
        'inverse-surface': md('inverse-surface'),
        'inverse-on-surface': md('inverse-on-surface'),
        outline: {
          DEFAULT: md('outline'),
          variant: md('outline-variant'),
        },

        // ---- Primary (Nexus Indigo) ----
        primary: {
          DEFAULT: md('primary'),
          dark: 'var(--color-primary-dark)',
          container: md('primary-container'),
          'fixed-dim': md('primary-fixed-dim'),
        },
        'on-primary': md('on-primary'),
        'on-primary-container': md('on-primary-container'),
        'inverse-primary': md('inverse-primary'),

        // ---- Secondary / Tertiary ----
        secondary: {
          DEFAULT: md('secondary'),
          container: md('secondary-container'),
        },
        'on-secondary': md('on-secondary'),
        'on-secondary-container': md('on-secondary-container'),
        tertiary: {
          DEFAULT: md('tertiary'),
          container: md('tertiary-container'),
        },
        'on-tertiary': md('on-tertiary'),
        'on-tertiary-container': md('on-tertiary-container'),

        // ---- Semantic ----
        success: {
          DEFAULT: md('success'),
          container: md('success-container'),
        },
        'on-success': md('on-success'),
        'on-success-container': md('on-success-container'),
        warning: {
          DEFAULT: md('warning'),
          container: md('warning-container'),
        },
        'on-warning': md('on-warning'),
        'on-warning-container': md('on-warning-container'),
        danger: {
          DEFAULT: md('error'),
          container: md('error-container'),
        },
        error: {
          DEFAULT: md('error'),
          container: md('error-container'),
        },
        'on-error': md('on-error'),
        'on-error-container': md('on-error-container'),
        info: {
          DEFAULT: md('info'),
          container: md('info-container'),
        },
        'on-info': md('on-info'),
        'on-info-container': md('on-info-container'),

        // ---- shadcn-style aliases used by existing primitives (button.tsx etc.) ----
        foreground: md('on-surface'),
        border: md('outline-variant'),
        input: md('outline-variant'),
        ring: md('primary'),
        muted: {
          DEFAULT: md('surface-container-high'),
          foreground: md('on-surface-variant'),
        },
        accent: {
          DEFAULT: md('surface-container-high'),
          foreground: md('on-surface'),
        },
        destructive: {
          DEFAULT: md('error'),
          foreground: md('on-error'),
        },
        'text-primary': md('on-surface'),
        'text-secondary': md('on-surface-variant'),

        // ---- Legacy brand ramp (now indigo) ----
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 3px rgb(15 23 42 / 0.06), 0 1px 2px rgb(15 23 42 / 0.04)',
        elevated: '0 4px 12px rgb(15 23 42 / 0.05)',
        modal: '0 12px 24px rgb(15 23 42 / 0.10)',
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
