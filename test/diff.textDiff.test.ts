import { describe, expect, it } from "vitest";
import { diffLines } from "../src/diff/textDiff.js";

describe("diffLines (LCS-based line diff)", () => {
  it("produces only context lines for identical text", () => {
    const result = diffLines("a\nb\nc", "a\nb\nc");
    expect(result?.lines.every((l) => l.type === "context")).toBe(true);
  });

  it("detects a single changed line as remove+add", () => {
    const result = diffLines("one\ntwo\nthree", "one\nTWO\nthree");
    expect(result?.lines).toEqual([
      { type: "context", text: "one" },
      { type: "removed", text: "two" },
      { type: "added", text: "TWO" },
      { type: "context", text: "three" },
    ]);
  });

  it("detects a purely appended line", () => {
    const result = diffLines("a\nb", "a\nb\nc");
    expect(result?.lines).toEqual([
      { type: "context", text: "a" },
      { type: "context", text: "b" },
      { type: "added", text: "c" },
    ]);
  });

  it("bails out to null for pathologically large inputs", () => {
    const big = Array.from({ length: 600 }, (_, i) => `line-${i}`).join("\n");
    const bigChanged = Array.from({ length: 600 }, (_, i) => `line-${i}-x`).join("\n");
    expect(diffLines(big, bigChanged)).toBeNull();
  });
});
