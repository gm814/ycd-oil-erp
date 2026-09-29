import type { Metadata, Viewport } from "next";
import "./globals.css";
import { InstallApp } from "@/components/install-app";

export const metadata: Metadata = {
  title: "YCD OIL ERP",
  appleWebApp: { capable: true, title: "YCD OIL", statusBarStyle: "default" },
  icons: { apple: "/brand/app-icon-192.png" },
  description: "نظام إدارة وتشغيل شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}<InstallApp /></body>
    </html>
  );
}
