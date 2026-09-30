import type { NormalizedCapture, NormalizedRequest } from "../types.js";
import { headerMapFromPairs } from "./headers.js";
import { tryParseJsonBody } from "./body.js";

/**
 * Parser for the HAR (HTTP Archive) 1.2 format.
 *
 * HAR 1.2 is a documented JSON schema originally published by the HAR spec
 * (http://www.softwareishard.com/blog/har-12-spec/) and is what browser
 * DevTools "Save all as HAR" and mitmproxy's own HAR export addon produce.
 * The fields read below are the ones defined by that spec:
 *
 *   log.version               string
 *   log.creator               { name, version }
 *   log.entries[]             one HTTP transaction each
 *     .startedDateTime         ISO 8601 date string
 *     .time                    total time in ms
 *     .request.method
 *     .request.url
 *     .request.httpVersion
 *     .request.headers[]       { name, value }
 *     .request.queryString[]   { name, value }
 *     .request.postData        { mimeType, text, params? }  (optional)
 *     .response.status
 *     .response.statusText
 *     .response.httpVersion
 *     .response.headers[]      { name, value }
 *     .response.content        { size, mimeType, text?, encoding? }
 */

interface HarNameValue {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value?: string }>;
}

interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers?: HarNameValue[];
  queryString?: HarNameValue[];
  postData?: HarPostData;
}

interface HarContent {
  size?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
}

interface HarResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers?: HarNameValue[];
  content?: HarContent;
}

interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
}

interface HarLog {
  version?: string;
  creator?: { name: string; version: string };
  entries: HarEntry[];
}

interface HarFile {
  log: HarLog;
}

export class HarFormatError extends Error {}

/**
 * Structural check used by format auto-detection: does this parsed JSON
 * value look like a HAR document (has a log.entries array)?
 */
export function looksLikeHar(data: unknown): data is HarFile {
  if (!data || typeof data !== "object") return false;
  const log = (data as Record<string, unknown>)["log"];
  if (!log || typeof log !== "object") return false;
  const entries = (log as Record<string, unknown>)["entries"];
  return Array.isArray(entries);
}

/**
 * Per the HAR 1.2 spec, postData.text is optional: a client may instead
 * record a parsed representation of a url-encoded/multipart body as
 * postData.params[]. When text is absent but params are present, synthesize
 * an equivalent url-encoded raw body so form-submitted fields (e.g. login
 * credentials sent as application/x-www-form-urlencoded) still get diffed
 * instead of silently normalizing to "no request body".
 */
function requestBodyRawFromPostData(postData: HarPostData | undefined): string | undefined {
  if (!postData) return undefined;
  if (postData.text !== undefined) return postData.text;
  if (postData.params && postData.params.length > 0) {
    return postData.params
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value ?? "")}`)
      .join("&");
  }
  return undefined;
}

function decodeHarContentText(content: HarContent | undefined): string | undefined {
  if (!content || content.text === undefined) {
    return undefined;
  }
  if (content.encoding === "base64") {
    try {
      return Buffer.from(content.text, "base64").toString("utf-8");
    } catch {
      return content.text;
    }
  }
  return content.text;
}

export function parseHar(rawJson: unknown, sourceFile: string): NormalizedCapture {
  if (!looksLikeHar(rawJson)) {
    throw new HarFormatError(
      `${sourceFile} does not look like a HAR 1.2 document (missing log.entries array)`,
    );
  }
  const har = rawJson as HarFile;
  const entries = har.log.entries ?? [];

  const requests: NormalizedRequest[] = entries.map((entry, index) => {
    const req = entry.request;
    const res = entry.response;

    if (!req || typeof req.url !== "string") {
      throw new HarFormatError(
        `${sourceFile}: log.entries[${index}].request.url is required by the HAR 1.2 spec but was missing`,
      );
    }
    if (typeof req.method !== "string" || req.method.length === 0) {
      throw new HarFormatError(
        `${sourceFile}: log.entries[${index}].request.method is required by the HAR 1.2 spec but was missing`,
      );
    }

    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      throw new HarFormatError(
        `${sourceFile}: log.entries[${index}].request.url ("${req.url}") is not a valid absolute URL`,
      );
    }

    const requestHeaders = headerMapFromPairs(
      (req.headers ?? []).map((h) => [h.name, h.value] as [string, string]),
    );
    const responseHeaders = headerMapFromPairs(
      (res?.headers ?? []).map((h) => [h.name, h.value] as [string, string]),
    );

    const requestBodyRaw = requestBodyRawFromPostData(req.postData);
    const requestBodyMimeType = req.postData?.mimeType;
    const requestBodyJson = tryParseJsonBody(requestBodyRaw, requestBodyMimeType);

    const responseBodyRaw = decodeHarContentText(res?.content);
    const responseBodyMimeType = res?.content?.mimeType;
    const responseBodyJson = tryParseJsonBody(responseBodyRaw, responseBodyMimeType);

    const normalized: NormalizedRequest = {
      index,
      method: req.method.toUpperCase(),
      scheme: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      path: url.pathname || "/",
      query: url.search.replace(/^\?/, ""),
      displayUrl: req.url,
      requestHeaders,
      requestBodyRaw,
      requestBodyJson,
      requestBodyMimeType,
      status: res?.status,
      responseHeaders,
      responseBodyRaw,
      responseBodyJson,
      responseBodyMimeType,
      timestamp: entry.startedDateTime,
    };
    return normalized;
  });

  return {
    sourceFormat: "har",
    sourceFile,
    requests,
  };
}
