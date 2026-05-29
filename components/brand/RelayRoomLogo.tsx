// Brand lockup: the three-node "source → route → play" mark plus the wordmark.
// `compact` hides the wordmark, leaving just the mark for tight spaces (e.g. the
// landing nav). Styling lives in globals.css.
export function RelayRoomLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup" aria-label="RelayRoom">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-node brand-node-source" />
        <span className="brand-node brand-node-route" />
        <span className="brand-node brand-node-play" />
      </span>
      {compact ? null : <strong>RelayRoom</strong>}
    </span>
  );
}
