/**
 * Shared internal data model that both parsers (HAR, mitmproxy flow-dump)
 * normalize into, and that the diff engine operates on.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SourceFormat = "har" | "mitmproxy";

/**
 * Headers are modeled as a lowercase-header-name -> list-of-values map,
 * because HTTP allows repeated headers (e.g. multiple Set-Cookie lines)
 * and header names are case-insensitive per RFC 7230 section 3.2.
 */
export type HeaderMap = Record<string, string[]>;

export interface NormalizedRequest {
  /** Position of this request within its source capture (0-based, in file order). */
  index: number;
  method: string;
  scheme: string;
  host: string;
  port: number | undefined;
  /** URL path only, no query string, e.g. "/api/v1/login". */
  path: string;
  /** Raw query string with no leading "?", e.g. "id=1&ref=app". */
  query: string;
  /** Best-effort human-readable absolute URL used only for display. */
  displayUrl: string;
  requestHeaders: HeaderMap;
  requestBodyRaw: string | undefined;
  requestBodyJson: JsonValue | undefined;
  requestBodyMimeType: string | undefined;
  status: number | undefined;
  responseHeaders: HeaderMap;
  responseBodyRaw: string | undefined;
  responseBodyJson: JsonValue | undefined;
  responseBodyMimeType: string | undefined;
  /** ISO-8601 timestamp when available. */
  timestamp: string | undefined;
}

export interface NormalizedCapture {
  sourceFormat: SourceFormat;
  sourceFile: string;
  requests: NormalizedRequest[];
}
