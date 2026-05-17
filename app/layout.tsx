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

export const metadata: Metadata = {
  title: "RelayRoom",
  description: "Route Drive recordings to YouTube playlists with observable operations.",
  icons: {
    icon: "/icon.svg"
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
