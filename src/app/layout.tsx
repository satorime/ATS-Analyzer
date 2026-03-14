import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ATS Resume Analyzer — Optimize Your Resume",
  description:
    "Analyze your resume against any job description and get an instant ATS compatibility score, matched keywords, and actionable improvement suggestions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${roboto.className} antialiased bg-[#FFFBFE] text-[#1C1B1F]`}>
        {children}
      </body>
    </html>
  );
}
