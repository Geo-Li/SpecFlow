"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Select } from "@/components/select";

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

  const options = branches.map((b) => ({ value: b, label: b }));

  return (
    <div>
      <Select
        label={label}
        value={branches.includes(value) ? value : ""}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && localPath && (
        <p className="text-xs text-text-secondary mt-1">{error}</p>
      )}
    </div>
  );
}
