import type { DiffResult } from "../diff/engine.js";

/**
 * Renders a DiffResult as machine-readable JSON. This is intentionally just
 * the DiffResult structure itself (stable field names, no lossy formatting)
 * so downstream tooling (CI privacy gates, dashboards, etc.) can consume it
 * directly.
 */
export function renderJsonReport(diff: DiffResult): string {
  return JSON.stringify(diff, null, 2);
}
