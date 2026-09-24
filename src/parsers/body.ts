import type { JsonValue } from "../types.js";

/**
 * Tries to interpret a raw body string as JSON. We attempt this whenever the
 * declared mime type mentions "json" OR the text looks like it starts with a
 * JSON value, since apps do not always set Content-Type correctly. Returns
 * undefined (not an error) when the body isn't valid JSON - callers fall
 * back to raw-text/byte diffing in that case.
 */
export function tryParseJsonBody(
  text: string | undefined,
  mimeType: string | undefined,
): JsonValue | undefined {
  if (text === undefined) {
    return undefined;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const looksJsonByMime = mimeType?.toLowerCase().includes("json") ?? false;
  const looksJsonByShape = trimmed[0] === "{" || trimmed[0] === "[";
  if (!looksJsonByMime && !looksJsonByShape) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return undefined;
  }
}
