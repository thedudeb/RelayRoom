import Link from "next/link";
import type { Metadata } from "next";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";

export const metadata: Metadata = {
  title: "Privacy Policy | RelayRoom",
  description: "How RelayRoom handles Google Drive, YouTube, and account data."
};

export default function PrivacyPage() {
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
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated May 18, 2026</p>

        <section>
          <h2>What RelayRoom collects</h2>
          <p>
            RelayRoom stores the minimum account, Google Drive, YouTube, pipeline,
            routing, and queue data needed to detect recordings, route them to
            playlists, upload them, and show operational history.
          </p>
        </section>

        <section>
          <h2>Google account and OAuth data</h2>
          <p>
            RelayRoom uses Google OAuth to sign in approved operators and to connect
            Drive and YouTube accounts. Refresh tokens are encrypted before storage.
            Operators can disconnect Drive or YouTube grants from the Connections page.
          </p>
        </section>

        <section>
          <h2>Google Drive files</h2>
          <p>
            RelayRoom reads selected Drive folders to find supported video files and
            record detection metadata such as file name, MIME type, size, modified
            time, and Drive file ID. RelayRoom does not modify or delete Drive files.
          </p>
        </section>

        <section>
          <h2>YouTube uploads</h2>
          <p>
            RelayRoom uploads approved or automatically routed recordings to the
            connected YouTube account and may add uploaded videos to selected
            playlists. Upload privacy is controlled by the pipeline configuration.
          </p>
        </section>

        <section>
          <h2>Data sharing</h2>
          <p>
            RelayRoom does not sell personal data. Workspace operators can view
            shared operational data inside RelayRoom, including connections,
            pipelines, queue items, and activity history needed to operate the
            workspace.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For access or data questions, contact the RelayRoom workspace owner.
          </p>
        </section>
      </article>
    </main>
  );
}
