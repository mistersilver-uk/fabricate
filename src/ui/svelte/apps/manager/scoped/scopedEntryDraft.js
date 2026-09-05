/**
 * The BUFFERED EDIT one world scoped-entity entry editor holds between two Saves (issue 1372,
 * epic 1357).
 *
 * The three world entry editors — component, essence and tool — persisted every keystroke and
 * every drop through `worldScopeActions` on change, and so had no Save action at all. The
 * prototype heads each of them with `← Back` and `Save essence` (`essEntry.png`), and
 * `design-system/spec.md`'s EDITOR recipe orders "the action pair with back before save", so the
 * screens change to match: an edit accumulates locally, `Save` flushes it, and leaving with an
 * unflushed edit prompts rather than silently dropping it.
 *
 * ## WHY THIS IS A MODULE AND NOT THREE COPIES
 *
 * The essence entry ships this first and the tool entry takes it next. A draft is a SHAPE — which
 * identity fields it buffers, which world-default sections it buffers, and what counts as a
 * difference from disk — and the same shape reached by two independent implementations is how a
 * persisted record and the screens that write it drift apart. The one place the two screens differ
 * is their FIELD LIST, so that is the argument, not a branch.
 *
 * ## IT IMPORTS NOTHING, DELIBERATELY
 *
 * The same reason `scopedEntryRoutes.js` and `essenceScoped.js` state for themselves: the
 * manager's compiled module graph is copied file-by-file into hand-rolled mounted test trees, and
 * an omission there does not fail — it HANGS, reported as `# cancelled`. It is also why nothing in
 * here reaches for a Foundry global, a store singleton or a Svelte rune: a caller owns the
 * reactive state and hands values in.
 *
 * ## DIRTINESS IS MEASURED AGAINST DISK, NOT AGAINST THE SEED
 *
 * Every function here takes the PERSISTED snapshot as its second argument, recomputed by the
 * caller from the live projection, rather than a baseline frozen when the editor opened. That is
 * what makes a successful Save clear the dirty flag with no second signal: the projection
 * republishes, the persisted snapshot becomes the draft, and the difference is empty. A frozen
 * baseline would keep reporting dirty forever after the first Save, and a caller would have to
 * re-seed the draft from a publish that may not have landed yet — which is the same race that
 * would overwrite the GM's next keystroke.
 *
 * It is also why {@link scopedEntryWrites} answers only the keys that DIFFER: a Save writes the
 * fields the GM actually changed rather than restating the whole record over whatever another
 * client wrote in the meantime.
 *
 * ## WHAT A DRAFT DELIBERATELY DOES NOT BUFFER
 *
 * MEMBERSHIP is not in here. Adding an entity to a crafting system, removing it, and switching it
 * on or off are actions on a DIFFERENT record — a System Membership Record — each with its own
 * armed confirmation and its own immediate consequence in another system's rules. Staging them
 * behind this screen's Save would mean an armed `Remove` that removed nothing until a later
 * button, which is the opposite of what arming an action says.
 *
 * DELETING the world entity is not in here either, for the same reason and a sharper one: it ends
 * the record the draft is about.
 */

/**
 * Structural equality, for a world-default section value that may be a bare string OR an
 * `{id, name}` pair.
 *
 * A section value is stored OPAQUELY by design — `updateWorldDefaultSection` writes whatever it is
 * handed and the normalizer coerces shape rather than meaning — so `===` answers "different" for
 * two publishes of the same authored value, and every reload would open the editor dirty.
 * `JSON.stringify` is not the answer either: it is key-order sensitive, and the two sides here come
 * from different places (a store round-trip and a live edit) with no ordering guarantee between
 * them.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

/**
 * A promise-ish, by the one property every caller here awaits.
 *
 * `instanceof Promise` is wrong for a thenable returned across a realm boundary, and a store
 * action is free to answer synchronously; both shapes reach these guards.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isThenable(value) {
  return typeof value?.then === 'function';
}

/**
 * The PERSISTED snapshot of one entry, in the shape a draft takes.
 *
 * `identityFields` and `sections` are the caller's, because the two screens buffer different sets
 * and a branch on entity type inside here would be a third statement of a fact the scope
 * descriptor already owns.
 *
 * An identity field the record does not carry snapshots as `''` rather than `undefined`, because
 * that is what the control bound to it renders and what the GM sees when they open the editor: an
 * absent description and an empty one are the same authored state on this screen, and treating
 * them as different would open a never-edited editor dirty.
 *
 * A section the world defaults do not carry snapshots as `null`, which is the value
 * `updateWorldDefaultSection` is given to CLEAR one — so "unset" is one value here, not two.
 *
 * ## A SECTION MAY NAME ITS OWN READER AND WRITER (issue 1371 r18-entry, maintainer ruling M34)
 *
 * "Every component edit on the world entry stages and lands on `Save entry`" — and two of the
 * entry's edits are not world-default sections: its tags land through `setWorldTags` and its
 * aliases through `updateEntity`'s `aliasItemUuids`, off the entity record. Rather than a second
 * draft beside this one (two dirty flags, two saves, two guards — the shape this module exists to
 * end), a shape may hand a `readers[section]` for where the persisted value lives and the flush a
 * `writers[section]` for how it lands. A section naming neither keeps the world-default reading
 * and writing it always had, so the essence and tool entries are unchanged by construction.
 *
 * @param {{entity?: object, defaults?: object}|null|undefined} entry a projected entry.
 * @param {{identityFields?: readonly string[], sections?: readonly string[],
 *   readers?: Record<string, (entry: object|null|undefined) => unknown>}} shape
 * @returns {{identity: Record<string, unknown>, defaults: Record<string, unknown>}}
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

/**
 * One identity field, changed — as a NEW draft object.
 *
 * NEW, never mutated in place, and the reason is that this module's OWN answers depend on it:
 * {@link scopedEntryWrites} is handed the draft and the persisted snapshot as two values, so a
 * wither that mutated its argument would, at the one call site that seeds a draft FROM that
 * snapshot, make the two the same object and report every edit as no change. It also keeps the
 * draft a plain value the moment it leaves a component — a Svelte 5 `$state` proxy makes an
 * in-place write reactive, but the manager shell holds this draft through a handle rather than a
 * rune, and there it is an ordinary object with no such guarantee.
 *
 * @param {{identity: object, defaults: object}} draft
 * @param {string} field
 * @param {unknown} value
 * @returns {{identity: object, defaults: object}}
 */
export function withScopedEntryIdentity(draft, field, value) {
  return {
    identity: { ...draft?.identity, [field]: value },
    defaults: { ...draft?.defaults },
  };
}

/**
 * One world-default section, changed — as a NEW draft object. See
 * {@link withScopedEntryIdentity} for why it is new rather than mutated.
 *
 * @param {{identity: object, defaults: object}} draft
 * @param {string} section
 * @param {unknown} value the section value, or `null` to clear it.
 * @returns {{identity: object, defaults: object}}
 */
export function withScopedEntryDefault(draft, section, value) {
  return {
    identity: { ...draft?.identity },
    defaults: { ...draft?.defaults, [section]: value },
  };
}

/**
 * The writes one Save performs: the identity patch and the changed sections, and NOTHING else.
 *
 * `identity` is `null` when no identity field differs, so a Save that only re-pointed a world
 * default does not re-send the name, the icon and the description over whatever another client
 * wrote to them while this editor was open.
 *
 * @param {{identity: object, defaults: object}|null} draft
 * @param {{identity: object, defaults: object}} persisted
 * @returns {{identity: Record<string, unknown>|null, sections: Array<{section: string, value: unknown}>}}
 */
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

/**
 * Whether this draft differs from what is on disk.
 *
 * Derived from {@link scopedEntryWrites} rather than computed beside it, so "the Save button is
 * enabled" and "the Save button has something to write" are one answer. A draft the caller has not
 * seeded yet (`null`) is never dirty.
 *
 * @param {{identity: object, defaults: object}|null} draft
 * @param {{identity: object, defaults: object}} persisted
 * @returns {boolean}
 */
export function scopedEntryDirty(draft, persisted) {
  if (!draft) return false;
  const writes = scopedEntryWrites(draft, persisted);
  return writes.identity !== null || writes.sections.length > 0;
}

/**
 * Flush a draft through one entity type's world-scope write family.
 *
 * The identity patch lands FIRST and the sections after it, in the order the scope descriptor
 * declares them, because `updateEntity` refuses an entity id the roster does not hold and
 * `updateWorldDefaultSection` refuses one too — so a record deleted from under the editor fails
 * the whole Save at its first write rather than half-writing it.
 *
 * Every action here answers `false` to REFUSE, so a refusal at any step answers `false` from
 * here — which is what the route-exit guard gates navigation on. A GM whose Save did not land
 * stays on the screen with the edit still in front of them.
 *
 * A section with a `writers[section]` lands through it instead (M34, see
 * {@link scopedEntryBaseline}); the writer is handed the action family, the entity id and the
 * staged value, and answers `false` to refuse exactly as the family's own verbs do.
 *
 * @param {object} options
 * @param {string} options.entityId
 * @param {{identity: Record<string, unknown>|null, sections: Array<{section: string, value: unknown}>}} options.writes
 * @param {object|null} options.actions the entity type's world-scope action family.
 * @param {Record<string, (actions: object|null, entityId: string, value: unknown) => unknown>} [options.writers]
 * @returns {Promise<boolean>} whether every write landed.
 */
export async function flushScopedEntryDraft({ entityId, writes, actions, writers = {} }) {
  if (!entityId) return false;
  if (writes.identity !== null) {
    const patched = await actions?.updateEntity?.(entityId, writes.identity);
    if (patched === false) return false;
  }
  for (const { section, value } of writes.sections) {
    const write = writers?.[section];
    const written = write
      ? await write(actions, entityId, value)
      : await actions?.updateWorldDefaultSection?.(entityId, section, value);
    if (written === false) return false;
  }
  return true;
}

/**
 * Apply the three-way route-exit answer, and say whether navigation may proceed.
 *
 * The vocabulary is the manager's own — `'save' | 'discard' | 'cancel'`, plus the boolean pair the
 * two-way fallback prompt answers with — so this reads exactly like the eight `finish*RouteExit`
 * functions already in the shell and can be substituted for none of them by accident.
 *
 * @param {'save'|'discard'|'cancel'|boolean} action
 * @param {{save: () => unknown, discard: () => unknown}} handlers
 * @returns {boolean|Promise<boolean>}
 */
export function finishScopedEntryExit(action, { save, discard }) {
  if (action === 'cancel' || action === false) return false;
  if (action === 'save') {
    const saved = save();
    return isThenable(saved) ? saved.then((value) => value !== false) : saved !== false;
  }
  discard();
  return true;
}

/**
 * The unsaved-changes guard for one scoped entry editor.
 *
 * SYNCHRONOUSLY `true` when there is nothing to ask, and that is load-bearing rather than an
 * optimization: the shell's route-exit cascade preserves the promise identity of whatever it is
 * handed, and a guard that answered a resolved promise on the clean path would put EVERY route
 * activation in the manager one microtask later.
 *
 * `confirm` is the caller's, so the essence editor and the tool editor each name their own record
 * in the prompt through the shared three-way dialog rather than sharing one noun-free sentence.
 *
 * @param {object} options
 * @param {boolean} options.dirty
 * @param {() => 'save'|'discard'|'cancel'|boolean|Promise<'save'|'discard'|'cancel'|boolean>} options.confirm
 * @param {() => unknown} options.save
 * @param {() => unknown} options.discard
 * @returns {boolean|Promise<boolean>}
 */
export function confirmScopedEntryExit({ dirty, confirm, save, discard }) {
  if (dirty !== true) return true;
  const answer = confirm();
  if (isThenable(answer)) {
    return answer.then((action) => finishScopedEntryExit(action, { save, discard }));
  }
  return finishScopedEntryExit(answer, { save, discard });
}
