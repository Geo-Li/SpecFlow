import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createAuthRouter, authMiddleware, initAuth } from "./auth.js";
import { createConfigRouter } from "./config-routes.js";
import { createProviderRouter } from "./provider-routes.js";
import { createRepoRouter } from "./repo-routes.js";
import { createSessionRouter } from "./session-routes.js";
import { createChatRouter } from "./chat-routes.js";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function setupApi(app: Express, jwtSecret: string, adminPassword: string): void {
  initAuth(jwtSecret, adminPassword);

  app.use(helmet());

  const corsOrigins = (process.env.SPECFLOW_CORS_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (corsOrigins.some((allowed) => origin === allowed)) return callback(null, true);
      // Allow a specific Chrome extension origin (set SPECFLOW_EXTENSION_ORIGIN env var)
      const extOrigin = process.env.SPECFLOW_EXTENSION_ORIGIN;
      if (extOrigin && origin === extOrigin) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api/auth/login", loginLimiter);
  app.use(createAuthRouter());
  app.use("/api/config", authMiddleware);
  app.use("/api/providers", authMiddleware);
  app.use("/api/browse-dirs", authMiddleware);
  app.use("/api/repos", authMiddleware);
  app.use("/api/sessions", authMiddleware);
  app.use("/api/chat", authMiddleware);
  app.use(createConfigRouter());
  app.use(createProviderRouter());
  app.use(createRepoRouter());
  app.use(createSessionRouter());
  app.use(createChatRouter());
}
