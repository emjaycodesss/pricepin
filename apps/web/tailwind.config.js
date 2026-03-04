/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* Mobile-first breakpoints per architecture: mobile < 768px, tablet/desktop >= 768px */
      screens: {
        'tablet': '768px',
      },
    },
  },
  plugins: [],
}
