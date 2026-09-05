/**
 * TELLING A CLIENT THAT IT IS RUNNING A STALE ENTRY SCRIPT (issue 1565).
 *
 * Foundry renders a module's `esmodules` entry as a plain
 * `<script type="module" src="modules/fabricate/main.js">` with no version or cache-busting
 * parameter, so the entry script's URL is stable across versions. Any cache in front of the
 * server that serves it without revalidating can therefore hand a client an EARLIER build, and
 * that build asks for hashed chunk names the installed package no longer contains — a 404, a
 * rejected `import()`, and (before this module) a dead button whose only trace was an unhandled
 * rejection in the console.
 *
 * TWO SIGNALS, because they fail at different moments:
 *
 *  - {@link buildDeferredChunkFailureNotice} reacts to the rejection itself, at the moment a
 *    deferred window is opened.
 *  - {@link buildStaleEntryNotice} detects the condition DIRECTLY at startup, by comparing the
 *    version this build was made from against the installed module version, so a client learns
 *    about it without having to click the one broken button first.
 *
 * NO CLAIM OF RECOVERY BY REOPENING. The host records a failed module fetch in the realm's
 * module map, so a later `import()` of the same specifier resolves to the recorded failure with
 * no network request, and Vite has already rewritten that specifier to the hashed path at build
 * time so it cannot be busted. Only a reload recovers, and the copy escalates: reload, and if
 * the message returns, reload BYPASSING the cache — a soft reload cannot be relied on to
 * displace an entry script held by an intermediary that absorbed `Cache-Control: no-cache`,
 * which is the topology this failure requires in the first place.
 *
 * NEITHER NOTICE IS GM-GATED. The condition is per client and role-independent, and
 * `openRecipeManager` carries no GM gate, so a player invoking it from a macro must not get a
 * silent failure.
 *
 * PURE, and that is the point: nothing in `src/main.js` can be executed by a unit test, so
 * everything a semantic mutation could break lives here (the precedent is
 * `src/migration/worldScopeEntityNotice.js`). What stays at the Foundry edge is the localizer,
 * the notification channel and the console.
 */

import { localizeWith } from './localizeWithFallback.js';

/**
 * THE REAL ENGINE TEXTS for a failed dynamic import, one per engine, matched case-insensitively.
 *
 * Chromium/Edge: `Failed to fetch dynamically imported module: <url>`.
 * Firefox: `error loading dynamically imported module: <url>`.
 * Safari: `Importing a module script failed.`
 *
 * Matching on text is unattractive and unavoidable: the host throws a plain `TypeError` with no
 * code, no cause and no property distinguishing a missing chunk from any other failure. So the
 * classification is a POSITIVE lookup — anything unrecognised takes the generic branch, which
 * asserts no cause at all rather than telling a user to reload over an error that has nothing to
 * do with caching.
 */
const CHUNK_LOAD_FAILURE_TEXTS = Object.freeze([
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
]);

/**
 * The module's OWN console line for a failed deferred load, at `console.error`.
 *
 * THE LEVEL IS NOT A FREE CHOICE, and it is pinned in `tests/release-build.test.js` by matching
 * the built bundle's `console.error(<binding>)` CALL — a `log` spy in a unit test passes at any
 * level, so only the artefact can hold that line.
 *
 * IT IS NOT PINNED BY THIS LITERAL'S PRESENCE, and an earlier version of this comment claimed
 * otherwise. `vite.config.js` does declare `console.log`, `console.debug` and `console.info`
 * pure, but `manualPureFunctions` lets Rolldown drop such a call only when its RETURN VALUE IS
 * UNUSED — and this constant's only write is `src/main.js`'s concise-arrow `log` seam,
 * `(error) => console.error(MESSAGE, error)`, whose value IS the arrow's return value. So the
 * call survives DCE at every level, the literal reaches the bundle either way, and an `includes`
 * check over it proves the reporter wiring survived tree-shaking and nothing about the level.
 * Measured by rebuilding at `console.info`: the sentence was still in `dist/main.js`.
 * Contrast {@link STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE}, whose write is a bare statement and does
 * strip.
 *
 * REFERENCED ONLY BY THE CONSOLE WRITE, and that is why the reporter's `log` seam takes the
 * ERROR ALONE rather than a message and an error. It is deliberately not a localization key and
 * not part of any notice, because a key on this code path survives tree-shaking (the notice
 * references it) and so would pass the bundle assertion even if the console call had been
 * stripped. Were this constant passed INTO `log` from here, it would survive for the same
 * reason: only a literal whose sole reference is the console call itself disappears from the
 * bundle when that call is stripped, which is the whole point of asserting it.
 */
export const DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE =
  'Fabricate | a deferred part of the module failed to load. This browser is probably running a cached copy of an earlier version of Fabricate; reload to complete the update.';

/**
 * The module's own console line for a detected stale entry script, at `console.warn`.
 *
 * HERE A LEVEL REGRESSION REALLY DOES STRIP THE WRITE, unlike
 * {@link DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE}. `src/main.js` writes this one as an expression
 * STATEMENT whose value is discarded, so the `console.log`/`console.debug`/`console.info` purity
 * declared in `vite.config.js` lets Rolldown delete the call — and with it this literal's only
 * reference, so the sentence leaves the bundle entirely. Measured by rebuilding at
 * `console.log`. `tests/release-build.test.js` therefore asserts both that this reaches
 * `dist/main.js` and that it is written at `console.warn`.
 */
export const STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE =
  'Fabricate | this browser is running a cached entry script from an earlier version of Fabricate; reload to complete the update.';

/**
 * Is this rejection the host refusing to fetch a code-split chunk?
 *
 * READS `.message` AND NOTHING ELSE, so every non-`Error` rejection shape is safe. `null` and
 * `undefined` would THROW on a property read, and a throw inside the `catch` handler that
 * reports the failure would reproduce the exact silent-button defect this module exists to
 * remove. A bare string is not classified either, even one carrying an engine text: no engine
 * rejects a dynamic import with a string, so a string rejection is somebody else's error and the
 * generic notice — which claims no cause — is the honest answer for it.
 *
 * @param {unknown} error The rejection value.
 * @returns {boolean} True when the text names a failed dynamic module fetch.
 */
function isChunkLoadFailure(error) {
  const message = error?.message;
  if (typeof message !== 'string' || !message) return false;
  const text = message.toLowerCase();
  return CHUNK_LOAD_FAILURE_TEXTS.some((candidate) => text.includes(candidate));
}

/**
 * The notice for a deferred window that failed to open.
 *
 * @param {unknown} error The rejection value, of any shape.
 * @param {(key: string, data?: object) => string|undefined} localize The Foundry localizer.
 * @returns {string} A complete localized sentence.
 */
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
  // instruction. It points at the console, which carries the error itself.
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

/**
 * The startup notice for a build whose version differs from the installed one.
 *
 * SILENT UNLESS BOTH SIDES ARE KNOWN AND THEY DIFFER. The baked side is absent wherever the
 * build-time define is absent — the View Lab is served from its own config, which declares no
 * `define`, and under `node --test` there is no build at all — so an unknown side must no-op
 * rather than warn every developer and every capture frame.
 *
 * @param {{buildVersion?: unknown, installedVersion?: unknown}} versions The two sides.
 * @param {(key: string, data?: object) => string|undefined} localize The Foundry localizer.
 * @returns {string} The message, or `''` when there is nothing to report.
 */
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

/**
 * Is the notice this reporter last raised still on screen?
 *
 * CAPABILITY-CHECKED IN THREE RUNGS, each catching a DIFFERENT real shape. An earlier version of
 * this comment misattributed them, so they are named one at a time; any of them has to read as
 * "not live" rather than as an exception on the recovery path.
 *
 *  1. `typeof hasNotice !== 'function'` is the OMITTED SEAM — the parameter is optional and the
 *     unit suite exercises a reporter built without it. It is never the production shape:
 *     `src/main.js` passes an arrow, `(notice) => ui.notifications?.has?.(notice)`, which is a
 *     function whether or not the host defines `has`.
 *  2. `retained?.id > 0` is the UNUSABLE HANDLE — `Notifications#has` THROWS unless passed
 *     something with `id > 0`, and the View Lab's shim returns `undefined` from `warn`/`error`.
 *     It is NOT about a notice sitting in the queue: `notify` assigns `id: this.#id++` BEFORE
 *     pushing, and `has` searches the queue ahead of the active set (V14.367
 *     `client/applications/ui/notifications.mjs`), so a queued notice carries an id and correctly
 *     reads as live — which is the behaviour this reporter wants.
 *  3. `Boolean(...)`, and the `catch`, are the HOST WITHOUT `has` — which is how a production
 *     degradation actually arrives, since the optional call in rung 1's arrow yields `undefined`.
 *
 * @param {((notice: object) => boolean)|undefined} hasNotice The `ui.notifications.has` seam.
 * @param {object|null} retained The handle the last `notify` returned.
 * @returns {boolean} True when a further notice would only duplicate a visible one.
 */
function isNoticeLive(hasNotice, retained) {
  if (typeof hasNotice !== 'function') return false;
  if (!(retained?.id > 0)) return false;
  try {
    return Boolean(hasNotice(retained));
  } catch {
    return false;
  }
}

/**
 * The reporter for a failed deferred load: one console line per failure, one notice at a time.
 *
 * VOLUME IS BOUNDED BY RETAIN-AND-REUSE, NOT BY A ONCE-PER-SESSION FLAG. Foundry shows at most
 * five notices and only PERMANENT ones accumulate; a non-permanent notice drains after its
 * lifetime. A boolean flag would therefore leave a user who retries thirty seconds later with
 * nothing on screen — the invisible failure this change exists to remove. So the handle is
 * retained and a fresh notice is raised only once the retained one is gone, which is core's own
 * idiom (`scene-navigation.mjs`).
 *
 * THE CONSOLE LINE IS UNCONDITIONAL, the notice is not: repeated opens must each leave a trace
 * for a bug report while the user sees one notice.
 *
 * `{ console: false }` IS MANDATORY on the notify call. Core mirrors every notification to the
 * console from inside its own queue drain, so without it each failure writes two console lines.
 * Nor can that mirror carry the error INSTEAD of this module's own line: for a notice queued
 * behind the five-notice cap the mirror is deferred until the notice drains (`#fetch` is
 * re-entered from `#remove`), and lost outright if `clear()`, a removal while queued, or an
 * unload beats it — so it cannot be relied on to carry the error at failure time.
 *
 * @param {object} seams
 * @param {(message: string, options: object) => object|undefined} seams.notify
 *   The notification channel, BOUND to its receiver — `ui.notifications.error` passed as a bare
 *   function value throws on a private-field access at call time.
 * @param {(error: unknown) => void} seams.log The console seam. It takes the error alone and
 *   owns the write, including {@link DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE} — see that constant.
 * @param {(key: string, data?: object) => string|undefined} seams.localize The localizer.
 * @param {((notice: object) => boolean)} [seams.hasNotice] The `ui.notifications.has` seam,
 *   likewise bound. Optional: without it every failure notifies.
 * @returns {(error: unknown) => void} The reporter.
 */
export function createDeferredChunkFailureReporter({ notify, log, localize, hasNotice }) {
  let retained = null;
  return (error) => {
    log(error);
    if (isNoticeLive(hasNotice, retained)) return;
    retained = notify(buildDeferredChunkFailureNotice(error, localize), { console: false }) ?? null;
  };
}

/**
 * Open a deferred app, report a failure, and RETHROW it.
 *
 * The contract for the public API (`game.fabricate.openRecipeManager`), which must keep
 * returning a promise that rejects so a macro author's `await` still sees the failure. Core does
 * the same at every equivalent site.
 *
 * @template T
 * @param {() => Promise<T>} open Opens the app — the loader chain plus `show()`.
 * @param {(error: unknown) => void} report The reporter from
 *   {@link createDeferredChunkFailureReporter}.
 * @returns {Promise<T>} The app's own result.
 */
export async function openDeferredAppRethrowing(open, report) {
  try {
    return await open();
  } catch (error) {
    report(error);
    throw error;
  }
}

/**
 * Open a deferred app, report a failure, and SWALLOW it.
 *
 * The contract for a UI event handler, where nothing awaits the returned promise: a rethrow
 * there lands as the unhandled rejection this change exists to replace. Expressed as the
 * rethrowing form with its rejection absorbed so the two cannot drift on what "report" means.
 *
 * @template T
 * @param {() => Promise<T>} open Opens the app.
 * @param {(error: unknown) => void} report The reporter.
 * @returns {Promise<T|undefined>} The app's own result, or `undefined` on failure.
 */
export async function openDeferredApp(open, report) {
  try {
    return await openDeferredAppRethrowing(open, report);
  } catch {
    return;
  }
}
