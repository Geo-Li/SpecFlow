import { apiFetch } from "./api";

export async function login(password: string): Promise<boolean> {
  try { await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }); return true; }
  catch { return false; }
}

export async function checkAuth(): Promise<boolean> {
  try { const r = await apiFetch<{ authenticated: boolean }>("/api/auth/check"); return r.authenticated; }
  catch { return false; }
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}
