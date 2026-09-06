/**
 * Marks an error message as already written for end users (Greek, no
 * technical detail). Callers should show `error.message` verbatim only for
 * this class — any other thrown error (a raw TypeError, a bug) must never
 * reach the UI as-is; log it and show a generic fallback instead.
 */
export class UserFacingError extends Error {}
