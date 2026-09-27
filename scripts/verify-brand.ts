import { readFile } from "node:fs/promises";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`BRAND_VERIFY_FAILED: ${message}`);
}

async function main() {
  const [config, css, logo] = await Promise.all([
    readFile("lib/config.ts", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("public/brand/ycd-logo-source.svg", "utf8"),
  ]);

  const colors = ["#F18F21", "#F7A81D", "#939497", "#BDBDBF"];
  for (const color of colors) {
    assert(config.toUpperCase().includes(color), `لون الهوية غير موجود في config: ${color}`);
    assert(css.toUpperCase().includes(color), `لون الهوية غير موجود في CSS: ${color}`);
  }

  assert(config.includes('brand: "YCD OIL"'), "اسم العلامة غير مطابق");
  assert(config.includes('sourceSha256: "864c162d79433c1941393c2cb5cbe80ccef51abe291aea8018a84d7f0029549a"'), "بصمة ملف الهوية الرسمي غير مثبتة");
  assert(config.includes('certificateSha256: "121703866f6e01c3aaaacd8b3bed7befe6d9b02d342086ff087e63d7d5698dc6"'), "بصمة شهادة IBAN غير مثبتة");
  assert(config.includes('logoAsset: "/brand/ycd-logo-source.svg"'), "مسار الشعار المعتمد غير مطابق");
  assert(logo.includes('aria-label="YCD OIL"'), "ملف الشعار لا يحمل تعريف YCD OIL");
  assert(logo.includes("official YCD OIL identity file supplied by management"), "مصدر الشعار الرسمي غير موثق داخل الأصل");
  assert(logo.includes("data:image/webp;base64,"), "الشعار يجب أن يضم القص المعتمد من ملف الهوية دون إعادة رسم");
  assert(logo.length > 5000, "ملف الشعار يبدو فارغًا أو مستبدلًا ببديل مبسط");

  console.log("YCD BRAND IDENTITY VERIFIED");
  console.log(`Approved colors: ${colors.join(", ")}`);
  console.log("Official embedded logo asset: verified");
  console.log("Identity PDF and IBAN certificate provenance: recorded");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
