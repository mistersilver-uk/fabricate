/**
 * Pure (playwright-free, no autorun) derivation of the `core.tourProgress` value that stops
 * Foundry's New User Experience tours ever starting during a smoke run.
 */

/** Every core Tour Foundry ships, by the id it registers under. */
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

/** The `localStorage` key Foundry stores tour progress under. */
export const TOUR_PROGRESS_STORAGE_KEY = 'core.tourProgress';

/**
 * A tour's persisted `stepIndex`. `Tour#status` reports unstarted for `-1`, and
 * `#showNewWorldTour()` only starts a tour whose status is unstarted — so any other value
 * suppresses the auto-start.
 */
export const SUPPRESSED_STEP_INDEX = 0;

/** Merge suppression entries into an existing `core.tourProgress` value. */
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
 * `BrowserContext#addInitScript`.
 */
export function seedTourProgress(storage, tourIds = CORE_TOUR_IDS) {
  // Declared null and only ever assigned on the success path: if JSON.parse throws, the
  // assignment never ran, so the catch has nothing to reset (and writing `existing = null`
  // there is a `no-useless-assignment` error, not merely redundant).
  let existing = null;
  try {
    const raw = storage.getItem(TOUR_PROGRESS_STORAGE_KEY);
    existing = raw ? JSON.parse(raw) : null;
  } catch {
    // A malformed stored value is treated as absent — see withSuppressedTours.
  }
  storage.setItem(
    TOUR_PROGRESS_STORAGE_KEY,
    JSON.stringify(withSuppressedTours(existing, tourIds))
  );
}
