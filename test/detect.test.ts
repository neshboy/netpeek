import { describe, expect, it } from "vitest";
import { detectFormat, loadCapture, UnrecognizedCaptureFormatError } from "../src/parsers/detect.js";
import { fixturePath, readJsonFixture } from "./util.js";

describe("detectFormat / loadCapture (auto-detect HAR vs mitmproxy from file content)", () => {
  it("detects a HAR document", async () => {
    const data = await readJsonFixture("har", "json-post.har.json");
    expect(detectFormat(data)).toBe("har");
  });

  it("detects a mitmproxy flow array", async () => {
    const data = await readJsonFixture("mitm", "dict-headers.json");
    expect(detectFormat(data)).toBe("mitmproxy");
  });

  it("throws on unrecognized shapes", () => {
    expect(() => detectFormat({ nothing: "here" })).toThrow(UnrecognizedCaptureFormatError);
    expect(() => detectFormat("just a string")).toThrow(UnrecognizedCaptureFormatError);
  });

  it("loadCapture reads a HAR file from disk end-to-end", async () => {
    const capture = await loadCapture(fixturePath("har", "json-post.har.json"));
    expect(capture.sourceFormat).toBe("har");
    expect(capture.requests).toHaveLength(1);
  });

  it("loadCapture reads a mitmproxy flow file from disk end-to-end", async () => {
    const capture = await loadCapture(fixturePath("mitm", "dict-headers.json"));
    expect(capture.sourceFormat).toBe("mitmproxy");
    expect(capture.requests).toHaveLength(2);
  });

  it("loadCapture rejects a file that is not valid JSON at all", async () => {
    await expect(loadCapture(fixturePath("not-json.txt"))).rejects.toThrow();
  });
});
