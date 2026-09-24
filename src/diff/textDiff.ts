export interface TextDiffLine {
  type: "added" | "removed" | "context";
  text: string;
}

/**
 * Real longest-common-subsequence line diff (the same family of algorithm
 * behind `diff`/`git diff`, just without the O(ND) Myers optimization). Used
 * for non-JSON request/response bodies so a byte diff is presented as
 * readable added/removed lines instead of an opaque blob comparison.
 *
 * Returns null when the inputs are too large for the O(n*m) DP table to be
 * worth computing (callers fall back to a byte-length summary instead).
 */
export function diffLines(beforeText: string, afterText: string): { lines: TextDiffLine[] } | null {
  const before = beforeText.split(/\r?\n/);
  const after = afterText.split(/\r?\n/);

  const n = before.length;
  const m = after.length;
  if (n * m > 250_000) {
    return null;
  }

  // dp[i][j] = length of the LCS of before[i:] and after[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (before[i] === after[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const lines: TextDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      lines.push({ type: "context", text: before[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ type: "removed", text: before[i]! });
      i++;
    } else {
      lines.push({ type: "added", text: after[j]! });
      j++;
    }
  }
  while (i < n) {
    lines.push({ type: "removed", text: before[i]! });
    i++;
  }
  while (j < m) {
    lines.push({ type: "added", text: after[j]! });
    j++;
  }

  return { lines };
}
