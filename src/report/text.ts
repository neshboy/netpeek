import type { DiffResult, EndpointChange, EndpointSummary } from "../diff/engine.js";
import type { BodyDiffResult } from "../diff/bodyDiff.js";

const MAX_TEXT_DIFF_LINES = 20;
const MAX_JSON_DIFF_ENTRIES = 30;
const PREVIEW_LENGTH = 200;

function truncate(text: string, max = PREVIEW_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars total)` : text;
}

function formatJsonValue(value: unknown): string {
  return truncate(JSON.stringify(value));
}

function endpointLabel(e: { method: string; host: string; path: string }): string {
  return `${e.method} ${e.host}${e.path}`;
}

function renderEndpointSummaryLine(e: EndpointSummary): string {
  const count = e.requestCount === 1 ? "1 request" : `${e.requestCount} requests`;
  return `  - ${endpointLabel(e)}  (${count})`;
}

function renderBodyDiff(label: string, diff: BodyDiffResult): string[] {
  switch (diff.kind) {
    case "identical":
      return [];
    case "added":
      return [`    ${label} body is new in B: ${formatJsonValue(diff.afterRaw)}`];
    case "removed":
      return [`    ${label} body present in A is gone in B: ${formatJsonValue(diff.beforeRaw)}`];
    case "json": {
      const lines = [`    ${label} body changed (structural JSON diff):`];
      const shown = diff.entries.slice(0, MAX_JSON_DIFF_ENTRIES);
      for (const entry of shown) {
        if (entry.kind === "added") {
          lines.push(`      + ${entry.path} = ${formatJsonValue(entry.after)}`);
        } else if (entry.kind === "removed") {
          lines.push(`      - ${entry.path} (was ${formatJsonValue(entry.before)})`);
        } else {
          lines.push(`      ~ ${entry.path}: ${formatJsonValue(entry.before)} -> ${formatJsonValue(entry.after)}`);
        }
      }
      if (diff.entries.length > shown.length) {
        lines.push(`      … ${diff.entries.length - shown.length} more field(s) changed`);
      }
      return lines;
    }
    case "text": {
      const changedLines = diff.lines.filter((l) => l.type !== "context");
      const lines = [`    ${label} body changed (text diff):`];
      const shown = changedLines.slice(0, MAX_TEXT_DIFF_LINES);
      for (const line of shown) {
        const prefix = line.type === "added" ? "+" : "-";
        lines.push(`      ${prefix} ${truncate(line.text)}`);
      }
      if (changedLines.length > shown.length) {
        lines.push(`      … ${changedLines.length - shown.length} more changed line(s)`);
      }
      return lines;
    }
    case "binary-or-large":
      return [
        `    ${label} body changed (binary or too large to line-diff): ${diff.beforeBytes} bytes -> ${diff.afterBytes} bytes`,
      ];
  }
}

function renderEndpointChange(change: EndpointChange): string[] {
  const lines: string[] = [`  - ${endpointLabel(change)}`];

  if (
    change.statusesBefore.length > 0 || change.statusesAfter.length > 0
  ) {
    const before = change.statusesBefore.length > 0 ? change.statusesBefore.join(",") : "none";
    const after = change.statusesAfter.length > 0 ? change.statusesAfter.join(",") : "none";
    if (before !== after) {
      lines.push(`    response status changed: ${before} -> ${after}`);
    }
  }

  for (const h of change.requestHeaderChanges) {
    lines.push(
      `    request header "${h.name}" changed: ${h.before.length ? h.before.join(", ") : "(absent)"} -> ${
        h.after.length ? h.after.join(", ") : "(absent)"
      }`,
    );
  }
  for (const h of change.responseHeaderChanges) {
    lines.push(
      `    response header "${h.name}" changed: ${h.before.length ? h.before.join(", ") : "(absent)"} -> ${
        h.after.length ? h.after.join(", ") : "(absent)"
      }`,
    );
  }

  lines.push(...renderBodyDiff("request", change.requestBodyDiff));
  lines.push(...renderBodyDiff("response", change.responseBodyDiff));

  return lines;
}

/**
 * Renders a DiffResult as a plain-English report meant to be read top to
 * bottom by someone auditing privacy behavior, not a developer.
 */
export function renderTextReport(diff: DiffResult): string {
  const out: string[] = [];

  out.push("NetPeek traffic diff");
  out.push("=====================");
  out.push(`A: ${diff.captureA.sourceFile}  (${diff.captureA.sourceFormat}, ${diff.captureA.requestCount} requests)`);
  out.push(`B: ${diff.captureB.sourceFile}  (${diff.captureB.sourceFormat}, ${diff.captureB.requestCount} requests)`);
  out.push("");

  out.push(`New destinations contacted in B (${diff.hosts.added.length}):`);
  if (diff.hosts.added.length === 0) {
    out.push("  (none)");
  } else {
    for (const host of diff.hosts.added) out.push(`  - ${host}`);
  }
  out.push("");

  out.push(`Destinations no longer contacted (present in A, gone from B) (${diff.hosts.removed.length}):`);
  if (diff.hosts.removed.length === 0) {
    out.push("  (none)");
  } else {
    for (const host of diff.hosts.removed) out.push(`  - ${host}`);
  }
  out.push("");

  out.push(`New endpoints contacted in B (${diff.endpoints.added.length}):`);
  if (diff.endpoints.added.length === 0) {
    out.push("  (none)");
  } else {
    for (const e of diff.endpoints.added) out.push(renderEndpointSummaryLine(e));
  }
  out.push("");

  out.push(`Endpoints no longer contacted (${diff.endpoints.removed.length}):`);
  if (diff.endpoints.removed.length === 0) {
    out.push("  (none)");
  } else {
    for (const e of diff.endpoints.removed) out.push(renderEndpointSummaryLine(e));
  }
  out.push("");

  out.push(`Endpoints contacted in both, with materially different behavior (${diff.endpoints.changed.length}):`);
  if (diff.endpoints.changed.length === 0) {
    out.push("  (none)");
  } else {
    for (const change of diff.endpoints.changed) {
      out.push(...renderEndpointChange(change));
    }
  }
  out.push("");

  out.push(`Unchanged endpoints: ${diff.endpoints.unchanged.length} (use --json for the full list)`);

  return out.join("\n");
}
