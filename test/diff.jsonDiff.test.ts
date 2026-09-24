import { describe, expect, it } from "vitest";
import { diffJsonValues } from "../src/diff/jsonDiff.js";

describe("diffJsonValues (structural JSON diff)", () => {
  it("returns no entries for deeply equal values, including out-of-order keys", () => {
    expect(diffJsonValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("reports an added key", () => {
    expect(diffJsonValues({ a: 1 }, { a: 1, b: 2 })).toEqual([{ path: "b", kind: "added", after: 2 }]);
  });

  it("reports a removed key", () => {
    expect(diffJsonValues({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: "b", kind: "removed", before: 2 }]);
  });

  it("reports a changed leaf value with a dotted path", () => {
    const entries = diffJsonValues({ user: { email: "a@x.com" } }, { user: { email: "b@x.com" } });
    expect(entries).toEqual([{ path: "user.email", kind: "changed", before: "a@x.com", after: "b@x.com" }]);
  });

  it("diffs arrays index-by-index, including trailing added elements", () => {
    const entries = diffJsonValues({ items: [1, 2] }, { items: [1, 2, 3] });
    expect(entries).toEqual([{ path: "items[2]", kind: "added", after: 3 }]);
  });

  it("reports a type change (object -> array) as a single changed leaf", () => {
    const entries = diffJsonValues({ v: { x: 1 } }, { v: [1] });
    expect(entries).toEqual([{ path: "v", kind: "changed", before: { x: 1 }, after: [1] }]);
  });
});
