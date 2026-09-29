import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { UAT_CASES } from "@/lib/uat";
import UatChecklist from "./uat-checklist";

export default async function UatPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  if (!hasPermission(session.permissions, PERMISSIONS.REPORTS_VIEW)) redirect("/dashboard");

  const [branch, results] = await Promise.all([
    db.branch.findUnique({
      where: { id: session.branchId },
      select: { operationalStatus: true, nameAr: true },
    }),
    db.uatTestResult.findMany({
      where: { branchId: session.branchId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  if (!branch) redirect("/dashboard");

  const resultByCode = new Map(results.map((item) => [item.caseCode, item]));
  const rows = UAT_CASES.map((testCase) => {
    const result = resultByCode.get(testCase.code);
    return {
      ...testCase,
      status: result?.status ?? "NOT_RUN",
      executedAt: result?.executedAt?.toISOString() ?? null,
      evidenceRef: result?.evidenceRef ?? null,
      notes: result?.notes ?? null,
    };
  });
  const passed = rows.filter((item) => item.status === "PASSED").length;
  const failed = rows.filter((item) => item.status === "FAILED").length;
  const notRun = rows.length - passed - failed;

  return (
    <main className="workspace">
      <div className="workspaceTop">
        <div>
          <a href="/dashboard/readiness" className="backLink">← جاهزية الافتتاح</a>
          <h1>اختبارات القبول التشغيلي UAT</h1>
          <p>اختبارات إلزامية قبل فتح فرع {branch.nameAr} للتشغيل التجاري. كل نتيجة تحفظ باسم المنفذ وفي سجل التدقيق.</p>
        </div>
        <img className="documentCenterLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
      </div>

      <section className="kpis reportKpis">
        <article><span>إجمالي السيناريوهات</span><b>{rows.length}</b></article>
        <article><span>ناجح</span><b>{passed}</b></article>
        <article><span>فاشل</span><b>{failed}</b></article>
        <article><span>لم يُنفذ</span><b>{notRun}</b></article>
      </section>

      {branch.operationalStatus !== "PREOPENING" && (
        <p className="formNotice">تم تجاوز مرحلة ما قبل التشغيل؛ سجل UAT أصبح للعرض فقط.</p>
      )}

      <UatChecklist
        rows={rows}
        canExecute={branch.operationalStatus === "PREOPENING" && hasPermission(session.permissions, PERMISSIONS.OPERATIONS_UAT)}
      />
    </main>
  );
}
