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
import { AccessModal } from "@/components/auth/AccessModal";
import { RelayRoomLogo } from "@/components/brand/RelayRoomLogo";
import { RoutingDemo } from "@/components/landing/RoutingDemo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signIn } from "@/auth";

// Public marketing landing page (the app's "/" route). Mostly static JSX; the
// dynamic parts are the Google sign-in server action and an optional auth-error
// modal driven by the ?error query param.

// Sample data for the static hero/product mockups — illustrative only, not real
// queue rows.
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

// Server action for the "Log in with Google" button. `prompt: select_account`
// forces Google's account chooser so a user signed into multiple accounts can
// pick the approved one rather than being silently logged in with the wrong one.
async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" }, { prompt: "select_account" });
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

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  // Auth redirects land back here with an ?error code; translate the two we
  // expect into a modal explaining what happened and what to do next.
  const showAccessDenied = params?.error === "AccessDenied";
  const showSignInRequired = params?.error === "SignInRequired";
  const authDialog = showAccessDenied
    ? {
        eyebrow: "Access restricted",
        title: "This Google account is not on the RelayRoom allowlist.",
        body:
          "Ask the Owner of your organization to add your email to the approved user list, or use the approved Google account for this workspace."
      }
    : showSignInRequired
      ? {
          eyebrow: "Sign in required",
          title: "Please log in before opening RelayRoom.",
          body:
            "The app pages are private. Use an approved Google account, or use demo login to explore with seeded sample data."
        }
      : null;

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
            <Link href="/privacy">Legal</Link>
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

          <RoutingDemo />
        </div>
      </section>

      {authDialog ? (
        <AccessModal eyebrow={authDialog.eyebrow} title={authDialog.title} body={authDialog.body} />
      ) : null}

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
