import type { Metadata } from "next";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/500.css";
import "@fontsource/spectral/600.css";
import "@fontsource/spectral/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Scavenger Hunt",
    template: "%s",
  },
  applicationName: "Scavenger Hunt",
  description: "A cinematic, location-driven scavenger hunt experience.",
  openGraph: {
    title: "Scavenger Hunt",
    description: "A cinematic, location-driven scavenger hunt experience.",
  },
  twitter: {
    title: "Scavenger Hunt",
    description: "A cinematic, location-driven scavenger hunt experience.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
