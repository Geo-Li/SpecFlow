import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

let jwtSecret = "";
let adminPassword = "";

export function initAuth(secret: string, password: string): void { jwtSecret = secret; adminPassword = password; }

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.specflow_token;
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(token, jwtSecret); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

export function createAuthRouter(): Router {
  const router = Router();
  router.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    if (password !== adminPassword) { res.status(401).json({ error: "Invalid password" }); return; }
    const token = jwt.sign({ admin: true }, jwtSecret, { expiresIn: "24h" });
    res.cookie("specflow_token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });
  router.post("/api/auth/logout", (_req: Request, res: Response) => { res.clearCookie("specflow_token"); res.json({ ok: true }); });
  router.get("/api/auth/check", (req: Request, res: Response) => {
    const token = req.cookies?.specflow_token;
    if (!token) { res.json({ authenticated: false }); return; }
    try { jwt.verify(token, jwtSecret); res.json({ authenticated: true }); }
    catch { res.json({ authenticated: false }); }
  });
  return router;
}
