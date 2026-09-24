import type { JsonValue } from "../types.js";
import { diffJsonValues, type JsonDiffEntry } from "./jsonDiff.js";
import { diffLines, type TextDiffLine } from "./textDiff.js";

export interface BodyInput {
  raw: string | undefined;
  json: JsonValue | undefined;
}

export type BodyDiffResult =
  | { kind: "identical" }
  | { kind: "added"; afterRaw: string }
  | { kind: "removed"; beforeRaw: string }
  | { kind: "json"; entries: JsonDiffEntry[] }
  | { kind: "text"; lines: TextDiffLine[] }
  | { kind: "binary-or-large"; beforeBytes: number; afterBytes: number };

// Control characters (excluding tab/newline/carriage-return) are a strong
// signal the body is not human-readable text, e.g. protobuf/gzip/image data.
const BINARY_SIGNATURE = /[\x00-\x08\x0E-\x1F]/;

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

/**
 * Diffs a single endpoint's request or response body between two captures.
 * Strategy: structural JSON diff when both sides parse as JSON, otherwise a
 * real line-based text diff, otherwise (binary-looking or too large for the
 * line-diff DP table) a byte-length summary.
 */
export function diffBodies(before: BodyInput, after: BodyInput): BodyDiffResult {
  if (before.raw === undefined && after.raw === undefined) {
    return { kind: "identical" };
  }
  if (before.raw === undefined) {
    return { kind: "added", afterRaw: after.raw! };
  }
  if (after.raw === undefined) {
    return { kind: "removed", beforeRaw: before.raw };
  }

  if (before.json !== undefined && after.json !== undefined) {
    const entries = diffJsonValues(before.json, after.json);
    return entries.length === 0 ? { kind: "identical" } : { kind: "json", entries };
  }

  if (before.raw === after.raw) {
    return { kind: "identical" };
  }

  if (BINARY_SIGNATURE.test(before.raw) || BINARY_SIGNATURE.test(after.raw)) {
    return {
      kind: "binary-or-large",
      beforeBytes: byteLength(before.raw),
      afterBytes: byteLength(after.raw),
    };
  }

  const diffed = diffLines(before.raw, after.raw);
  if (!diffed) {
    return {
      kind: "binary-or-large",
      beforeBytes: byteLength(before.raw),
      afterBytes: byteLength(after.raw),
    };
  }
  return { kind: "text", lines: diffed.lines };
}
