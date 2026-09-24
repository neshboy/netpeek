import { readFile } from "node:fs/promises";
import type { NormalizedCapture, SourceFormat } from "../types.js";
import { looksLikeHar, parseHar } from "./har.js";
import { looksLikeMitmFlows, parseMitmFlows } from "./mitmproxy.js";

export class UnrecognizedCaptureFormatError extends Error {}

/**
 * Inspects already-parsed JSON and decides whether it is HAR or mitmproxy
 * flow-dump shaped. Throws if neither shape matches.
 */
export function detectFormat(data: unknown): SourceFormat {
  if (looksLikeHar(data)) {
    return "har";
  }
  if (looksLikeMitmFlows(data)) {
    return "mitmproxy";
  }
  throw new UnrecognizedCaptureFormatError(
    "Unrecognized capture format: expected a HAR 1.2 document ({ log: { entries: [...] } }) " +
      "or a mitmproxy flow-dump JSON array ([{ request: { method, host, path, ... } }, ...]).",
  );
}

/**
 * Reads a capture file from disk, auto-detects whether its contents are HAR
 * or mitmproxy flow-dump JSON, and returns the normalized internal model.
 */
export async function loadCapture(filePath: string): Promise<NormalizedCapture> {
  const raw = await readFile(filePath, "utf-8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UnrecognizedCaptureFormatError(`${filePath} is not valid JSON: ${reason}`);
  }

  const format = detectFormat(data);
  if (format === "har") {
    return parseHar(data, filePath);
  }
  return parseMitmFlows(data, filePath);
}
