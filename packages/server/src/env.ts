import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface EnvResult {
  slackBotToken: string;
  slackAppToken: string;
  adminPassword: string;
  jwtSecret: string;
  warnings: string[];
}

export async function validateEnv(): Promise<EnvResult> {
  const warnings: string[] = [];
  const missing: string[] = [];

  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const slackAppToken = process.env.SLACK_APP_TOKEN;
  const adminPassword = process.env.SPECFLOW_ADMIN_PASSWORD;
  const convexAuthToken = process.env.CONVEX_AUTH_TOKEN;

  if (!slackBotToken) missing.push("SLACK_BOT_TOKEN");
  if (!slackAppToken) missing.push("SLACK_APP_TOKEN");
  if (!adminPassword) missing.push("SPECFLOW_ADMIN_PASSWORD");
  if (!process.env.CONVEX_SITE_URL) missing.push("CONVEX_SITE_URL");
  if (!convexAuthToken) missing.push("CONVEX_AUTH_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  let jwtSecret = process.env.SPECFLOW_JWT_SECRET;
  if (!jwtSecret) {
    jwtSecret = randomBytes(32).toString("hex");
    warnings.push("SPECFLOW_JWT_SECRET not set — using random secret (sessions will not survive restarts)");
  }

  const checks = await Promise.allSettled([
    execFileAsync("claude", ["--version"]),
    execFileAsync("gh", ["auth", "status"]),
  ]);

  if (checks[0].status === "rejected") {
    warnings.push("claude CLI not found on PATH — execution will fail");
  }
  if (checks[1].status === "rejected") {
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
