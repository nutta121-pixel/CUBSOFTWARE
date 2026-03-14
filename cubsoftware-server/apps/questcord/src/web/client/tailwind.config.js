/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#5865f2',
        secondary: '#7c3aed',
        success: '#10b981',
        warning: '#fbbf24',
        danger: '#ef4444',
        dark: {
          900: '#0a0a1a',
          800: '#1a1a2e',
          700: '#16213e',
          600: '#0f3460'
        }
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
        display: ['Orbitron', 'sans-serif']
      }
    },
  },
  plugins: [],
}
