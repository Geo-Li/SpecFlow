"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { inputBaseStyles } from "@/components/input";

export function BranchSelect({
  localPath,
  value,
  onChange,
  label = "Default Branch",
}: {
  localPath: string;
  value: string;
  onChange: (branch: string) => void;
  label?: string;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!localPath) {
      setBranches([]);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch<{ branches: string[] }>(
      `/api/repos/branches?localPath=${encodeURIComponent(localPath)}`
    )
      .then((res) => {
        if (cancelled) return;
        setBranches(res.branches);
        if (res.branches.length > 0 && !res.branches.includes(valueRef.current)) {
          onChangeRef.current(res.branches.includes("main") ? "main" : res.branches[0]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBranches([]);
        setError((err as Error).message || "Could not load branches");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [localPath]);

  const disabled = !localPath || loading;
  const placeholder = !localPath
    ? "Select a folder first"
    : loading
      ? "Loading branches..."
      : error
        ? "No branches found"
        : "Select a branch";

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
      <select
        value={branches.includes(value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputBaseStyles} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {disabled || branches.length === 0 ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : (
          branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))
        )}
      </select>
      {error && localPath && (
        <p className="text-xs text-text-secondary mt-1">{error}</p>
      )}
    </div>
  );
}
