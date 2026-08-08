import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email and a password of at least 8 characters are required" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findFirst();
  if (existing) {
    return NextResponse.json(
      { error: "An account already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}
