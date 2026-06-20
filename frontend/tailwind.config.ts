import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#2563EB',
        'accent-light': '#EFF6FF',
        surface: '#F7F6F3',
        border: '#EBE9E4',
        'text-primary': '#1A1917',
        'text-muted': '#8B8880',
        'text-faint': '#A8A49F',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-ibm-plex-mono)', ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [],
}
export default config
