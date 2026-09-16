/**
 * Telling a client it is running a STALE ENTRY SCRIPT (issue 1565). Foundry serves the module's
 * entry at a stable URL, so a cache in front of it can hand back an earlier build whose hashed
 * chunks are gone. Two signals, because they fail at different moments:
 * {@link buildDeferredChunkFailureNotice} on the rejection, {@link buildStaleEntryNotice} at
 * startup. Neither is GM-gated, and neither claims reopening recovers — only a reload does, and
 * the copy escalates to a cache-bypassing one. Pure, because nothing in `src/main.js` is testable.
 */

import { localizeWith } from './localizeWithFallback.js';

/**
 * THE REAL ENGINE TEXTS for a failed dynamic import, one per engine, matched case-insensitively.
 */
const CHUNK_LOAD_FAILURE_TEXTS = Object.freeze([
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
]);

/** The module's OWN console line for a failed deferred load, at `console.error`. */
export const DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE =
  'Fabricate | a deferred part of the module failed to load. This browser is probably running a cached copy of an earlier version of Fabricate; reload to complete the update.';

/** The module's own console line for a detected stale entry script, at `console.warn`. */
export const STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE =
  'Fabricate | this browser is running a cached entry script from an earlier version of Fabricate; reload to complete the update.';

/** Is this rejection the host refusing to fetch a code-split chunk? */
function isChunkLoadFailure(error) {
  const message = error?.message;
  if (typeof message !== 'string' || !message) return false;
  const text = message.toLowerCase();
  return CHUNK_LOAD_FAILURE_TEXTS.some((candidate) => text.includes(candidate));
}

/** The notice for a deferred window that failed to open. */
export function buildDeferredChunkFailureNotice(error, localize) {
  if (isChunkLoadFailure(error)) {
    return localizeWith(
      localize,
      'FABRICATE.Admin.Manager.LoadFailedStaleEntry',
      undefined,
      'Fabricate could not open the crafting system manager because this browser is still running an earlier version of the module. Reload your browser to complete the update. If this message comes back, reload again bypassing the cache — Ctrl+Shift+R, or Cmd+Shift+R on macOS.'
    );
  }
  // THIS BRANCH CANNOT KNOW A CAUSE, so its copy claims none — no update, no cache, no reload
  // instruction.
  return localizeWith(
    localize,
    'FABRICATE.Admin.Manager.LoadFailed',
    undefined,
    'Fabricate could not open the crafting system manager. The browser console has the error.'
  );
}

/** A version is comparable only when it is a non-empty string. */
function comparableVersion(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** The startup notice for a build whose version differs from the installed one. */
export function buildStaleEntryNotice(versions, localize) {
  const buildVersion = comparableVersion(versions?.buildVersion);
  const installedVersion = comparableVersion(versions?.installedVersion);
  if (!buildVersion || !installedVersion || buildVersion === installedVersion) return '';
  return localizeWith(
    localize,
    'FABRICATE.Update.StaleEntryScript',
    { buildVersion, installedVersion },
    `Fabricate ${installedVersion} is installed, but this browser is still running Fabricate ${buildVersion}. Reload your browser to complete the update. If this message comes back, reload again bypassing the cache — Ctrl+Shift+R, or Cmd+Shift+R on macOS.`
  );
}

/** Is the notice this reporter last raised still on screen? */
function isNoticeLive(hasNotice, retained) {
  if (typeof hasNotice !== 'function') return false;
  if (!(retained?.id > 0)) return false;
  try {
    return Boolean(hasNotice(retained));
  } catch {
    return false;
  }
}

/** The reporter for a failed deferred load: one console line per failure, one notice at a time. */
export function createDeferredChunkFailureReporter({ notify, log, localize, hasNotice }) {
  let retained = null;
  return (error) => {
    log(error);
    if (isNoticeLive(hasNotice, retained)) return;
    retained = notify(buildDeferredChunkFailureNotice(error, localize), { console: false }) ?? null;
  };
}

/** Open a deferred app, report a failure, and RETHROW it. */
export async function openDeferredAppRethrowing(open, report) {
  try {
    return await open();
  } catch (error) {
    report(error);
    throw error;
  }
}

/** Open a deferred app, report a failure, and SWALLOW it. */
export async function openDeferredApp(open, report) {
  try {
    return await openDeferredAppRethrowing(open, report);
  } catch {
    return;
  }
}
