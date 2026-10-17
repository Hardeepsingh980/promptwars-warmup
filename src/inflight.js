/**
 * Counts background jobs that run after a webhook has already been answered,
 * so a shutdown can wait for them instead of cutting a reply short.
 */
let count = 0;
const waiters = new Set();

/** Run `work` as a tracked background job. Errors are passed to `onError`. */
export function track(work, onError = console.error) {
  count += 1;
  let job;
  try {
    job = Promise.resolve(work());
  } catch (error) {
    job = Promise.reject(error);
  }
  return job
    .catch(onError)
    .finally(() => {
      count -= 1;
      if (count === 0) for (const resolve of waiters) resolve();
    });
}

export const pending = () => count;

/** Resolve when no job is running, or after `timeoutMs`, whichever comes first. */
export function drain(timeoutMs = 8000) {
  if (count === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() { clearTimeout(timer); waiters.delete(done); resolve(); }
    waiters.add(done);
  });
}
