/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        muted: 'var(--bg-muted)',
        fg: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          faint: 'var(--text-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          bright: 'var(--accent-bright)',
          deep: 'var(--accent-deep)',
        },
        line: 'var(--border)',
        danger: 'var(--danger)',
        success: 'var(--success)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '1rem',
      },
    },
  },
  plugins: [],
}
