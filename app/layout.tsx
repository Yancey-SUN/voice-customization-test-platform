import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "声音定制测试平台",
  description: "和 Omi 聊聊，用喜欢的声音陪伴你。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
