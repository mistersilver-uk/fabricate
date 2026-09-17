/**
 * The pure presentation model behind the six scoped-entity editors (issue 1362, epic 1357): the
 * map from `WORLD_SCOPE_DESCRIPTORS[entityType]` onto the copy and rows the shared patterns draw.
 */

import { TOOL_SEEDED_SECTIONS } from '../../../../../systems/toolScope.js';
import { WORLD_SCOPE_DESCRIPTORS } from '../../../stores/worldScopeProjection.js';

/**
 * The world-default sections SEEDED onto a membership record rather than inherited; a seeded
 * section renders no inherit row, and the tool list is IMPORTED rather than restated. The
 * subtraction in `inheritableSections` is UNEXERCISED today — no entity type declares a section
 * that is also seeded — so the suite pins this constant directly, not the rendered row set.
 */
export const SCOPED_SEEDED_SECTIONS = Object.freeze({
  component: Object.freeze([]),
  essence: Object.freeze([]),
  tool: TOOL_SEEDED_SECTIONS,
});

/** Per-section copy: the row label and the lang key it is localized under. */
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
 * The label one section renders under. EXPORTED so a catalogue's counts read the ONE list (issue
 * 1380); the table stays private, and an unknown section falls back to its key, not a blank cell.
 */
export function scopedSectionLabel(section, text) {
  const copy = SECTION_COPY[section];
  if (!copy) return section;
  return text(copy.key, copy.label);
}

/**
 * Per-step SENTENCE FRAGMENTS for the refused-save report, keyed as {@link SECTION_COPY} is, plus
 * the two entry-level steps a component's Save stages that are not sections (M34). A fragment
 * inflects inside a sentence and a title does not, so both forms live here and are keyed alike.
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
 * The identity PATCH's fragment, per entity type: the one Save step that is not a section, and
 * the three editors buffer different field sets. The fragments carry NO COMMAS — each is an item
 * in a joined list — so the enumerating labels state the FIELD SET rather than the field list.
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
 * Join the landed steps as a LIST, in the GM's own language: the callers supply an interpolator
 * that cannot see the items. The language is FOUNDRY's, read off `globalThis` and never imported,
 * and the fallback is the English shape rather than the comma join it replaces.
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

/** Every step name a refused Save can report, for the guard keeping this table level. */
export const SCOPED_SAVE_STEP_FRAGMENTS = Object.freeze(Object.keys(SAVE_STEP_FRAGMENT));

/**
 * The sentence a REFUSED scoped-entry Save puts in front of the GM, through the caller's notifier:
 * a second, DIFFERENT statement from Foundry's own toast, naming which step stopped and which had
 * already landed durably. `identityStep` is passed in rather than imported, because
 * `scopedEntryDraft.js` is absent from some hand-rolled mounted trees.
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

/** The scope descriptor for one entity type, or `null`. */
export function scopedDescriptor(entityType) {
  return WORLD_SCOPE_DESCRIPTORS[entityType] ?? null;
}

/** The sections that render an inherit row: the descriptor's sections, minus the seeded ones. */
export function inheritableSections(entityType) {
  const descriptor = scopedDescriptor(entityType);
  if (!descriptor) return [];
  const seeded = new Set(SCOPED_SEEDED_SECTIONS[entityType]);
  return descriptor.sections.filter((section) => !seeded.has(section));
}

/** Whether this type renders an enabled switch at all — STRUCTURAL, not a switch that is off. */
export function scopedEnableable(entityType) {
  return scopedDescriptor(entityType)?.enableable === true;
}

/** Whether this entity type carries world tags with per-tag muting. */
export function scopedTaggable(entityType) {
  return scopedDescriptor(entityType)?.taggable === true;
}

/** The inherit rows for one membership record; `notes` are the caller's, never read here. */
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
