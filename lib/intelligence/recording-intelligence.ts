import type { QueueItem, RecordingIntelligence } from "@/lib/domain/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "call",
  "calls",
  "for",
  "meeting",
  "meetings",
  "of",
  "recording",
  "sync",
  "the",
  "to",
  "with"
]);

const KNOWN_TOPICS = [
  "acme",
  "architecture",
  "budget",
  "client",
  "contract",
  "demo",
  "engineering",
  "indexing",
  "roadmap",
  "search",
  "standup",
  "vendor"
];

export function generateRecordingIntelligence(item: QueueItem): RecordingIntelligence {
  const cleanTitle = titleCase(filenameWithoutExtension(item.filename));
  const keywords = keywordsFromFilename(item.filename);
  const inferredTopics = inferTopics(item, keywords);
  const routingRecommendation = routingRecommendationForItem(item, inferredTopics);
  const confidence = confidenceForItem(item, inferredTopics);
  const reviewFlags = reviewFlagsForItem(item);

  return {
    confidence,
    suggestedTitle: filenameWithoutExtension(item.renderedTitle || cleanTitle),
    suggestedDescription: suggestedDescriptionForItem(item, inferredTopics),
    summary: summaryForItem(item, inferredTopics),
    tags: Array.from(new Set([...inferredTopics, item.pipelineName, item.sourceFolderName]))
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
      .slice(0, 7),
    chapters: chaptersForItem(item, inferredTopics),
    routingRecommendation,
    reviewFlags
  };
}

function summaryForItem(item: QueueItem, topics: string[]) {
  if (!isVideoItem(item)) {
    return "This watched-folder item is not a supported video, so RelayRoom should keep it out of the publishing path.";
  }

  const topicCopy = topics.length
    ? topics.slice(0, 3).join(", ")
    : "the detected recording";
  const routeCopy = item.intendedPlaylistName
    ? ` It is ready for the ${item.intendedPlaylistName} playlist.`
    : " It needs a playlist decision before it can be published.";

  return `Likely covers ${topicCopy}.${routeCopy}`;
}

function suggestedDescriptionForItem(item: QueueItem, topics: string[]) {
  if (item.renderedDescription) {
    return item.renderedDescription;
  }

  const date = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(item.driveCreatedTime));
  const topicLine = topics.length ? `Topics: ${topics.slice(0, 5).join(", ")}.` : "";

  return [`Recorded ${date}.`, topicLine, `Source: ${item.sourceFolderName}.`]
    .filter(Boolean)
    .join(" ");
}

function chaptersForItem(item: QueueItem, topics: string[]) {
  if (!isVideoItem(item)) {
    return [{ start: "00:00", title: "Unsupported file reviewed" }];
  }

  const primary = topics[0] || "Recording overview";
  const secondary = topics[1] || item.pipelineName;

  return [
    { start: "00:00", title: `${titleCase(primary)} overview` },
    { start: "03:00", title: `${titleCase(secondary)} discussion` },
    { start: "12:00", title: "Decisions and follow-ups" }
  ];
}

function routingRecommendationForItem(item: QueueItem, topics: string[]) {
  if (item.intendedPlaylistName) {
    return {
      playlistName: item.intendedPlaylistName,
      reason: item.matchedRuleName
        ? `Matched by ${item.matchedRuleName}.`
        : "Already selected on the queue item."
    };
  }

  const topic = topics[0];
  if (!topic) {
    return undefined;
  }

  return {
    playlistName: `${titleCase(topic)} Recordings`,
    reason: `Inferred from the filename and source folder.`
  };
}

function reviewFlagsForItem(item: QueueItem) {
  const flags: string[] = [];

  if (!isVideoItem(item)) {
    flags.push("Unsupported file type");
  }

  if (!item.intendedPlaylistName) {
    flags.push("Needs playlist decision");
  }

  if (item.failureReason) {
    flags.push(`Failure: ${item.failureReason.replaceAll("_", " ")}`);
  }

  if (item.status === "needs_approval") {
    flags.push("Awaiting operator approval");
  }

  return flags;
}

function confidenceForItem(item: QueueItem, topics: string[]): RecordingIntelligence["confidence"] {
  if (!isVideoItem(item) || item.failureReason) {
    return "low";
  }

  if (item.matchedRuleName && item.intendedPlaylistName) {
    return "high";
  }

  return topics.length >= 2 ? "medium" : "low";
}

function inferTopics(item: QueueItem, keywords: string[]) {
  const haystack = `${item.filename} ${item.pipelineName} ${item.sourceFolderName} ${item.matchedRuleName || ""}`.toLowerCase();
  const known = KNOWN_TOPICS.filter((topic) => haystack.includes(topic));

  return Array.from(new Set([...known, ...keywords])).slice(0, 6);
}

function keywordsFromFilename(filename: string) {
  return filenameWithoutExtension(filename)
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2)
    .filter((part) => !STOP_WORDS.has(part))
    .filter((part) => !/^\d+$/.test(part))
    .slice(0, 6);
}

function filenameWithoutExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim();
}

function isVideoItem(item: QueueItem) {
  return item.mimeType.startsWith("video/");
}

function normalizeTag(tag: string) {
  return titleCase(tag.replaceAll("/", " ").replace(/\s+/g, " ").trim());
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
