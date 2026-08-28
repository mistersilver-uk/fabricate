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

import { WORLD_SCOPE_DESCRIPTORS } from '../../../stores/worldScopeProjection.js';

/**
 * The world-default sections that are SEEDED onto a membership record rather than inherited,
 * per entity type. A seeded section renders no inherit row.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const SCOPED_SEEDED_SECTIONS = Object.freeze({
  component: Object.freeze([]),
  essence: Object.freeze([]),
  tool: Object.freeze(['repairRequirements']),
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
    const copy = SECTION_COPY[section] ?? { key: '', label: section };
    const isInherited = inherited?.[section] !== false;
    return {
      section,
      label: copy.key ? text(copy.key, copy.label) : copy.label,
      inherited: isInherited,
      note: notes?.[section] ?? '',
      stateLabel: isInherited
        ? text('FABRICATE.Admin.Manager.Scoped.Inherit.StateInherited', 'Inherited')
        : text('FABRICATE.Admin.Manager.Scoped.Inherit.StateOverridden', 'Overridden'),
    };
  });
}
