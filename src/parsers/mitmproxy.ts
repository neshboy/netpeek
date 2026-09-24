import type { NormalizedCapture, NormalizedRequest } from "../types.js";
import { normalizeHeadersFlexible } from "./headers.js";
import { tryParseJsonBody } from "./body.js";
import { getHeaderFirstValue } from "./headers.js";

/**
 * Parser for mitmproxy flow-dump JSON.
 *
 * Unlike HAR, mitmproxy does not ship one official "flow JSON" spec - its
 * native on-disk format is a binary flow file read by `mitmproxy -r` / the
 * mitmweb UI. To get JSON out of a capture, the standard, documented way is
 * a small mitmproxy addon script that walks `flow.request` / `flow.response`
 * (see mitmproxy's own scripting docs: https://docs.mitmproxy.org/stable/addons-scripting/)
 * and serializes the fields you care about. This parser targets exactly the
 * shape produced by the addon script shipped in examples/mitmproxy_dump_addon.py
 * and documented in the README, which mirrors mitmproxy's real, stable
 * `HTTPRequest` / `HTTPResponse` attribute names:
 *
 *   flow.request.method        string
 *   flow.request.scheme        "http" | "https"
 *   flow.request.host          string
 *   flow.request.port          number
 *   flow.request.path          string, includes the query string
 *   flow.request.http_version  string
 *   flow.request.headers       dict(flow.request.headers) -> object, or list of [name, value] pairs
 *   flow.request.content       flow.request.get_text() -> string | null
 *   flow.response.status_code  number
 *   flow.response.headers      same shape as request headers
 *   flow.response.content      flow.response.get_text() -> string | null
 *   timestamp_start / timestamp_end   epoch seconds (float), optional
 *
 * We deliberately accept headers as either a plain object or an array of
 * [name, value] pairs since both show up in real-world addon scripts
 * depending on whether the author called dict(...) or list(...).
 */

interface MitmRequestJson {
  method?: string;
  scheme?: string;
  host?: string;
  port?: number;
  path?: string;
  http_version?: string;
  headers?: unknown;
  content?: string | null;
}

interface MitmResponseJson {
  status_code?: number;
  http_version?: string;
  headers?: unknown;
  content?: string | null;
}

interface MitmFlowJson {
  request: MitmRequestJson;
  response?: MitmResponseJson | null;
  timestamp_start?: number;
  timestamp_end?: number;
}

export class MitmproxyFormatError extends Error {}

/**
 * Structural check used by format auto-detection: does this parsed JSON
 * value look like a mitmproxy flow-dump array (a list of flow-like objects
 * with a request.method / request.host)?
 */
export function looksLikeMitmFlows(data: unknown): data is MitmFlowJson[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // empty capture, ambiguous but plausible
  const first = data[0];
  if (!first || typeof first !== "object") return false;
  const request = (first as Record<string, unknown>)["request"];
  if (!request || typeof request !== "object") return false;
  const req = request as Record<string, unknown>;
  return typeof req["method"] === "string" && ("host" in req || "path" in req);
}

function epochSecondsToIso(seconds: number | undefined): string | undefined {
  if (seconds === undefined || Number.isNaN(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

export function parseMitmFlows(rawJson: unknown, sourceFile: string): NormalizedCapture {
  if (!looksLikeMitmFlows(rawJson)) {
    throw new MitmproxyFormatError(
      `${sourceFile} does not look like a mitmproxy flow-dump JSON array (expected a list of { request: { method, host, path, ... } })`,
    );
  }
  const flows = rawJson as MitmFlowJson[];

  const requests: NormalizedRequest[] = flows.map((flow, index) => {
    const req = flow.request;
    if (!req || typeof req.method !== "string") {
      throw new MitmproxyFormatError(
        `${sourceFile}: flows[${index}].request.method is required but was missing`,
      );
    }
    if (typeof req.host !== "string" || req.host.length === 0) {
      throw new MitmproxyFormatError(
        `${sourceFile}: flows[${index}].request.host is required but was missing`,
      );
    }

    const rawPath = req.path ?? "/";
    const questionMarkIndex = rawPath.indexOf("?");
    const path = questionMarkIndex === -1 ? rawPath || "/" : rawPath.slice(0, questionMarkIndex) || "/";
    const query = questionMarkIndex === -1 ? "" : rawPath.slice(questionMarkIndex + 1);

    const scheme = req.scheme ?? "http";
    const port = req.port;
    const portSuffix =
      port !== undefined && !((scheme === "https" && port === 443) || (scheme === "http" && port === 80))
        ? `:${port}`
        : "";
    const displayUrl = `${scheme}://${req.host}${portSuffix}${rawPath}`;

    const requestHeaders = normalizeHeadersFlexible(req.headers);
    const responseHeaders = normalizeHeadersFlexible(flow.response?.headers);

    const requestBodyRaw = req.content ?? undefined;
    const requestBodyMimeType = getHeaderFirstValue(requestHeaders, "content-type");
    const requestBodyJson = tryParseJsonBody(requestBodyRaw, requestBodyMimeType);

    const responseBodyRaw = flow.response?.content ?? undefined;
    const responseBodyMimeType = getHeaderFirstValue(responseHeaders, "content-type");
    const responseBodyJson = tryParseJsonBody(responseBodyRaw, responseBodyMimeType);

    const normalized: NormalizedRequest = {
      index,
      method: req.method.toUpperCase(),
      scheme,
      host: req.host,
      port,
      path,
      query,
      displayUrl,
      requestHeaders,
      requestBodyRaw,
      requestBodyJson,
      requestBodyMimeType,
      status: flow.response?.status_code,
      responseHeaders,
      responseBodyRaw,
      responseBodyJson,
      responseBodyMimeType,
      timestamp: epochSecondsToIso(flow.timestamp_start),
    };
    return normalized;
  });

  return {
    sourceFormat: "mitmproxy",
    sourceFile,
    requests,
  };
}
