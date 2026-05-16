const isoBaseMediaExtensions = new Set(["3gp", "3gpp", "h265", "hevc", "m4v", "mov", "mp4", "mpeg4"]);

export function getVideoContentValidationError({
  bytes,
  filename,
  mimeType
}: {
  bytes: ArrayBuffer;
  filename: string;
  mimeType: string;
}) {
  const buffer = Buffer.from(bytes);
  const extension = getFileExtension(filename);
  const normalizedMimeType = mimeType.toLowerCase();

  const disguisedFileType = detectKnownNonVideoFileType(buffer);
  if (disguisedFileType) {
    return `The Drive file looks like ${disguisedFileType}, not a supported video file.`;
  }

  if (buffer.byteLength < 16) {
    return "The Drive file is too small to be a valid video upload.";
  }

  if (extension === "webm" || normalizedMimeType === "video/webm") {
    return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])
      ? null
      : "The Drive file has a WebM name or MIME type, but its content is not a valid WebM container.";
  }

  if (extension && isoBaseMediaExtensions.has(extension)) {
    return isCompleteIsoBaseMediaFile(buffer)
      ? null
      : "The Drive file appears to be incomplete or is not a valid MP4/MOV-style container.";
  }

  if (extension === "avi" || normalizedMimeType === "video/x-msvideo") {
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 11) === "AVI"
      ? null
      : "The Drive file has an AVI name or MIME type, but its content is not a valid AVI container.";
  }

  if (extension === "flv" || normalizedMimeType === "video/x-flv") {
    return buffer.toString("ascii", 0, 3) === "FLV"
      ? null
      : "The Drive file has an FLV name or MIME type, but its content is not a valid FLV container.";
  }

  if (extension === "wmv" || normalizedMimeType === "video/x-ms-wmv") {
    return startsWithBytes(buffer, [
      0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce,
      0x6c
    ])
      ? null
      : "The Drive file has a WMV name or MIME type, but its content is not a valid ASF/WMV container.";
  }

  if (extension === "mpeg" || extension === "mpg" || normalizedMimeType === "video/mpeg") {
    return startsWithBytes(buffer, [0x00, 0x00, 0x01])
      ? null
      : "The Drive file has an MPEG name or MIME type, but its content is not a valid MPEG stream.";
  }

  return null;
}

function detectKnownNonVideoFileType(buffer: Buffer) {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return "a JPEG image";
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47])) return "a PNG image";
  if (startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38])) return "a GIF image";
  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46])) return "a PDF document";
  if (buffer.toString("ascii", 0, 3) === "ID3") return "an MP3 audio file";
  return undefined;
}

function isCompleteIsoBaseMediaFile(buffer: Buffer) {
  const boxes = new Set<string>();
  let offset = 0;

  while (offset + 8 <= buffer.byteLength) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > buffer.byteLength) return false;
      const largeSize = buffer.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(largeSize);
      headerSize = 16;
    }

    if (size === 0) {
      size = buffer.byteLength - offset;
    }

    if (size < headerSize || offset + size > buffer.byteLength) {
      return false;
    }

    boxes.add(type);
    offset += size;
  }

  return boxes.has("ftyp") && boxes.has("moov") && boxes.has("mdat");
}

function getFileExtension(filename: string) {
  return /\.([^.\/\\]+)$/.exec(filename.trim())?.[1]?.toLowerCase();
}

function startsWithBytes(buffer: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => buffer[index] === byte);
}
