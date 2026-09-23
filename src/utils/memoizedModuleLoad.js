/** IN-FLIGHT MEMOIZATION FOR A DEFERRED MODULE LOAD (issue 1565). */

/** Wrap a loader so concurrent and repeat callers share one attempt. */
export function createMemoizedLoad(load) {
  let inFlight = null;
  // An `async` wrapper so the loader is still invoked SYNCHRONOUSLY (as `import()` is today) while
  // a synchronous throw from it becomes a rejection rather than escaping to the caller.
  const attempt = async () => load();
  return () => {
    if (!inFlight) {
      inFlight = attempt().catch((error) => {
        inFlight = null;
        throw error;
      });
    }
    return inFlight;
  };
}
