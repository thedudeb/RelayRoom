import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileVideo,
  Gauge,
  KeyRound,
  Play,
  RefreshCcw,
  Route,
  ShieldCheck,
  Youtube
} from "lucide-react";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signIn } from "@/auth";

const heroRows = [
  {
    file: "Engineering Standup 2026-05-13.mp4",
    pipeline: "Engineering Meetings",
    status: "Uploaded",
    tone: "success"
  },
  {
    file: "Acme Roadmap Review.mp4",
    pipeline: "Client Calls",
    status: "Needs approval",
    tone: "approval"
  },
  {
    file: "Architecture Deep Dive.mov",
    pipeline: "Engineering Meetings",
    status: "Needs routing",
    tone: "routing"
  }
];

const workflow = [
  { label: "Watch Drive", detail: "Poll selected folders without touching the rest of Drive." },
  { label: "Evaluate rules", detail: "Run first-match-wins routing with a full trace." },
  { label: "Upload safely", detail: "Send videos to YouTube as unlisted by default." },
  { label: "Recover issues", detail: "Approve, retry, route, skip, or mark handled." }
];

const queueStates = [
  ["Needs approval", "1"],
  ["Needs routing", "1"],
  ["Failed", "1"],
  ["Uploaded", "1"]
];

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

function GoogleSignInButton({ className = "button" }: { className?: string }) {
  return (
    <form action={signInWithGoogle} className="auth-form">
      <button className={className} type="submit">
        <span className="google-mark" aria-hidden="true">G</span>
        Log in with Google
      </button>
    </form>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-scene" aria-hidden="true">
          <div className="scene-topline" />
          <div className="route-field">
            <span className="route-line route-line-one" />
            <span className="route-line route-line-two" />
            <span className="route-line route-line-three" />
          </div>
        </div>

        <header className="landing-nav">
          <Link className="landing-brand" href="/">
            <RelayRoomLogo />
          </Link>
          <nav aria-label="Landing navigation">
            <a href="/dashboard?demo=true">Demo</a>
            <Link href="/settings">API</Link>
            <ThemeToggle compact />
            <GoogleSignInButton />
          </nav>
        </header>

        <div className="landing-hero-grid">
          <div className="landing-copy">
            <p className="eyebrow">Drive recordings. YouTube playlists. One observable queue.</p>
            <h1>RelayRoom</h1>
            <p className="landing-lede">
              Turn a messy folder of meeting recordings into a trusted video library:
              visual routing rules, YouTube uploads, approval queues, retries, and
              every decision explained.
            </p>
            <div className="landing-actions">
              <a className="button primary landing-cta" href="/dashboard?demo=true">
                <Play aria-hidden="true" size={17} />
                Demo login
              </a>
              <GoogleSignInButton className="button landing-cta" />
            </div>
            <div className="landing-stats" aria-label="Reliability highlights">
              <span><strong>0</strong> silent drops</span>
              <span><strong>1h</strong> detection target</span>
              <span><strong>6</strong> queue states seeded</span>
            </div>
          </div>

          <div className="scene-dashboard hero-product-card" aria-hidden="true">
            <div className="scene-head">
              <RelayRoomLogo />
              <span>Operations queue</span>
            </div>
            <div className="scene-main">
              <div className="scene-metrics">
                {queueStates.map(([label, value]) => (
                  <div className="scene-metric" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="scene-table">
                {heroRows.map((row) => (
                  <div className="scene-row" key={row.file}>
                    <div>
                      <strong>{row.file}</strong>
                      <small>{row.pipeline}</small>
                    </div>
                    <span className="status-chip" data-tone={row.tone}>
                      <i />
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="scene-decision">
                <div>
                  <span>Rule matched</span>
                  <strong>Engineering Standup</strong>
                </div>
                <ArrowRight aria-hidden="true" size={16} />
                <div>
                  <span>Playlist</span>
                  <strong>Engineering Standups</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-workflow" aria-label="Workflow">
        {workflow.map((step, index) => (
          <article key={step.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{step.label}</h2>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="landing-proof" aria-label="Product highlights">
        <article>
          <Route aria-hidden="true" size={19} />
          <h2>Visual routing</h2>
          <p>AND/OR rule groups, playlist targets, template previews, and first-match-wins traces.</p>
        </article>
        <article>
          <CircleAlert aria-hidden="true" size={19} />
          <h2>Recoverable queue</h2>
          <p>Needs routing, needs approval, failed, skipped, uploaded, and externally handled states.</p>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" size={19} />
          <h2>OAuth-safe design</h2>
          <p>Separate Drive and YouTube grants, encrypted refresh tokens, and private user data.</p>
        </article>
        <article>
          <CheckCircle2 aria-hidden="true" size={19} />
          <h2>Duplicate control</h2>
          <p>Per-pipeline idempotency keeps repeat detections from creating repeat uploads.</p>
        </article>
      </section>

      <section className="landing-product">
        <div className="landing-section-copy">
          <p className="eyebrow">Designed for daily operations</p>
          <h2>Not just automation. An accountable queue.</h2>
          <p>
            Every file lands somewhere visible: uploaded, failed, waiting for approval,
            waiting for routing, skipped, or externally handled. Operators get the exact
            state and the next useful action.
          </p>
        </div>
        <div className="product-board">
          <div className="product-board-toolbar">
            <span>All</span>
            <span>Failed</span>
            <span>Needs routing</span>
          </div>
          {heroRows.map((row) => (
            <div className="product-board-row" key={row.file}>
              <FileVideo aria-hidden="true" size={18} />
              <div>
                <strong>{row.file}</strong>
                <small>{row.pipeline}</small>
              </div>
              <span data-tone={row.tone}>{row.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-rule-callout">
        <div className="rule-builder-card">
          <div className="rule-builder-line">
            <span>AND</span>
            <p>Filename contains “Engineering”</p>
          </div>
          <div className="rule-builder-line nested">
            <span>OR</span>
            <p>Filename contains “Standup”</p>
          </div>
          <div className="rule-builder-line nested">
            <span>OR</span>
            <p>Filename contains “Sync”</p>
          </div>
          <div className="rule-builder-action">
            <Youtube aria-hidden="true" size={18} />
            Route to Engineering Standups
          </div>
        </div>
        <div className="landing-section-copy">
          <p className="eyebrow">Rule builder first</p>
          <h2>Make routing understandable before uploads happen.</h2>
          <p>
            Build nested AND/OR conditions for filename, type, day, and time.
            Then preview the playlist, title, description, and evaluation trace
            before a recording moves.
          </p>
        </div>
      </section>

      <section className="landing-reliability" aria-label="Reliability features">
        <article>
          <RefreshCcw aria-hidden="true" size={19} />
          <h2>Retry with history</h2>
          <p>Transient failures can retry while permanent failures stay visible for operator action.</p>
        </article>
        <article>
          <Gauge aria-hidden="true" size={19} />
          <h2>Quota aware</h2>
          <p>YouTube quota exhaustion is classified clearly instead of becoming a generic upload error.</p>
        </article>
        <article>
          <KeyRound aria-hidden="true" size={19} />
          <h2>Token-safe</h2>
          <p>Separate OAuth grants, encrypted refresh tokens, and clear reconnection paths.</p>
        </article>
        <article>
          <Clock3 aria-hidden="true" size={19} />
          <h2>Cold-start safe</h2>
          <p>Existing folder contents are watermarked so old recordings do not suddenly upload.</p>
        </article>
      </section>

      <section className="landing-next">
        <div>
          <h2>Give reviewers the product, not a promise.</h2>
          <p>
            The demo queue is seeded with real operational states so the dashboard,
            filters, rule traces, and recovery actions can be inspected immediately.
          </p>
        </div>
        <Link className="button primary" href="/dashboard?demo=true">
          Open operations queue
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </main>
  );
}
