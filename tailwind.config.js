/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          cyan: '#00BCF2',
          lime: '#8DC63F',
          magenta: '#D51A7A',
          orange: '#FF6B1A',
          dark: '#121212',
          card: '#0D0D0D',
        },
      },
    },
  },
  plugins: [],
}
