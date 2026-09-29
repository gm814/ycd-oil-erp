import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({
  employeeId: z.string().min(1),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.union([z.string().email().max(200), z.literal("")]).optional(),
  password: z.string().min(10).max(200),
  roleCodes: z.array(z.string().min(1).max(80)).min(1).max(6),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const roleCodes = [...new Set(parsed.data.roleCodes)];

  try {
    const user = await db.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: parsed.data.employeeId, branchId: session.branchId!, active: true },
        include: { user: { select: { id: true } } },
      });
      if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
      if (employee.user) throw new Error("EMPLOYEE_ALREADY_HAS_USER");

      const existingUsername = await tx.user.findUnique({ where: { username } });
      if (existingUsername) throw new Error("USERNAME_ALREADY_USED");
      if (email) {
        const existingEmail = await tx.user.findUnique({ where: { email } });
        if (existingEmail) throw new Error("EMAIL_ALREADY_USED");
      }

      const roles = await tx.role.findMany({ where: { code: { in: roleCodes } } });
      if (roles.length !== roleCodes.length) throw new Error("INVALID_ROLE");

      const passwordHash = await hash(parsed.data.password, 12);
      const created = await tx.user.create({
        data: {
          username,
          email,
          name: employee.nameAr,
          passwordHash,
          mustChangePassword: true,
          branchId: session.branchId!,
          employeeId: employee.id,
          status: "ACTIVE",
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: { roles: { include: { role: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "USER_ACCOUNT_CREATED",
          entityType: "User",
          entityId: created.id,
          afterJson: {
            employeeId: employee.id,
            employeeCode: employee.code,
            username,
            email,
            roles: roles.map((role) => role.code),
            status: created.status,
            mustChangePassword: true,
          },
        },
      });

      return created;
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        roles: user.roles.map((entry) => entry.role.code),
      },
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "USER_CREATE_FAILED";
    const status = ["EMPLOYEE_ALREADY_HAS_USER", "USERNAME_ALREADY_USED", "EMAIL_ALREADY_USED"].includes(code) ? 409
      : code === "EMPLOYEE_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
