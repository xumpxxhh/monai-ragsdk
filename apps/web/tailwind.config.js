/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0E9F85',
          hover: '#0B8570',
          soft: '#E5F8F3',
          deep: '#0A6B5C',
          mist: '#C8EFE6',
        },
        canvas: '#F2F7F5',
        surface: '#FFFFFF',
        ink: '#152520',
        muted: '#5A6E68',
        line: '#D5E4DF',
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
      },
      borderRadius: {
        card: '14px',
        ctrl: '9px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,37,32,.05), 0 4px 12px rgba(14,159,133,.06)',
        soft: '0 8px 24px rgba(21,37,32,.08)',
      },
      fontFamily: {
        sans: [
          'PingFang SC',
          'Microsoft YaHei',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
