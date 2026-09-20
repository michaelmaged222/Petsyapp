/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f3f5f4',
          100: '#e5e9e7',
          200: '#cbd2ce',
          300: '#aebbb3',
          400: '#82938a',
          500: '#5d8064',
          600: '#4e5652',
          700: '#414a46',
          800: '#36403b',
          900: '#2d3632',
          950: '#252d2a',
        },
        secondary: {
          50: '#f4f8f4',
          100: '#e6efe7',
          200: '#cfdfd1',
          300: '#b7cbb9',
          400: '#9ab69b',
          500: '#7f9e83',
          600: '#68866d',
          700: '#526e59',
          800: '#435947',
          900: '#35483a',
        },
        accent: {
          50: '#f4f8f4',
          100: '#e6efe7',
          200: '#cfdfd1',
          300: '#b7cbb9',
          400: '#9ab69b',
          500: '#5d8064',
          600: '#4e5652',
          700: '#435947',
          800: '#35483a',
          900: '#29382d',
        },
        brand: {
          sage: '#5d8064',
          eucalyptus: '#9ab69b',
          charcoal: '#4e5652',
          mist: '#d6d8d6',
          pink: '#ed7499',
        },
        success: {
          400: '#9ab69b',
          500: '#5d8064',
          600: '#4e5652',
        },
        warning: {
          400: '#f29ab4',
          500: '#ed7499',
          600: '#d85d83',
        },
        error: {
          400: '#f29ab4',
          500: '#ed7499',
          600: '#d85d83',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Chewy', 'Trebuchet MS', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
