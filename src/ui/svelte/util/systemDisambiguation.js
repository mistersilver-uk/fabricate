// Two crafting systems may carry the SAME display name, so every picker is ambiguous and one that
// defaults to the first entry can land on an empty duplicate (issue 346). One source of truth for
// both decisions: a disambiguator is appended ONLY on a genuine name collision, so the common case
// stays uncluttered, and the default prefers a system that actually has sources. `localize` returns
// the key unchanged with no translation registered, hence the English suffix fallback.
import { localize } from './foundryBridge.js';

const SUFFIX_KEY = 'FABRICATE.System.Disambiguation.Suffix';
const SUFFIX_FALLBACK = '{name} (id: {hint})';

// A crafting-system id is a long random token, so a short prefix tells siblings apart while
// staying compact in a narrow picker.
const HINT_LENGTH = 8;

function systemIdHint(id) {
  const value = String(id ?? '');
  return value.length > HINT_LENGTH ? value.slice(0, HINT_LENGTH) : value;
}

function formatDisambiguatedLabel(name, hint) {
  const translated = localize(SUFFIX_KEY);
  const format = translated && translated !== SUFFIX_KEY ? translated : SUFFIX_FALLBACK;
  return format.replace('{name}', name).replace('{hint}', hint);
}

function systemName(system) {
  const name = String(system?.name ?? '');
  return name.trim() ? name : String(system?.id ?? '');
}

export function buildSystemLabelMap(systems) {
  const list = Array.isArray(systems) ? systems : [];

  // Trimmed and case-insensitive, so only a genuine collision is disambiguated.
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

export function systemDisplayLabel(system, labelMap) {
  const id = String(system?.id ?? '');
  return labelMap?.get?.(id) ?? systemName(system);
}

// Prefers the first system reporting sources, so an empty duplicate is never silently selected over
// a source-bearing sibling; falls back to the first when none report any.
export function pickDefaultSystemId(systems, hasSources) {
  const list = Array.isArray(systems) ? systems : [];
  if (list.length === 0) return '';
  if (typeof hasSources === 'function') {
    const sourced = list.find((system) => hasSources(String(system?.id ?? '')));
    if (sourced) return String(sourced.id ?? '');
  }
  return String(list[0]?.id ?? '');
}
