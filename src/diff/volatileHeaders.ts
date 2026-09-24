/**
 * Headers that change on essentially every request/response regardless of
 * any real behavioral difference (timestamps, request-tracing IDs, CDN/edge
 * routing info). We exclude these from the header diff so a "changed
 * endpoint" report reflects a materially different request, not clock skew.
 * Body diffing is unaffected - only header comparison consults this list.
 */
export const VOLATILE_HEADER_NAMES: ReadonlySet<string> = new Set([
  "date",
  "age",
  "etag",
  "expires",
  "last-modified",
  "retry-after",
  "x-request-id",
  "x-amzn-requestid",
  "x-amzn-trace-id",
  "x-amz-cf-id",
  "x-amz-request-id",
  "cf-ray",
  "x-cache",
  "x-served-by",
  "via",
  "server-timing",
  "x-runtime",
  "x-response-time",
  "x-b3-traceid",
  "x-b3-spanid",
  "traceparent",
  "tracestate",
]);
