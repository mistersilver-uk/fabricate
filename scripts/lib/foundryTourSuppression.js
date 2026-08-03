/**
 * foundryTourSuppression.js
 *
 * Pure (playwright-free, no autorun) derivation of the `core.tourProgress` value that
 * stops Foundry's New User Experience tours ever starting during a smoke run.
 *
 * WHY a separate module: `scripts/foundry-test-run.mjs` calls `main()` at top level, so
 * importing it from a test launches a build and the whole Foundry harness. Anything that
 * needs a unit test has to live outside it — the same reason `foundryRunBudget.js` exists.
 */

/**
 * Every core Tour Foundry ships, by the id it registers under. Read from
 * `public/tours/*.json` in the 14.365 build; the ids are the filenames, and
 * `ToursCollection#register` keys each tour `"<namespace>.<id>"`.
 *
 * Only `core.welcome` auto-starts unattended — `NewUserExperienceManager#showNewWorldTour()`
 * names it explicitly and nothing else in the client starts a tour without a user gesture —
 * but seeding the whole set costs nothing and does not depend on that staying true.
 */
export const CORE_TOUR_IDS = Object.freeze([
  'welcome',
  'sidebar',
  'ui-overview',
  'canvas-controls',
  'backups-overview',
  'compatibility-preview-overview',
  'creating-a-world',
  'installing-a-system',
]);

/**
 * The `localStorage` key Foundry stores tour progress under.
 *
 * `core.tourProgress` is registered `{scope: "client"}`, and `ClientSettings#setClient` writes
 * a client-scope setting straight to `window.localStorage` under its dotted setting id. So the
 * key is the setting id verbatim, not a namespaced or prefixed variant.
 */
export const TOUR_PROGRESS_STORAGE_KEY = 'core.tourProgress';

/**
 * A tour's persisted `stepIndex`. `Tour#status` reports UNSTARTED for `-1`, and
 * `#showNewWorldTour()` only starts a tour whose status is UNSTARTED — so ANY other value
 * suppresses the auto-start.
 *
 * `0` rather than `steps.length` (i.e. COMPLETED) is deliberate: marking a tour complete
 * through `Tour#complete()` can open the "suggested next tour" `DialogV2.confirm`
 * (`core.welcome` suggests `core.uiOverview`), which would replace one blocking overlay with
 * another. Writing the index directly never triggers that path.
 */
export const SUPPRESSED_STEP_INDEX = 0;

/**
 * Merge suppression entries into an existing `core.tourProgress` value.
 *
 * Merges rather than replaces, and never lowers an index Foundry itself recorded: a tour the
 * run legitimately advanced must keep its real progress.
 *
 * @param {unknown} existing Parsed prior value, or anything at all — a malformed value is
 *   treated as absent rather than throwing, because a harness must still boot.
 * @param {readonly string[]} [tourIds]
 * @returns {{core: Record<string, number>} & Record<string, unknown>}
 */
export function withSuppressedTours(existing, tourIds = CORE_TOUR_IDS) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const core =
    base.core && typeof base.core === 'object' && !Array.isArray(base.core) ? { ...base.core } : {};
  for (const id of tourIds) {
    if (typeof core[id] !== 'number') core[id] = SUPPRESSED_STEP_INDEX;
  }
  return { ...base, core };
}

/**
 * The init-script body, as a function to be serialized into the page by
 * `BrowserContext#addInitScript`. Kept here so its behaviour is unit-testable against a fake
 * storage; the harness only supplies the real `window.localStorage`.
 *
 * @param {{getItem: (k: string) => string | null, setItem: (k: string, v: string) => void}} storage
 * @param {readonly string[]} [tourIds]
 */
export function seedTourProgress(storage, tourIds = CORE_TOUR_IDS) {
  let existing = null;
  try {
    const raw = storage.getItem(TOUR_PROGRESS_STORAGE_KEY);
    existing = raw ? JSON.parse(raw) : null;
  } catch {
    // A malformed stored value is treated as absent — see withSuppressedTours.
    existing = null;
  }
  storage.setItem(
    TOUR_PROGRESS_STORAGE_KEY,
    JSON.stringify(withSuppressedTours(existing, tourIds))
  );
}
