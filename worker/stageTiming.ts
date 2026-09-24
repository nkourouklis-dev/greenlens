/**
 * Per-stage latency, one structured log line per stage. Every line carries
 * the request id, so a whole scan can be reassembled with `wrangler tail`
 * (or the Workers logs) and the slow stage read straight off it.
 *
 * Measurement only: the wrapped promise's result, errors and ordering are
 * passed through untouched, so it can never change what a scan returns.
 */
export async function timedStage<T>(
  requestId: string,
  stage: string,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let outcome: "ok" | "error" = "ok";

  try {
    return await work();
  } catch (caughtError) {
    outcome = "error";
    throw caughtError;
  } finally {
    console.log("stage_timing", {
      requestId,
      stage,
      durationMs: Date.now() - startedAt,
      outcome,
    });
  }
}
