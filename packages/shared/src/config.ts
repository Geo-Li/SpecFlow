import { z } from "zod";

export const providerConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Provider name is required"),
  type: z.enum(["anthropic", "openai-compatible"]),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().min(1, "Model name is required"),
  baseUrl: z.string().url().optional(),
});

export const repoConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Repo name is required"),
  localPath: z.string().min(1, "Local path is required"),
  defaultBranch: z.string().default("main"),
  isDefault: z.boolean().default(false),
});

export const appConfigSchema = z.object({
  defaultProviderId: z.string().nullable().default(null),
  defaultRepoId: z.string().nullable().default(null),
  maxConcurrentExecutions: z.number().int().min(1).max(10).default(3),
  systemPromptOverride: z.string().nullable().default(null),
  providers: z.array(providerConfigSchema).default([]),
  repos: z.array(repoConfigSchema).default([]),
});

export type AppConfigInput = z.input<typeof appConfigSchema>;
