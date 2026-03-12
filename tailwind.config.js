/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        gold: {
          50: "#FFFEF5",
          100: "#FFFCE0",
          200: "#FFF8B8",
          300: "#FFF085",
          400: "#FFE44D",
          500: "#FFD700",
          600: "#D4A800",
          700: "#AD8B00",
          800: "#8B6E00",
          900: "#6B5500",
        },
        sand: {
          1: "#FDFDFC",
          2: "#F9F9F8",
          3: "#F1F0EF",
          5: "#E4E2DF",
          8: "#B4B1AB",
          11: "#716F6C",
          12: "#1B1B18",
        },
      },
    },
  },
  plugins: [],
};
