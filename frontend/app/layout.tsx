import type { Metadata } from "next";
import "./globals.css";
import { ThemeController } from "@/components/theme/ThemeController";

export const metadata: Metadata = {
  title: "BorderLens — Intelligent Border Video Analytics",
  description: "Next-generation stark tactical surveillance command terminal and human accountability guard duty system for border security.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#EBF3FA] text-[#0F172A] min-h-screen antialiased selection:bg-[#0284C7] selection:text-white font-sans">
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
