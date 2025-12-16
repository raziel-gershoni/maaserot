import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media', // Uses system preference
  theme: {
    extend: {
      colors: {
        // Map existing Tailwind utilities to new color scheme
        gray: {
          50: 'var(--surface)',
          100: 'var(--surface-muted)',
          200: 'var(--surface-muted)',
          300: '#E0D4CE',
          400: '#C0AFA8',
          500: 'var(--text-disabled)',
          600: 'var(--text-secondary)',
          700: 'var(--text-secondary)',
          800: 'var(--text-primary)',
          900: 'var(--text-primary)',
        },
        indigo: {
          50: '#FCE9E3',
          100: '#F9D3C7',
          200: '#F5BDB1',
          300: '#EFA08A',
          400: '#E98B74',
          500: 'var(--primary)',
          600: 'var(--primary)',
          700: 'var(--primary-hover)',
          800: '#B35838',
          900: '#9A4A2F',
        },
        blue: {
          50: '#FCE9E3',
          100: '#F9D3C7',
          200: '#F5BDB1',
          300: '#EFA08A',
          400: '#E98B74',
          500: 'var(--primary)',
          600: 'var(--primary)',
          700: 'var(--primary-hover)',
          800: '#B35838',
          900: '#9A4A2F',
        },
        purple: {
          50: '#F3E8F0',
          100: '#E7D1E1',
          200: '#DBBAD2',
          300: '#CFA3C3',
          400: '#C38CB4',
          500: 'var(--secondary)',
          600: 'var(--secondary)',
          700: '#7A3D6A',
          800: '#662F58',
          900: '#522146',
        },
        green: {
          50: '#E8F5EF',
          100: '#D1EBDF',
          200: '#BAE1CF',
          300: '#A3D7BF',
          400: '#8CCDAF',
          500: 'var(--success)',
          600: 'var(--success)',
          700: '#3E8066',
          800: '#2E6050',
          900: '#1E403A',
        },
        red: {
          50: '#F8E6E6',
          100: '#F1CDCD',
          200: '#EAB4B4',
          300: '#E39B9B',
          400: '#DC8282',
          500: 'var(--error)',
          600: 'var(--error)',
          700: '#A13B3B',
          800: '#862C2C',
          900: '#6B1D1D',
        },
        yellow: {
          50: '#FDF4E5',
          100: '#FBE9CB',
          200: '#F9DEB1',
          300: '#F7D397',
          400: '#F5C87D',
          500: 'var(--warning)',
          600: 'var(--warning)',
          700: '#B88230',
          800: '#9A6E28',
          900: '#7C5920',
        },
      },
      backgroundColor: {
        DEFAULT: 'var(--bg)',
      },
      textColor: {
        DEFAULT: 'var(--text-primary)',
      },
      borderColor: {
        DEFAULT: 'var(--surface-muted)',
      },
    },
  },
  plugins: [],
};

export default config;
