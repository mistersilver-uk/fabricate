/**
 * @module componentNameMatch
 *
 * The single shared home for Fabricate's **name-fallback** component matching — the
 * last-resort tier that resolves an owned item to a crafting definition by comparing
 * their display names once every durable link (the `flags.fabricate` identity map, the
 * legacy scalar flag, and the source-UUID reference chain) has already missed.
 *
 * Historically the same name compare was duplicated at four independent call sites with
 * two subtly different semantics — three case-INSENSITIVE (essence resolution / inventory
 * listing, recipe ingredient matching, tool presence matching) and one case-SENSITIVE
 * (salvage item selection). This module unifies them behind one primitive
 * ({@link matchComponentByName} / {@link findComponentByName}) that is **parameterized on
 * case-sensitivity**, so each site keeps its exact prior behaviour while the logic lives
 * in one place.
 *
 * Name matching is inherently unsafe — names are non-unique, editable, and shared across
 * crafting systems — and its removal is tracked by issue 540 (phased). To measure real
 * reliance before removal, every successful name-only match routes through
 * {@link reportNameOnlyMatch}, which emits a warn-once, deduped console notice. A match
 * that reaches this module has, by construction, already failed durable + source-ref
 * resolution at the call site, so a hit here is precisely a name-ONLY match.
 */

/**
 * The raw name comparison, parameterized on case-sensitivity. Both names must be
 * truthy to match (an empty/absent name never matches). Case-insensitive comparison
 * lower-cases via `String(...)` so a non-string name degrades gracefully rather than
 * throwing; case-sensitive comparison is a strict `===` (the salvage semantics).
 *
 * @param {unknown} itemName - The owned item's `name`.
 * @param {unknown} candidateName - The candidate definition's `name`.
 * @param {boolean} caseSensitive - `true` for a strict `===` compare (salvage), else lower-cased.
 * @returns {boolean}
 */
function namesMatch(itemName, candidateName, caseSensitive) {
  if (!itemName || !candidateName) return false;
  if (caseSensitive) return itemName === candidateName;
  return String(itemName).toLowerCase() === String(candidateName).toLowerCase();
}

// Warn-once telemetry state. A module-level Set deduplicates so a hot per-item matcher
// (essence accumulation, craftability checks, salvage item selection) emits at most one
// console line per distinct name-only match rather than one per call. Exposed for reset
// via `resetNameOnlyMatchTelemetry` so unit tests can assert the guard without bleed.
const _nameOnlyMatchWarned = new Set();

/**
 * Clear the warn-once name-only-match telemetry state. Test seam only — production code
 * never resets it (the guard is intentionally per-session).
 *
 * @returns {void}
 */
export function resetNameOnlyMatchTelemetry() {
  _nameOnlyMatchWarned.clear();
}

/**
 * Emit a warn-once, deduped console notice that an owned item resolved to a component
 * (or tool) **by name only** — i.e. durable identity and source references had already
 * missed and only the display name matched. This is the observability that will justify
 * the eventual removal of name matching (issue 540, Phase 3). The message carries only
 * game-content strings (item name, definition name/id, system id) — no user PII.
 *
 * Deduped on `(systemId, definition id ?? name, item name)` so the same recurring match
 * warns once per session.
 *
 * @param {{ item: object|null, component: object|null, systemId?: string|null|undefined }} params
 * @returns {void}
 */
function reportNameOnlyMatch({ item, component, systemId }) {
  const definitionId = component?.id ?? null;
  const definitionName = component?.name ?? '';
  const itemName = item?.name ?? '';
  const key = `${systemId ?? ''}|${definitionId ?? definitionName}|${itemName}`;
  if (_nameOnlyMatchWarned.has(key)) return;
  _nameOnlyMatchWarned.add(key);
  console.warn?.(
    `Fabricate | name-only match: owned item "${itemName}" resolved to "${definitionName}"` +
      `${definitionId ? ` (id "${definitionId}")` : ''}${systemId ? ` in system "${systemId}"` : ''}` +
      ' by display name only — durable identity flags and source references did not match.' +
      ' Name matching is a deprecated compatibility fallback (issue 540); re-link or re-import' +
      ' this item so it resolves by a durable link.'
  );
}

/**
 * Whether an owned `item` matches a single `component`/tool-like definition by NAME —
 * the shared name-fallback primitive. On a successful match it reports the name-only
 * match through {@link reportNameOnlyMatch} (warn-once). Callers MUST reach this only
 * after durable-identity + source-reference resolution has already failed, so a `true`
 * result is by construction a name-ONLY match.
 *
 * @param {object|null} item - The owned item (reads `item.name`).
 * @param {object|null} component - The candidate definition (reads `component.name`, `component.id`).
 * @param {{ caseSensitive?: boolean, systemId?: string|null|undefined }} [options]
 *   `caseSensitive` defaults to `false` (the essence/ingredient/tool sites); pass `true`
 *   for the case-sensitive salvage path.
 * @returns {boolean}
 */
export function matchComponentByName(item, component, { caseSensitive = false, systemId } = {}) {
  const matched = namesMatch(item?.name, component?.name, caseSensitive);
  if (matched) reportNameOnlyMatch({ item, component, systemId });
  return matched;
}

/**
 * Find the first component in `components` whose name matches the owned `item` by NAME,
 * WITHOUT emitting name-only telemetry — the pure list-aware primitive shared by
 * {@link findComponentByName} and the issue-600 owned-item re-stamp migration
 * (`planOwnedItemComponentRestamp`). The migration DETECTS name-only owned items so it can
 * back-fill their durable identity; firing the deprecation warn-once during that detection
 * pass would pollute the very issue-540 Phase 3 telemetry window that measures live runtime
 * reliance on the fallback. Sharing this exact `namesMatch` comparison guarantees the
 * migration selects precisely the items the runtime name-fallback would.
 *
 * @param {object|null} item - The owned item (reads `item.name`).
 * @param {Array<object>|null} components - The candidate component set of ONE system.
 * @param {{ caseSensitive?: boolean }} [options]
 * @returns {object|null} The first name-matching component, or null.
 */
export function findComponentByNameSilently(item, components, { caseSensitive = false } = {}) {
  const candidates = Array.isArray(components) ? components : [];
  return (
    candidates.find((component) => namesMatch(item?.name, component?.name, caseSensitive)) || null
  );
}

/**
 * Find the first component in `components` whose name matches the owned `item` by NAME —
 * the list-aware form of {@link matchComponentByName} used by essence resolution /
 * inventory listing. Fires warn-once telemetry for the matched component only. Callers
 * MUST reach this only after durable-identity + source-reference resolution failed.
 *
 * @param {object|null} item - The owned item (reads `item.name`).
 * @param {Array<object>|null} components - The candidate component set of ONE system.
 * @param {{ caseSensitive?: boolean, systemId?: string|null|undefined }} [options]
 * @returns {object|null} The first name-matching component, or null.
 */
export function findComponentByName(item, components, { caseSensitive = false, systemId } = {}) {
  const match = findComponentByNameSilently(item, components, { caseSensitive });
  if (match) reportNameOnlyMatch({ item, component: match, systemId });
  return match;
}
