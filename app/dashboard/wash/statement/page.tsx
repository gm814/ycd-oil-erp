import { Prisma } from "@prisma/client";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS as P } from "@/lib/rbac";
import { riyadhDateRange, riyadhMonthToDateStrings } from "@/lib/time";
import PrintDocumentButton from "@/components/print-document-button";
import { YcdDocumentHeader, YcdDocumentFooter } from "@/components/ycd-document-brand";
export default async function WashStatement({ searchParams }: { searchParams: Promise<{ agreementId?: string; from?: string; to?: string; view?: string }> }) {
  const session = await getSession(); if (!session) redirect("/");
  if (!session.branchId || ![P.COUPON_REDEEM,P.FINANCE_VIEW,P.FINANCE_EXPENSE_APPROVE,P.FINANCE_EXPENSE_PAY].some(p=>hasPermission(session.permissions,p))) redirect("/dashboard");
  const q = await searchParams;
  const agreement = await db.washAgreement.findFirst({ where: { id: q.agreementId ?? "", OR: [{ sourceBranchId: session.branchId }, { washBranchId: session.branchId }] }, include: { sourceBranch: true, washBranch: true } });
  if (!agreement) notFound();
  const defaults = riyadhMonthToDateStrings(); const from=q.from??defaults.from, to=q.to??defaults.to;
  const range=riyadhDateRange(from,to);if(!range) return <main className="workspace"><p>فترة غير صالحة.</p><a href={`/dashboard/wash/statement?agreementId=${agreement.id}`}>إعادة اختيار الفترة</a></main>;
  const washView=q.view!=="oil";
  const [batches,payments]=await Promise.all([
    db.washBatch.findMany({where:{agreementId:agreement.id,status:"POSTED",postedAt:{lt:range.end}},orderBy:{postedAt:"asc"}}),
    db.washSettlement.findMany({where:{batch:{agreementId:agreement.id},paidAt:{lt:range.end}},include:{batch:true},orderBy:{paidAt:"asc"}}),
  ]);
  const zero=()=>new Prisma.Decimal(0);
  const opening=batches.filter(b=>b.postedAt!<range.start).reduce((n,b)=>n.plus(b.total),zero()).minus(payments.filter(p=>p.paidAt<range.start).reduce((n,p)=>n.plus(p.amount),zero()));
  const entries=[...batches.filter(b=>b.postedAt!>=range.start).map(b=>({id:b.id,date:b.postedAt!,number:b.batchNo,text:`ترحيل كوبونات يوم ${b.businessDate}`,charge:b.total,payment:zero()})),...payments.filter(p=>p.paidAt>=range.start).map(p=>({id:p.id,date:p.paidAt,number:p.settlementNo,text:`سداد ${p.batch.batchNo} · ${p.reference}`,charge:zero(),payment:p.amount}))].sort((a,b)=>a.date.getTime()-b.date.getTime()||a.id.localeCompare(b.id));
  let balance=opening; const charge=entries.reduce((n,e)=>n.plus(e.charge),zero()),payment=entries.reduce((n,e)=>n.plus(e.payment),zero());
  const fmt=(n:Prisma.Decimal)=>n.toFixed(2)+" ر.س";
  return <main className="workspace invoiceWorkspace"><div className="invoiceActions noPrint"><a className="backLink" href="/dashboard/wash">← كوبونات وتسويات الغسيل</a><PrintDocumentButton label="طباعة كشف الحساب"/></div>
    <form className="panel intakeForm noPrint"><input type="hidden" name="agreementId" value={agreement.id}/><div className="formRow"><label>من<input type="date" name="from" defaultValue={from} required/></label><label>إلى<input type="date" name="to" defaultValue={to} required/></label></div><label>منظور كشف الحساب<select name="view" defaultValue={washView?"wash":"oil"}><option value="wash">دفاتر المغسلة — ذمة مدينة على YCD OIL</option><option value="oil">دفاتر YCD OIL — ذمة دائنة للمغسلة</option></select></label><button>عرض الكشف</button></form>
    <article className="ycdDocument"><YcdDocumentHeader title="كشف حساب كوبونات الغسيل" titleEn="CAR WASH SETTLEMENT STATEMENT" number={`${from} / ${to}`}/><h2>{agreement.sourceBranch.nameAr} — {agreement.nameAr}</h2><p>{washView?"منظور المغسلة: المدين يزيد مستحقاتها، والدائن يمثل التحصيل.":"منظور المركز: الدائن يزيد المستحق للمغسلة، والمدين يمثل السداد."}</p><p>سجل تسويات داخلي، يضم المطالبات المعتمدة والمرحلة فقط. لا يمثل فاتورة ضريبية.</p>
    <section className="kpis reportKpis"><article><span>الرصيد الافتتاحي للمغسلة</span><b>{fmt(opening)}</b></article><article><span>مستحقات الفترة</span><b>{fmt(charge)}</b></article><article><span>سداد الفترة</span><b>{fmt(payment)}</b></article><article><span>الرصيد المتبقي للمغسلة</span><b>{fmt(opening.plus(charge).minus(payment))}</b></article></section>
    <div className="tableWrap"><table><thead><tr><th>التاريخ</th><th>رقم المستند</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد {washView?"المدين على المركز":"الدائن للمغسلة"}</th></tr></thead><tbody>{entries.map(e=>{balance=balance.plus(e.charge).minus(e.payment);return <tr key={e.id}><td>{e.date.toLocaleDateString("ar-SA",{timeZone:"Asia/Riyadh"})}</td><td>{e.number}</td><td>{e.text}</td><td>{fmt(washView?e.charge:e.payment)}</td><td>{fmt(washView?e.payment:e.charge)}</td><td>{fmt(balance)}</td></tr>})}{!entries.length&&<tr><td colSpan={6}>لا توجد حركات مرحلة ضمن الفترة.</td></tr>}</tbody></table></div><YcdDocumentFooter/></article></main>;
}
