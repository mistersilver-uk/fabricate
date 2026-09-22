// Hand-maintained loader over the GENERATED `foundryIconCatalogue.json`; do not hand-edit that.
// Regenerate it with `node scripts/generate-icon-catalogue.mjs <foundry>/…/fonts/fontawesome`.
// Why the set is Foundry × Free: `openspec/specs/ui-visual-style/spec.md`, `#### Icon vocabulary`.

import catalogue from './foundryIconCatalogue.json' with { type: 'json' };

/**
 * Every icon Foundry's bundled Font Awesome can render under a name Font Awesome publishes for
 * free, brands excluded. One row per glyph, `iconCode|label|alias,alias`.
 *
 * Frozen entry by entry, not just as an array: `Object.freeze` is shallow, and the curated
 * vocabulary is a filter of this array, so an unfrozen entry would hand any caller a writable
 * handle on a row every Fabricate picker renders from.
 *
 * @type {ReadonlyArray<{ iconCode: string, label: string, aliases: ReadonlyArray<string> }>}
 */
export const FOUNDRY_ICON_DEFINITIONS = Object.freeze(
  catalogue.rows.map((row) => {
    const [iconCode, label, aliases] = row.split('|');
    return Object.freeze({
      iconCode,
      label,
      aliases: Object.freeze(aliases === undefined ? [] : aliases.split(',')),
    });
  })
);

/** The Font Awesome release Foundry bundles, which this catalogue was measured from. */
export const FOUNDRY_ICON_BUNDLE_RELEASE = Object.freeze({ ...catalogue.bundleRelease });

/**
 * The free release whose names this catalogue was narrowed to.
 *
 * Recorded rather than inferred so the licensing guard can say which free set the committed names
 * were checked against, and fail when the pinned devDependency moves away from it.
 */
export const FOUNDRY_ICON_FREE_INTERSECTION = Object.freeze({ ...catalogue.freeIntersection });
