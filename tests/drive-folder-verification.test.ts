import { describe, expect, it } from "vitest";
import { isValidDriveFolderId } from "@/lib/oauth/drive-folder-verification";

describe("Drive folder validation", () => {
  it("accepts normal Google Drive folder ids", () => {
    expect(isValidDriveFolderId("1Ch8I_Mpyx7wsxAmgcAQLVPCMvvuVzaGX")).toBe(true);
  });

  it("rejects folder ids with query or path syntax", () => {
    expect(isValidDriveFolderId("https://drive.google.com/drive/folders/abc123")).toBe(false);
    expect(isValidDriveFolderId("abc123?usp=sharing")).toBe(false);
    expect(isValidDriveFolderId("abc123/child")).toBe(false);
  });
});
