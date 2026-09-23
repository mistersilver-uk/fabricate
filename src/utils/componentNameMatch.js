/**
 * The single shared home for Fabricate's NAME-FALLBACK component matching: the last-resort tier,
 * reached only once every durable link and source reference has missed. One primitive parameterised
 * on case-sensitivity, so the four historical call sites keep their exact prior semantics. Name
 * matching is inherently unsafe and its removal is issue 540, so every hit routes through
 * {@link reportNameOnlyMatch} to measure real reliance. The list-aware form reads
 * `definitionIndex.js`, which keeps the exact-name and case-folded maps SEPARATE on purpose.
 */

import { findByName, getDefinitionIndex } from './definitionIndex.js';

/** The raw name comparison, parameterized on case-sensitivity. */
function namesMatch(itemName, candidateName, caseSensitive) {
  if (!itemName || !candidateName) return false;
  if (caseSensitive) return itemName === candidateName;
  return String(itemName).toLowerCase() === String(candidateName).toLowerCase();
}

// Warn-once telemetry state.
const _nameOnlyMatchWarned = new Set();

/** Clear the warn-once name-only-match telemetry state. */
export function resetNameOnlyMatchTelemetry() {
  _nameOnlyMatchWarned.clear();
}

/**
 * Emit a warn-once, deduped console notice that an owned item resolved to a component (or tool)
 * **by name only** — i.e. durable identity and source references had already missed and only the
 * display name matched.
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
 * Whether an owned `item` matches a single `component`/tool-like definition by NAME — the shared
 * name-fallback primitive.
 */
export function matchComponentByName(item, component, { caseSensitive = false, systemId } = {}) {
  const matched = namesMatch(item?.name, component?.name, caseSensitive);
  if (matched) reportNameOnlyMatch({ item, component, systemId });
  return matched;
}

/**
 * Find the first component in `components` whose name matches the owned `item` by NAME, WITHOUT
 * emitting name-only telemetry — the pure list-aware primitive shared by {@link
 * findComponentByName} and the issue-600 owned-item re-stamp migration
 */
export function findComponentByNameSilently(item, components, { caseSensitive = false } = {}) {
  return findByName(getDefinitionIndex(components), item?.name, caseSensitive);
}

/**
 * Find the first component in `components` whose name matches the owned `item` by NAME — the
 * list-aware form of {@link matchComponentByName} used by essence resolution / inventory listing.
 */
export function findComponentByName(item, components, { caseSensitive = false, systemId } = {}) {
  const match = findComponentByNameSilently(item, components, { caseSensitive });
  if (match) reportNameOnlyMatch({ item, component: match, systemId });
  return match;
}
