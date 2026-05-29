import Link from "next/link";
import type { Metadata } from "next";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";

// Static, public terms-of-service page. Like the privacy page, it satisfies the
// Google OAuth verification requirement for a reachable terms URL. Pure content.
export const metadata: Metadata = {
  title: "Terms of Service | RelayRoom",
  description: "Terms for using RelayRoom to route Drive recordings to YouTube."
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="landing-brand" href="/">
          <RelayRoomLogo />
        </Link>
        <Link className="button" href="/">
          Back to RelayRoom
        </Link>
      </header>

      <article className="legal-card">
        <p className="eyebrow">RelayRoom</p>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated May 18, 2026</p>

        <section>
          <h2>Use of RelayRoom</h2>
          <p>
            RelayRoom is an operations tool for detecting video files in selected
            Google Drive folders, routing them through workspace rules, and uploading
            approved recordings to connected YouTube accounts.
          </p>
        </section>

        <section>
          <h2>Operator responsibility</h2>
          <p>
            Operators are responsible for connecting the correct Google accounts,
            selecting the intended Drive folders and YouTube playlists, reviewing
            public upload settings, and confirming that uploaded content is allowed
            to be shared.
          </p>
        </section>

        <section>
          <h2>Workspace visibility</h2>
          <p>
            RelayRoom is designed for shared operations. Approved workspace users may
            see connections, pipelines, queue items, routing decisions, and activity
            history created by other approved users.
          </p>
        </section>

        <section>
          <h2>Google services</h2>
          <p>
            Use of RelayRoom with Google Drive and YouTube is also subject to
            Google&apos;s applicable terms and policies. You can revoke RelayRoom access
            from your Google Account at any time.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            RelayRoom may pause, fail, or require manual intervention when Google API
            quotas, OAuth grants, file permissions, or unsupported media formats
            prevent automated processing.
          </p>
        </section>

        <p className="legal-crosslink">
          See also: <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
