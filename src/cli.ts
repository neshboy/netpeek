#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { loadCapture } from "./parsers/detect.js";
import { diffCaptures } from "./diff/engine.js";
import { renderTextReport } from "./report/text.js";
import { renderJsonReport } from "./report/json.js";

export const VERSION = "1.0.0";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const HELP_TEXT = `netpeek - plain-English network traffic diffing for privacy auditing

Usage:
  netpeek diff <capture-a> <capture-b> [--json]
  netpeek --help
  netpeek --version

Arguments:
  <capture-a>   Path to the "before" capture (HAR or mitmproxy flow-dump JSON)
  <capture-b>   Path to the "after" capture (HAR or mitmproxy flow-dump JSON)

Options:
  --json        Emit the diff as machine-readable JSON instead of a text report
  -h, --help    Show this help text
  -v, --version Show the installed netpeek version

Capture format is auto-detected from file content: a HAR 1.2 document
({ log: { entries: [...] } }) or a mitmproxy flow-dump JSON array
([{ request: { method, host, path, ... } }, ...]). See the README for how
to produce either from a real capture session.
`;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs the netpeek CLI against a raw argv array (already stripped of
 * `node script.js`) and returns the exit code and would-be stdout/stderr
 * text, without touching the real process streams. Kept side-effect-free
 * so it can be exercised directly in tests as well as from the real bin
 * entrypoint at the bottom of this file.
 */
export async function runCli(argv: string[]): Promise<CliResult> {
  if (argv.length === 0) {
    return { exitCode: 1, stdout: "", stderr: HELP_TEXT };
  }

  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: HELP_TEXT, stderr: "" };
  }
  if (command === "--version" || command === "-v") {
    return { exitCode: 0, stdout: `netpeek ${VERSION}\n`, stderr: "" };
  }

  if (command === "diff") {
    const jsonFlag = rest.includes("--json");
    const positional = rest.filter((a) => a !== "--json");

    if (positional.length !== 2) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `netpeek: "diff" requires exactly two capture file arguments\n\n${HELP_TEXT}`,
      };
    }

    const [fileA, fileB] = positional as [string, string];

    try {
      const [captureA, captureB] = await Promise.all([loadCapture(fileA), loadCapture(fileB)]);
      const diff = diffCaptures(captureA, captureB);
      const output = jsonFlag ? renderJsonReport(diff) : renderTextReport(diff);
      return { exitCode: 0, stdout: `${output}\n`, stderr: "" };
    } catch (err) {
      return { exitCode: 1, stdout: "", stderr: `netpeek: ${errorMessage(err)}\n` };
    }
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr: `netpeek: unknown command "${command}"\n\n${HELP_TEXT}`,
  };
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
