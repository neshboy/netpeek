import type { HeaderMap } from "../types.js";

/**
 * Builds a HeaderMap (lowercase name -> values[]) from a flat list of
 * [name, value] pairs, preserving repeated headers (e.g. Set-Cookie).
 */
export function headerMapFromPairs(pairs: Array<[string, string]>): HeaderMap {
  const map: HeaderMap = {};
  for (const [rawName, value] of pairs) {
    const name = rawName.toLowerCase();
    const existing = map[name];
    if (existing) {
      existing.push(value);
    } else {
      map[name] = [value];
    }
  }
  return map;
}

/**
 * Accepts the several shapes header collections show up in across HAR and
 * mitmproxy-derived JSON:
 *   - HAR-style array of { name, value }
 *   - a plain object of name -> string (common dict(flow.request.headers) dumps)
 *   - a plain object of name -> string[] (in case duplicates were preserved)
 *   - an array of [name, value] tuples
 */
export function normalizeHeadersFlexible(input: unknown): HeaderMap {
  if (input == null) {
    return {};
  }

  if (Array.isArray(input)) {
    const pairs: Array<[string, string]> = [];
    for (const item of input) {
      if (Array.isArray(item) && item.length >= 2) {
        pairs.push([String(item[0]), String(item[1])]);
      } else if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        "value" in item
      ) {
        const rec = item as Record<string, unknown>;
        pairs.push([String(rec["name"]), String(rec["value"])]);
      }
    }
    return headerMapFromPairs(pairs);
  }

  if (typeof input === "object") {
    const pairs: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          pairs.push([name, String(v)]);
        }
      } else {
        pairs.push([name, String(value)]);
      }
    }
    return headerMapFromPairs(pairs);
  }

  return {};
}

export function getHeaderFirstValue(headers: HeaderMap, name: string): string | undefined {
  return headers[name.toLowerCase()]?.[0];
}
