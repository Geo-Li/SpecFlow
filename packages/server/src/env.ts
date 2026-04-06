import { execFileSync } from "node:child_process";

interface EnvResult {
  slackBotToken: string;
  slackAppToken: string;
  adminPassword: string;
  jwtSecret: string;
  warnings: string[];
}

export function validateEnv(): EnvResult {
  const warnings: string[] = [];
  const missing: string[] = [];

  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const slackAppToken = process.env.SLACK_APP_TOKEN;
  const adminPassword = process.env.SPECFLOW_ADMIN_PASSWORD;

  if (!slackBotToken) missing.push("SLACK_BOT_TOKEN");
  if (!slackAppToken) missing.push("SLACK_APP_TOKEN");
  if (!adminPassword) missing.push("SPECFLOW_ADMIN_PASSWORD");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const jwtSecret =
    process.env.SPECFLOW_JWT_SECRET ||
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  try {
    execFileSync("claude", ["--version"], { stdio: "pipe" });
  } catch {
    warnings.push("claude CLI not found on PATH — execution will fail");
  }

  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe" });
  } catch {
    warnings.push("gh CLI not authenticated — PR creation will fail");
  }

  return {
    slackBotToken: slackBotToken!,
    slackAppToken: slackAppToken!,
    adminPassword: adminPassword!,
    jwtSecret,
    warnings,
  };
}
