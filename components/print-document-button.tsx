"use client";
export default function PrintDocumentButton({ label = "طباعة المستند" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()}>{label}</button>;
}
