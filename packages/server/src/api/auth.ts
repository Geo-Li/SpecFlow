import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { timingSafeEqual, createHmac, randomBytes } from "node:crypto";

let jwtSecret = "";
let adminPassword = "";

export function initAuth(secret: string, password: string): void { jwtSecret = secret; adminPassword = password; }

const compareKey = randomBytes(32);

function safeCompare(a: string, b: string): boolean {
  const hashA = createHmac("sha256", compareKey).update(a).digest();
  const hashB = createHmac("sha256", compareKey).update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Try Bearer token first, then fall back to cookie
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies?.specflow_token || "";
  }
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

export function createAuthRouter(): Router {
  const router = Router();
  router.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password || !safeCompare(password, adminPassword)) { res.status(401).json({ error: "Invalid password" }); return; }
    const token = jwt.sign({ admin: true }, jwtSecret, { algorithm: "HS256", expiresIn: "24h" });
    res.cookie("specflow_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 24 * 60 * 60 * 1000 });
    res.json({ ok: true, token });
  });
  router.post("/api/auth/logout", (_req: Request, res: Response) => { res.clearCookie("specflow_token"); res.json({ ok: true }); });
  router.get("/api/auth/check", (req: Request, res: Response) => {
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else {
      token = req.cookies?.specflow_token || "";
    }
    if (!token) { res.json({ authenticated: false }); return; }
    try { jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }); res.json({ authenticated: true }); }
    catch { res.json({ authenticated: false }); }
  });
  return router;
}
