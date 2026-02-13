import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: '#7C3AED',
        brand: {
          dark: '#1a1a2e',
          mid: '#16213e',
          deep: '#0f3460',
          gold: '#ffcb77',
          'gold-light': '#ffe0a6',
        },
        aynam: {
          primary: '#FFB800',
          bg: '#121214',
          card: 'rgba(30, 30, 34, 0.7)',
          border: 'rgba(255, 255, 255, 0.05)',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
