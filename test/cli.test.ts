import { describe, expect, it } from "vitest";
import { runCli, VERSION } from "../src/cli.js";
import { fixturePath } from "./util.js";

const BEFORE = fixturePath("diff-scenario", "before.mitm.json");
const AFTER = fixturePath("diff-scenario", "after.mitm.json");

describe("netpeek CLI", () => {
  it("shows usage and exits non-zero with no arguments", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  it("--help exits zero and prints usage to stdout", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("netpeek diff <capture-a> <capture-b>");
  });

  it("--version prints the package version", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(`netpeek ${VERSION}`);
  });

  it("diff with the wrong number of arguments fails with a helpful message", async () => {
    const result = await runCli(["diff", BEFORE]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("requires exactly two capture file arguments");
  });

  it("diff on a nonexistent file fails with a clear error, not a crash", async () => {
    const result = await runCli(["diff", BEFORE, fixturePath("does-not-exist.json")]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("netpeek:");
  });

  it("diff auto-detects mitmproxy flow JSON and renders a plain-English report", async () => {
    const result = await runCli(["diff", BEFORE, AFTER]);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("New destinations contacted in B (1):");
    expect(result.stdout).toContain("tracker.new.example.com");

    expect(result.stdout).toContain("Destinations no longer contacted");
    expect(result.stdout).toContain("analytics.old.example.com");

    expect(result.stdout).toContain("POST api.example.com/v1/login");
    expect(result.stdout).toContain("device_id");

    expect(result.stdout).toContain("GET api.example.com/v1/status");
    expect(result.stdout).toContain("response status changed: 200 -> 503");

    expect(result.stdout).toContain("GET api.example.com/v1/profile");
  });

  it("diff --json emits parseable JSON matching the DiffResult shape", async () => {
    const result = await runCli(["diff", BEFORE, AFTER, "--json"]);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.hosts.added).toEqual(["tracker.new.example.com"]);
    expect(parsed.hosts.removed).toEqual(["analytics.old.example.com"]);
    expect(parsed.captureA.sourceFormat).toBe("mitmproxy");
    expect(parsed.captureB.requestCount).toBe(6);

    const loginChange = parsed.endpoints.changed.find((c: { path: string }) => c.path === "/v1/login");
    expect(loginChange).toBeDefined();
    expect(loginChange.requestBodyDiff.kind).toBe("json");
  });

  it("diff works across two different capture formats (HAR vs mitmproxy), auto-detected independently per file", async () => {
    const har = fixturePath("real-captured", "before.session.har.json");
    const mitm = fixturePath("diff-scenario", "after.mitm.json");
    const result = await runCli(["diff", har, mitm, "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.captureA.sourceFormat).toBe("har");
    expect(parsed.captureB.sourceFormat).toBe("mitmproxy");
  });
});
