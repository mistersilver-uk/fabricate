/**
 * statusChipTone — the ONE map from the retired status vocabularies onto `Chip`'s tones
 * (issue 1506).
 *
 * ── WHY A MODULE AND NOT A TERNARY AT EACH SITE ─────────────────────────────────────────
 *
 * `Chip` and the pill it replaces disagree about an unrecognised tone, and they disagree
 * SILENTLY in opposite directions. The pill resolved anything it did not know to `subtle`
 * and reported the resolved value on a `data-*` hook, so a test could watch the fallback
 * happen. `Chip` DROPS it — `TONES.has(tone) ? \`is-${tone}\` : ''` — which emits no class,
 * throws nothing and fails no test: a mistyped or unmapped tone renders the default chip and
 * every suite stays green.
 *
 * That matters because the two vocabularies are NOT the same list. The pill's `success` is
 * `Chip`'s `positive`, and `success` is the tone the projections behind the dynamic call
 * sites emit most: the salvage yield rows, the bulk report's outcome table, the recipe
 * browser's row pills, the world Essence rollup and the Tool player preview all return
 * `tone: 'success'` from a closed map. Converted verbatim, every one of those renders an
 * untoned chip — the green simply gone, with nothing red anywhere.
 *
 * So the read site is routed through one total function rather than through a ternary per
 * call site: a mapping written twelve times is twelve chances to write it once wrong, and
 * `src/` duplication counts against the new-code gate as surely as `tests/` does.
 *
 * ── THE DOMAIN IS BOTH RETIRED VOCABULARIES, NOT ONE ────────────────────────────────────
 *
 * The pill's six names — `subtle`, `success`, `accent`, `danger`, `warning`, `info` — plus
 * the look-alike badges' `neutral`, which those families emit for a locked recipe and a
 * cancelled run. `neutral` is a `Chip` tone already, so it maps to ITSELF by name; what it
 * does not keep is its ground, because the look-alikes declared `--fab-surface-raised` on
 * their base rule while `Chip`'s base inherits `--fab-overlay-light-06`. That move is stated
 * at the sites it reaches rather than hidden here — this map decides the NAME, never the
 * paint.
 *
 * Four of the six pill tones map at a byte-identical colour triple (`success`→`positive`,
 * `danger`, `warning`, `info` all resolve to the same three family tokens on both sides).
 * `accent` keeps its name and moves its INK from `--fab-accent` to `--fab-accent-text`,
 * which is an accessibility repair `Chip` already made and recorded. `subtle` is a `Chip`
 * tone as of this change, reproducing the pill's own default face.
 *
 * ── TOTALITY, AND THE FALLBACK IT KEEPS ─────────────────────────────────────────────────
 *
 * The map is TOTAL over that domain, and an argument outside it resolves to `subtle` — the
 * fallback the retired pill performed at all of its call sites, so a projection that emits a
 * name nobody expected renders exactly what it rendered before this change rather than a
 * chip with no tone at all. Membership is tested with `Object.hasOwn`, so a prototype key
 * (`constructor`, `toString`) is a miss like any other rather than a function.
 *
 * No Foundry, DOM or Svelte dependency: a pure `.js` leaf, unit-testable, and one entry in a
 * mount harness's `rawModules`.
 */

/**
 * The whole map, closed and frozen. Read by the source contract as well as by the callers,
 * so it is exported rather than inlined.
 *
 * @type {Readonly<Record<string, string>>}
 */
const STATUS_CHIP_TONES = Object.freeze({
  subtle: 'subtle',
  success: 'positive',
  accent: 'accent',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
});

/** What an unmapped name renders, which is what the retired pill rendered for it. */
const FALLBACK_TONE = 'subtle';

/**
 * Resolve a retired status tone to the `Chip` tone that draws it.
 *
 * @param {string} tone A pill or badge tone name.
 * @returns {string} A tone `Chip` paints; `subtle` for anything unrecognised.
 */
export function statusChipTone(tone) {
  return Object.hasOwn(STATUS_CHIP_TONES, tone) ? STATUS_CHIP_TONES[tone] : FALLBACK_TONE;
}

export { STATUS_CHIP_TONES, FALLBACK_TONE as STATUS_CHIP_TONE_FALLBACK };
