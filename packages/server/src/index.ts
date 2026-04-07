import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import express from "express";
import { validateEnv } from "./env.js";
import { loadConfig } from "./config-store.js";
import { createSlackApp } from "./slack/app.js";
import { registerHandlers } from "./slack/handlers.js";
import { registerActions } from "./slack/actions.js";
import { startCleanupLoop } from "./sessions/session-cleanup.js";
import { initExecutor } from "./executor/executor.js";
import { setupApi } from "./api/router.js";

async function main(): Promise<void> {
  console.log("Starting SpecFlow server...");
  const env = await validateEnv();
  for (const warning of env.warnings) console.warn(`WARNING: ${warning}`);

  const config = loadConfig();
  console.log(`Config loaded: ${config.providers.length} providers, ${config.repos.length} repos`);

  initExecutor(config.maxConcurrentExecutions);

  const expressApp = express();
  setupApi(expressApp, env.jwtSecret, env.adminPassword);
  expressApp.listen(3001, () => console.log("Express API listening on http://localhost:3001"));

  const slackApp = createSlackApp(env.slackBotToken, env.slackAppToken);
  registerHandlers(slackApp);
  registerActions(slackApp);
  await slackApp.start();
  console.log("Slack bot connected (Socket Mode)");

  startCleanupLoop(async (sessionId, channelId, threadTs) => {
    try {
      await slackApp.client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: "This session timed out due to inactivity. Start a new request to try again." });
    } catch (err) { console.error("Failed to post timeout message:", err); }
  });

  console.log("SpecFlow server is running.");
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
