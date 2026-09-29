import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader } from "@/components/ycd-document-brand";
import PrintButton from "./print-button";

export default async function LetterheadPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <main className="workspace invoiceWorkspace">
      <div className="invoiceActions noPrint">
        <a href="/dashboard/documents" className="backLink">← مركز المستندات</a>
        <PrintButton />
      </div>
      <article className="ycdDocument ycdLetterhead">
        <YcdDocumentHeader title="مراسلات رسمية" titleEn="OFFICIAL LETTERHEAD" />
        <section className="letterMeta">
          <div><b>التاريخ</b><span>____ / ____ / ______</span></div>
          <div><b>الرقم</b><span>________________</span></div>
          <div><b>المرفقات</b><span>________________</span></div>
        </section>
        <section className="letterBody">
          <p>السادة / .....................................................................................................................</p>
          <p>الموضوع / ...................................................................................................................</p>
          <div className="letterWritingArea" />
          <div className="letterSignature">
            <span>وتفضلوا بقبول خالص التحية والتقدير،</span>
            <b>شركة وجهتك الإبداعية لزيوت وخدمات السيارات</b>
            <span>YCD OIL & AUTO SERVICE</span>
          </div>
        </section>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
