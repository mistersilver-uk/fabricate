/**
 * The **arm selection** every arrangement-aware migration corpus accessor shares
 * (issues 1242, 1212).
 *
 * The ARMS differ per entity class — one reads a whole-array key, one reads per-record
 * documents, and the component arm has to re-inflate into containers — but the SELECTION does
 * not, and it is the part a copy gets subtly wrong.
 *
 * ## The mapping is a positive switch, never a truthiness test
 *
 * A "not `singleArray`, therefore granular" formulation is wrong in a way that is easy to
 * miss: unit fixtures answer an unregistered layout key with `null` in one suite and `[]` in
 * another, and `[]` is TRUTHY. Only the three recognised values select an arm; every other
 * answer — absent, unrecognised, or thrown — takes the legacy arrangement.
 *
 * | layout | behaviour |
 * |---|---|
 * | `singleArray` | the legacy whole-array accessor, byte-for-byte the shipped path |
 * | `perRecord` | the granular accessor |
 * | `unsettled` | REFUSE: neither arrangement holds the whole corpus |
 * | anything else | the legacy accessor |
 *
 * ## Why `unsettled` refuses, and why an unreadable layout does not
 *
 * The two directions are opposite on purpose. `unsettled` is a POSITIVELY ESTABLISHED
 * statement that the corpus is spread across both arrangements, so either arm would reduce
 * over a PARTIAL corpus — and a partial corpus is the worst possible input to a corpus-global
 * reduction, not a skipped one. It is live on the ordinary path: the migration pass runs
 * BEFORE the storage reconcile, so the boot after a torn conversion runs the whole pass while
 * the layout says `unsettled`. Refusing costs exactly one boot.
 *
 * An unreadable layout is the ambient condition of every world that has never converted (and
 * of several hundred unit fixtures with no `game` at all), so refusing there would withhold
 * migrations from those worlds forever, on every boot, with no path out.
 */

import { DEFINITION_STORAGE_LAYOUTS } from '../config/settings.js';

/**
 * Select the arm one layout value addresses.
 *
 * A POSITIVE lookup keyed on the three recognised layout values, never a truthiness test and
 * never a `?? null` narrowing. `singleArray` is listed explicitly even though it shares the
 * legacy arm with the default, because the enumeration is the statement: an arm is selected
 * by RECOGNISING a layout, and everything else falls out of the map to the legacy
 * arrangement.
 *
 * @template T
 * @param {*} layout the layout value, however unreadable.
 * @param {{legacyArm: T, granularArm: T, unsettledArm: T}} arms
 * @returns {T}
 */
export function selectDefinitionCorpusArm(layout, { legacyArm, granularArm, unsettledArm }) {
  const armByLayout = new Map([
    [DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY, legacyArm],
    [DEFINITION_STORAGE_LAYOUTS.PER_RECORD, granularArm],
    [DEFINITION_STORAGE_LAYOUTS.UNSETTLED, unsettledArm],
  ]);
  return armByLayout.get(layout) ?? legacyArm;
}

/**
 * Memoize a layout read for the duration of one pass.
 *
 * The memo is what the ARM selection reads; a write GUARD must always read live, because its
 * whole purpose is detecting a mid-pass flip and wiring it to the memo would make it unable
 * to fire.
 *
 * @param {() => string|null} readLayout
 * @returns {() => string|null}
 */
export function memoizeLayout(readLayout) {
  let memoized;
  return () => {
    if (memoized === undefined) memoized = readLayout();
    return memoized;
  };
}
