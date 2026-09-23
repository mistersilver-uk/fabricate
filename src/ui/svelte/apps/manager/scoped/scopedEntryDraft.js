/**
 * The BUFFERED EDIT one world entry editor holds between two Saves (issue 1372, epic 1357); the
 * rules are `ui-world-scope/spec.md` `## Scoped entity editor patterns` requirement 14.
 */

/** Structural equality for an OPAQUE section value; `===` and key-ordered JSON both misreport. */
function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

/** A promise-ish, by the one property every caller here awaits; a store action may be sync. */
export function isThenable(value) {
  return typeof value?.then === 'function';
}

/**
 * The PERSISTED snapshot of one entry, in the shape a draft takes. A missing identity field
 * snapshots as `''` and a missing section as `null`, so "unset" is one value and a never-edited
 * editor never opens dirty. A section may name its own `readers[section]` (requirement 14, M34).
 */
export function scopedEntryBaseline(
  entry,
  { identityFields = [], sections = [], readers = {} } = {}
) {
  const identity = {};
  for (const field of identityFields) identity[field] = entry?.entity?.[field] ?? '';
  const defaults = {};
  for (const section of sections) {
    const read = readers?.[section];
    defaults[section] = (read ? read(entry) : entry?.defaults?.[section]) ?? null;
  }
  return { identity, defaults };
}

/** One identity field changed, as a NEW draft: mutating in place would report every edit as none. */
export function withScopedEntryIdentity(draft, field, value) {
  return {
    identity: { ...draft?.identity, [field]: value },
    defaults: { ...draft?.defaults },
  };
}

/** One world-default section changed, as a NEW draft; `null` clears the section. */
export function withScopedEntryDefault(draft, section, value) {
  return {
    identity: { ...draft?.identity },
    defaults: { ...draft?.defaults, [section]: value },
  };
}

/** The writes one Save performs: the identity patch — `null` when nothing differs — and sections. */
export function scopedEntryWrites(draft, persisted) {
  const patch = {};
  for (const [field, value] of Object.entries(draft?.identity ?? {})) {
    if (!sameValue(value, persisted?.identity?.[field] ?? '')) patch[field] = value;
  }
  const sections = [];
  for (const [section, value] of Object.entries(draft?.defaults ?? {})) {
    if (!sameValue(value, persisted?.defaults?.[section] ?? null)) sections.push({ section, value });
  }
  return { identity: Object.keys(patch).length > 0 ? patch : null, sections };
}

/** Whether this draft differs from disk, derived from the writes so the Save button agrees. */
export function scopedEntryDirty(draft, persisted) {
  if (!draft) return false;
  const writes = scopedEntryWrites(draft, persisted);
  return writes.identity !== null || writes.sections.length > 0;
}

/** The step name the flush reports for the identity patch, which is a step but not a SECTION. */
export const SCOPED_ENTRY_IDENTITY_STEP = 'identity';

/**
 * Flush a draft through one entity type's world-scope write family: the identity patch first,
 * then the sections in declared order, stopping at the first refusal. A REJECTION answers
 * `false` here too, reported through `onRefused` with the step that stopped and the steps that
 * had already landed — requirement 14 states why the two answers agree and the reporting differs.
 */
export async function flushScopedEntryDraft({
  entityId,
  writes,
  actions,
  writers = {},
  onRefused,
}) {
  if (!entityId) return false;
  const landed = [];
  let step = SCOPED_ENTRY_IDENTITY_STEP;
  try {
    if (writes.identity !== null) {
      const patched = await actions?.updateEntity?.(entityId, writes.identity);
      if (patched === false) return false;
      landed.push(step);
    }
    for (const { section, value } of writes.sections) {
      step = section;
      const write = writers?.[section];
      const written = write
        ? await write(actions, entityId, value)
        : await actions?.updateWorldDefaultSection?.(entityId, section, value);
      if (written === false) return false;
      landed.push(section);
    }
  } catch (error) {
    console.error('Fabricate | A scoped entry save was refused:', error);
    // The report may not re-reject the flush: `onRefused` is a public parameter, and a throw from
    // it inside this catch would escape the function whose contract is to answer `false`.
    try {
      onRefused?.({ step, error, landed });
    } catch (reportError) {
      console.error('Fabricate | A scoped entry save refusal could not be reported:', reportError);
    }
    return false;
  }
  return true;
}

/** Apply the manager's own `'save' | 'discard' | 'cancel'` exit answer; may navigation proceed? */
export function finishScopedEntryExit(action, { save, discard }) {
  if (action === 'cancel' || action === false) return false;
  if (action === 'save') {
    const saved = save();
    return isThenable(saved) ? saved.then((value) => value !== false) : saved !== false;
  }
  discard();
  return true;
}

