import type { NormalizedCapture, NormalizedRequest, SourceFormat } from "../types.js";
import { diffBodies, type BodyDiffResult } from "./bodyDiff.js";
import { diffHeaders, type HeaderChange } from "./headerDiff.js";

export interface EndpointSummary {
  method: string;
  host: string;
  path: string;
  requestCount: number;
  sampleTimestamp: string | undefined;
}

export interface EndpointChange {
  method: string;
  host: string;
  path: string;
  requestBodyDiff: BodyDiffResult;
  responseBodyDiff: BodyDiffResult;
  requestHeaderChanges: HeaderChange[];
  responseHeaderChanges: HeaderChange[];
  statusesBefore: number[];
  statusesAfter: number[];
}

export interface CaptureInfo {
  sourceFile: string;
  sourceFormat: SourceFormat;
  requestCount: number;
}

export interface DiffResult {
  captureA: CaptureInfo;
  captureB: CaptureInfo;
  hosts: {
    added: string[];
    removed: string[];
    common: string[];
  };
  endpoints: {
    added: EndpointSummary[];
    removed: EndpointSummary[];
    changed: EndpointChange[];
    unchanged: EndpointSummary[];
  };
}

interface EndpointGroup {
  method: string;
  host: string;
  path: string;
  requests: NormalizedRequest[];
}

function endpointKey(r: NormalizedRequest): string {
  return `${r.method} ${r.host}${r.path}`;
}

function groupByEndpoint(requests: NormalizedRequest[]): Map<string, EndpointGroup> {
  const map = new Map<string, EndpointGroup>();
  for (const r of requests) {
    const key = endpointKey(r);
    const existing = map.get(key);
    if (existing) {
      existing.requests.push(r);
    } else {
      map.set(key, { method: r.method, host: r.host, path: r.path, requests: [r] });
    }
  }
  return map;
}

function summarize(group: EndpointGroup): EndpointSummary {
  return {
    method: group.method,
    host: group.host,
    path: group.path,
    requestCount: group.requests.length,
    sampleTimestamp: group.requests[0]?.timestamp,
  };
}

function uniqueSortedStatuses(group: EndpointGroup): number[] {
  const statuses = new Set<number>();
  for (const r of group.requests) {
    if (r.status !== undefined) statuses.add(r.status);
  }
  return [...statuses].sort((a, b) => a - b);
}

function statusesEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Diffs two normalized captures by (method, host, path):
 *   - endpoints only in B: "added" (newly-contacted destinations)
 *   - endpoints only in A: "removed" (no longer contacted)
 *   - endpoints in both: compared for materially different request/response
 *     bodies, headers (minus known-volatile ones), or response status codes
 *
 * For endpoints called more than once within a single capture, the *first*
 * observed request/response pair is used as the representative sample for
 * body/header/status comparison (documented limitation - see README).
 *
 * Host-level added/removed sets are also reported directly, since a whole
 * new domain being contacted is the single highest-signal privacy event
 * this tool can surface.
 */
export function diffCaptures(a: NormalizedCapture, b: NormalizedCapture): DiffResult {
  const hostsA = new Set(a.requests.map((r) => r.host));
  const hostsB = new Set(b.requests.map((r) => r.host));

  const hosts = {
    added: [...hostsB].filter((h) => !hostsA.has(h)).sort(),
    removed: [...hostsA].filter((h) => !hostsB.has(h)).sort(),
    common: [...hostsA].filter((h) => hostsB.has(h)).sort(),
  };

  const groupsA = groupByEndpoint(a.requests);
  const groupsB = groupByEndpoint(b.requests);
  const allKeys = new Set([...groupsA.keys(), ...groupsB.keys()]);

  const added: EndpointSummary[] = [];
  const removed: EndpointSummary[] = [];
  const changed: EndpointChange[] = [];
  const unchanged: EndpointSummary[] = [];

  for (const key of [...allKeys].sort()) {
    const groupA = groupsA.get(key);
    const groupB = groupsB.get(key);

    if (groupA && !groupB) {
      removed.push(summarize(groupA));
      continue;
    }
    if (groupB && !groupA) {
      added.push(summarize(groupB));
      continue;
    }
    if (!groupA || !groupB) continue; // unreachable, satisfies TS narrowing

    const reprA = groupA.requests[0]!;
    const reprB = groupB.requests[0]!;

    const requestBodyDiff = diffBodies(
      { raw: reprA.requestBodyRaw, json: reprA.requestBodyJson },
      { raw: reprB.requestBodyRaw, json: reprB.requestBodyJson },
    );
    const responseBodyDiff = diffBodies(
      { raw: reprA.responseBodyRaw, json: reprA.responseBodyJson },
      { raw: reprB.responseBodyRaw, json: reprB.responseBodyJson },
    );
    const requestHeaderChanges = diffHeaders(reprA.requestHeaders, reprB.requestHeaders);
    const responseHeaderChanges = diffHeaders(reprA.responseHeaders, reprB.responseHeaders);
    const statusesBefore = uniqueSortedStatuses(groupA);
    const statusesAfter = uniqueSortedStatuses(groupB);

    const isChanged =
      requestBodyDiff.kind !== "identical" ||
      responseBodyDiff.kind !== "identical" ||
      requestHeaderChanges.length > 0 ||
      responseHeaderChanges.length > 0 ||
      !statusesEqual(statusesBefore, statusesAfter);

    if (isChanged) {
      changed.push({
        method: groupA.method,
        host: groupA.host,
        path: groupA.path,
        requestBodyDiff,
        responseBodyDiff,
        requestHeaderChanges,
        responseHeaderChanges,
        statusesBefore,
        statusesAfter,
      });
    } else {
      unchanged.push(summarize(groupB));
    }
  }

  return {
    captureA: { sourceFile: a.sourceFile, sourceFormat: a.sourceFormat, requestCount: a.requests.length },
    captureB: { sourceFile: b.sourceFile, sourceFormat: b.sourceFormat, requestCount: b.requests.length },
    hosts,
    endpoints: { added, removed, changed, unchanged },
  };
}
