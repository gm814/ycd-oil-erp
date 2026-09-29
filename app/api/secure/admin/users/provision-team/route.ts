import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { operationalTeam } from "@/lib/operations";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

type Credential = {
  employeeCode: string;
  employeeName: string;
  username: string;
  temporaryPassword: string;
  roles: string[];
};

function temporaryPassword() {
  return String.fromCharCode(randomInt(65, 91)) + String.fromCharCode(randomInt(97, 123)) + String(randomInt(0, 1000000)).padStart(6, "0");
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId) return NextResponse.json({ error: "BRANCH_REQUIRED" }, { status: 400 });
  if (!hasPermission(session.permissions, PERMISSIONS.USER_MANAGE)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const credentials = await db.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({
        where: {
          branchId: session.branchId!,
          active: true,
          code: { in: operationalTeam.map((member) => member.code) },
        },
        include: { user: { select: { id: true } } },
      });
      const employeeByCode = new Map(employees.map((employee) => [employee.code, employee]));

      const allRoleCodes = [...new Set(operationalTeam.flatMap((member) => [...member.systemRoleCodes]))];
      const roles = await tx.role.findMany({
        where: { code: { in: allRoleCodes } },
        select: { id: true, code: true },
      });
      const roleByCode = new Map(roles.map((role) => [role.code, role]));
      if (roles.length !== allRoleCodes.length) throw new Error("OPERATIONAL_ROLE_MISSING");

      const createdCredentials: Credential[] = [];

      for (const member of operationalTeam) {
        const employee = employeeByCode.get(member.code);
        if (!employee) throw new Error(`EMPLOYEE_MISSING:${member.code}`);
        if (employee.user) continue;

        const username = member.code.toLowerCase();
        const existingUsername = await tx.user.findUnique({ where: { username } });
        if (existingUsername) throw new Error(`USERNAME_ALREADY_USED:${username}`);

        const password = temporaryPassword();
        const passwordHash = await hash(password, 12);
        const selectedRoles = member.systemRoleCodes.map((code) => {
          const role = roleByCode.get(code);
          if (!role) throw new Error(`OPERATIONAL_ROLE_MISSING:${code}`);
          return role;
        });

        const user = await tx.user.create({
          data: {
            username,
            email: null,
            name: member.nameAr,
            passwordHash,
            mustChangePassword: true,
            branchId: session.branchId!,
            employeeId: employee.id,
            status: "ACTIVE",
            roles: { create: selectedRoles.map((role) => ({ roleId: role.id })) },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "STAFF_ACCESS_PROVISIONED",
            entityType: "User",
            entityId: user.id,
            afterJson: {
              employeeId: employee.id,
              employeeCode: member.code,
              username,
              roles: selectedRoles.map((role) => role.code),
              mustChangePassword: true,
            },
          },
        });

        createdCredentials.push({
          employeeCode: member.code,
          employeeName: member.nameAr,
          username,
          temporaryPassword: password,
          roles: selectedRoles.map((role) => role.code),
        });
      }

      return createdCredentials;
    });

    return NextResponse.json({
      created: credentials.length,
      credentials,
      notice: "TEMPORARY_PASSWORDS_RETURNED_ONCE",
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STAFF_PROVISION_FAILED";
    const status = code.startsWith("EMPLOYEE_MISSING") ? 404
      : code.startsWith("USERNAME_ALREADY_USED") ? 409
        : code.startsWith("OPERATIONAL_ROLE_MISSING") ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
