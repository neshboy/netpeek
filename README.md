# NetPeek

A packaged network-traffic-diffing toolkit for privacy auditing. Point it at
two captured traffic sessions of the same app — two versions, or before/after
a settings change — and it produces a plain-English diff of every domain and
endpoint the app talked to: new destinations, destinations it stopped
contacting, and endpoints it still contacts but with materially different
request bodies, headers, or response status codes.

## The problem

Apps quietly expand what they phone home to. A version bump adds a new
analytics SDK; a settings toggle you thought disabled tracking actually just
stops one of three trackers; a "privacy update" changes what fields get sent
to an existing endpoint without changing which endpoint. The evidence for all
of this is sitting right there in a network capture — but diffing two raw
HAR or proxy dumps by hand (hundreds of requests, verbose headers, nested
JSON bodies) is slow and error-prone. NetPeek automates that diff.

## What NetPeek actually is (read this before anything else)

NetPeek is the **diffing and analysis engine**, not a traffic capture tool.
It does not instrument a device, run a proxy, or drive a browser. You capture
traffic yourself with an existing, standard tool (Chrome DevTools, mitmproxy,
etc. — see below) and hand NetPeek two resulting files. This is a deliberate
scope decision: building a real capture pipeline needs a device/emulator and
a MITM CA installed on it, which isn't something this project can package or
verify. The parsing, normalization, and diffing is 100% real, working code —
see [Limitations](#limitations) for the precise boundary.

NetPeek understands two real, documented capture formats:

- **HAR 1.2** (HTTP Archive) — the JSON format browser DevTools export, and
  the format mitmproxy's own `har_dump` addon produces.
- **mitmproxy flow-dump JSON** — a JSON array shape mirroring mitmproxy's own
  `flow.request` / `flow.response` attribute names, produced by a small
  addon script (provided in `examples/mitmproxy_dump_addon.py`).

It auto-detects which format a file is from its content, so `netpeek diff`
works regardless of which tool produced either file, and the two files don't
even need to be the same format as each other.

## Install / quick start

```bash
git clone <this-repo>
cd netpeek
npm install
npm run build
npm link          # makes the `netpeek` command available globally, or:
node dist/cli.js diff <capture-a> <capture-b>
```

```bash
netpeek diff before.har after.har
netpeek diff before.json after.json --json > diff.json
```

Example output (real, produced by this repo's own test fixtures):

```
NetPeek traffic diff
=====================
A: before.mitm.json  (mitmproxy, 5 requests)
B: after.mitm.json  (mitmproxy, 6 requests)

New destinations contacted in B (1):
  - tracker.new.example.com

Destinations no longer contacted (present in A, gone from B) (1):
  - analytics.old.example.com

New endpoints contacted in B (2):
  - GET api.example.com/v1/profile  (1 request)
  - GET tracker.new.example.com/pixel  (1 request)

Endpoints no longer contacted (1):
  - GET analytics.old.example.com/collect  (1 request)

Endpoints contacted in both, with materially different behavior (2):
  - GET api.example.com/v1/status
    response status changed: 200 -> 503
  - POST api.example.com/v1/login
    response header "x-new-feature" changed: (absent) -> 1
    request body changed (structural JSON diff):
      + device_id = "dev-42"

Unchanged endpoints: 2 (use --json for the full list)
```

## How to capture traffic (real, standard workflows)

NetPeek doesn't capture traffic itself. Here's how to produce a real
HAR or mitmproxy flow-dump file with existing, standard, well-documented
tools:

### Option A: HAR via Chrome/Firefox DevTools (easiest, works for web apps)

1. Open DevTools → **Network** tab.
2. Reload/use the app so the requests you care about are captured.
3. Right-click the request list → **Save all as HAR with content**.
4. Feed the resulting `.har` file straight to `netpeek diff`.

This also works for anything that can be pointed through a browser-based
webview, or for a mobile app's backend calls if you already have a proxy set
up that exports HAR (mitmproxy does, see below).

### Option B: HAR via mitmproxy's own HAR export

mitmproxy ships a HAR-export addon
(https://github.com/mitmproxy/mitmproxy/blob/main/examples/contrib/har_dump.py).
Run your app's traffic through mitmproxy configured as its HTTP(S) proxy
(with mitmproxy's CA cert trusted on the device — mitmproxy's own docs cover
this: https://docs.mitmproxy.org/stable/concepts-certificates/), then:

```bash
mitmdump -s har_dump.py --set hardump=./capture.har
```

### Option C: mitmproxy flow-dump JSON via the addon in this repo

mitmproxy's native format is a binary flow file, not JSON, and there's no
single official "flow JSON" spec the way there is for HAR. `examples/mitmproxy_dump_addon.py`
in this repo is a small addon script (written against mitmproxy's documented
scripting API — `flow.request`/`flow.response` attributes) that dumps flows
to the JSON shape NetPeek's mitmproxy parser expects:

```bash
mitmdump -s examples/mitmproxy_dump_addon.py --set netpeek_out=capture.json
```

Capture the "before" state, save that file, change the app/setting, capture
the "after" state, then:

```bash
netpeek diff capture-before.json capture-after.json
```

Note: this addon script is written to mitmproxy's real, stable API surface,
but it has not been executed against a live mitmproxy install in this build
environment (no mitmproxy binary here) — sanity-check it against your
mitmproxy version before relying on it. The parser that reads its output
(`src/parsers/mitmproxy.ts`) *is* fully tested against hand-built fixtures
matching that exact shape.

## CLI reference

```
netpeek diff <capture-a> <capture-b> [--json]
netpeek --help
netpeek --version
```

- `<capture-a>` / `<capture-b>` — paths to HAR or mitmproxy flow-dump JSON
  files, auto-detected independently, so you can even diff a HAR against a
  mitmproxy dump.
- `--json` — emit the full `DiffResult` as JSON instead of the text report
  (includes the full unchanged-endpoint list, which the text report
  summarizes as a count).

Exit code is `0` on a successful diff (regardless of whether differences were
found) and `1` on a usage error or unreadable/unrecognized capture file.

## How the diff engine works

1. Both captures are parsed into a common internal model: method, scheme,
   host, path, query, headers (as a lowercase-name → values map, since HTTP
   headers are case-insensitive and repeatable), request/response bodies
   (raw text plus a parsed-JSON form when applicable), status code, and
   timestamp.
2. Requests are grouped by `(method, host, path)` — an "endpoint" — in each
   capture.
3. Endpoints only in capture B are **added**; only in capture A are
   **removed**. Host sets are diffed the same way and reported separately,
   since "a whole new domain got contacted" is the highest-signal event.
4. For endpoints present in both, NetPeek compares the *first* observed
   request/response pair from each capture:
   - **Body diff**: structural JSON diff (added/removed/changed fields with
     a JSONPath-ish pointer) when both bodies parse as JSON; otherwise a
     real LCS line diff; otherwise (binary-looking or too large to line-diff)
     a byte-length summary.
   - **Header diff**: added/changed/removed headers, excluding a small
     denylist of known-volatile headers (`Date`, `ETag`, `X-Request-Id`,
     CDN/tracing headers, etc. — see `src/diff/volatileHeaders.ts`) that
     change on every request regardless of any real behavioral difference.
   - **Status diff**: the set of distinct status codes seen for that
     endpoint in each capture.
   - If any of the above differ, the endpoint is **changed**; otherwise
     **unchanged**.

## Limitations

- **No built-in capture.** NetPeek diffs HAR and mitmproxy flow-dump JSON
  files you already have; it does not proxy traffic, instrument a device, or
  drive a browser. See "How to capture traffic" above.
- **Two formats only.** Other export formats (e.g. Charles Proxy `.chls`,
  Wireshark `.pcap`) aren't supported. HAR 1.2 and the mitmproxy addon-script
  JSON shape documented above are the only inputs understood.
- **First-occurrence representative comparison.** If an endpoint is called
  multiple times within one capture with genuinely different payloads each
  time (not just once), NetPeek compares the *first* observed request/
  response pair per capture, not every call. The request/response *count*
  per endpoint is still reported.
- **No subdomain/eTLD+1 grouping.** `a.tracker.com` and `b.tracker.com` are
  reported as fully distinct hosts, even if they're the same tracking
  vendor. This is more precise but means a vendor rotating subdomains could
  look like several "new hosts" rather than one.
- **Volatile-header denylist is a fixed, small list.** It reduces noise from
  headers like `Date`/`ETag`/tracing IDs but isn't configurable per-run yet.
- **mitmproxy flow-dump JSON is not an official mitmproxy spec.** mitmproxy's
  native format is a binary flow file; the JSON shape NetPeek reads is
  produced by the addon script this repo ships (`examples/mitmproxy_dump_addon.py`),
  built from mitmproxy's real, documented `flow.request`/`flow.response`
  attribute names. If you have JSON from a different mitmproxy exporter, you
  may need to reshape it to match (object-or-array-of-pairs headers, `path`
  including the query string, `content` as decoded text).
- **HAR body decoding** handles `content.encoding === "base64"`; other HAR
  encodings are not special-cased.

## Test fixtures: real capture vs. hand-built

Most parser test fixtures (`test/fixtures/har/`, `test/fixtures/mitm/`) are
hand-built JSON constructed to match the HAR 1.2 spec and the mitmproxy
addon-script shape exactly, including edge cases (base64-encoded response
bodies, repeated headers, missing optional fields, malformed documents) that
are impractical to reliably trigger from a live capture on demand.

In addition, `test/fixtures/real-captured/` contains a HAR file built from
**genuinely captured, real HTTP traffic** — actual `curl -v` requests made
against `https://httpbin.org` and `https://example.com` while building this
project, with real observed headers, status lines, and response bodies
copied in verbatim (not invented). `scripts/build-real-har-fixtures.mjs`
documents exactly which `curl` commands were run and assembles them into
valid HAR 1.2 documents, so this is traceable and reproducible. This proves
the HAR parser handles real-world data, not just idealized fixtures.

## Development

```bash
npm install
npm run build       # compile TypeScript to dist/
npm test            # run the vitest suite
npm run typecheck   # tsc --noEmit
```

Stack: TypeScript (strict), Node.js ESM, zero runtime dependencies, vitest
for tests.

## License

MIT © 2026 NetPeek contributors. See [LICENSE](LICENSE).
