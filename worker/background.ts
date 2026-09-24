import { timedStage } from "./stageTiming";

/**
 * Work that must happen but that nobody is waiting for (storing a photo,
 * writing catalogue copy). Runs after the response is sent when the request's
 * ExecutionContext is known, so it never adds to the scan's wait.
 *
 * The context is attached to a per-request clone of `env` rather than passed
 * through every function signature between the router and the call site:
 * everything already threads `env`, and the clone inherits every binding.
 * Callers with a plain `env` (tests, scripts) get the old behaviour — the work
 * is simply awaited.
 */
const contexts = new WeakMap<object, ExecutionContext>();

export function bindExecutionContext<E extends object>(
  env: E,
  ctx: ExecutionContext,
): E {
  const scoped = Object.create(env) as E;
  contexts.set(scoped, ctx);
  return scoped;
}

export async function afterResponse(
  env: object,
  requestId: string,
  stage: string,
  work: () => Promise<void>,
): Promise<void> {
  const task = timedStage(requestId, stage, work).catch((caughtError) => {
    console.error("background_task_failed", {
      requestId,
      stage,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError).slice(0, 300),
    });
  });

  const ctx = contexts.get(env);

  if (ctx) {
    ctx.waitUntil(task);
    return;
  }

  await task;
}
