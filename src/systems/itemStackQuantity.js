/**
 * The canonical accessor for an item's stack quantity, how many units one owned document
 * represents (issue 1024); "stack quantity" because `quantity` is overloaded in this domain.
 * Three read semantics that must not be collapsed: `readStackQuantity` (a present item is at
 * least one), `readStoredStackQuantity` (as stored, honouring `0`, which makes its callers
 * delete) and `hasStackQuantity` (stackability: unique gear never folds into an award). The
 * absent-field default is a separate axis, passed explicitly as `absentDefault`; collapsing the
 * two inflates or deflates every stack by one.
 * The accessors never truncate; `alchemySubmissions.js` keeps its own `Math.trunc` for the
 * one-submission-one-unit rule (`openspec/specs/resolution-modes/spec.md`).
 * `path` defaults to the ambient `itemStackQuantityPath()`, pushed at startup and on setting
 * change; this module never reads Foundry globals (`openspec/specs/data-models/spec.md`).
 * Never auto-append `.value` and never fall back to the default path per item: one resolved path,
 * both directions, or a read and a write target different fields.
 */

import { DEFAULT_ITEM_STACK_QUANTITY_PATH } from '../config/stackQuantityPathPresets.js';
import { getByPath, setByPath } from '../utils/objectPath.js';

let activePath = DEFAULT_ITEM_STACK_QUANTITY_PATH;

/**
 * Normalize a configured path, or `null` when unusable (non-string, empty, or an empty segment);
 * never throws, since a settings typo must not brick startup.
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
    // A throw in a Foundry settings callback kills the broadcast for every client.
    return null;
  }
}

/** The stack-quantity path in force; the default until configured. */
export function itemStackQuantityPath() {
  return activePath;
}

/** Push a configured path; never throws, and an unusable value keeps the active path. */
export function configureItemStackQuantityPath(value) {
  const normalized = normalizeStackQuantityPath(value);
  if (normalized) activePath = normalized;
  return activePath;
}

/**
 * Restore the default path, for tests: a hand-written default would dodge
 * `tests/quantity-literal-gate.test.js`. Register `t.after(resetItemStackQuantityPath)` first.
 */
export function resetItemStackQuantityPath() {
  activePath = DEFAULT_ITEM_STACK_QUANTITY_PATH;
  return activePath;
}

/** At least one: absent, `0`, negative or non-numeric is 1; numeric strings and fractions kept. */
export function readStackQuantity(item, path = itemStackQuantityPath()) {
  const raw = Number(getByPath(item, path));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * The stored stack size, honouring `0` (its callers then delete) and negatives; absent or
 * non-numeric is `absentDefault`, an axis independent of the stored-`0` behaviour.
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
 * Whether the item carries the field at all (presence, not a count), not the whole stacking
 * decision; a present non-numeric value still counts, as `sourceUuid.js`'s probe did.
 */
export function hasStackQuantity(item, path = itemStackQuantityPath()) {
  const raw = getByPath(item, path);
  return raw !== undefined && raw !== null;
}

/**
 * Report and refuse a numeric write over an object at the path (a GM configured the parent of
 * the count). It cannot prevent misconfiguration data loss, since underrun sites delete instead
 * of updating; the probe's advisory is that defence. It warns rather than throws because one
 * caller swallows throws and its sibling does not.
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

/** The flattened `item.update` payload, or `null` when the write is refused. */
export function stackQuantityUpdate(item, value, path = itemStackQuantityPath()) {
  if (refuseObjectValuedStackQuantity(item, path)) return null;
  return { [path]: value };
}

/**
 * Thrown on a refused write, so a caller tells "nothing reached the database" from an
 * unacknowledged, uncertain write that needs GM reconciliation.
 */
export class StackQuantityPathRefusal extends Error {
  constructor(path) {
    super(`The configured item stack-quantity path "${path}" resolves an object`);
    this.name = 'StackQuantityPathRefusal';
    this.code = 'STACK_QUANTITY_PATH_REFUSED';
    this.path = path;
  }
}

/**
 * Write a stack quantity onto a live item; a refusal answers `null` without calling `update`
 * (callers keep `underrun ? item.delete() : updateStackQuantity(...)`), or throws
 * `StackQuantityPathRefusal` under `throwOnRefusal`.
 */
export async function updateStackQuantity(
  item,
  value,
  path = itemStackQuantityPath(),
  { throwOnRefusal = false } = {}
) {
  const payload = stackQuantityUpdate(item, value, path);
  if (!payload) {
    if (throwOnRefusal) throw new StackQuantityPathRefusal(path);
    return null;
  }
  return (await item?.update?.(payload)) ?? null;
}

/** Write a stack quantity into a creation payload in place, creating intermediate objects. */
export function setStackQuantity(itemData, value, path = itemStackQuantityPath()) {
  if (!itemData || typeof itemData !== 'object') return itemData;
  if (refuseObjectValuedStackQuantity(itemData, path)) return itemData;
  return setByPath(itemData, path, value);
}

/**
 * Probe a configured path against the world's items, reporting `{ path, defaultPath, total,
 * resolved, sourceCandidates, sourceResolved, defaultResolved, verdict }`. `_source` is checked
 * too: `SchemaField._cleanType` deletes off-schema keys, so a path that reads on the prepared
 * document but not in `_source` is `schema-discard` (updates silently discarded, while a full
 * consume's `delete` still succeeds). See `.agents/docs/foundry-and-architecture.md`.
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

  // A numeric string counts; an array must not (`Number([])` is 0).
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
  // Reads on the prepared document but in no `_source`: the schema will discard writes.
  if (report.sourceCandidates > 0 && report.sourceResolved === 0) {
    report.verdict = 'schema-discard';
    return report;
  }
  report.verdict = 'ok';
  return report;
}

/** The localization keys the probe advisory selects. */
export const STACK_QUANTITY_ADVISORY_KEYS = Object.freeze({
  unresolved: 'FABRICATE.Settings.ItemStackQuantityPath.Unresolved',
  unresolvedAtDefault: 'FABRICATE.Settings.ItemStackQuantityPath.UnresolvedAtDefault',
  schemaDiscard: 'FABRICATE.Settings.ItemStackQuantityPath.SchemaDiscard',
});

/**
 * The GM advisory `{ key, data }` for a probe report, or `null`; pure so the branch is testable
 * (`main.js` cannot be imported under `node --test`). An unresolved default path gets its own
 * conditional string (a spells-only dnd5e world is fine) rather than being suppressed, because a
 * world that stores counts elsewhere is in the same state and losing inventory.
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
