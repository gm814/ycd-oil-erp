"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { canCatalog: boolean; canSuppliers: boolean };

function parseLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function parseTable(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("EMPTY_FILE");
  const first = lines[0];
  const candidates = [",", ";", "\t"];
  const delimiter = candidates.sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const headers = parseLine(first, delimiter).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function bool(value: string) {
  return ["1", "true", "yes", "نعم"].includes(String(value).trim().toLowerCase());
}

export default function PreopeningImportClient({ canCatalog, canSuppliers }: Props) {
  const router = useRouter();
  const [catalogRows, setCatalogRows] = useState<Record<string, string>[]>([]);
  const [supplierRows, setSupplierRows] = useState<Record<string, string>[]>([]);
  const [catalogFile, setCatalogFile] = useState("");
  const [supplierFile, setSupplierFile] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const catalogPreview = useMemo(() => catalogRows.slice(0, 8), [catalogRows]);
  const supplierPreview = useMemo(() => supplierRows.slice(0, 8), [supplierRows]);

  async function readFile(event: ChangeEvent<HTMLInputElement>, kind: "catalog" | "suppliers") {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = parseTable(await file.text());
      if (kind === "catalog") { setCatalogRows(rows); setCatalogFile(file.name); }
      else { setSupplierRows(rows); setSupplierFile(file.name); }
      setMessage(`تمت قراءة ${rows.length} صف من ${file.name}. راجع المعاينة قبل الاعتماد.`);
    } catch {
      setMessage("تعذر قراءة الملف. استخدم CSV أو TSV بالقالب المحدد.");
    }
  }

  async function send(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const labels: Record<string, string> = {
        INVALID_INPUT: "يوجد صف أو حقل غير صالح. راجع أسماء الأعمدة والأرقام.",
        DUPLICATE_SKU_IN_BATCH: "يوجد SKU مكرر داخل الملف.",
        SERVICE_OPENING_STOCK_NOT_ALLOWED: "الخدمات لا تقبل رصيد مخزون افتتاحي؛ اجعل openingQty للخدمات صفرًا.",
        DUPLICATE_SUPPLIER_CODE_IN_BATCH: "يوجد كود مورد مكرر داخل الملف.",
        PREOPENING_IMPORT_ONLY: "الاستيراد الافتتاحي متاح فقط قبل بدء التشغيل التجاري.",
        FORBIDDEN: "لا تملك الصلاحية المطلوبة للاستيراد.",
      };
      setMessage(labels[result.error] || "تعذر اعتماد الملف.");
      return;
    }
    const summary = result.import;
    setMessage(`تم الاعتماد: ${summary.rowCount} صف · جديد ${summary.created} · محدث ${summary.updated}${summary.openingMovements !== undefined ? ` · أرصدة مخزون ${summary.openingMovements}` : ""}.`);
    router.refresh();
  }

  function importCatalog() {
    const rows = catalogRows.map((row) => ({
      sku: row.sku,
      nameAr: row.nameAr,
      category: row.category,
      unit: row.unit,
      salePrice: row.salePrice,
      costPrice: row.costPrice,
      minStock: row.minStock || "0",
      grantsWashCoupon: bool(row.grantsWashCoupon),
      openingQty: row.openingQty || "0",
    }));
    void send("/api/secure/readiness/import/catalog", {
      batchId: `CAT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      rows,
    });
  }

  function importSuppliers() {
    const rows = supplierRows.map((row) => ({
      code: row.code,
      nameAr: row.nameAr,
      vatNumber: row.vatNumber || "",
      crNumber: row.crNumber || "",
      phone: row.phone || "",
      email: row.email || "",
    }));
    void send("/api/secure/readiness/import/suppliers", {
      batchId: `SUP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      rows,
    });
  }

  return (
    <>
      <section className="workGrid">
        {canCatalog && (
          <article className="panel">
            <h2>الأصناف والخدمات والجرد الافتتاحي</h2>
            <p className="muted">الأعمدة المطلوبة بالترتيب أو بأي ترتيب يحمل نفس الأسماء:</p>
            <code className="importColumns">sku,nameAr,category,unit,salePrice,costPrice,minStock,grantsWashCoupon,openingQty</code>
            <a className="orderLink" href="/templates/ycd-preopening-catalog.csv" download>تنزيل قالب الأصناف والخدمات والجرد CSV</a>
            <p className="muted">التصنيف: OIL / FILTER / BATTERY / PART / WASH_SUPPLY / SERVICE / OTHER. الخدمة SERVICE يجب أن يكون openingQty لها صفرًا.</p>
            <p className="formNotice">قبل التشغيل فقط: إعادة استيراد نفس SKU تستبدل رصيده الافتتاحي السابق بدل مضاعفة الكمية، لتصحيح الجرد بأمان.</p>
            <label className="filePicker">ملف CSV / TSV
              <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void readFile(event, "catalog")} />
            </label>
            {catalogFile && <p><b>{catalogFile}</b> · {catalogRows.length} صف</p>}
            {catalogPreview.length > 0 && (
              <div className="tableWrap">
                <table>
                  <thead><tr><th>SKU</th><th>الصنف/الخدمة</th><th>التصنيف</th><th>البيع</th><th>التكلفة</th><th>الرصيد</th></tr></thead>
                  <tbody>{catalogPreview.map((row, index) => (
                    <tr key={index}><td>{row.sku}</td><td>{row.nameAr}</td><td>{row.category}</td><td>{row.salePrice}</td><td>{row.costPrice}</td><td>{row.openingQty || "0"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <button disabled={busy || catalogRows.length === 0} onClick={importCatalog}>اعتماد واستيراد الملف</button>
          </article>
        )}

        {canSuppliers && (
          <article className="panel">
            <h2>الموردون</h2>
            <p className="muted">الأعمدة المطلوبة:</p>
            <code className="importColumns">code,nameAr,vatNumber,crNumber,phone,email</code>
            <a className="orderLink" href="/templates/ycd-preopening-suppliers.csv" download>تنزيل قالب الموردين CSV</a>
            <label className="filePicker">ملف CSV / TSV
              <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void readFile(event, "suppliers")} />
            </label>
            {supplierFile && <p><b>{supplierFile}</b> · {supplierRows.length} صف</p>}
            {supplierPreview.length > 0 && (
              <div className="tableWrap">
                <table>
                  <thead><tr><th>الكود</th><th>المورد</th><th>الضريبي</th><th>السجل</th><th>الجوال</th></tr></thead>
                  <tbody>{supplierPreview.map((row, index) => (
                    <tr key={index}><td>{row.code}</td><td>{row.nameAr}</td><td>{row.vatNumber || "—"}</td><td>{row.crNumber || "—"}</td><td>{row.phone || "—"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <button disabled={busy || supplierRows.length === 0} onClick={importSuppliers}>اعتماد واستيراد الموردين</button>
          </article>
        )}
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
