# نشر YCD OIL ERP على Render

هذا الدليل خاص ببيئة الإنتاج لتطبيق YCD OIL ERP.

## Web Service

- Source: GitHub repository `gm814/ycd-oil-erp`
- Runtime: Docker
- Dockerfile Path: `./Dockerfile`
- Health Check Path: `/api/health`
- التطبيق يستمع إلى متغير `PORT` الذي توفره Render، والقيمة الافتراضية داخل الصورة هي `10000`.
- لا تضف Docker Command مخصصًا؛ استخدم `CMD ["node", "server.js"]` الموجود في Dockerfile.

## قاعدة البيانات

استخدم PostgreSQL إنتاجية، ويفضل أن تكون خدمة الويب وقاعدة البيانات في نفس منطقة Render.

ضع رابط الاتصال الداخلي الآمن في:
`DATABASE_URL`

يجب عدم استخدام localhost أو قاعدة بيانات التطوير في الإنتاج.

## Environment Variables

أضف القيم التالية من صفحة Environment في Render:

- `DATABASE_URL`: رابط PostgreSQL الإنتاجي.
- `AUTH_SECRET`: قيمة عشوائية قوية لا تقل عن 48 حرفًا.
- `NEXT_PUBLIC_APP_NAME=YCD OIL ERP`
- `VAT_RATE=0.15`
- `WASH_COUPON_VALIDITY_DAYS=30`
- `ALLOW_PREOPENING_OPERATIONS=false`
- `ADMIN_USERNAME`: حساب التهيئة المؤقت عند الحاجة.
- `ADMIN_EMAIL`: بريد حساب التهيئة عند الحاجة.
- `ADMIN_PASSWORD`: كلمة قوية لا تقل عن 14 حرفًا عند استخدام حساب التهيئة.

لا تحفظ كلمات المرور أو الأسرار داخل GitHub.

## قاعدة البيانات قبل التشغيل

لا تستخدم `prisma db push` على قاعدة الإنتاج.

نفّذ migrations الإنتاجية باستخدام:
`npm run db:deploy`

ثم نفّذ Seed مرة واحدة فقط عند تهيئة قاعدة جديدة:
`npm run db:seed`

بعد التهيئة، شغّل:
`npm run verify:production-env`
`npm run verify:go-live`

## خطة Compute

512 MB قد تكفي لتجربة أولية محدودة، لكنها ليست الخطة المفضلة لنظام ERP إنتاجي يعمل بـ Next.js وPrisma. ابدأ بخطة 2 GB RAM عند التشغيل الفعلي، ثم راقب الذاكرة والاستجابة وعدّل الخطة بناءً على القياسات.

## التحقق بعد النشر

1. افتح `/api/health` وتأكد أن `status` تساوي `ok` وأن قاعدة البيانات `reachable`.
2. اختبر تسجيل الدخول والصلاحيات.
3. تحقق أن الفرع ما زال PREOPENING حتى اعتماد GO LIVE.
4. اختبر فاتورة تجريبية وإقفال وردية ومطابقة مالية في UAT قبل فتح العمليات التجارية.
