import { describe, expect, it } from "vitest";
import {
  getFileExtension,
  isYouTubeSupportedVideoFile
} from "@/lib/detection/youtube-supported-formats";

describe("YouTube-supported file detection", () => {
  it("accepts common YouTube upload formats by extension", () => {
    expect(isYouTubeSupportedVideoFile({ filename: "standup.MP4", mimeType: "application/octet-stream" })).toBe(true);
    expect(isYouTubeSupportedVideoFile({ filename: "client-call.mov", mimeType: undefined })).toBe(true);
    expect(isYouTubeSupportedVideoFile({ filename: "roadmap.mpeg", mimeType: undefined })).toBe(true);
    expect(isYouTubeSupportedVideoFile({ filename: "browser-capture.webm", mimeType: undefined })).toBe(true);
  });

  it("accepts supported Drive video MIME types even when the extension is missing", () => {
    expect(isYouTubeSupportedVideoFile({ filename: "Untitled", mimeType: "video/quicktime" })).toBe(true);
    expect(isYouTubeSupportedVideoFile({ filename: "Untitled", mimeType: "video/x-msvideo" })).toBe(true);
  });

  it("rejects images, documents, audio, and unknown files", () => {
    expect(isYouTubeSupportedVideoFile({ filename: "thumbnail.jpg", mimeType: "image/jpeg" })).toBe(false);
    expect(isYouTubeSupportedVideoFile({ filename: "notes.pdf", mimeType: "application/pdf" })).toBe(false);
    expect(isYouTubeSupportedVideoFile({ filename: "audio.mp3", mimeType: "audio/mpeg" })).toBe(false);
    expect(isYouTubeSupportedVideoFile({ filename: "mystery.bin", mimeType: "application/octet-stream" })).toBe(false);
  });

  it("extracts normalized filename extensions", () => {
    expect(getFileExtension("Final Cut.MOV")).toBe("mov");
    expect(getFileExtension("no-extension")).toBeUndefined();
  });
});
