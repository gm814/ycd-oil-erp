"use client";

import { useEffect, useState } from "react";

export default function PrintButton() {
  const [format, setFormat] = useState("a4");
  useEffect(() => {
    document.documentElement.dataset.invoicePrint = format;
    return () => { delete document.documentElement.dataset.invoicePrint; };
  }, [format]);

  return (
    <div className="invoicePrintControls">
      <label>تنسيق الطباعة{" "}
        <select value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="a4">صفحة A4</option>
          <option value="epson80">إيصال Epson — عرض 80 مم</option>
        </select>
      </label>
      <button type="button" onClick={() => window.print()}>طباعة الفاتورة</button>
      {format === "epson80" && <small>اختر طابعة Epson وورق 80 مم، والمقياس 100%، وأوقف رؤوس الصفحات وتذييلاتها.</small>}
    </div>
  );
}
