import { z } from "zod";

export const gitRefName = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9._\-/]+$/, "Invalid git ref name")
  .refine((s) => !s.startsWith("-"), "Must not start with a dash");

const safeUrl = z
  .string()
  .url()
  .refine((u) => {
    if (u.startsWith("https://")) return true;
    try {
      const { hostname } = new URL(u);
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }, "Must use HTTPS (or http for localhost)");

export const providerConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Provider name is required"),
  type: z.enum(["anthropic", "openai", "google", "openai-compatible"]),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().min(1, "Model name is required"),
  baseUrl: safeUrl.optional(),
});

export const repoConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Repo name is required"),
  localPath: z.string().min(1, "Local path is required"),
  defaultBranch: gitRefName.default("main"),
  isDefault: z.boolean().default(false),
  executionMode: z.enum(["worktree", "branch"]).default("worktree"),
});

export const appConfigSchema = z.object({
  defaultProviderId: z.string().nullable().default(null),
  defaultRepoId: z.string().nullable().default(null),
  maxConcurrentExecutions: z.number().int().min(1).max(10).default(3),
  systemPromptOverride: z.string().max(50000).nullable().default(null),
  providers: z.array(providerConfigSchema).default([]),
  repos: z.array(repoConfigSchema).default([]),
});

export type AppConfigInput = z.input<typeof appConfigSchema>;
