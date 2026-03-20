/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        cream: 'var(--cream)',
        warm: {
          50: 'var(--warm-50)',
          100: 'var(--warm-100)',
        },
        copper: {
          DEFAULT: 'var(--copper)',
          light: 'var(--copper-light)',
          dark: 'var(--copper-dark)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          '70': 'var(--ink-70)',
          '40': 'var(--ink-40)',
          '15': 'var(--ink-15)',
          '08': 'var(--ink-08)',
        },
        green: {
          DEFAULT: 'var(--green)',
          bg: 'var(--green-bg)'
        },
        red: {
          DEFAULT: 'var(--red)',
          bg: 'var(--red-bg)'
        },
        purple: 'var(--purple)'
      },
    },
  },
  plugins: [],
}
