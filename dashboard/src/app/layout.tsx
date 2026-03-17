import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, Orbitron, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fontRoboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: "--font-roboto",
});

const fontOrbitron = Orbitron({
  subsets: ['latin'],
  variable: "--font-orbitron",
});

const fontInter = Inter({
  subsets: ['latin'],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Graviton Systems",
  description: "Web platforms, automation systems, and scalable infrastructure.",
};

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/providers/auth-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fontRoboto.variable} ${fontOrbitron.variable} ${fontInter.variable} font-inter antialiased bg-zinc-950 text-zinc-50`}
      >
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
