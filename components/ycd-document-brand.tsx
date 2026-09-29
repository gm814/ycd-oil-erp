import { companyConfig } from "@/lib/config";

export function YcdDocumentHeader({ title, titleEn, number }: { title: string; titleEn?: string; number?: string }) {
  return (
    <header className="ycdDocHeader">
      <div className="ycdDocBrand">
        <img src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
        <div>
          <b>{companyConfig.legalNameAr}</b>
          <span>OIL & AUTO SERVICE</span>
        </div>
      </div>
      <div className="ycdDocTitle">
        <span>{titleEn}</span>
        <h1>{title}</h1>
        {number && <b>{number}</b>}
      </div>
    </header>
  );
}

export function YcdDocumentFooter() {
  return (
    <footer className="ycdDocFooter">
      <span>☎ {companyConfig.phone}</span>
      <span>⌖ {companyConfig.branch}</span>
      <span>✉ {companyConfig.email}</span>
      <span>◉ {companyConfig.website}</span>
    </footer>
  );
}

export function YcdLegalStrip() {
  return (
    <section className="ycdLegalStrip">
      <div><span>الرقم الموحد</span><b>{companyConfig.unifiedNumber}</b></div>
      <div><span>السجل التجاري</span><b>{companyConfig.crNumber}</b></div>
      <div><span>الرقم الضريبي</span><b>{companyConfig.vatNumber}</b></div>
    </section>
  );
}
