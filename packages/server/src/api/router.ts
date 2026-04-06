import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createAuthRouter, authMiddleware, initAuth } from "./auth.js";
import { createConfigRouter } from "./config-routes.js";
import { createProviderRouter } from "./provider-routes.js";
import { createRepoRouter } from "./repo-routes.js";
import { createSessionRouter } from "./session-routes.js";

export function setupApi(app: Express, jwtSecret: string, adminPassword: string): void {
  initAuth(jwtSecret, adminPassword);
  app.use(cors({ origin: "http://localhost:3000", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(createAuthRouter());
  app.use("/api/config", authMiddleware);
  app.use("/api/providers", authMiddleware);
  app.use("/api/repos", authMiddleware);
  app.use("/api/sessions", authMiddleware);
  app.use(createConfigRouter());
  app.use(createProviderRouter());
  app.use(createRepoRouter());
  app.use(createSessionRouter());
}
