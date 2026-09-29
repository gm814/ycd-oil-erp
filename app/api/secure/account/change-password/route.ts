import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_REGEX, PASSWORD_HINT } from "@/lib/password-policy";
import { db } from "@/lib/db";
import { createSessionToken, getSession, SESSION_COOKIE } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().regex(PASSWORD_REGEX, PASSWORD_HINT),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "PASSWORD_MUST_CHANGE",
  path: ["newPassword"],
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  if (!user?.passwordHash || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const valid = await compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "CURRENT_PASSWORD_INVALID" }, { status: 401 });

  const passwordHash = await hash(parsed.data.newPassword, 12);
  const updatedUser = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "USER_PASSWORD_CHANGED",
        entityType: "User",
        entityId: user.id,
        afterJson: {
          forcedChangeCompleted: user.mustChangePassword,
          sessionVersion: updated.sessionVersion,
        },
      },
    });
    return updated;
  });

  const roles = user.roles.map((entry) => entry.role.code);
  const permissions = [...new Set(
    user.roles.flatMap((entry) => entry.role.permissions.map((item) => item.permission.code)),
  )];
  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    username: user.username,
    email: user.email ?? undefined,
    mustChangePassword: false,
    sessionVersion: updatedUser.sessionVersion,
    branchId: user.branchId ?? undefined,
    roles,
    permissions,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
