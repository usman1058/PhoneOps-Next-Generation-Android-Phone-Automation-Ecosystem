import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const ip = clientIp(req);

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const limited = rateLimit(`login:${ip}:${email}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many login attempts, try again shortly" },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = signAccessToken(user.id);
  return NextResponse.json({
    token,
    user: { id: user.id, email: user.email },
  });
}
