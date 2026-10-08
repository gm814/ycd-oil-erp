import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import SecurityActions from "./security-actions";

export default async function AccountSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      username: true,
      email: true,
      name: true,
      status: true,
      lastLoginAt: true,
      mustChangePassword: true,
      sessionVersion: true,
      roles: { select: { role: { select: { nameAr: true } } } },
    },
  });
  if (!user) redirect("/");

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard" className="backLink">← لوحة التحكم</a>
          <h1>أمان الحساب</h1>
          <p>مراجعة حساب الدخول وإبطال الجلسات القديمة عند الحاجة.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="workGrid">
        <article className="panel">
          <h2>بيانات الحساب</h2>
          <p><b>المستخدم:</b> {user.name}</p>
          <p><b>اسم الدخول:</b> <span dir="ltr">{user.username}</span></p>
          <p><b>البريد:</b> {user.email || "غير مسجل"}</p>
          <p><b>الحالة:</b> {user.status === "ACTIVE" ? "نشط" : "موقوف"}</p>
          <p><b>آخر دخول:</b> {user.lastLoginAt ? user.lastLoginAt.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }) : "لم يسجل بعد"}</p>
          <p><b>الأدوار:</b> {user.roles.map((entry) => entry.role.nameAr).join(" + ") || "—"}</p>
          {user.mustChangePassword && <p className="alertBadge">يلزم تغيير كلمة المرور المؤقتة.</p>}
        </article>
        <SecurityActions />
      </section>

      <article className="panel">
        <h2>سياسة الجلسة</h2>
        <p>مدة جلسة الدخول ثماني ساعات. تغيير كلمة المرور أو إعادة تعيينها يبطل الجلسات القديمة، كما يمكن إبطالها يدويًا من هذه الصفحة.</p>
      </article>
    </main>
  );
}
