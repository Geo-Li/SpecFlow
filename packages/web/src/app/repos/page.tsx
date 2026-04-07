"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { FolderPicker } from "@/components/folder-picker";
import { BranchSelect } from "@/components/branch-select";

import type { ExecutionMode } from "@specflow/shared";
interface Repo { id: string; name: string; localPath: string; defaultBranch: string; isDefault: boolean; executionMode: ExecutionMode; }

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", localPath: "", defaultBranch: "main", isDefault: false, executionMode: "worktree" as ExecutionMode });

  const load = () => apiFetch<Repo[]>("/api/repos").then(setRepos).catch((err) => setError(err.message || "Failed to load repositories"));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setFormError("");
    try {
      await apiFetch("/api/repos", { method: "POST", body: JSON.stringify(form) });
      setIsModalOpen(false);
      setForm({ name: "", localPath: "", defaultBranch: "main", isDefault: false, executionMode: "worktree" });
      load();
    } catch (err) {
      setFormError((err as Error).message || "Failed to add repository");
    }
  };

  const handleDelete = async (id: string) => {
    try { await apiFetch(`/api/repos/${id}`, { method: "DELETE" }); load(); }
    catch (err) { setError((err as Error).message || "Failed to delete repository"); }
  };

  return (
    <>
      <PageHeader title="Repositories" description="Configure local repositories" />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <div className="mb-4"><Button onClick={() => setIsModalOpen(true)}>Add Repository</Button></div>
      <div className="space-y-4">
        {repos.map((r) => (
          <Card key={r.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">{r.name} {r.isDefault && <span className="text-xs text-accent">(default)</span>}</p>
              <p className="text-sm text-text-secondary">{r.localPath} &middot; branch: {r.defaultBranch} &middot; {r.executionMode || "worktree"}</p>
            </div>
            <Button variant="danger" onClick={() => handleDelete(r.id)}>Delete</Button>
          </Card>
        ))}
        {repos.length === 0 && <p className="text-sm text-text-secondary">No repositories configured.</p>}
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Repository">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. my-project" />
          <FolderPicker value={form.localPath} onChange={(path) => setForm({ ...form, localPath: path })} />
          <BranchSelect localPath={form.localPath} value={form.defaultBranch} onChange={(branch) => setForm({ ...form, defaultBranch: branch })} />
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Execution Mode</label>
            <div className="flex gap-2">
              {(["worktree", "branch"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setForm({ ...form, executionMode: mode })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.executionMode === mode
                      ? "bg-accent-light border-accent/30 text-accent-dark"
                      : "bg-white/60 border-border text-text-secondary hover:bg-white/80"
                  }`}
                >
                  <span className="block">{mode === "worktree" ? "Worktree" : "Branch"}</span>
                  <span className="block text-xs font-normal mt-0.5 opacity-70">
                    {mode === "worktree" ? "Parallel-safe isolation" : "Serial, same repo"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
