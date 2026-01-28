import type { Metadata } from "next";
import { Source_Sans_3, Spectral } from "next/font/google";
import "./globals.css";

const spectral = Spectral({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Proposal Scavenger Hunt",
  description: "A cinematic, location-driven scavenger hunt experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spectral.variable} ${sourceSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
