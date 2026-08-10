/**
 * The canonical accessor for an item's STACK QUANTITY — how many units one owned
 * document represents (issue 1024, #853 proposal 1).
 *
 * ## Why "stack quantity" and not "quantity"
 *
 * `quantity` is the most overloaded word in this domain: `Ingredient.quantity` (how
 * many a recipe needs), `result.quantity` (how many a craft produces), a drop row's
 * `quantity`, `awardedQuantity`, and essence `amount` all already exist. Every
 * identifier here therefore says **stack quantity**, reusing the term
 * `InventoryListingBuilder.js` already had.
 *
 * ## Three read semantics, which must not be collapsed
 *
 * - {@link readStackQuantity} — "a present item is at least one". Every read except the
 *   three below.
 * - {@link readStoredStackQuantity} — the value AS STORED, honouring a stored `0`. It is
 *   named for the consequence rather than for the mechanism, because at its call sites a
 *   returned `0` causes `item.delete()`.
 * - {@link hasStackQuantity} — stackability, not a count. This is what keeps
 *   `findStackableMatch` correct: an item with no stack-quantity field at all (unique
 *   gear) must never be folded into an award.
 *
 * The **absent-field default is a second, independent axis** from the stored-`0` axis.
 * Four distinct behaviours existed across the call sites before this change, so
 * {@link readStoredStackQuantity} takes `absentDefault` explicitly and the routed sites
 * pass the value that pins what they did before. Collapsing the two axes into one
 * accessor silently inflates or deflates every stack in the world by one.
 *
 * ## No truncation
 *
 * The accessors never truncate. `src/utils/alchemySubmissions.js` keeps its own
 * `Math.trunc`, because "one submission = one unit"
 * (`openspec/specs/resolution-modes/spec.md:397`) is a SUBMISSION rule, not a
 * stack-reading rule. Folding it in here would silently truncate every other read in the
 * module, including craftability `have` counts.
 *
 * ## Delivery: ambient module state with a per-call override
 *
 * Every accessor defaults its `path` argument to {@link itemStackQuantityPath}, evaluated
 * per call, and the ambient path is pushed in once by
 * {@link configureItemStackQuantityPath} during startup and again whenever the setting
 * changes. Constructor threading was rejected: six call sites are exported free
 * functions with no DI context, and threading the rest would touch every engine, both
 * listing builders, both Svelte service objects, and every construction site across the
 * test suite — a four-figure-line diff in which the actual change is invisible.
 *
 * This module NEVER touches `game`. That is a hard constraint rather than a preference:
 * `openspec/specs/data-models/spec.md:1328` commits the ingredient model to being
 * Foundry-free and `src/models/IngredientSet.js` is a call site. The path arrives by
 * push, from `src/main.js`.
 *
 * ## Two mitigations that are deliberately NOT implemented
 *
 * 1. **Never auto-append `.value`.** `.value`, `.val`, `.qty` and bare numbers all exist
 *    in real systems. Guessing a leaf would silently target a field the GM did not name,
 *    which is the same class of failure this whole change exists to remove.
 * 2. **Never fall back to the default path on a per-item read.** A read that fell back
 *    while the write did not would consume from one field and write to another: the
 *    engine would read 20, write 19 to a different key, leave the real stack at 20
 *    forever and never reach the delete branch — infinite free components with no signal
 *    at all. One resolved path, both directions, per item.
 */

import { DEFAULT_ITEM_STACK_QUANTITY_PATH } from '../config/stackQuantityPathPresets.js';
import { getByPath, setByPath } from '../utils/objectPath.js';

let activePath = DEFAULT_ITEM_STACK_QUANTITY_PATH;

/**
 * Normalize a configured stack-quantity path.
 *
 * NEVER THROWS, and never returns a falsy-but-truthy-looking path. A typo in a world
 * setting that bricks module startup is strictly worse than the data loss this guard
 * exists to reduce, so an unusable value simply yields `null` and the caller keeps the
 * path it already had.
 *
 * Rejected: anything that is not a string, the empty string, and any path with an empty
 * segment (`'system.'`, `'.value'`, `'system..qty'`) — each of which would otherwise
 * resolve nothing on every item in the world.
 *
 * @param {unknown} value Raw configured value.
 * @returns {string|null} The normalized dotted path, or `null` when unusable.
 */
export function normalizeStackQuantityPath(value) {
  try {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const segments = trimmed.split('.').map((segment) => segment.trim());
    if (segments.includes('')) return null;
    return segments.join('.');
  } catch {
    // Unreachable for a string input, but this function is called from a Foundry
    // settings callback where a throw kills the whole broadcast for every client.
    return null;
  }
}

/**
 * The stack-quantity path currently in force.
 *
 * @returns {string} The active dotted path; the default until something configures it.
 */
export function itemStackQuantityPath() {
  return activePath;
}

/**
 * Push a configured stack-quantity path into the accessor.
 *
 * NEVER THROWS and never stores a falsy path: an unusable value leaves the currently
 * active path in place, so a mistyped setting degrades to "unchanged" rather than to
 * "reads nothing on any item".
 *
 * @param {unknown} value Raw configured value.
 * @returns {string} The path in force after the call.
 */
export function configureItemStackQuantityPath(value) {
  const normalized = normalizeStackQuantityPath(value);
  if (normalized) activePath = normalized;
  return activePath;
}

/**
 * Restore the built-in default stack-quantity path.
 *
 * Exported for tests, and not decoration. The ambient path is module state, so a test
 * that configures it must restore it; without this seam that restore would have to
 * hand-write the default literal — a second, unpoliced spelling of exactly what
 * `tests/quantity-literal-gate.test.js` exists to eliminate, in a location the gate does
 * not scan.
 *
 * Every configuring test registers `t.after(resetItemStackQuantityPath)` as the FIRST
 * statement of its body, before the configure call, so a mid-test throw still resets.
 *
 * @returns {string} The default path, now in force.
 */
export function resetItemStackQuantityPath() {
  activePath = DEFAULT_ITEM_STACK_QUANTITY_PATH;
  return activePath;
}

/**
 * The stack size of a present item: **at least one**.
 *
 * Contract over the awkward inputs: absent -> 1; `0` -> 1; negative -> 1; non-numeric or
 * `NaN` -> 1; a numeric string -> its number; fractional -> kept as authored (this
 * accessor does not truncate).
 *
 * @param {object} item Item document or item-like object.
 * @param {string} [path] Dotted stack-quantity path.
 * @returns {number} The stack size, always >= 1.
 */
export function readStackQuantity(item, path = itemStackQuantityPath()) {
  const raw = Number(getByPath(item, path));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * The stack size AS STORED, honouring a stored `0`.
 *
 * Named for the consequence: at the call sites that use this, a returned `0` means the
 * consume path takes `item.delete()` rather than `item.update(...)`.
 *
 * Contract: absent (`undefined`/`null`) -> `absentDefault`; `0` -> `0`; negative -> the
 * negative value; non-numeric or `NaN` -> `absentDefault`; a numeric string -> its
 * number; fractional -> kept as authored.
 *
 * @param {object} item Item document or item-like object.
 * @param {object} [options]
 * @param {number} [options.absentDefault=1] Value for an absent/unreadable field. This
 *   is an INDEPENDENT axis from the stored-`0` behaviour and every routed call site
 *   passes the value that preserves what it did before.
 * @param {string} [options.path] Dotted stack-quantity path.
 * @returns {number} The stored stack size.
 */
export function readStoredStackQuantity(
  item,
  { absentDefault = 1, path = itemStackQuantityPath() } = {}
) {
  const raw = getByPath(item, path);
  if (raw === undefined || raw === null) return absentDefault;
  const value = Number(raw);
  return Number.isFinite(value) ? value : absentDefault;
}

/**
 * Whether an item carries a stack-quantity field at all — stackability, not a count.
 *
 * Deliberately NOT named `isStackable`, which reads as the whole stacking decision;
 * this answers one input to it. An item with no such field (unique gear) never stacks,
 * so an award creates a new document instead of incrementing.
 *
 * The test is PRESENCE (`!== undefined && !== null`), pinning the pre-change behaviour
 * of `sourceUuid.js`'s stack probe exactly. A present non-numeric value therefore still
 * counts as stackable, as it did before.
 *
 * @param {object} item Item document or item-like object.
 * @param {string} [path] Dotted stack-quantity path.
 * @returns {boolean} True when the path resolves a non-nullish value.
 */
export function hasStackQuantity(item, path = itemStackQuantityPath()) {
  const raw = getByPath(item, path);
  return raw !== undefined && raw !== null;
}

/**
 * Report — and refuse — a write that would clobber an OBJECT sitting at the configured
 * path.
 *
 * **This guard cannot prevent the misconfiguration data loss, and must not be read as
 * protection against it.** All four delete-on-underrun sites take `item.delete()`
 * *instead of* `item.update(...)`, so a guard on the update branch never executes on the
 * destructive branch at all. The remaining defence against a typo'd path destroying
 * stacks is the probe's permanent notification (see {@link probeStackQuantityPath}).
 *
 * What this guard actually does is narrower and still worth doing: it stops a numeric
 * write from replacing a structured sub-object when a GM configures the PARENT of the
 * count instead of the count itself.
 *
 * It REPORTS and no-ops rather than throwing, because one of its call sites
 * (`_consumeSubmittedAlchemyItems`) sits inside a `try { … } catch { console.error }`
 * while its sibling does not — a throwing guard would be silently swallowed in one place
 * and propagate in the other, which is two behaviours for one guard.
 *
 * @param {object} target Item document or item payload.
 * @param {string} path Dotted stack-quantity path.
 * @returns {boolean} True when the write must be refused.
 */
function refuseObjectValuedStackQuantity(target, path) {
  const current = getByPath(target, path);
  if (current === null || typeof current !== 'object') return false;
  const label = target?.name ?? target?.id ?? 'an item';
  console.warn(
    `Fabricate | The configured item stack-quantity path "${path}" resolves an object on ` +
      `"${label}", so writing a number there would destroy structured data. The write was ` +
      `skipped. If the count lives on a leaf of that object, configure the leaf — for ` +
      `example "${path}.value". Fabricate never appends a leaf for you, because ".value", ` +
      `".val", ".qty" and bare numbers all exist in real systems.`
  );
  return true;
}

/**
 * Build the flattened `item.update(...)` payload that writes a stack quantity.
 *
 * @param {object} item Item document.
 * @param {number} value The new stack quantity.
 * @param {string} [path] Dotted stack-quantity path.
 * @returns {object|null} The update payload, or `null` when the write is refused.
 */
export function stackQuantityUpdate(item, value, path = itemStackQuantityPath()) {
  if (refuseObjectValuedStackQuantity(item, path)) return null;
  return { [path]: value };
}

/**
 * Write a stack quantity onto a live item document.
 *
 * Returns `null` without calling `update` when the write is refused, so the six routed
 * call sites keep their `await (underrun ? item.delete() : updateStackQuantity(...))`
 * shape instead of each growing a branch around the guard.
 *
 * @param {object} item Item document.
 * @param {number} value The new stack quantity.
 * @param {string} [path] Dotted stack-quantity path.
 * @returns {Promise<*>} The `update` result, or `null` when refused.
 */
export async function updateStackQuantity(item, value, path = itemStackQuantityPath()) {
  const payload = stackQuantityUpdate(item, value, path);
  if (!payload) return null;
  return (await item?.update?.(payload)) ?? null;
}

/**
 * Write a stack quantity into an item-creation payload, creating the intermediate
 * objects the path needs.
 *
 * @param {object} itemData Item creation payload (mutated in place).
 * @param {number} value The stack quantity to author.
 * @param {string} [path] Dotted stack-quantity path.
 * @returns {object} The same `itemData`.
 */
export function setStackQuantity(itemData, value, path = itemStackQuantityPath()) {
  if (!itemData || typeof itemData !== 'object') return itemData;
  if (refuseObjectValuedStackQuantity(itemData, path)) return itemData;
  return setByPath(itemData, path, value);
}

/**
 * @typedef {object} StackQuantityProbeReport
 * @property {string} path The path probed.
 * @property {string} defaultPath The built-in default, offered as the suggested fix.
 * @property {number} total Items examined.
 * @property {number} resolved Items where `path` resolves a finite number on the
 *   PREPARED document.
 * @property {number} sourceCandidates Items that expose an `_source` to check.
 * @property {number} sourceResolved Items where `path` resolves a finite number in
 *   `_source`.
 * @property {number} defaultResolved Items where `defaultPath` resolves a finite number.
 * @property {'no-items'|'ok'|'schema-discard'|'unresolved'} verdict
 */

/**
 * Probe a configured stack-quantity path against the world's items.
 *
 * Resolution is checked against `item._source` as well as the prepared document, and
 * that is the whole point of the `'schema-discard'` verdict.
 * `SchemaField._cleanType` explicitly DELETES keys that are not in the schema, and
 * `TypeDataField._cleanType` delegates to the system's `DataModel.cleanData`, so on
 * every modern system a write to an off-schema path is silently discarded:
 * `item.update()` resolves and nothing changes. A path that reads fine on the prepared
 * document (because a module or an active effect put a value there) but is absent from
 * `_source` therefore produces the "infinite free components with no signal" failure
 * from the other direction — and the two failure modes coexist, because a FULL consume
 * takes `item.delete()`, which is not schema-filtered and succeeds. So an off-schema
 * path leaks AND destroys, and neither write guard can see either.
 *
 * @param {Iterable<object>} items World items.
 * @param {object} [options]
 * @param {string} [options.path] The path to probe.
 * @param {string} [options.defaultPath] The path suggested as a correction.
 * @returns {StackQuantityProbeReport}
 */
export function probeStackQuantityPath(
  items,
  { path = itemStackQuantityPath(), defaultPath = DEFAULT_ITEM_STACK_QUANTITY_PATH } = {}
) {
  const report = {
    path,
    defaultPath,
    total: 0,
    resolved: 0,
    sourceCandidates: 0,
    sourceResolved: 0,
    defaultResolved: 0,
    verdict: 'no-items',
  };

  // "Resolves a number" means a number or a numeric string. An array must NOT count:
  // `Number([])` is 0, which would report a healthy path on a world where every read
  // is actually resolving an empty array.
  const isNumeric = (value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
    return false;
  };

  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    report.total += 1;
    if (isNumeric(getByPath(item, path))) report.resolved += 1;
    if (isNumeric(getByPath(item, defaultPath))) report.defaultResolved += 1;
    const source = item._source;
    if (source && typeof source === 'object') {
      report.sourceCandidates += 1;
      if (isNumeric(getByPath(source, path))) report.sourceResolved += 1;
    }
  }

  if (report.total === 0) return report;
  if (report.resolved === 0) {
    report.verdict = 'unresolved';
    return report;
  }
  // Reads on the prepared document but is absent from `_source` on EVERY item that has
  // one: writes to this path will be discarded by the system's schema cleaner.
  if (report.sourceCandidates > 0 && report.sourceResolved === 0) {
    report.verdict = 'schema-discard';
    return report;
  }
  report.verdict = 'ok';
  return report;
}

/**
 * The localization keys the probe advisory can select.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const STACK_QUANTITY_ADVISORY_KEYS = Object.freeze({
  unresolved: 'FABRICATE.Settings.ItemStackQuantityPath.Unresolved',
  unresolvedAtDefault: 'FABRICATE.Settings.ItemStackQuantityPath.UnresolvedAtDefault',
  schemaDiscard: 'FABRICATE.Settings.ItemStackQuantityPath.SchemaDiscard',
});

/**
 * Choose the GM-facing advisory for a probe report — the localization key and the data it
 * interpolates — or `null` when there is nothing to say.
 *
 * This is a PURE selector, and lives here rather than in `src/main.js` so that the branch
 * it makes is testable. `main.js` cannot be imported under `node --test`, so an advisory
 * decision taken there can only ever be pinned by grepping its own source, which is not
 * evidence that the right string is chosen for a given world.
 *
 * ## Three strings, not two
 *
 * `'unresolved'` covers two situations that a GM must not be told are the same thing:
 *
 *   - The configured path is NOT the suggested default. Somebody typed something, and it
 *     resolves on nothing. That is a live misconfiguration and the certainty is earned.
 *   - The configured path IS the suggested default and the default resolves on nothing
 *     either. A dnd5e world whose Item directory holds only spells, feats, classes and
 *     backgrounds — extremely common — is in exactly this state, and there is nothing
 *     wrong with it. Telling that GM, permanently and on every login, to change the
 *     setting to the value it already has is a self-contradictory false alarm.
 *
 * The second case gets its own string stating the CONDITIONAL rather than the certainty.
 * It is deliberately NOT suppressed: a GM whose system really does store stack counts
 * somewhere else, and who never touched the setting, is in the same state and is losing
 * inventory. Suppressing on `defaultResolved === 0` would delete the warning for exactly
 * the world that needs it.
 *
 * @param {StackQuantityProbeReport} report
 * @returns {{key: string, data: object}|null}
 */
export function stackQuantityAdvisory(report) {
  if (!report || report.verdict === 'ok' || report.verdict === 'no-items') return null;
  const data = {
    path: report.path,
    total: report.total,
    resolved: report.resolved,
    default: report.defaultPath,
    defaultResolved: report.defaultResolved,
  };
  if (report.verdict === 'schema-discard') {
    return { key: STACK_QUANTITY_ADVISORY_KEYS.schemaDiscard, data };
  }
  if (report.path === report.defaultPath && report.defaultResolved === 0) {
    return { key: STACK_QUANTITY_ADVISORY_KEYS.unresolvedAtDefault, data };
  }
  return { key: STACK_QUANTITY_ADVISORY_KEYS.unresolved, data };
}
