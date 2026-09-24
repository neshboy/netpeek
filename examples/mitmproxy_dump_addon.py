"""
NetPeek mitmproxy flow-dump addon.

mitmproxy does not have one official "flow JSON" export spec - its native
on-disk format is a binary flow file read by `mitmproxy -r` / mitmweb. To get
a JSON file that NetPeek's mitmproxy parser (src/parsers/mitmproxy.ts) can
read, run mitmproxy with this addon script. It walks each flow's real,
documented `flow.request` / `flow.response` attributes (method, scheme,
host, port, path, http_version, headers, content) - see mitmproxy's own
scripting docs: https://docs.mitmproxy.org/stable/addons-scripting/

Usage:
    mitmdump -s examples/mitmproxy_dump_addon.py --set netpeek_out=capture.json
    # ... browse / use the app you're capturing, then Ctrl+C to stop mitmdump ...
    # capture.json now contains a JSON array of flows, ready for:
    netpeek diff before.json capture.json

You can run this twice (once per app state you're comparing) to produce the
two capture files NetPeek diffs.
"""

import json

from mitmproxy import ctx, http

flows: list[dict] = []


def load(loader):
    loader.add_option(
        name="netpeek_out",
        typespec=str,
        default="netpeek-capture.json",
        help="Path to write the NetPeek-compatible flow-dump JSON to on shutdown.",
    )


def response(flow: http.HTTPFlow) -> None:
    flows.append(
        {
            "request": {
                "method": flow.request.method,
                "scheme": flow.request.scheme,
                "host": flow.request.host,
                "port": flow.request.port,
                "path": flow.request.path,  # includes the query string
                "http_version": flow.request.http_version,
                "headers": dict(flow.request.headers),
                "content": flow.request.get_text(strict=False),
            },
            "response": (
                {
                    "status_code": flow.response.status_code,
                    "http_version": flow.response.http_version,
                    "headers": dict(flow.response.headers),
                    "content": flow.response.get_text(strict=False),
                }
                if flow.response is not None
                else None
            ),
            "timestamp_start": flow.request.timestamp_start,
            "timestamp_end": (flow.response.timestamp_end if flow.response else None),
        }
    )


def done() -> None:
    out_path = ctx.options.netpeek_out
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(flows, f, indent=2)
    ctx.log.info(f"netpeek: wrote {len(flows)} flow(s) to {out_path}")
