import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

const DESCRIPTION =
  "Pick a side, name your odds, send the link. Faceoff matches two people directly on DreamDEX Event Contracts — no market maker, no liquidity required.";

export const metadata: Metadata = {
  // Resolved from the deployment URL so share cards work on every preview and
  // on the production domain without a hardcoded host.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"),
  ),
  title: "Faceoff — bet a friend in one link",
  description: DESCRIPTION,
  openGraph: {
    title: "Faceoff — bet a friend in one link",
    description: DESCRIPTION,
    siteName: "Faceoff",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Faceoff — bet a friend in one link",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
