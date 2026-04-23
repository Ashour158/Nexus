import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
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
    },
  },
  plugins: [],
};

export default config;
