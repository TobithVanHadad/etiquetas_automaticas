import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/core/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 10px 28px rgba(23, 23, 23, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
