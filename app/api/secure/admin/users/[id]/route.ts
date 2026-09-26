import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  roleCodes: z.array(z.string().min(1).max(80)).min(1).max(6).optional(),
  password: z.string().min(10).max(200).optional(),
}).refine((value) => value.status || value.roleCodes || value.password, {
  message: "NO_CHANGES",
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { id } = await context.params;

  if (id === session.userId && (parsed.data.status === "SUSPENDED" || parsed.data.roleCodes)) {
    return NextResponse.json({ error: "SELF_ACCESS_CHANGE_NOT_ALLOWED" }, { status: 409 });
  }

  const roleCodes = parsed.data.roleCodes ? [...new Set(parsed.data.roleCodes)] : undefined;

  try {
    const user = await db.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id, branchId: session.branchId! },
        include: { roles: { include: { role: true } }, employee: true },
      });
      if (!current) throw new Error("USER_NOT_FOUND");

      const isGeneralManager = current.roles.some((entry) => entry.role.code === "GENERAL_MANAGER");
      const removesGeneralManager = roleCodes ? !roleCodes.includes("GENERAL_MANAGER") : false;
      const suspendsGeneralManager = parsed.data.status === "SUSPENDED";
      if (isGeneralManager && (removesGeneralManager || suspendsGeneralManager)) {
        const activeGeneralManagers = await tx.user.count({
          where: {
            branchId: session.branchId!,
            status: "ACTIVE",
            roles: { some: { role: { code: "GENERAL_MANAGER" } } },
          },
        });
        if (activeGeneralManagers <= 1) throw new Error("LAST_GENERAL_MANAGER_PROTECTED");
      }

      if (roleCodes) {
        const roles = await tx.role.findMany({
          where: { code: { in: roleCodes } },
          select: { id: true, code: true },
        });
        if (roles.length !== roleCodes.length) throw new Error("INVALID_ROLE");
        await tx.userRole.deleteMany({ where: { userId: current.id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: current.id, roleId: role.id })),
        });
      }

      const passwordHash = parsed.data.password ? await hash(parsed.data.password, 12) : undefined;
      const updated = await tx.user.update({
        where: { id: current.id },
        data: {
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
        include: { roles: { include: { role: true } }, employee: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "USER_ACCOUNT_UPDATED",
          entityType: "User",
          entityId: current.id,
          beforeJson: {
            status: current.status,
            roles: current.roles.map((entry) => entry.role.code),
          },
          afterJson: {
            status: updated.status,
            roles: updated.roles.map((entry) => entry.role.code),
            passwordReset: Boolean(parsed.data.password),
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        roles: user.roles.map((entry) => entry.role.code),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USER_UPDATE_FAILED";
    const status = code === "USER_NOT_FOUND" ? 404
      : ["LAST_GENERAL_MANAGER_PROTECTED", "SELF_ACCESS_CHANGE_NOT_ALLOWED"].includes(code) ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
