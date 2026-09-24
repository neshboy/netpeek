import { describe, expect, it } from "vitest";
import { diffBodies } from "../src/diff/bodyDiff.js";

describe("diffBodies (picks JSON structural diff, text diff, or byte summary)", () => {
  it("is identical when both bodies are absent", () => {
    expect(diffBodies({ raw: undefined, json: undefined }, { raw: undefined, json: undefined })).toEqual({
      kind: "identical",
    });
  });

  it("reports added when only the after side has a body", () => {
    const result = diffBodies({ raw: undefined, json: undefined }, { raw: '{"a":1}', json: { a: 1 } });
    expect(result).toEqual({ kind: "added", afterRaw: '{"a":1}' });
  });

  it("reports removed when only the before side has a body", () => {
    const result = diffBodies({ raw: '{"a":1}', json: { a: 1 } }, { raw: undefined, json: undefined });
    expect(result).toEqual({ kind: "removed", beforeRaw: '{"a":1}' });
  });

  it("uses structural JSON diff when both sides parse as JSON, even if formatting differs", () => {
    const before = { raw: '{"a":1,"b":2}', json: { a: 1, b: 2 } };
    const after = { raw: '{"b": 2, "a": 1}', json: { b: 2, a: 1 } };
    expect(diffBodies(before, after)).toEqual({ kind: "identical" });
  });

  it("reports a JSON diff entry for an added field", () => {
    const before = { raw: "", json: { a: 1 } };
    const after = { raw: "", json: { a: 1, deviceId: "xyz" } };
    const result = diffBodies(before, after);
    expect(result).toEqual({
      kind: "json",
      entries: [{ path: "deviceId", kind: "added", after: "xyz" }],
    });
  });

  it("falls back to a text diff for non-JSON bodies", () => {
    const result = diffBodies({ raw: "hello world", json: undefined }, { raw: "hello there", json: undefined });
    expect(result.kind).toBe("text");
  });

  it("treats identical non-JSON text as identical", () => {
    const result = diffBodies({ raw: "plain text", json: undefined }, { raw: "plain text", json: undefined });
    expect(result).toEqual({ kind: "identical" });
  });

  it("reports a byte-length summary for binary-looking content", () => {
    const beforeRaw = "\x00\x01binarydata";
    const afterRaw = "\x00\x01binarydatalonger";
    const result = diffBodies({ raw: beforeRaw, json: undefined }, { raw: afterRaw, json: undefined });
    expect(result).toEqual({
      kind: "binary-or-large",
      beforeBytes: Buffer.byteLength(beforeRaw, "utf-8"),
      afterBytes: Buffer.byteLength(afterRaw, "utf-8"),
    });
  });
});
