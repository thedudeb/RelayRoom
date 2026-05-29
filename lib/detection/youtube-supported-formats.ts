// Allowlist mirroring the video formats YouTube accepts for upload. A file is
// considered uploadable if EITHER its extension OR its MIME type matches, since
// Drive metadata is inconsistent — some files arrive with a generic/missing
// MIME type but a clear extension, and vice versa.

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  "3gp",
  "3gpp",
  "avi",
  "flv",
  "h265",
  "hevc",
  "m2v",
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpeg4",
  "mpegps",
  "mpg",
  "webm",
  "wmv"
]);

const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/3gpp",
  "video/3gpp2",
  "video/avi",
  "video/hevc",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-flv",
  "video/x-m4v",
  "video/x-ms-asf",
  "video/x-ms-wmv",
  "video/x-msvideo",
  "video/x-mpeg",
  "application/vnd.ms-asf"
]);

/** True when the file's extension or MIME type is on YouTube's upload allowlist. */
export function isYouTubeSupportedVideoFile({
  filename,
  mimeType
}: {
  filename?: string | null;
  mimeType?: string | null;
}) {
  const extension = getFileExtension(filename);
  const normalizedMimeType = mimeType?.toLowerCase();

  if (extension && SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
    return true;
  }

  if (normalizedMimeType && SUPPORTED_VIDEO_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  return false;
}

// Produces a human-readable reason a file was rejected, for surfacing in the
// queue's failure detail. Checks extension first, then MIME type, then a
// generic fallback when neither signal is present at all.
export function describeUnsupportedVideoFile({
  filename,
  mimeType
}: {
  filename?: string | null;
  mimeType?: string | null;
}) {
  const extension = getFileExtension(filename);
  const normalizedMimeType = mimeType?.toLowerCase();

  if (extension && !SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
    return `.${extension} is not in RelayRoom's YouTube upload allowlist.`;
  }

  if (normalizedMimeType && !SUPPORTED_VIDEO_MIME_TYPES.has(normalizedMimeType)) {
    return `${normalizedMimeType} is not a YouTube-supported video MIME type.`;
  }

  return "Missing a supported video extension or MIME type.";
}

/** Lowercased final extension of a filename, or undefined when there isn't one. */
export function getFileExtension(filename?: string | null) {
  if (!filename) {
    return undefined;
  }

  // Match the run of characters after the last dot, excluding path separators
  // so a dot in a directory name can't be mistaken for an extension.
  const match = /\.([^.\/\\]+)$/.exec(filename.trim());
  return match?.[1]?.toLowerCase();
}
