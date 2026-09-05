/**
 * IN-FLIGHT MEMOIZATION FOR A DEFERRED MODULE LOAD (issue 1565).
 *
 * `src/main.js` has memoized its GM-manager `import()` since issue 150, in three lines nothing
 * can execute: no test can import that file (it statically imports CSS), so a source-text grep
 * can pin the DISPATCH and never the BEHAVIOUR. This is the same memoization behind a seam a
 * unit test can drive, plus one change — the memo is cleared when the attempt REJECTS, so a
 * rejected promise is not retained for the rest of the session.
 *
 * IT IS NAMED FOR MEMOIZATION AND NOT FOR RETRYING, deliberately. Clearing the memo does NOT
 * make a second attempt succeed and nothing here should be read as claiming it does: the host
 * records a failed module fetch in the realm's module map (keyed per `Document`), so a later
 * `import()` of the same specifier resolves to the recorded failure without a network request —
 * measured in Chromium 149 against a server that 404s once and then serves 200, where attempt 2
 * produced a second `TypeError` and no second server hit. Only a browser reload recovers. The
 * clear is therefore UNOBSERVABLE today; what it buys is not holding a dead promise.
 *
 * NO IDENTITY GUARD, and that is a decision rather than an omission. Because the memo holds the
 * IN-FLIGHT promise, two attempts cannot coexist: every caller arriving during an attempt is
 * handed that attempt, and the clear runs in that same attempt's rejection handler before any
 * later call can create another. A `if (inFlight === mine)` guard would be unreachable through
 * this API and its test could only pass vacuously.
 */

/**
 * Wrap a loader so concurrent and repeat callers share one attempt.
 *
 * @template T
 * @param {() => Promise<T>|T} load The loader — in production a dynamic `import()` chain.
 * @returns {() => Promise<T>} A function returning the shared attempt.
 */
export function createMemoizedLoad(load) {
  let inFlight = null;
  // An `async` wrapper so the loader is still invoked SYNCHRONOUSLY (as `import()` is today)
  // while a synchronous throw from it becomes a rejection rather than escaping to the caller.
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
