import { App } from "@slack/bolt";

let app: App | null = null;

export function createSlackApp(botToken: string, appToken: string): App {
  app = new App({ token: botToken, appToken, socketMode: true });
  return app;
}

export function getSlackApp(): App {
  if (!app) throw new Error("Slack app not initialized");
  return app;
}
