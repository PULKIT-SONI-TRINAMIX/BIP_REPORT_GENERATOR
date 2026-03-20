import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#1E2532",
        foreground: "#f8fafc",
        panel: "#2A3441",
        card: "#2F3A4A",
        primary: "#3b82f6",
        success: "#10b981",
        muted: "#94a3b8",
        border: "#475569"
      },
    },
  },
  plugins: [],
};
export default config;
