# YCD OIL ERP - Deployment Runbook

## الهدف

هذا الملف يصف نشر النسخة الإنتاجية بعد اكتمال بيانات ما قبل التشغيل ونجاح UAT واعتماد GO LIVE.

## 1. قاعدة البيانات

استخدم PostgreSQL مُدارًا ببيئة إنتاج منفصلة عن UAT. قبل أي نشر أو migration خذ نسخة احتياطية قابلة للاستعادة.

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "ycd-oil-$(date +%Y%m%d-%H%M).dump"
```

اختبر الاستعادة على قاعدة منفصلة قبل الاعتماد.

## 2. متغيرات البيئة

المطلوب كحد أدنى:

- `DATABASE_URL`
- `AUTH_SECRET` بطول 48 حرفًا على الأقل
- `ALLOW_PREOPENING_OPERATIONS=false`
- `VAT_RATE=0.15`
- `WASH_COUPON_VALIDITY_DAYS=30`

حساب مدير النظام الأولي اختياري عبر `ADMIN_EMAIL` و`ADMIN_USERNAME` و`ADMIN_PASSWORD`. بعد تهيئة الحسابات الفعلية لا تحفظ كلمة مرور إدارية داخل ملفات النشر.

تحقق من البيئة:

```bash
npm run verify:production-env
```

## 3. ترحيل قاعدة البيانات

نفذ migrations قبل تشغيل نسخة التطبيق الجديدة:

```bash
npm ci
npm run db:generate
npm run db:deploy
```

لا تستخدم `prisma db push` على الإنتاج.

## 4. بوابة GO LIVE

على قاعدة بيئة الإطلاق وبعد تحميل البيانات الفعلية:

```bash
npm run verify:go-live
```

الفحص يرفض الإطلاق إذا كانت بيانات HR أو حسابات الفريق أو الأصناف أو الخدمات أو المخزون أو الموردون أو UAT أو سجل ما قبل التشغيل غير مكتملة.

## 5. بناء الحاوية

```bash
docker build -t ycd-oil-erp:release .
```

تشغيل مثال:

```bash
docker run --rm -p 3000:3000 \
  --env-file .env.production \
  ycd-oil-erp:release
```

الحاوية تعمل كمستخدم غير root وتحتوي Health Check على `/api/health`.

## 6. ما بعد النشر

- تحقق من HTTPS وترويسات الأمان.
- تحقق من `/api/health`.
- نفذ دخولًا بحساب المدير العام وحساب تشغيلي محدود الصلاحية.
- تأكد أن `ALLOW_PREOPENING_OPERATIONS=false`.
- اطبع محضر الجاهزية من `/dashboard/readiness/launch-report`.
- لا تحول الفرع إلى LIVE إلا بعد اعتماد الإدارة ونجاح UAT الكامل.
- راقب النسخ الاحتياطية وسجل التدقيق والإقفالات المالية والمطابقات البنكية بعد بدء التشغيل.

## 7. الرجوع عند فشل النشر

لا تعكس migration إنتاجية بحذف البيانات. أوقف الإصدار الجديد، أعد تشغيل آخر صورة تطبيق سليمة، وقيّم توافق قاعدة البيانات. إذا تطلب الأمر استعادة قاعدة البيانات، استخدم نسخة احتياطية مختبرة وعلى إجراء إداري معتمد.
