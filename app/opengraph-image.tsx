import { ImageResponse } from "next/og";

// Next.js file-based OG image. Generated at build time, served at /opengraph-image.
// 1200x630 is the canonical size honored by iMessage, Slack, Discord, Twitter,
// LinkedIn, and Facebook.
export const runtime = "edge";
export const alt = "RelayRoom — Route Drive recordings to YouTube playlists";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0b1220 0%, #111c34 45%, #1a2a4e 100%)",
          color: "#f5f7fb",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #4f8bff 0%, #8f6cff 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "44px",
              fontWeight: 800,
              color: "#0b1220"
            }}
          >
            R
          </div>
          <div
            style={{
              fontSize: "44px",
              fontWeight: 700,
              letterSpacing: "-0.02em"
            }}
          >
            RelayRoom
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "960px"
            }}
          >
            Drive recordings into YouTube playlists, on autopilot.
          </div>
          <div
            style={{
              fontSize: "30px",
              color: "#a8b5cf",
              maxWidth: "960px",
              lineHeight: 1.35
            }}
          >
            Visual AND/OR rule builder · push + polling detection · streaming uploads ·
            operations queue with full recovery
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            fontSize: "22px",
            color: "#cbd5ef"
          }}
        >
          <Pill>Multi-account OAuth</Pill>
          <Pill>Resumable uploads</Pill>
          <Pill>First-match routing</Pill>
          <Pill>Idempotent</Pill>
        </div>
      </div>
    ),
    { ...size }
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 20px",
        borderRadius: "999px",
        background: "rgba(148, 168, 220, 0.15)",
        border: "1px solid rgba(148, 168, 220, 0.35)"
      }}
    >
      {children}
    </div>
  );
}
