// Online-first operations: never cache credentials, API responses, or authenticated pages.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YCD OIL — لا يوجد اتصال</title><body style="font-family:Arial;text-align:center;padding:60px 24px;background:#f4f4f4;color:#222"><h1 style="color:#ec8a17">YCD OIL</h1><h2>لا يوجد اتصال بالإنترنت</h2><p>اتصل بالشبكة ثم أعد فتح التطبيق للوصول إلى بياناتك.</p><a href="/">إعادة المحاولة</a></body></html>',
    {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}}
  )));
});
