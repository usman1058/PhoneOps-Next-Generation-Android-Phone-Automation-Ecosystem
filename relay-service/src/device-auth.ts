import { Router } from "express";
import { rateLimit, isLoopback } from "@automation/shared/rate-limit";
import { prisma } from "./db";
import { sha256Hex, signDeviceWsToken } from "./auth";

export const deviceAuthRouter = Router();

deviceAuthRouter.post("/handshake", async (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()) ??
    req.socket.remoteAddress ??
    "unknown";

  const limited = isLoopback(ip) ? { ok: true } : rateLimit(`handshake:${ip}`, 10, 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many attempts" });
    return;
  }

  const body = (req.body ?? {}) as { apiKey?: unknown };
  if (typeof body.apiKey !== "string" || body.apiKey.length === 0) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const apiKeyHash = sha256Hex(body.apiKey);
  const device = await prisma.device.findUnique({ where: { apiKeyHash } });
  if (!device) {
    res.status(401).json({ error: "Invalid apiKey" });
    return;
  }

  const token = signDeviceWsToken(device.id);
  res.json({ token, deviceId: device.id, expiresIn: 300 });
});
