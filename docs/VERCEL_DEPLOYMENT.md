# YCD OIL ERP — Vercel Production Deployment

## الغرض

يمكن نشر النسخة النهائية تقنيًا قبل اكتمال الأصناف والخدمات والمخزون. يبقى الفرع في حالة `PREOPENING` وتظل الورديات والمبيعات التجارية محظورة لأن `ALLOW_PREOPENING_OPERATIONS=false`.

## متطلبات البيئة

اضبط القيم التالية في بيئة Production:

- `DATABASE_URL`: PostgreSQL مُدار ومخصص للإنتاج.
- `AUTH_SECRET`: قيمة عشوائية لا تقل عن 48 حرفًا.
- `ALLOW_PREOPENING_OPERATIONS=false`.
- `VAT_RATE=0.15`.
- `WASH_COUPON_VALIDITY_DAYS=30`.
- `NEXT_PUBLIC_APP_NAME=YCD OIL ERP`.
- `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` تستخدم فقط لتهيئة حساب الإدارة الأول ثم تزال كلمة المرور من إعدادات النشر بعد إنشاء الحسابات الفعلية.

## أمر البناء على Vercel

المستودع يثبت أمر البناء في `vercel.json` على:

```bash
npm run vercel-build
```

وهذا الأمر ينفذ `prisma generate` أولًا ثم `next build`. لا تُشغّل migrations من Build Command؛ ترحيل قاعدة الإنتاج يتم كخطوة نشر مستقلة عبر `npm run db:deploy`.

## قاعدة البيانات قبل أول نشر

نفذ على قاعدة الإنتاج:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run verify:production-env
```

لا تستخدم `prisma db push` في الإنتاج.

## ما يعمل قبل GO LIVE

- تسجيل الدخول والإدارة.
- المستخدمون والصلاحيات.
- الموارد البشرية والرواتب والإعدادات.
- الحسابات المالية والبنك ومعلومات IBAN.
- استيراد الأصناف والخدمات والجرد والموردين.
- التقارير والوثائق ومركز الجاهزية.
- تنفيذ UAT في بيئة اختبار منفصلة.

## ما يبقى مقفلاً

فتح وردية تشغيل تجارية حقيقية وما يتبعها من استقبال سيارة ومبيعات يظل مقفلاً أثناء `PREOPENING`. لا ترفع `ALLOW_PREOPENING_OPERATIONS` في Production.

بعد إدخال البيانات الفعلية واجتياز UAT، شغّل:

```bash
npm run verify:go-live
```

ثم يعتمد المدير المخول GO LIVE من شاشة الجاهزية. القرار يسجل في Audit Log.

## التحقق بعد النشر

1. افتح `/api/health` وتأكد من `status: ok`.
2. سجل الدخول بحساب الإدارة.
3. تحقق من شعار YCD OIL والهوية المعتمدة.
4. تحقق من مصرف الراجحي والحساب وIBAN في شاشة الجاهزية والمالية.
5. أنشئ حسابات الفريق بكلمات مرور مؤقتة وألزم تغييرها عند أول دخول.
6. أدخل الأصناف والخدمات والمخزون لاحقًا من مركز الاستيراد.
