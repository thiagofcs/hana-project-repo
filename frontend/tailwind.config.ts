import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Force-include all am-orange utilities so they are never purged,
  // even if the dev server hasn't been restarted after a config change.
  safelist: [
    { pattern: /^bg-am-orange-/,     variants: ['hover', 'dark', 'dark:hover'] },
    { pattern: /^text-am-orange-/,   variants: ['hover', 'dark', 'dark:hover'] },
    { pattern: /^border-am-orange-/, variants: ['hover', 'dark', 'focus'] },
    { pattern: /^ring-am-orange-/,   variants: ['focus'] },
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ArcelorMittal brand orange — Pantone 1575 C (#F47D30)
        'am-orange': {
          50:  '#FFF5EC',
          100: '#FEEBD8',
          200: '#FDD5AC',
          300: '#FABB7D',
          400: '#F7994E',
          500: '#F47D30',
          600: '#D96820',
          700: '#B35218',
          800: '#8C3F12',
          900: '#3D1C08',
          950: '#1F0D03',
        },
      },
    },
  },
  plugins: [],
};

export default config;
