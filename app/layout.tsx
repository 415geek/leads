import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Restaurant Leads Finder",
  description: "自动发现湾区新开张餐厅，生成与管理销售线索",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50">
        <header className="bg-[#1e3a5f] text-white py-4 px-6 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold">
              <span className="text-[#f59e0b]">Restaurant</span>
              <span> Leads Finder</span>
            </h1>
            <nav className="flex gap-4">
              <a href="/" className="hover:text-[#f59e0b] transition-colors">
                Dashboard
              </a>
              <a href="/leads" className="hover:text-[#f59e0b] transition-colors">
                Leads
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto w-full py-6 px-4">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
