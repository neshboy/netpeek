import type { JsonValue } from "../types.js";

export interface JsonDiffEntry {
  /** JSONPath-ish pointer, e.g. "$", "user.email", "items[2].name". */
  path: string;
  kind: "added" | "removed" | "changed";
  before?: JsonValue;
  after?: JsonValue;
}

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepEqualJson(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqualJson(v, b[i] as JsonValue));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => k in b && deepEqualJson(a[k] as JsonValue, b[k] as JsonValue));
  }
  return a === b;
}

/**
 * Structural diff between two JSON values. Produces one entry per
 * added/removed/changed leaf or key, addressed by a simple path string.
 * This is a real recursive structural diff (not a placeholder): objects are
 * diffed key-by-key (union of keys from both sides), arrays are diffed
 * index-by-index (including length changes as trailing added/removed
 * entries), and everything else falls back to value equality.
 */
export function diffJsonValues(
  a: JsonValue | undefined,
  b: JsonValue | undefined,
  path = "$",
): JsonDiffEntry[] {
  if (a === undefined && b === undefined) return [];
  if (a === undefined) return [{ path, kind: "added", after: b }];
  if (b === undefined) return [{ path, kind: "removed", before: a }];

  if (isPlainObject(a) && isPlainObject(b)) {
    const entries: JsonDiffEntry[] = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      const childPath = path === "$" ? key : `${path}.${key}`;
      entries.push(...diffJsonValues(a[key], b[key], childPath));
    }
    return entries;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const entries: JsonDiffEntry[] = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      entries.push(...diffJsonValues(a[i], b[i], `${path}[${i}]`));
    }
    return entries;
  }

  // Type mismatch (e.g. object vs array, or object vs primitive) or a leaf
  // comparison (both primitives): this is the only place deepEqualJson runs
  // now, so an equal subtree gets exactly one pass (via the recursion above)
  // instead of one whole-subtree pass here plus a second one per-key/per-index.
  if (deepEqualJson(a, b)) return [];
  return [{ path, kind: "changed", before: a, after: b }];
}
