"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const success = await login(password);
    if (success) { router.push("/"); } else { setError("Invalid password"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-text-primary text-center mb-8">SpecFlow</h1>
        <form onSubmit={handleSubmit} className="bg-surface rounded-lg border border-border shadow-sm p-6 space-y-4">
          <Input label="Admin Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in..." : "Sign In"}</Button>
        </form>
      </div>
    </div>
  );
}
