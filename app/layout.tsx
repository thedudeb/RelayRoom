import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
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
        {children}
      </body>
    </html>
  );
}
