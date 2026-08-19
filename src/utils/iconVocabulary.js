/**
 * The curated icon vocabulary as PUBLISHED data (issue 1269).
 *
 * Fabricate curates one Font Awesome vocabulary and every icon field in the module draws from it.
 * This module is the projection that turns that internal set into the plain data
 * `game.fabricate.listCuratedIcons()` hands to a caller, so the accessor on `src/main.js` stays a
 * thin Foundry-facing edge and the contract itself is testable without importing `main.js`.
 */

import { FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS } from '../ui/svelte/util/fontAwesomeFreeClassicIcons.js';

/**
 * The curated vocabulary as plain, caller-owned data.
 *
 * Copies rather than handing the module's own array back, and the reason is not defensive
 * habit. `FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS` is frozen, but `Object.freeze`
 * is shallow: the definition objects INSIDE it are writable, and because the curated array is
 * `filter`ed out of the full catalogue, each of those objects is the very object the 1402-entry
 * catalogue holds. Returning one would lend every caller a writable handle on the data every
 * Fabricate picker renders from, where a single stray assignment would rename an icon for the
 * rest of the session with nothing to trace it to.
 *
 * The three fields are named one at a time rather than spread, so regenerating the catalogue
 * with a new field cannot silently widen what is published.
 *
 * @returns {Array<{iconCode: string, label: string, hasRegular: boolean}>} a fresh array of fresh
 *   records, in the curated order, safe for a caller to keep, sort or mutate.
 */
export function listCuratedIconVocabulary() {
  return FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.map(
    ({ iconCode, label, hasRegular }) => ({
      iconCode,
      label,
      hasRegular: Boolean(hasRegular),
    })
  );
}
