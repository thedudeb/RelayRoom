import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ToastProvider } from "@/components/toast/ToastContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-loaded",
  display: "swap",
  axes: ["opsz", "SOFT"]
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap"
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://relay-room-one.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "RelayRoom",
  description:
    "Route Google Drive recordings to YouTube playlists with a visual rule builder and observable operations queue.",
  applicationName: "RelayRoom",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: {
    type: "website",
    siteName: "RelayRoom",
    title: "RelayRoom — Drive recordings into YouTube playlists, on autopilot",
    description:
      "Visual AND/OR rule builder, push-notification + polling detection, streaming uploads, and an operations queue with full recovery flows.",
    url: siteUrl,
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "RelayRoom — Drive recordings into YouTube playlists, on autopilot",
    description:
      "Visual rule builder, reliable detection, streaming uploads, and an operations queue with full recovery flows."
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var storedTheme = localStorage.getItem('theme');
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              var theme = storedTheme || (prefersDark ? 'dark' : 'light');
              document.documentElement.dataset.theme = theme;
              document.documentElement.dataset.privacy =
                localStorage.getItem('privacyMode') === 'on' ? 'on' : 'off';
            } catch (error) {}
          `}
        </Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
