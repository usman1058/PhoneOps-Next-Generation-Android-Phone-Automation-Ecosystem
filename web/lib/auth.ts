import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";
const ACCESS_TOKEN_TTL = "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(
  token: string,
): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (typeof decoded.sub !== "string" || decoded.sub.length === 0) {
      return null;
    }
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireAuth(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId: payload.userId };
}
