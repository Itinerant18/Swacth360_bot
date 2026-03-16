import type { Metadata, Viewport } from "next";
import "./globals.css";

// Analytics: Netlify has built-in analytics — no client script needed.
// Remove @vercel/analytics (Vercel-specific). Use Netlify Analytics in dashboard.

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Dexter Tech Support AI",
  description: "AI-powered HMS panel technical support — by SEPLe",
  openGraph: {
    title: "Dexter Tech Support AI",
    description: "AI-powered HMS panel technical support",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased desk-texture" suppressHydrationWarning>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
