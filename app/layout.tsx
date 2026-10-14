import type { Metadata, Viewport } from "next";
import "./globals.css";
import { InstallApp } from "@/components/install-app";

export const metadata: Metadata = {
  title: "YCD OIL ERP",
  appleWebApp: { capable: true, title: "YCD OIL", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/brand/ycd-icon-v2-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/ycd-icon-v2-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/brand/ycd-icon-v2-180.png", sizes: "180x180", type: "image/png" },
    shortcut: "/brand/ycd-icon-v2-32.png",
  },
  description: "نظام إدارة وتشغيل شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}{process.env.YCD_OFFLINE_PILOT === "true" && <a className="offlinePilotLink" href="/offline.html">تجهيز العمل دون اتصال — نسخة اختبار</a>}<InstallApp /></body>
    </html>
  );
}
