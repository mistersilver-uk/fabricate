/**
 * The page session's one reporter for a deferred chunk that failed to load (issue 1565): the
 * crafting system manager and a lazy published entry share it (issue 2455), so a stale cache
 * raises one reload notice at a time. Not GM-gated, because `openRecipeManager` is macro-reachable.
 */
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  createDeferredChunkFailureReporter,
} from '../utils/deferredEntryNotice.js';

// Closures, since both `ui.notifications` members touch private fields and throw when unbound.
export const reportDeferredChunkFailure = createDeferredChunkFailureReporter({
  notify: (message, options) => ui.notifications?.error?.(message, options),
  hasNotice: (notice) => ui.notifications?.has?.(notice),
  // `console.error`, which `tests/release-build.test.js` pins in the built bundle: Rolldown keeps a
  // declared-pure call only when its return value is used, as this concise arrow's is.
  log: (error) => console.error(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error),
  localize: (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)),
});
