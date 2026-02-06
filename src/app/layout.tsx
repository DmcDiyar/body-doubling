import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Sessiz Ortak — Sen çalış, biz yanındayız.",
  description:
    "Body doubling platformu. Kamera yok, mikrofon yok, sadece sessiz eşlik. Odaklanmak için birlikte ol.",
  keywords: ["body doubling", "odaklanma", "çalışma ortağı", "pomodoro", "sessiz çalışma"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-brand-dark text-white`}
      >
        {children}
      </body>
    </html>
  );
}
