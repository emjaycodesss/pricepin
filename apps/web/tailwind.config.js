/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Raleway', 'system-ui', 'sans-serif'],
      },
      /* Mobile-first breakpoints per architecture: mobile < 768px, tablet/desktop >= 768px */
      screens: {
        'tablet': '768px',
      },
      /* Page enter: fade + slide up when navigating to Add Food Spot */
      keyframes: {
        'page-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spider-in': {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'page-in': 'page-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'spider-in': 'spider-in 0.25s ease-out forwards',
      },
    },
  },
  plugins: [],
}
