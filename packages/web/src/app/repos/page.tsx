"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";

interface Repo { id: string; name: string; localPath: string; defaultBranch: string; isDefault: boolean; }

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", localPath: "", defaultBranch: "main", isDefault: false });

  const load = () => apiFetch<Repo[]>("/api/repos").then(setRepos);
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await apiFetch("/api/repos", { method: "POST", body: JSON.stringify(form) });
    setIsModalOpen(false);
    setForm({ name: "", localPath: "", defaultBranch: "main", isDefault: false });
    load();
  };

  const handleDelete = async (id: string) => { await apiFetch(`/api/repos/${id}`, { method: "DELETE" }); load(); };

  return (
    <>
      <PageHeader title="Repositories" description="Configure local repositories" />
      <div className="mb-4"><Button onClick={() => setIsModalOpen(true)}>Add Repository</Button></div>
      <div className="space-y-4">
        {repos.map((r) => (
          <Card key={r.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">{r.name} {r.isDefault && <span className="text-xs text-primary">(default)</span>}</p>
              <p className="text-sm text-text-secondary">{r.localPath} &middot; branch: {r.defaultBranch}</p>
            </div>
            <Button variant="danger" onClick={() => handleDelete(r.id)}>Delete</Button>
          </Card>
        ))}
        {repos.length === 0 && <p className="text-sm text-text-secondary">No repositories configured.</p>}
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Repository">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. my-project" />
          <Input label="Local Path" value={form.localPath} onChange={(e) => setForm({ ...form, localPath: e.target.value })} placeholder="/path/to/repo" />
          <Input label="Default Branch" value={form.defaultBranch} onChange={(e) => setForm({ ...form, defaultBranch: e.target.value })} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
