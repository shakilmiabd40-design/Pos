/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // RGB-triple CSS variables (see globals.css) so Tailwind's opacity
        // modifiers (e.g. text-ink/60) keep working, and a single `.dark`
        // class on <html> re-themes every page using these tokens — no
        // need to sprinkle dark: variants across every component.
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        moss: "rgb(var(--color-moss) / <alpha-value>)",
        clay: "rgb(var(--color-clay) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
