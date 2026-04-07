"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Modal } from "./modal";
import { Button } from "./button";
import { FolderIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

interface BrowseResult {
  path: string;
  dirs: string[];
  parent: string | null;
}

export function FolderPicker({
  value,
  onChange,
  label = "Local Path",
}: {
  value: string;
  onChange: (path: string) => void;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const browse = async (path?: string) => {
    setLoading(true);
    setError("");
    try {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const res = await apiFetch<BrowseResult>(`/api/browse-dirs${query}`);
      setBrowsePath(res.path);
      setDirs(res.dirs);
      setParent(res.parent);
    } catch (err) {
      setError((err as Error).message || "Failed to browse directory");
    } finally {
      setLoading(false);
    }
  };

  const open = () => {
    setIsOpen(true);
    browse(value || undefined);
  };

  const select = () => {
    onChange(browsePath);
    setIsOpen(false);
  };

  const pathSegments = browsePath.split("/").filter(Boolean);

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
      <button
        type="button"
        onClick={open}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white/60 text-left text-sm font-medium transition-colors hover:bg-white/80 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
      >
        <FolderIcon className="w-4 h-4 text-accent shrink-0" />
        {value ? (
          <span className="text-text-primary truncate">{value}</span>
        ) : (
          <span className="text-text-secondary">Browse for folder...</span>
        )}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Folder">
        <div className="space-y-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => browse()}
              className="text-accent hover:underline shrink-0"
            >
              ~
            </button>
            {pathSegments.map((seg, i) => {
              const segPath = "/" + pathSegments.slice(0, i + 1).join("/");
              const isLast = i === pathSegments.length - 1;
              return (
                <span key={segPath} className="flex items-center gap-1 shrink-0">
                  <ChevronRightIcon className="w-3 h-3 text-text-secondary" />
                  {isLast ? (
                    <span className="font-medium text-text-primary">{seg}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => browse(segPath)}
                      className="text-accent hover:underline"
                    >
                      {seg}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {/* Directory listing */}
          <div className="border border-border rounded-md max-h-64 overflow-y-auto">
            {loading ? (
              <p className="p-3 text-sm text-text-secondary">Loading...</p>
            ) : error ? (
              <p className="p-3 text-sm text-error">{error}</p>
            ) : dirs.length === 0 ? (
              <p className="p-3 text-sm text-text-secondary">No subdirectories</p>
            ) : (
              dirs.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => browse(browsePath === "/" ? `/${dir}` : `${browsePath}/${dir}`)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-black/[0.03] border-b border-border last:border-b-0 transition-colors"
                >
                  <FolderIcon className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-text-primary truncate">{dir}</span>
                </button>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-text-secondary truncate max-w-[60%]">{browsePath}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={select}>Select This Folder</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
