import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { appConfigSchema } from "@specflow/shared";
import type { AppConfig } from "@specflow/shared";

const CONFIG_DIR = join(homedir(), ".specflow");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const CONFIG_TMP_PATH = CONFIG_PATH + ".tmp";

const DEFAULT_CONFIG: AppConfig = {
  defaultProviderId: null,
  defaultRepoId: null,
  maxConcurrentExecutions: 3,
  systemPromptOverride: null,
  providers: [],
  repos: [],
};

let currentConfig: AppConfig = DEFAULT_CONFIG;

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function loadConfig(): AppConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    currentConfig = appConfigSchema.parse(raw);
    return currentConfig;
  } catch (err) {
    throw new Error(
      `Failed to load config from ${CONFIG_PATH}: ${(err as Error).message}. ` +
      `Fix or delete the file to use defaults.`
    );
  }
}

export function getConfig(): AppConfig {
  return structuredClone(currentConfig);
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  const validated = appConfigSchema.parse(config);
  writeFileSync(CONFIG_TMP_PATH, JSON.stringify(validated, null, 2), { mode: 0o600 });
  renameSync(CONFIG_TMP_PATH, CONFIG_PATH);
  currentConfig = validated;
}
