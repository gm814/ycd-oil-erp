import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken, getSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const updated = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: session.userId },
      data: { sessionVersion: { increment: 1 } },
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

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "USER_SESSIONS_REVOKED",
        entityType: "User",
        entityId: user.id,
        afterJson: { sessionVersion: user.sessionVersion },
      },
    });

    return user;
  });

  const roles = updated.roles.map((entry) => entry.role.code);
  const permissions = [...new Set(
    updated.roles.flatMap((entry) =>
      entry.role.permissions.map((item) => item.permission.code),
    ),
  )];

  const token = await createSessionToken({
    userId: updated.id,
    name: updated.name,
    username: updated.username,
    email: updated.email ?? undefined,
    mustChangePassword: updated.mustChangePassword,
    sessionVersion: updated.sessionVersion,
    branchId: updated.branchId ?? undefined,
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
