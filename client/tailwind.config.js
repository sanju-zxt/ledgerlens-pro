/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: { primary: { 50: "#eef8f4", 100: "#dff2eb", 500: "#328e75", 600: "#227a64", 700: "#1c6655", 800: "#174e43" } } } },
  plugins: []
}
