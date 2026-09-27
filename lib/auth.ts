import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "ycd_session";

export type SessionPayload = {
  userId: string;
  name: string;
  username: string;
  email?: string;
  mustChangePassword: boolean;
  branchId?: string;
  roles: string[];
  permissions: string[];
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET_MISSING");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionPayload;
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const tokenSession = await verifySessionToken(token);
    if (!tokenSession.userId) return null;

    const user = await db.user.findUnique({
      where: { id: tokenSession.userId },
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

    if (!user || user.status !== "ACTIVE") return null;
    if (user.lockedUntil && user.lockedUntil > new Date()) return null;

    // A password reset or forced-change state invalidates any older browser session.
    // The user must sign in again with the current password before continuing.
    if (tokenSession.mustChangePassword !== user.mustChangePassword) return null;

    const roles = user.roles.map((entry) => entry.role.code);
    const permissions = [...new Set(
      user.roles.flatMap((entry) =>
        entry.role.permissions.map((item) => item.permission.code),
      ),
    )];

    return {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email ?? undefined,
      mustChangePassword: user.mustChangePassword,
      branchId: user.branchId ?? undefined,
      roles,
      permissions,
    } satisfies SessionPayload;
  } catch {
    return null;
  }
}
