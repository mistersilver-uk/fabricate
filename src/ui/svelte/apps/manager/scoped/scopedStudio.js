/**
 * The pure presentation model behind the six scoped-entity editors (issue 1362, epic 1357).
 *
 * The sibling of `essences/essenceStudio.js` and `tools/toolStudio.js`: it decides nothing
 * about persistence and reads no Foundry global. What it owns is the mapping from the SCOPE
 * DESCRIPTOR - which sections an entity has, whether it can be enabled, whether it carries
 * world tags - onto the copy and the row set the shared patterns render.
 *
 * ## A component has ONE section, and the row set is derived rather than listed
 *
 * `COMPONENT_SECTIONS` is `['category']`; essences have two; tools have two, plus the seeded
 * `repairRequirements` that is NOT a section and gets no switch. Every row set here comes
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
});

/**
 * The label one section renders under, localized through the caller's `text` resolver.
 *
 * EXPORTED so a catalogue's per-section `inheritCounts` are labelled from the ONE list rather
 * than a restated five (issue 1380). `SECTION_COPY` stays module-private: what a caller needs
 * is the resolved label for a section it already holds, not the table — and handing out the
 * table is how a second copy of these five strings gets written, which is the mirror rot the
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
