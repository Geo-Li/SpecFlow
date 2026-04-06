import type { InputHTMLAttributes } from "react";

export function Input({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
      <input className={`w-full px-3 py-2 rounded-md border border-border text-base focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors ${className}`} {...props} />
    </div>
  );
}
