/**
 * Shared crafting-system label disambiguation (issue 346).
 *
 * Two crafting systems can carry the SAME display name, which makes every system
 * picker / list ambiguous: the GM cannot tell duplicates apart, and a picker that
 * silently defaults to the first entry can land on a tool-less / empty duplicate.
 *
 * This module is the single source of truth for two decisions so every picker and
 * the GM manager rail stay consistent (and DRY):
 *
 *   1. `buildSystemLabelMap` — given the full systems list, returns a label per
 *      system id, appending a short stable disambiguator (a system-id fragment)
 *      ONLY when another system shares the same display name. Unique names are
 *      left untouched so the common case stays uncluttered.
 *   2. `pickDefaultSystemId` — choose a sensible default for an auto-defaulting
 *      picker: prefer a system that actually has selectable sources over a blank
 *      first entry, so the "No sources in this system." footgun is unreachable
 *      purely because a same-named, source-bearing sibling sits unselected.
 *
 * The localized suffix format lives under `FABRICATE.System.Disambiguation.Suffix`;
 * `localize` returns the key unchanged when no translation is registered, so we
 * fall back to a plain English format.
 */
import { localize } from './foundryBridge.js';

const SUFFIX_KEY = 'FABRICATE.System.Disambiguation.Suffix';
const SUFFIX_FALLBACK = '{name} (id: {hint})';

// How many leading id characters form the disambiguator hint. A crafting-system
// id is a long random token, so a short prefix is enough to tell siblings apart
// while staying compact in a narrow picker.
const HINT_LENGTH = 8;

/**
 * The short, stable disambiguator hint for a system id (a leading id fragment).
 *
 * @param {string} id
 * @returns {string}
 */
function systemIdHint(id) {
  const value = String(id ?? '');
  return value.length > HINT_LENGTH ? value.slice(0, HINT_LENGTH) : value;
}

/**
 * The localized disambiguation label for a name + hint.
 *
 * @param {string} name
 * @param {string} hint
 * @returns {string}
 */
function formatDisambiguatedLabel(name, hint) {
  const translated = localize(SUFFIX_KEY);
  const format = translated && translated !== SUFFIX_KEY ? translated : SUFFIX_FALLBACK;
  return format.replace('{name}', name).replace('{hint}', hint);
}

/**
 * The display name for a system row, normalized to a non-empty string.
 *
 * @param {{ id?: unknown, name?: unknown }} system
 * @returns {string}
 */
function systemName(system) {
  const name = String(system?.name ?? '');
  return name.trim() ? name : String(system?.id ?? '');
}

/**
 * Build a `Map<id, label>` of display labels for a systems list, appending a
 * disambiguator only to systems whose display name collides with another system.
 *
 * @param {Array<{ id?: unknown, name?: unknown }>} systems
 * @returns {Map<string, string>}
 */
export function buildSystemLabelMap(systems) {
  const list = Array.isArray(systems) ? systems : [];

  // Count display-name occurrences (trimmed + case-insensitive) so we only
  // disambiguate genuine collisions.
  const nameCounts = new Map();
  for (const system of list) {
    const key = systemName(system).trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const labels = new Map();
  for (const system of list) {
    const id = String(system?.id ?? '');
    const name = systemName(system);
    const collisionKey = name.trim().toLowerCase();
    if ((nameCounts.get(collisionKey) ?? 0) > 1) {
      labels.set(id, formatDisambiguatedLabel(name, systemIdHint(id)));
    } else {
      labels.set(id, name);
    }
  }
  return labels;
}

/**
 * The display label for a single system, given a prebuilt label map (falls back
 * to the system's own name when the map has no entry).
 *
 * @param {{ id?: unknown, name?: unknown }} system
 * @param {Map<string, string>} labelMap
 * @returns {string}
 */
export function systemDisplayLabel(system, labelMap) {
  const id = String(system?.id ?? '');
  return labelMap?.get?.(id) ?? systemName(system);
}

/**
 * Choose a default system id for an auto-defaulting picker. Prefers the first
 * system for which `hasSources(id)` is true (so a tool-less / empty duplicate is
 * never silently selected over a source-bearing sibling), falling back to the
 * first system when none report sources (or no predicate is supplied).
 *
 * @param {Array<{ id?: unknown }>} systems
 * @param {(systemId: string) => boolean} [hasSources]
 * @returns {string}
 */
export function pickDefaultSystemId(systems, hasSources) {
  const list = Array.isArray(systems) ? systems : [];
  if (list.length === 0) return '';
  if (typeof hasSources === 'function') {
    const sourced = list.find((system) => hasSources(String(system?.id ?? '')));
    if (sourced) return String(sourced.id ?? '');
  }
  return String(list[0]?.id ?? '');
}
