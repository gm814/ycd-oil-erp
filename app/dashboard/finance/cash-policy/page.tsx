import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS as P, hasPermission } from "@/lib/rbac";
import { configureCashDrawer, drawerSummary } from "@/services/cash-drawer";
import CashHandover from "./cash-handover";

async function configure(form: FormData) {
  "use server";
  const session = await getSession();
  if (!session?.branchId || !hasPermission(session.permissions, P.FINANCE_MANAGE) || !hasPermission(session.permissions, P.FINANCE_EXPENSE_APPROVE)) redirect("/dashboard");
  const drawerId = String(form.get("drawerId") || "");
  const treasuryId = String(form.get("treasuryId") || "");
  let result = "ready";
  try {
    if (!drawerId || form.get("reviewed") !== "yes") throw new Error("REVIEW_REQUIRED");
    await db.$transaction(tx => configureCashDrawer(tx, session.branchId!, session.userId, drawerId, treasuryId || undefined), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    result = error instanceof Error ? error.message : "FAILED";
    if (!/^[A-Z_]+$/.test(result)) result = "FAILED";
  }
  revalidatePath("/dashboard/shifts");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/wash");
  redirect(`/dashboard/finance/cash-policy?result=${result}`);
}
const messages: Record<string, string> = {
  ready: "تم فصل درج الكاشير عن صندوق الإدارة وربط الوردية المفتوحة. لم تُضف أو تُحذف أي حركة مالية.",
  CASH_POLICY_LOCKED: "الفصل معتمد بالفعل. تغيير الحسابات المرتبطة يحتاج مراجعة مستقلة.",
  LEGACY_REVIEW_REQUIRED: "تحصيلات الوردية لا تتطابق مع هذا الحساب. اختر درج التحصيل الصحيح أو راجع الحركات مع المحاسب.",
  OPENING_REVIEW_REQUIRED: "رصيد الحساب عند بدء الوردية لا يطابق النقد الافتتاحي. يلزم مراجعة السبب قبل الفصل.",
  INVALID_DRAWER: "اختر حسابًا نقديًا نشطًا لتحصيل العملاء، وليس حساب قبض المغسلة.",
  INVALID_TREASURY: "اختر صندوقًا مستقلًا للإدارة، وليس درج الكاشير أو حساب قبض المغسلة.",
  MULTIPLE_OPEN_SHIFTS: "توجد أكثر من وردية مفتوحة. يلزم مراجعتها قبل الفصل.",
  REVIEW_REQUIRED: "راجع الحسابات والحركات ثم ضع علامة تأكيد المراجعة.",
};
const money = (value: unknown) => Number(value).toFixed(2) + " ر.س";
export default async function CashPolicyPage({ searchParams }: { searchParams: Promise<{ drawer?: string; result?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId || !hasPermission(session.permissions, P.FINANCE_VIEW)) redirect("/dashboard");
  const branchId = session.branchId;
  const params = await searchParams;
  const accounts = await db.financialAccount.findMany({ where: { branchId, type: "CASH", active: true }, orderBy: { createdAt: "asc" } });
  const drawer = accounts.find(a => a.cashRole === "DRAWER");
  const treasury = accounts.find(a => a.cashRole === "TREASURY");
  const selected = drawer ?? accounts.find(a => a.id === params.drawer);
  const open = await db.shift.findFirst({ where: { branchId, closedAt: null }, orderBy: { openedAt: "desc" } });
  const summary = selected && open ? await drawerSummary(db, { ...open, drawerAccountId: selected.id }) : null;
  const balances = await db.financialTransaction.groupBy({ by: ["accountId"], where: { branchId }, _sum: { amount: true } });
  const balance = (id: string) => Number(balances.find(b => b.accountId === id)?._sum.amount ?? 0);
  const canConfigure = hasPermission(session.permissions, P.FINANCE_MANAGE) && hasPermission(session.permissions, P.FINANCE_EXPENSE_APPROVE);
  return <main className="workspace" dir="rtl">
    <div className="workspaceTop"><div><a href="/dashboard/finance">← المالية</a><h1>درج الكاشير وصندوق الإدارة</h1><p>الدرج لتحصيل العملاء ورد مبالغهم. صندوق الإدارة للسداد والمصروفات. تسليم النقد يُسجّل بسند تحويل بعد التسليم الفعلي.</p></div></div>
    {params.result && <p className="formNotice" role="status">{messages[params.result] ?? "لم يتم الحفظ. راجع اختيار الحسابات وتأكد من عدم وجود حساب سابق بكود ADMIN-TREASURY؛ إن وجد اختره بدل إنشاء حساب جديد."}</p>}
    {drawer && treasury ? <>
      <section className="kpis"><article><span>درج الكاشير — {drawer.nameAr}</span><b>{money(balance(drawer.id))}</b></article><article><span>صندوق الإدارة — {treasury.nameAr}</span><b>{money(balance(treasury.id))}</b></article></section>
      <p>سداد مطالبات الغسيل من صندوق الإدارة أو البنك فقط. الصرف السابق من الدرج يبقى في السجل ويظهر في مطابقة الوردية.</p>
      {hasPermission(session.permissions, P.FINANCE_TRANSFER) && <CashHandover drawerId={drawer.id} treasuryId={treasury.id} drawerBalance={balance(drawer.id)} treasuryBalance={balance(treasury.id)} hasOpenShift={!!open} />}
      <a className="secondaryButton" href="/dashboard/shifts">مراجعة الوردية وإقفالها</a>
    </> : canConfigure ? <article className="panel">
      <h2>تحديد الحسابات ومراجعة الوردية الحالية</h2>
      <form className="intakeForm" method="get"><label>حساب تحصيل العملاء الحالي<select name="drawer" required defaultValue={selected?.id ?? ""}><option value="">اختر درج التحصيل</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}</select></label><button>عرض الحركات للمراجعة</button></form>
      {selected && <form className="intakeForm" action={configure}>
        <input type="hidden" name="drawerId" value={selected.id} />
        <p>درج الكاشير: <b>{selected.code} — {selected.nameAr}</b> · الرصيد الحالي: {money(balance(selected.id))}</p>
        <label>صندوق الإدارة<select name="treasuryId" defaultValue=""><option value="">إنشاء صندوق الإدارة برصيد صفر</option>{accounts.filter(a => a.id !== selected.id).map(a => <option key={a.id} value={a.id}>{a.code} — {a.nameAr}</option>)}</select></label>
        <p>لن يتغير رصيد أي حساب أو مستحق. تُربط الوردية المفتوحة بحركات هذا الدرج الفعلية، وتبقى الحركات القديمة بمراجعها.</p>
        {summary && <p>النقد المتوقع بعد احتساب جميع حركات الدرج: <b>{money(summary.expectedCash)}</b></p>}
        <label><input name="reviewed" value="yes" type="checkbox" required />راجعت الحساب والحركات أدناه، وهذا هو درج تحصيل الوردية.</label>
        <button>اعتماد فصل الدرج وصندوق الإدارة</button>
      </form>}
    </article> : <p className="formNotice">يجهز المحاسب العام درج الكاشير وصندوق الإدارة من هذه الصفحة.</p>}
    {summary && <article className="panel inventoryPanel"><h2>حركات الدرج خلال الوردية المفتوحة</h2><p>رصيد بداية الوردية: {money(open!.openingCash)} · المتوقع الآن: {money(summary.expectedCash)}</p><div className="tableWrap"><table><thead><tr><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr></thead><tbody>{summary.movements.map(row => <tr key={row.id}><td>{row.descriptionAr}</td><td><a href={`/dashboard/finance/transactions/${row.id}/voucher`}>{row.reference || row.documentNo}</a></td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></article>}
  </main>;
}
