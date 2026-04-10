import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const variantStyles: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "border border-border-dark text-text-primary hover:bg-black/5",
  danger: "bg-error text-white hover:bg-red-600",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${variantStyles[variant]} ${className}`} {...props} />
  );
}
