import type { HeaderMap } from "../types.js";
import { VOLATILE_HEADER_NAMES } from "./volatileHeaders.js";

export interface HeaderChange {
  name: string;
  before: string[];
  after: string[];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Diffs two header maps, ignoring known-volatile headers (see
 * volatileHeaders.ts) so the report highlights meaningful differences
 * (a new tracking header, a changed auth scheme, an added cookie) rather
 * than noise like Date or per-request trace IDs.
 */
export function diffHeaders(before: HeaderMap, after: HeaderMap): HeaderChange[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: HeaderChange[] = [];
  for (const name of [...names].sort()) {
    if (VOLATILE_HEADER_NAMES.has(name)) continue;
    const beforeValues = before[name] ?? [];
    const afterValues = after[name] ?? [];
    if (!arraysEqual(beforeValues, afterValues)) {
      changes.push({ name, before: beforeValues, after: afterValues });
    }
  }
  return changes;
}
