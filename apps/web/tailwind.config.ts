import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so light and dark share one component layer.
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        content: 'rgb(var(--content) / <alpha-value>)',
        'content-muted': 'rgb(var(--content-muted) / <alpha-value>)',
        'content-subtle': 'rgb(var(--content-subtle) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-hover': 'rgb(var(--brand-hover) / <alpha-value>)',
        'brand-subtle': 'rgb(var(--brand-subtle) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        'positive-subtle': 'rgb(var(--positive-subtle) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        'warning-subtle': 'rgb(var(--warning-subtle) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        'danger-subtle': 'rgb(var(--danger-subtle) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        'info-subtle': 'rgb(var(--info-subtle) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 6px -1px rgb(0 0 0 / 0.06)',
        overlay: '0 10px 40px -12px rgb(0 0 0 / 0.25)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
