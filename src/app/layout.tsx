import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Sessiz Ortak - Sen calis, biz yanindayiz.",
  description:
    "Body doubling platformu. Kamera yok, mikrofon yok, sadece sessiz eslik. Odaklanmak icin birlikte ol.",
  keywords: ["body doubling", "odaklanma", "calisma ortagi", "pomodoro", "sessiz calisma"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${inter.variable} font-sans antialiased bg-brand-dark text-white`}
      >
        {children}
      </body>
    </html>
  );
}
