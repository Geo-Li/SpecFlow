import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6366F1", dark: "#4F46E5", light: "#EEF2FF" },
        surface: "#FFFFFF",
        background: "#F9FAFB",
        "text-primary": "#111827",
        "text-secondary": "#6B7280",
        "text-tertiary": "#9CA3AF",
        success: { DEFAULT: "#10B981", light: "#ECFDF5" },
        warning: { DEFAULT: "#F59E0B", light: "#FFFBEB" },
        error: { DEFAULT: "#EF4444", light: "#FEF2F2" },
        border: { DEFAULT: "#E5E7EB", dark: "#D1D5DB" },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
