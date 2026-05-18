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

export function getFileExtension(filename?: string | null) {
  if (!filename) {
    return undefined;
  }

  const match = /\.([^.\/\\]+)$/.exec(filename.trim());
  return match?.[1]?.toLowerCase();
}
