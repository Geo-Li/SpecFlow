import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#1d1d1f", dark: "#000000", light: "#f5f5f7" },
        accent: { DEFAULT: "#6366F1", light: "rgba(99,102,241,0.08)", dark: "#4F46E5" },
        surface: "#FFFFFF",
        background: "#fafafa",
        "text-primary": "#1d1d1f",
        "text-secondary": "#6B7280",
        "text-tertiary": "#9CA3AF",
        success: { DEFAULT: "#059669", light: "rgba(16,185,129,0.12)" },
        warning: { DEFAULT: "#d97706", light: "rgba(245,158,11,0.1)" },
        error: { DEFAULT: "#EF4444", light: "#FEF2F2" },
        border: { DEFAULT: "rgba(0,0,0,0.08)", dark: "rgba(0,0,0,0.12)" },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        glass: '16px',
        'glass-sm': '10px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.03)',
        'glass-hover': '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
export default config;
