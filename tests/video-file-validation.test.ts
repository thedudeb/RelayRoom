import { describe, expect, it } from "vitest";
import { getVideoContentValidationError } from "@/lib/upload/video-file-validation";

describe("video file content validation", () => {
  it("accepts a complete MP4-style container", () => {
    expect(
      getVideoContentValidationError({
        bytes: buildIsoFile(["ftyp", "moov", "mdat"]),
        filename: "standup.mp4",
        mimeType: "video/mp4"
      })
    ).toBeNull();
  });

  it("rejects an incomplete MP4-style container", () => {
    expect(
      getVideoContentValidationError({
        bytes: buildIsoFile(["ftyp", "mdat"]),
        filename: "corrupt.mp4",
        mimeType: "video/mp4"
      })
    ).toContain("incomplete");
  });

  it("rejects a JPEG renamed to WebM", () => {
    expect(
      getVideoContentValidationError({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
          .buffer.slice(0),
        filename: "fake-image.webm",
        mimeType: "video/webm"
      })
    ).toContain("JPEG");
  });

  it("accepts a WebM container signature", () => {
    expect(
      getVideoContentValidationError({
        bytes: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04])
          .buffer,
        filename: "recording.webm",
        mimeType: "video/webm"
      })
    ).toBeNull();
  });
});

function buildIsoFile(boxTypes: string[]) {
  const buffer = Buffer.concat(boxTypes.map(buildBox));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function buildBox(type: string) {
  const payload = Buffer.from([0, 0, 0, 0]);
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.byteLength, 0);
  box.write(type, 4, 4, "ascii");
  payload.copy(box, 8);
  return box;
}
