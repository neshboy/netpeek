import { describe, expect, it } from "vitest";
import { parseMitmFlows, looksLikeMitmFlows, MitmproxyFormatError } from "../src/parsers/mitmproxy.js";
import { readJsonFixture } from "./util.js";

describe("parseMitmFlows (mitmproxy addon-script flow-dump JSON)", () => {
  it("parses object-shaped headers, splits path into pathname/query, and parses JSON content", async () => {
    const data = await readJsonFixture("mitm", "dict-headers.json");
    const capture = parseMitmFlows(data, "dict-headers.json");

    expect(capture.sourceFormat).toBe("mitmproxy");
    expect(capture.requests).toHaveLength(2);

    const [forecast, session] = capture.requests;
    expect(forecast!.host).toBe("weather.example.net");
    expect(forecast!.path).toBe("/v1/forecast");
    expect(forecast!.query).toBe("city=NYC&units=metric");
    expect(forecast!.requestHeaders["accept"]).toEqual(["application/json"]);
    expect(forecast!.status).toBe(200);
    expect(forecast!.responseBodyJson).toEqual({ city: "NYC", tempC: 4 });
    // timestamp_start (epoch seconds) must convert to a real ISO string
    expect(forecast!.timestamp).toBe(new Date(1767603600.123 * 1000).toISOString());

    expect(session!.method).toBe("POST");
    expect(session!.requestBodyJson).toEqual({ deviceId: "device-111" });
  });

  it("parses array-of-pairs headers (repeated headers preserved) and a null response", async () => {
    const data = await readJsonFixture("mitm", "array-headers-no-response.json");
    const capture = parseMitmFlows(data, "array-headers-no-response.json");

    expect(capture.requests).toHaveLength(1);
    const [ping] = capture.requests;
    expect(ping!.requestHeaders["x-custom-trace"]).toEqual(["one", "two"]);
    expect(ping!.status).toBeUndefined();
    expect(ping!.responseBodyRaw).toBeUndefined();
  });

  it("rejects a JSON document that is not a flow array", async () => {
    const data = await readJsonFixture("mitm", "invalid-not-mitm.json");
    expect(looksLikeMitmFlows(data)).toBe(false);
    expect(() => parseMitmFlows(data, "invalid-not-mitm.json")).toThrow(MitmproxyFormatError);
  });

  it("accepts an empty flow array", () => {
    const capture = parseMitmFlows([], "empty.json");
    expect(capture.requests).toHaveLength(0);
  });
});
