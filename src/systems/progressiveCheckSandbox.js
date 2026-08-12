/**
 * The progressive check's PREVIEW SANDBOX (issue 1097).
 *
 * A progressive check has no tiers to land on: its roll produces a numeric budget that is
 * spent down an ordered list of result difficulties, so the only outcome a GM can read off
 * it is HOW MANY results the roll pays for. The Checks Studio's odds histogram therefore
 * buckets a progressive check by AWARD COUNT — and to do that it needs an ordered list of
 * difficulties.
 *
 * ## Where that order comes from, and where it deliberately does NOT
 *
 * It is SANDBOX STATE ON THE CHECK, typed by the GM for one experiment. It is NOT read from
 * a recipe's `resultGroups[].results[].componentId` → `system.components[].difficulty` chain,
 * and it is not the GM's configured values or a player's stored order. The Studio's whole
 * subject is the CHECK: the simulator previews what a check does, not what a recipe will do,
 * so an order borrowed from a real record would answer a question this screen is not asking
 * (and would need recipe threading through the manager root to answer it at all).
 *
 * It does not have to be real. It has to show the correct behaviour — which it does, because
 * the histogram spends it through `resolveProgressiveAward`, the same loop crafting, salvage
 * and gathering all award through.
 *
 * ## Four properties, each load-bearing
 *
 * 1. **The engine never reads it.** Nothing under the runtime award path consults `preview`;
 *    deleting the key changes no engine behaviour. It is scratch, not configuration.
 * 2. **Readiness never validates it.** No readiness issue, no section dot, no blocked enable.
 *    A GM must be free to type a nonsensical experiment.
 * 3. **Export strips it.** A sandbox value inside a distributed system reads as
 *    configuration to the recipient (see `CraftingSystemExporter`).
 * 4. **Absence is not emptiness.** An absent `preview` means the GM has never run an
 *    experiment here; `{ difficulties: [] }` means they authored an empty one. Both are
 *    preserved, and the ORDER is the datum — nothing here sorts it.
 *
 * ## Why a non-numeric entry is DROPPED from the stored list, and why that is not validation
 *
 * The persisted shape is `number[]`, and the system settings round-trip through JSON. A
 * `NaN` survives neither: `JSON.stringify(NaN)` is `null`, and `Number(null)` is `0` — a
 * perfectly finite cost that would silently make the GM's experiment mean something ELSE
 * after a reload. So a token that does not reduce to a finite number is not stored.
 *
 * That is a shape guarantee, not a judgement about the experiment: nothing refuses the edit,
 * nothing badges it, and the authoring control keeps the GM's own text verbatim while they
 * type — a stray word simply contributes no difficulty, exactly as a zero or negative one
 * contributes a cost `resolveProgressiveAward` skips.
 */

/**
 * Tokens are separated by commas and/or whitespace, so `4 6 9`, `4,6,9` and `4, 6, 9` are
 * one order typed three ways rather than three different experiments.
 */
const SEPARATOR = /[\s,]+/;

/** How a stored order is rendered back into the field. */
const JOIN = ', ';

/**
 * The finite numbers in a raw list, in the order they were given.
 *
 * @param {unknown} values A candidate difficulty list.
 * @returns {Array<number>} The finite entries, order preserved.
 */
function finiteInOrder(values) {
  const list = Array.isArray(values) ? values : [];
  const kept = [];
  for (const value of list) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) kept.push(numeric);
  }
  return kept;
}

/**
 * Parse the sandbox order a GM typed.
 *
 * @param {unknown} text The field's raw text.
 * @returns {Array<number>} The ordered difficulties.
 */
export function parsePreviewDifficulties(text) {
  return finiteInOrder(
    String(text ?? '')
      .split(SEPARATOR)
      .filter((token) => token !== '')
  );
}

/**
 * Render a stored sandbox order back into field text.
 *
 * @param {unknown} difficulties The stored order.
 * @returns {string} The field text.
 */
export function formatPreviewDifficulties(difficulties) {
  return finiteInOrder(difficulties).join(JOIN);
}

/**
 * Normalize the persisted sandbox block, ABSENCE-PRESERVING.
 *
 * ONE derivation, three callers — the manager's progressive normalizer (which every
 * activity's progressive check funnels through), the manager root's draft clone, and the
 * rail's own parse — because each of the first two is an allowlist REBUILD, and a key one
 * of them fails to emit is dropped on the next save with nothing reporting it.
 *
 * @param {unknown} preview The raw `progressive.preview` block.
 * @returns {?{difficulties: Array<number>}} The sandbox, or null when none is authored.
 */
export function normalizePreviewSandbox(preview) {
  if (!preview || typeof preview !== 'object') return null;
  if (!Array.isArray(preview.difficulties)) return null;
  return { difficulties: finiteInOrder(preview.difficulties) };
}
