import type { Metadata } from "next";
import "./globals.css";
import { ThemeController } from "@/components/theme/ThemeController";

export const metadata: Metadata = {
  title: "Sentrix — AI GIS Intelligence for Safer Communities",
  description: "Sentrix AI GIS intelligence for safer communities, with explainable risk, impact and response decision support.",
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
