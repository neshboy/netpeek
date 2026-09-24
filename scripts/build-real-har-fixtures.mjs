// Regenerates test/fixtures/real-captured/*.har.json from data that was
// genuinely captured with `curl -v` against live public endpoints while
// building NetPeek (2026-09-24, from this repo's dev machine). This script
// is not part of the published package or the test run - it exists purely
// as a provenance record so anyone can see exactly how the "real capture"
// fixtures were assembled (as opposed to invented from scratch), and can
// re-run the same curl commands themselves to reproduce fresh values.
//
// The exact commands run were:
//   curl -v "https://httpbin.org/get?probe=netpeek" -H "User-Agent: netpeek-fixture-capture/1.0"
//   curl -v "https://example.com/"
//   curl -v "https://httpbin.org/post" -H "Content-Type: application/json" \
//        -H "User-Agent: netpeek-fixture-capture/1.0" -d '{"username":"alice","password":"secret"}'
//   curl -v "https://httpbin.org/post" -H "Content-Type: application/json" \
//        -H "User-Agent: netpeek-fixture-capture/1.0" \
//        -d '{"username":"alice","password":"secret","device_id":"abc123"}'
//   curl -v "https://httpbin.org/headers" -H "User-Agent: netpeek-fixture-capture/1.0"
//
// Response headers, status lines, and response bodies below are copied
// verbatim from those real responses. This models an app whose "before"
// traffic talks to example.com and posts a login payload, and whose
// "after" traffic drops example.com, adds a new /headers call, and starts
// sending an extra device_id field on login - exactly the kind of privacy
// drift NetPeek's diff engine is meant to surface.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "test", "fixtures", "real-captured");

const CAPTURED_USER_AGENT = "netpeek-fixture-capture/1.0";

function harEntry({
  startedDateTime,
  time,
  method,
  url,
  requestHeaders,
  postDataText,
  postDataMimeType,
  status,
  statusText,
  responseHeaders,
  responseMimeType,
  responseText,
}) {
  const u = new URL(url);
  const queryString = [...u.searchParams.entries()].map(([name, value]) => ({ name, value }));

  const request = {
    method,
    url,
    httpVersion: "HTTP/1.1",
    cookies: [],
    headers: requestHeaders.map(([name, value]) => ({ name, value })),
    queryString,
    headersSize: -1,
    bodySize: postDataText ? Buffer.byteLength(postDataText, "utf-8") : 0,
  };
  if (postDataText !== undefined) {
    request.postData = { mimeType: postDataMimeType, text: postDataText };
  }

  return {
    startedDateTime,
    time,
    request,
    response: {
      status,
      statusText,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: responseHeaders.map(([name, value]) => ({ name, value })),
      content: {
        size: Buffer.byteLength(responseText, "utf-8"),
        mimeType: responseMimeType,
        text: responseText,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: Buffer.byteLength(responseText, "utf-8"),
    },
    cache: {},
    timings: { send: 0, wait: time, receive: 0 },
  };
}

function harLog(entries) {
  return {
    log: {
      version: "1.2",
      creator: { name: "netpeek-fixture-capture", version: "1.0" },
      entries,
    },
  };
}

const getProbeBody = `{
  "args": {
    "probe": "netpeek"
  },
  "headers": {
    "Accept": "*/*",
    "Host": "httpbin.org",
    "User-Agent": "netpeek-fixture-capture/1.0",
    "X-Amzn-Trace-Id": "Root=1-6ab4f841-61688bb62407005676751ce3"
  },
  "origin": "211.25.18.5",
  "url": "https://httpbin.org/get?probe=netpeek"
}
`;

const examplePage =
  '<!doctype html><html lang="en"><head><title>Example Domain</title><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee;width:60vw;margin:15vh auto;font-family:system-ui,sans-serif}h1{font-size:1.5em}div{opacity:0.8}a:link,a:visited{color:#348}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.</p><p><a href="https://www.iana.org/domains/reserved">More information...</a></p></div></body></html>';

const postABody = `{
  "args": {},
  "data": "{\\"username\\":\\"alice\\",\\"password\\":\\"secret\\"}",
  "files": {},
  "form": {},
  "headers": {
    "Accept": "*/*",
    "Content-Length": "40",
    "Content-Type": "application/json",
    "Host": "httpbin.org",
    "User-Agent": "netpeek-fixture-capture/1.0",
    "X-Amzn-Trace-Id": "Root=1-6ab4f85a-2025f6f30f2232576755a10b"
  },
  "json": {
    "password": "secret",
    "username": "alice"
  },
  "origin": "211.25.18.5",
  "url": "https://httpbin.org/post"
}
`;

const postBBody = `{
  "args": {},
  "data": "{\\"username\\":\\"alice\\",\\"password\\":\\"secret\\",\\"device_id\\":\\"abc123\\"}",
  "files": {},
  "form": {},
  "headers": {
    "Accept": "*/*",
    "Content-Length": "61",
    "Content-Type": "application/json",
    "Host": "httpbin.org",
    "User-Agent": "netpeek-fixture-capture/1.0",
    "X-Amzn-Trace-Id": "Root=1-6ab4f864-7cad5e394ccaf05b20188f35"
  },
  "json": {
    "device_id": "abc123",
    "password": "secret",
    "username": "alice"
  },
  "origin": "211.25.18.5",
  "url": "https://httpbin.org/post"
}
`;

const headersBody = `{
  "headers": {
    "Accept": "*/*",
    "Host": "httpbin.org",
    "User-Agent": "netpeek-fixture-capture/1.0",
    "X-Amzn-Trace-Id": "Root=1-6ab4f866-3603926a098e0f762090f125"
  }
}
`;

const httpbinResponseHeaders = [
  ["Content-Type", "application/json"],
  ["Connection", "keep-alive"],
  ["Server", "gunicorn/19.9.0"],
  ["Access-Control-Allow-Origin", "*"],
  ["Access-Control-Allow-Credentials", "true"],
];

const before = harLog([
  harEntry({
    startedDateTime: "2026-09-24T10:15:29.000Z",
    time: 210,
    method: "GET",
    url: "https://httpbin.org/get?probe=netpeek",
    requestHeaders: [
      ["Host", "httpbin.org"],
      ["Accept", "*/*"],
      ["User-Agent", CAPTURED_USER_AGENT],
    ],
    status: 200,
    statusText: "OK",
    responseHeaders: [["Date", "Thu, 24 Sep 2026 10:15:29 GMT"], ...httpbinResponseHeaders],
    responseMimeType: "application/json",
    responseText: getProbeBody,
  }),
  harEntry({
    startedDateTime: "2026-09-24T10:15:51.000Z",
    time: 340,
    method: "GET",
    url: "https://example.com/",
    requestHeaders: [
      ["Host", "example.com"],
      ["User-Agent", "curl/8.21.0"],
      ["Accept", "*/*"],
    ],
    status: 200,
    statusText: "OK",
    responseHeaders: [
      ["Date", "Thu, 24 Sep 2026 10:15:51 GMT"],
      ["Content-Type", "text/html"],
      ["Connection", "keep-alive"],
      ["Server", "cloudflare"],
      ["last-modified", "Tue, 22 Sep 2026 21:15:25 GMT"],
      ["allow", "GET, HEAD"],
      ["Accept-Ranges", "bytes"],
      ["Age", "3783"],
      ["cf-cache-status", "HIT"],
      ["CF-RAY", "a40107c52aa413dc-KUL"],
    ],
    responseMimeType: "text/html",
    responseText: examplePage,
  }),
  harEntry({
    startedDateTime: "2026-09-24T10:15:54.000Z",
    time: 260,
    method: "POST",
    url: "https://httpbin.org/post",
    requestHeaders: [
      ["Host", "httpbin.org"],
      ["Accept", "*/*"],
      ["Content-Type", "application/json"],
      ["User-Agent", CAPTURED_USER_AGENT],
      ["Content-Length", "40"],
    ],
    postDataText: '{"username":"alice","password":"secret"}',
    postDataMimeType: "application/json",
    status: 200,
    statusText: "OK",
    responseHeaders: [["Date", "Thu, 24 Sep 2026 10:15:54 GMT"], ...httpbinResponseHeaders],
    responseMimeType: "application/json",
    responseText: postABody,
  }),
]);

const after = harLog([
  harEntry({
    startedDateTime: "2026-09-24T10:16:00.000Z",
    time: 205,
    method: "GET",
    url: "https://httpbin.org/get?probe=netpeek",
    requestHeaders: [
      ["Host", "httpbin.org"],
      ["Accept", "*/*"],
      ["User-Agent", CAPTURED_USER_AGENT],
    ],
    status: 200,
    statusText: "OK",
    responseHeaders: [["Date", "Thu, 24 Sep 2026 10:16:00 GMT"], ...httpbinResponseHeaders],
    responseMimeType: "application/json",
    responseText: getProbeBody,
  }),
  harEntry({
    startedDateTime: "2026-09-24T10:16:04.000Z",
    time: 275,
    method: "POST",
    url: "https://httpbin.org/post",
    requestHeaders: [
      ["Host", "httpbin.org"],
      ["Accept", "*/*"],
      ["Content-Type", "application/json"],
      ["User-Agent", CAPTURED_USER_AGENT],
      ["Content-Length", "61"],
    ],
    postDataText: '{"username":"alice","password":"secret","device_id":"abc123"}',
    postDataMimeType: "application/json",
    status: 200,
    statusText: "OK",
    responseHeaders: [["Date", "Thu, 24 Sep 2026 10:16:04 GMT"], ...httpbinResponseHeaders],
    responseMimeType: "application/json",
    responseText: postBBody,
  }),
  harEntry({
    startedDateTime: "2026-09-24T10:16:06.000Z",
    time: 190,
    method: "GET",
    url: "https://httpbin.org/headers",
    requestHeaders: [
      ["Host", "httpbin.org"],
      ["Accept", "*/*"],
      ["User-Agent", CAPTURED_USER_AGENT],
    ],
    status: 200,
    statusText: "OK",
    responseHeaders: [["Date", "Thu, 24 Sep 2026 10:16:06 GMT"], ...httpbinResponseHeaders],
    responseMimeType: "application/json",
    responseText: headersBody,
  }),
]);

await writeFile(path.join(outDir, "before.session.har.json"), JSON.stringify(before, null, 2) + "\n");
await writeFile(path.join(outDir, "after.session.har.json"), JSON.stringify(after, null, 2) + "\n");

console.log("Wrote real-captured HAR fixtures to", outDir);
