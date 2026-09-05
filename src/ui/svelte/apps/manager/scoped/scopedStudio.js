/**
 * The pure presentation model behind the six scoped-entity editors (issue 1362, epic 1357).
 *
 * The sibling of `essences/essenceStudio.js` and `tools/toolStudio.js`: it decides nothing
 * about persistence and reads no Foundry global. What it owns is the mapping from the SCOPE
 * DESCRIPTOR - which sections an entity has, whether it can be enabled, whether it carries
 * world tags - onto the copy and the row set the shared patterns render.
 *
 * ## A component has TWO sections, and the row set is derived rather than listed
 *
 * `COMPONENT_SECTIONS` is `['category', 'essences']` since `1.32.0` (issue 1371 r18, maintainer
 * ruling M31); essences have two; tools have FOUR since `1.31.0`
 * (`breakage`, `onBreak`, `prerequisites`, `bonus`), plus the seeded `repairRequirements` that is
 * NOT a section and gets no switch. Every row set here comes
 * from `WORLD_SCOPE_DESCRIPTORS[entityType].sections`, so a screen cannot draw a switch for a
 * field the resolver does not read through - the failure that produces is an inherit toggle
 * whose write `normalizeMembership` discards on the next `load()`.
 *
 * ## A SEEDED section renders no row
 *
 * A seeded section is copied once and then diverges: there is no live parent to fall back
 * to, so a switch over it would be a lie the editor would then have to hide. They are named
 * per entity type here rather than inferred, because absence from `sections` is also how an
 * ordinary unknown key looks.
 *
 * ## The copy says "fall back", never "discard"
 *
 * Re-inheriting RETAINS the dormant local override (`setSectionInheritance`), so nothing is
 * lost, no confirmation is required, and the note has to say what WILL be used rather than
 * what would be thrown away.
 */

import { TOOL_SEEDED_SECTIONS } from '../../../../../systems/toolScope.js';
import { WORLD_SCOPE_DESCRIPTORS } from '../../../stores/worldScopeProjection.js';

/**
 * The world-default sections that are SEEDED onto a membership record rather than inherited,
 * per entity type. A seeded section renders no inherit row.
 *
 * THE TOOL LIST IS IMPORTED, NEVER RESTATED. `toolScope.js` already exports
 * `TOOL_SEEDED_SECTIONS`, and a second copy of it here is the mirror-rot this repository
 * guards against everywhere else: rename the section there and this copy goes on filtering a
 * name nothing declares, silently.
 *
 * It is also INERT TODAY, and saying so is the point. `TOOL_SECTIONS` does not carry
 * `repairRequirements` — the resolver never reads through it — so subtracting it from the
 * descriptor's sections removes nothing. That makes "a seeded section renders no row" an
 * assertion satisfied by an EMPTY filter, so the suite proves it against this constant
 * directly rather than against the rendered row set alone.
 *
 * BE CLEAR ABOUT WHAT THAT LEAVES UNCOVERED: the SUBTRACTION IN `inheritableSections` IS
 * UNEXERCISED. Replacing its body with `return [...descriptor.sections]` leaves every suite in
 * this repository green, because no entity type today declares a section that is also seeded.
 * The constant is pinned and the intent is written down; the filter itself is guarded by
 * nothing, and the first entity type whose seeded list intersects its sections is what will
 * exercise it. Recorded rather than left for a later reader to mistake for coverage.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const SCOPED_SEEDED_SECTIONS = Object.freeze({
  component: Object.freeze([]),
  essence: Object.freeze([]),
  tool: TOOL_SEEDED_SECTIONS,
});

/**
 * Per-section copy: the row label and the lang key it is localized under.
 *
 * @type {Readonly<Record<string, {key: string, label: string}>>}
 */
const SECTION_COPY = Object.freeze({
  category: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Category',
    label: 'Category',
  }),
  // issue 1371 r18-entry, maintainer ruling M31: the component's second section.
  essences: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Essences',
    label: 'Essence values',
  }),
  effectSource: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.EffectSource',
    label: 'Effect source',
  }),
  macro: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Macro',
    label: 'Property macro',
  }),
  breakage: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Breakage',
    label: 'Breakage',
  }),
  onBreak: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.OnBreak',
    label: 'On break',
  }),
  prerequisites: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Prerequisites',
    label: 'Prerequisites',
  }),
  bonus: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Sections.Bonus',
    label: 'Check bonus',
  }),
});

/**
 * The label one section renders under, localized through the caller's `text` resolver.
 *
 * EXPORTED so a catalogue's per-section `inheritCounts` are labelled from the ONE list rather
 * than a restated set (issue 1380). `SECTION_COPY` stays module-private: what a caller needs
 * is the resolved label for a section it already holds, not the table — and handing out the
 * table is how a second copy of these strings gets written, which is the mirror rot the
 * seeded-section note above guards against for its own list.
 *
 * An unknown section falls back to its own key rather than an empty string, so a section added
 * to a scope before its copy lands renders its name instead of a blank cell.
 *
 * @param {string} section
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function scopedSectionLabel(section, text) {
  const copy = SECTION_COPY[section];
  if (!copy) return section;
  return text(copy.key, copy.label);
}

// ── issue 1371 r20-entry3: the refused-save sentence, hoisted off the three entry pages ────────

/**
 * Per-step SENTENCE FRAGMENTS for the refused-save report, keyed exactly as {@link SECTION_COPY}
 * is — plus the two ENTRY-LEVEL steps a component's Save stages that are not world-default
 * sections (M34): its world tags land through `setWorldTags` and its import aliases through
 * `updateEntity`, so neither has an inherit row and neither belongs in `SECTION_COPY`.
 *
 * WHY A SECOND FORM OF THE SAME NAMES, AND WHY IT IS STILL ONE HOME. `scopedSectionLabel` answers
 * the TITLE a section renders under — `Category`, `Essence values` — which is right for an inherit
 * row, a filter chip or a card heading, and wrong inside `Saving {section} did not complete.`. A
 * translation has to be free to inflect the fragment for that sentence, so the two forms are
 * genuinely different strings. What must not happen is a fragment set sitting in a PAGE:
 * `WorldComponentEntryPage.svelte` carried one until r20 while its two siblings called
 * `scopedSectionLabel` for the same sections, which is the divergence this module exists to
 * prevent (Foundry review round 6 finding 6). Both forms live here, keyed alike, and
 * `tests/scoped-entry-draft.test.js` asserts every section a scope descriptor declares has one.
 *
 * @type {Readonly<Record<string, {key: string, label: string}>>}
 */
const SAVE_STEP_FRAGMENT = Object.freeze({
  category: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepCategory',
    label: 'the world category',
  }),
  essences: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepEssences',
    label: 'the world essence values',
  }),
  tags: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepTags',
    label: 'the world tags',
  }),
  aliases: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepAliases',
    label: 'the import aliases',
  }),
  effectSource: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepEffectSource',
    label: 'the active effect source',
  }),
  macro: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepMacro',
    label: 'the macro on craft',
  }),
  breakage: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepBreakage',
    label: 'the breakage settings',
  }),
  onBreak: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepOnBreak',
    label: 'what happens on break',
  }),
  prerequisites: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepPrerequisites',
    label: 'the prerequisites',
  }),
  bonus: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepBonus',
    label: 'the check bonus',
  }),
});

/**
 * The identity PATCH's fragment, per entity type, because it is the one step of a Save that is
 * not a section and the three editors buffer DIFFERENT field sets: the component lifts
 * `name`/`img`/`description`, the essence adds its icon and colour token, and the tool buffers
 * its name alone. A GM told "the name, icon, colour and description did not save" on a screen
 * that never buffered a colour has been told something false.
 *
 * ── THE FRAGMENTS CARRY NO COMMAS (issue 1371 r21-store4, the UX designer's round-7 note) ────
 * Every fragment is an ITEM in a list the sentence below joins, so a fragment that is itself a
 * comma-separated list makes the join unreadable: "the name, art and description, the world
 * category had already been saved" reads as three or four things, and the reader cannot see
 * where one landed step ends and the next begins. The two enumerating labels are therefore
 * stated as the FIELD SET rather than the field list; the per-type keys stay, so a translation
 * may still differentiate, and the tool's "the name" is already a single item and is unchanged.
 * That also keeps the property the enumeration existed for: naming no field cannot name one the
 * screen never buffered.
 *
 * @type {Readonly<Record<string, {key: string, label: string}>>}
 */
const SAVE_IDENTITY_FRAGMENT = Object.freeze({
  component: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepComponentIdentity',
    label: 'the shared identity fields',
  }),
  essence: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepEssenceIdentity',
    label: 'the shared identity fields',
  }),
  tool: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Scoped.Save.StepToolIdentity',
    label: 'the name',
  }),
});

/**
 * Join the landed steps as a LIST, in the GM's own language.
 *
 * `Intl.ListFormat` is the one localization decision this module makes, and it is here rather
 * than at the three callers because what they supply is `format` — a key/fallback interpolator
 * that receives an already-joined string and cannot see the items. A bare `', '` join said
 * "a, b" where every language this ships in says "a and b", and the sentence reads as a run-on
 * the moment there is more than one landed step.
 *
 * THE LANGUAGE IS FOUNDRY'S, NOT THE RUNTIME'S. `game.i18n.lang` is the setting a GM chose;
 * `Intl`'s default is the browser's, which is routinely a different one. It is REFERENCED
 * through `globalThis` and optional-chained, never imported, so this module still runs in a
 * hand-rolled mounted tree with no `game` at all.
 *
 * THE FALLBACK IS THE ENGLISH SHAPE rather than the comma join it replaces, so a runtime with
 * no `Intl.ListFormat` degrades to a readable sentence instead of the defect this closes.
 *
 * @param {string[]} items already-localized fragments.
 * @returns {string}
 */
function joinLandedSteps(items) {
  if (items.length < 2) return items[0] ?? '';
  let lang;
  try {
    lang = globalThis.game?.i18n?.lang;
  } catch {
    lang = undefined;
  }
  try {
    return new Intl.ListFormat(lang || 'en', { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
  }
}

/**
 * Every step name a refused Save can report a fragment for, for the mirror guard that keeps this
 * table level with the scope descriptors.
 *
 * @type {readonly string[]}
 */
export const SCOPED_SAVE_STEP_FRAGMENTS = Object.freeze(Object.keys(SAVE_STEP_FRAGMENT));

/**
 * The sentence a REFUSED scoped-entry Save puts in front of the GM, posted through the caller's
 * own notifier — and it is a second, DIFFERENT statement rather than an echo of Foundry's.
 *
 * Foundry toasts a refused world-setting write's own `error.message` verbatim before it rejects,
 * so a catch that re-posted that message would put one sentence on screen twice. This one says
 * what Foundry's cannot: WHICH step of the staged sequence stopped it, and — the half that
 * matters under M34 — which steps had already landed durably, because the store publishes its
 * cache before awaiting the write and every open manager surface shows them as saved until a
 * reload. Same shape as `adminStore`'s membership failure sentences: localized, with an English
 * floor that cannot be a raw key, and the reason carried as `{error}` so a translation can state
 * it too.
 *
 * THE THREE ENTRY EDITORS SHARE IT (issue 1371 r20-entry3; Foundry review round 6 findings 4 and
 * 6). The component entry composed this alone while the essence and tool entries passed no
 * `onRefused` at all, so a rejection at write *k* on either sibling left `1..k-1` landed durably
 * with the GM's only signal being Foundry's raw message — and both stage MULTI-SECTION sequences.
 *
 * `notify` and `format` are the caller's, so this module still posts no toast and localizes
 * nothing itself, exactly as its header says. `identityStep` is the caller's too, taken from
 * `scopedEntryDraft.js`'s exported constant rather than imported here: `scopedStudio.js` is in
 * every hand-rolled mounted tree and `scopedEntryDraft.js` is in only some of them, and a module
 * a tree omits does not fail the suite — it HANGS it.
 *
 * @param {object} options
 * @param {{step: string, error: unknown, landed: string[]}} options.refusal what the flush reported.
 * @param {string} options.entityType `component`, `essence` or `tool`.
 * @param {string} options.identityStep `SCOPED_ENTRY_IDENTITY_STEP`, from `scopedEntryDraft.js`.
 * @param {(key: string, fallback: string, data: object) => string} options.format the page's own
 *   localizing formatter.
 * @param {(message: string) => void} options.notify the page's own error notifier.
 * @returns {void}
 */
export function reportRefusedScopedEntrySave({
  refusal,
  entityType,
  identityStep,
  format,
  notify,
}) {
  const { step, error, landed = [] } = refusal ?? {};
  const named = (name) => {
    const copy =
      name === identityStep ? SAVE_IDENTITY_FRAGMENT[entityType] : SAVE_STEP_FRAGMENT[name];
    return copy ? format(copy.key, copy.label, {}) : name;
  };
  const data = {
    section: named(step),
    landed: joinLandedSteps(landed.map(named)),
    error: error?.message ? String(error.message) : '',
  };
  notify(
    format(
      landed.length > 0
        ? 'FABRICATE.Admin.Manager.Scoped.Save.FailedAfter'
        : 'FABRICATE.Admin.Manager.Scoped.Save.Failed',
      landed.length > 0
        ? 'Saving {section} did not complete; {landed} had already been saved. {error}'
        : 'Saving {section} did not complete. {error}',
      data
    ).trim()
  );
}

/**
 * The scope descriptor for one entity type, or `null`.
 *
 * @param {string} entityType
 * @returns {Readonly<object>|null}
 */
export function scopedDescriptor(entityType) {
  return WORLD_SCOPE_DESCRIPTORS[entityType] ?? null;
}

/**
 * The sections that render an inherit row: the descriptor's sections, minus the seeded ones.
 *
 * @param {string} entityType
 * @returns {string[]}
 */
export function inheritableSections(entityType) {
  const descriptor = scopedDescriptor(entityType);
  if (!descriptor) return [];
  const seeded = new Set(SCOPED_SEEDED_SECTIONS[entityType]);
  return descriptor.sections.filter((section) => !seeded.has(section));
}

/**
 * Whether this entity type renders an enabled switch at all.
 *
 * STRUCTURAL. A component membership record carries no `enabled` flag, so the component path
 * must not render the control - answering `false` here is not the same as rendering a switch
 * that is off.
 *
 * @param {string} entityType
 * @returns {boolean}
 */
export function scopedEnableable(entityType) {
  return scopedDescriptor(entityType)?.enableable === true;
}

/**
 * Whether this entity type carries world tags with per-tag muting.
 *
 * @param {string} entityType
 * @returns {boolean}
 */
export function scopedTaggable(entityType) {
  return scopedDescriptor(entityType)?.taggable === true;
}

/**
 * The inherit rows for one membership record.
 *
 * @param {object} options
 * @param {string} options.entityType
 * @param {{[section: string]: boolean}} [options.inherited] The record's per-section switches.
 * @param {{[section: string]: string}} [options.notes] The one-line summary of the value each
 *   section resolves to, supplied by the calling editor - this module never reads a value.
 * @param {(key: string, fallback: string) => string} options.text
 * @returns {Array<{section: string, label: string, inherited: boolean, note: string,
 *   stateLabel: string}>}
 */
export function scopedInheritRows({ entityType, inherited = {}, notes = {}, text }) {
  return inheritableSections(entityType).map((section) => {
    const isInherited = inherited?.[section] !== false;
    return {
      section,
      label: scopedSectionLabel(section, text),
      inherited: isInherited,
      note: notes?.[section] ?? '',
      stateLabel: isInherited
        ? text('FABRICATE.Admin.Manager.Scoped.Inherit.StateInherited', 'Inherited')
        : text('FABRICATE.Admin.Manager.Scoped.Inherit.StateOverridden', 'Overridden'),
    };
  });
}
