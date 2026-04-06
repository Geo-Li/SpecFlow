import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { appConfigSchema } from "@specflow/shared";
import type { AppConfig } from "@specflow/shared";

const CONFIG_DIR = join(homedir(), ".specflow");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  defaultProviderId: null,
  defaultRepoId: null,
  maxConcurrentExecutions: 3,
  systemPromptOverride: null,
  providers: [],
  repos: [],
};

let currentConfig: AppConfig = DEFAULT_CONFIG;

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    currentConfig = appConfigSchema.parse(raw);
    return currentConfig;
  } catch (err) {
    console.error("Failed to load config, using defaults:", err);
    currentConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

export function getConfig(): AppConfig {
  return currentConfig;
}

export function saveConfig(config: AppConfig): void {
  const validated = appConfigSchema.parse(config);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2));
  currentConfig = validated;
}
