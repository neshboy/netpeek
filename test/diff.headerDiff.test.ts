import { describe, expect, it } from "vitest";
import { diffHeaders } from "../src/diff/headerDiff.js";

describe("diffHeaders", () => {
  it("ignores known-volatile headers like date/etag/x-request-id", () => {
    const before = { date: ["Mon, 01 Jan 2026 00:00:00 GMT"], etag: ['"v1"'] };
    const after = { date: ["Tue, 02 Jan 2026 00:00:00 GMT"], etag: ['"v2"'] };
    expect(diffHeaders(before, after)).toEqual([]);
  });

  it("reports a changed header value", () => {
    const before = { authorization: ["Bearer old"] };
    const after = { authorization: ["Bearer new"] };
    expect(diffHeaders(before, after)).toEqual([
      { name: "authorization", before: ["Bearer old"], after: ["Bearer new"] },
    ]);
  });

  it("reports a newly added header", () => {
    const before = {};
    const after = { "x-tracking-id": ["abc123"] };
    expect(diffHeaders(before, after)).toEqual([
      { name: "x-tracking-id", before: [], after: ["abc123"] },
    ]);
  });

  it("reports a removed header", () => {
    const before = { "x-legacy": ["1"] };
    const after = {};
    expect(diffHeaders(before, after)).toEqual([{ name: "x-legacy", before: ["1"], after: [] }]);
  });
});
