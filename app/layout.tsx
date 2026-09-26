import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YCD OIL ERP",
  description: "نظام إدارة وتشغيل شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
