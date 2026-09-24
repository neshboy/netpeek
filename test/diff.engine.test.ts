import { describe, expect, it } from "vitest";
import { diffCaptures } from "../src/diff/engine.js";
import type { NormalizedCapture, NormalizedRequest } from "../src/types.js";

function req(overrides: Partial<NormalizedRequest> & { host: string; path: string }): NormalizedRequest {
  return {
    index: 0,
    method: "GET",
    scheme: "https",
    port: undefined,
    query: "",
    displayUrl: `https://${overrides.host}${overrides.path}`,
    requestHeaders: {},
    requestBodyRaw: undefined,
    requestBodyJson: undefined,
    requestBodyMimeType: undefined,
    status: 200,
    responseHeaders: {},
    responseBodyRaw: undefined,
    responseBodyJson: undefined,
    responseBodyMimeType: undefined,
    timestamp: undefined,
    ...overrides,
  };
}

function capture(sourceFile: string, requests: NormalizedRequest[]): NormalizedCapture {
  return { sourceFormat: "mitmproxy", sourceFile, requests: requests.map((r, index) => ({ ...r, index })) };
}

describe("diffCaptures", () => {
  it("classifies a host+endpoint only present in B as added, and the reverse as removed", () => {
    const a = capture("a.json", [
      req({ host: "kept.example.com", path: "/x" }),
      req({ host: "gone.example.com", path: "/y" }),
    ]);
    const b = capture("b.json", [
      req({ host: "kept.example.com", path: "/x" }),
      req({ host: "new.example.com", path: "/z" }),
    ]);

    const diff = diffCaptures(a, b);

    expect(diff.hosts.added).toEqual(["new.example.com"]);
    expect(diff.hosts.removed).toEqual(["gone.example.com"]);
    expect(diff.hosts.common).toEqual(["kept.example.com"]);

    expect(diff.endpoints.added).toHaveLength(1);
    expect(diff.endpoints.added[0]).toMatchObject({ host: "new.example.com", path: "/z" });

    expect(diff.endpoints.removed).toHaveLength(1);
    expect(diff.endpoints.removed[0]).toMatchObject({ host: "gone.example.com", path: "/y" });

    expect(diff.endpoints.unchanged).toHaveLength(1);
    expect(diff.endpoints.unchanged[0]).toMatchObject({ host: "kept.example.com", path: "/x" });
  });

  it("classifies a same endpoint with a materially different JSON request body as changed", () => {
    const a = capture("a.json", [
      req({
        host: "api.example.com",
        path: "/login",
        method: "POST",
        requestBodyRaw: '{"username":"bob","password":"pw"}',
        requestBodyJson: { username: "bob", password: "pw" },
      }),
    ]);
    const b = capture("b.json", [
      req({
        host: "api.example.com",
        path: "/login",
        method: "POST",
        requestBodyRaw: '{"username":"bob","password":"pw","device_id":"d1"}',
        requestBodyJson: { username: "bob", password: "pw", device_id: "d1" },
      }),
    ]);

    const diff = diffCaptures(a, b);

    expect(diff.endpoints.added).toHaveLength(0);
    expect(diff.endpoints.removed).toHaveLength(0);
    expect(diff.endpoints.unchanged).toHaveLength(0);
    expect(diff.endpoints.changed).toHaveLength(1);

    const change = diff.endpoints.changed[0]!;
    expect(change.requestBodyDiff).toEqual({
      kind: "json",
      entries: [{ path: "device_id", kind: "added", after: "d1" }],
    });
    expect(change.responseBodyDiff).toEqual({ kind: "identical" });
  });

  it("classifies a status-code-only difference as changed", () => {
    const a = capture("a.json", [req({ host: "api.example.com", path: "/status", status: 200 })]);
    const b = capture("b.json", [req({ host: "api.example.com", path: "/status", status: 503 })]);

    const diff = diffCaptures(a, b);
    expect(diff.endpoints.changed).toHaveLength(1);
    expect(diff.endpoints.changed[0]!.statusesBefore).toEqual([200]);
    expect(diff.endpoints.changed[0]!.statusesAfter).toEqual([503]);
  });

  it("classifies a meaningful header addition (not on the volatile list) as changed", () => {
    const a = capture("a.json", [req({ host: "api.example.com", path: "/x", responseHeaders: {} })]);
    const b = capture("b.json", [
      req({ host: "api.example.com", path: "/x", responseHeaders: { "x-tracking-id": ["abc"] } }),
    ]);

    const diff = diffCaptures(a, b);
    expect(diff.endpoints.changed).toHaveLength(1);
    expect(diff.endpoints.changed[0]!.responseHeaderChanges).toEqual([
      { name: "x-tracking-id", before: [], after: ["abc"] },
    ]);
  });

  it("ignores volatile-header-only differences and keeps the endpoint unchanged", () => {
    const a = capture("a.json", [
      req({ host: "api.example.com", path: "/x", responseHeaders: { date: ["Mon, 01 Jan 2026 00:00:00 GMT"] } }),
    ]);
    const b = capture("b.json", [
      req({ host: "api.example.com", path: "/x", responseHeaders: { date: ["Tue, 02 Jan 2026 00:00:00 GMT"] } }),
    ]);

    const diff = diffCaptures(a, b);
    expect(diff.endpoints.changed).toHaveLength(0);
    expect(diff.endpoints.unchanged).toHaveLength(1);
  });

  it("treats an identical endpoint contacted multiple times as unchanged and reports the request count", () => {
    const a = capture("a.json", [
      req({ host: "api.example.com", path: "/ping" }),
      req({ host: "api.example.com", path: "/ping" }),
    ]);
    const b = capture("b.json", [req({ host: "api.example.com", path: "/ping" })]);

    const diff = diffCaptures(a, b);
    expect(diff.endpoints.unchanged).toHaveLength(1);
    expect(diff.endpoints.unchanged[0]!.requestCount).toBe(1); // summarized from capture B
  });
});
