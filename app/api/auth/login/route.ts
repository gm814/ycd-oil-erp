import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

const inputSchema = z.object({
  identifier: z.string().trim().min(2).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const user = await db.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier },
      ],
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user?.passwordHash || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const valid = await compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const roles = user.roles.map((entry) => entry.role.code);
  const permissions = [...new Set(
    user.roles.flatMap((entry) =>
      entry.role.permissions.map((permission) => permission.permission.code),
    ),
  )];

  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    username: user.username,
    email: user.email ?? undefined,
    mustChangePassword: user.mustChangePassword,
    branchId: user.branchId ?? undefined,
    roles,
    permissions,
  });

  const response = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
