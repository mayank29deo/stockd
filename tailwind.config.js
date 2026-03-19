/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0A0F',
        surface: '#0D0D12',
        card: '#12121A',
        elevated: '#1A1A26',
        subtle: '#1E1E2E',
        muted: '#2A2A3E',
        bright: '#3D3D5C',
        primary: '#F0F0F5',
        secondary: '#9999B3',
        faded: '#5A5A7A',
        saffron: {
          300: '#FFB07A',
          400: '#FF8C42',
          500: '#FF6B35',
          600: '#E55A25',
          700: '#C44A1A',
        },
        bull: '#00C897',
        bear: '#FF4757',
        caution: '#FFB020',
        chart1: '#FF6B35',
        chart2: '#00C897',
        chart3: '#4E9AF1',
        chart4: '#A78BFA',
        chart5: '#FFB020',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-saffron': 'linear-gradient(135deg, #FF6B35 0%, #E55A25 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0D0D12 0%, #130A1A 50%, #0A0F1A 100%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.6)',
        'glow-saffron': '0 0 24px rgba(255,107,53,0.3)',
        'glow-bull': '0 0 24px rgba(0,200,151,0.3)',
        'glow-bear': '0 0 24px rgba(255,71,87,0.3)',
      },
      animation: {
        ticker: 'ticker 40s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
}
