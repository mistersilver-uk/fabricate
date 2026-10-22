/**
 * The page session's one reporter for a deferred chunk that failed to load (issue 1565), so a stale
 * cache raises one reload notice at a time. Neither caller is GM-gated: `openRecipeManager` is
 * macro-reachable, and any client may load a published entry.
 * - The crafting system manager calls `reportDeferredChunkFailure(error)`, which raises its own
 *   notice on each failure.
 * - The published component seam calls `reportPublishedLoadFailure(error)` for a lazy entry (issue
 *   2455), which raises a neutral notice at most once per page session.
 * Each failure logs a console line. A notice a live one suppresses is not used up, and a notice
 * raised before Foundry has created `ui.notifications` waits for `ready`.
 */
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  buildDeferredPartFailureNotice,
  createDeferredChunkFailureReporter,
} from '../utils/deferredEntryNotice.js';

// Closures, since both `ui.notifications` members touch private fields and throw when unbound.
// `ui.notifications` exists from `Game#initializeUI`, so a failure before then waits for `ready`.
export const reportDeferredChunkFailure = createDeferredChunkFailureReporter({
  notify: (message, options) => ui.notifications?.error?.(message, options),
  hasNotice: (notice) => ui.notifications?.has?.(notice),
  // `console.error`, which `tests/release-build.test.js` pins in the built bundle: Rolldown keeps a
  // declared-pure call only when its return value is used, as this concise arrow's is.
  log: (error) => console.error(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error),
  localize: (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)),
  canNotify: () => Boolean(globalThis.ui?.notifications),
  whenReady: (flush) => globalThis.Hooks?.once?.('ready', flush),
});

/** The published seam's `reportLoadFailure`: the neutral reload notice through the one reporter. */
export const reportPublishedLoadFailure = (error) =>
  reportDeferredChunkFailure(error, { buildNotice: buildDeferredPartFailureNotice, once: true });
