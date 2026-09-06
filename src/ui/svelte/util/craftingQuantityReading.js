/**
 * craftingQuantityReading — how a crafting quantity is WRITTEN on a chip (issue 1506).
 *
 * ── WHY A MODULE AND NOT A TEMPLATE LITERAL PER CALL SITE ───────────────────────────────
 *
 * `QuantityTag.svelte` was the shared have/need chip for the recipe detail's material economy
 * and the alternatives picker. It formatted NOTHING: every one of its six call sites composed
 * the value itself and handed the finished string over — `state.have ?? 0` twice, a
 * `${have}/${need}` ratio once, a `×${have}` stack count once. Retiring that component into the
 * shared `Chip` therefore had a choice to make about four readings that had never had a home,
 * because the only thing holding them together was the component they were passed to.
 *
 * They live here, together, for the reason `craftingRecipeStatus.js` and `journalRunStatus.js`
 * live beside this file: a closed presentation vocabulary in a pure `.js` leaf is unit-testable,
 * a template literal inside a `.svelte` markup block is not, and four copies of "what a count
 * looks like" in two files is four chances to write it once wrong.
 *
 * ── EVERY READING IS TOTAL, WHICH IS A REPAIR ───────────────────────────────────────────
 *
 * The retired call sites were total only where an author had remembered `?? 0`. Two had; two had
 * not, and a stack with no `have` read back to the player as the literal string `×undefined`.
 * A quantity chip that cannot say what it holds should say ZERO rather than print the shape of
 * the gap in the model, so every function here answers with a number for any argument.
 *
 * No Foundry, DOM or Svelte dependency: a pure leaf, and one entry in a mount harness's
 * `rawModules`.
 */

/**
 * A count, written as its own digits. Anything unreadable — absent, empty, non-numeric or
 * infinite — is ZERO, which is what a player can act on; a fractional or negative count is kept,
 * because rounding one would misreport a holding and a negative one is a real shortfall.
 *
 * @param {unknown} value A count from a crafting read-model.
 * @returns {string}
 */
export function countText(value) {
  const count = Number(value);
  return Number.isFinite(count) ? String(count) : '0';
}

/**
 * The held-against-needed pair the alternatives picker reads on each option.
 *
 * @param {unknown} have How many the actor holds.
 * @param {unknown} need How many the option consumes.
 * @returns {string}
 */
export function haveOfNeedText(have, need) {
  return `${countText(have)}/${countText(need)}`;
}

/**
 * A held stack's count, behind the multiplication sign the stack chooser has always drawn. The
 * sign is U+00D7 rather than the letter x, which is what shipped and what a player reads as a
 * quantity rather than as part of a name.
 *
 * @param {unknown} have How many the stack holds.
 * @returns {string}
 */
export function stackCountText(have) {
  return `×${countText(have)}`;
}
