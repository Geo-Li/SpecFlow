import type { InputHTMLAttributes } from "react";

export const inputBaseStyles = "w-full px-3 py-2 rounded-lg border border-border bg-white/60 text-base focus:border-primary focus:ring-1 focus:ring-primary outline-hidden transition-colors";

export function Input({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
      <input className={`${inputBaseStyles} ${className}`} {...props} />
    </div>
  );
}
