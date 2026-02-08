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
  title: "Sessiz Ortak â€” Sen çalis, biz yanindayiz.",
  description:
    "Body doubling platformu. Kamera yok, mikrofon yok, sadece sessiz eslik. Odaklanmak için birlikte ol.",
  keywords: ["body doubling", "odaklanma", "çalisma ortagi", "pomodoro", "sessiz çalisma"],
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

