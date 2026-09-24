import { describe, expect, it } from "vitest";
import { parseHar, looksLikeHar, HarFormatError } from "../src/parsers/har.js";
import { readJsonFixture } from "./util.js";

describe("parseHar (HAR 1.2 spec: log.entries[].request / .response)", () => {
  it("decodes base64 response content and parses log.pages/log.entries[].pageref (both real HAR 1.2 fields)", async () => {
    const data = await readJsonFixture("har", "base64-and-pages.har.json");
    const capture = parseHar(data, "base64-and-pages.har.json");

    expect(capture.sourceFormat).toBe("har");
    expect(capture.requests).toHaveLength(2);

    const [dashboard, logo] = capture.requests;

    // request.url, request.method, request.headers[], request.queryString[]
    expect(dashboard!.method).toBe("GET");
    expect(dashboard!.host).toBe("app.example.com");
    expect(dashboard!.path).toBe("/dashboard");
    expect(dashboard!.query).toBe("tab=home");
    expect(dashboard!.requestHeaders["cookie"]).toEqual(["session_id=abc123"]);

    // response.content.encoding === "base64" must be decoded to real text
    expect(dashboard!.responseBodyRaw).toBe("hello world");
    expect(dashboard!.status).toBe(200);

    // response.content with no "text" field (0-byte body) must not throw and
    // must leave responseBodyRaw undefined rather than an empty string typo
    expect(logo!.status).toBe(304);
    expect(logo!.responseBodyRaw).toBeUndefined();
  });

  it("parses a JSON request/response body (request.postData.text / response.content.text)", async () => {
    const data = await readJsonFixture("har", "json-post.har.json");
    const capture = parseHar(data, "json-post.har.json");

    expect(capture.requests).toHaveLength(1);
    const entry = capture.requests[0]!;

    // HAR allows any-case HTTP methods; we normalize to uppercase
    expect(entry.method).toBe("POST");
    expect(entry.host).toBe("api.example.com");
    expect(entry.path).toBe("/v1/login");
    expect(entry.requestBodyMimeType).toBe("application/json");
    expect(entry.requestBodyJson).toEqual({ username: "alice", password: "secret" });
    expect(entry.responseBodyJson).toEqual({ token: "xyz", ok: true });
    expect(entry.requestHeaders["authorization"]).toEqual(["Bearer abc.def.ghi"]);
  });

  it("rejects a JSON document without log.entries (looksLikeHar + parseHar)", async () => {
    const data = await readJsonFixture("har", "invalid-not-har.json");
    expect(looksLikeHar(data)).toBe(false);
    expect(() => parseHar(data, "invalid-not-har.json")).toThrow(HarFormatError);
  });

  it("rejects an entry missing the required request.url field", async () => {
    const data = await readJsonFixture("har", "invalid-missing-url.har.json");
    expect(looksLikeHar(data)).toBe(true); // structurally still a HAR document
    expect(() => parseHar(data, "invalid-missing-url.har.json")).toThrow(HarFormatError);
  });

  describe("real captured HAR (see scripts/build-real-har-fixtures.mjs for provenance)", () => {
    it("parses genuine curl-captured traffic against httpbin.org and example.com", async () => {
      const data = await readJsonFixture("real-captured", "before.session.har.json");
      const capture = parseHar(data, "before.session.har.json");

      expect(capture.requests).toHaveLength(3);
      const hosts = capture.requests.map((r) => r.host);
      expect(hosts).toEqual(["httpbin.org", "example.com", "httpbin.org"]);

      const loginPost = capture.requests.find((r) => r.method === "POST");
      expect(loginPost?.requestBodyJson).toEqual({ username: "alice", password: "secret" });
      // real httpbin.org echo response - genuinely observed, not invented
      expect(loginPost?.responseBodyJson).toMatchObject({
        json: { username: "alice", password: "secret" },
        url: "https://httpbin.org/post",
      });
    });
  });
});
