import {
  defineScope,
  isSectionInherited,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';

/**
 * The component half of Scoped Entity Definitions (issue 1358, part of epic 1357).
 *
 * NOT YET LIVE. `## Component` describes the shipped per-system shape and stays authoritative
 * until the world-scope migration (epic 1357, PR 3) lands.
 *
 * A COMPONENT MEMBERSHIP RECORD CARRIES NO `enabled` FLAG, and that absence is STRUCTURAL rather
 * than conventional. The maintainer ruling behind epic 1357 is that essence enabling toggles
 * effect transfer and macros and tool enabling evokes a drained leyline, but component enabling
 * serves no purpose and is not implemented: component membership is binary, present or absent.
 * The scope therefore declares `enableable: false`, so `resolveComponent` OMITS the key entirely
 * rather than answering `false` - a resolver that answered `false` would hand a later screen the
 * exact value it would read to draw the toggle this ruling removes.
 *
 * TWO FIELDS DEPART FROM THE PLAIN SECTION PATTERN, each with its own named helper rather than a
 * special case inside the generic resolver:
 *
 * - `category` is a section, but its INHERITING branch is special: the world category wins IF
 *   AUTHORED, and otherwise the local value falls through. See `resolveComponentCategory`.
 * - `tags` is NOT a section and has no inherit switch at all: the effective set is additive, with
 *   per-tag muting. See `resolveComponentTags`.
 *
 * NEITHER HELPER READS A VOCABULARY. The world component-category and component-tag vocabularies,
 * their icon maps and their deletion semantics are the World Vocabulary, which epic 1357 models in
 * PR 7; both helpers take the world value as an EXPLICIT ARGUMENT, which is what stops this
 * resolver quietly acquiring a fourth layer. The reserved `general` category is not part of that
 * vocabulary and stays implicit.
 */

/**
 * The component sections resolution reads through, and the only keys a component membership
 * record's `inherit` map may carry.
 *
 * @type {readonly string[]}
 */
export const COMPONENT_SECTIONS = Object.freeze(['category']);

/**
 * Normalize a list of trimmed, de-duplicated, order-preserving labels.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeLabels(raw) {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const labels = [];
  for (const entry of entries) {
    const label = typeof entry === 'string' ? entry.trim() : '';
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * Attach a label list only when it carries something.
 *
 * ABSENCE-PRESERVING, on the `complications` doctrine (`## Component` requirement 20): an authored
 * empty tag list carries no meaning distinct from absence, so it normalizes to ABSENT and no
 * reader may distinguish the two.
 *
 * @param {object} target
 * @param {string} key
 * @param {unknown} raw
 * @returns {object}
 */
function attachLabels(target, key, raw) {
  const labels = normalizeLabels(raw);
  if (labels.length > 0) target[key] = labels;
  return target;
}

/**
 * The component scope descriptor.
 *
 * @type {Readonly<object>}
 */
export const COMPONENT_SCOPE = defineScope({
  sections: COMPONENT_SECTIONS,
  // Structural, not a default. See the module note.
  enableable: false,
  worldExtras: (entry) => attachLabels({}, 'tags', entry.tags),
  membershipExtras: (entry) => {
    const extras = attachLabels({}, 'tags', entry.tags);
    return attachLabels(extras, 'mutedTags', entry.mutedTags);
  },
});

/**
 * Normalize the world component defaults.
 *
 * THE WORLD CATEGORY IS ABSENCE-PRESERVING and the normalizer MUST NOT emit `general` for an
 * unauthored one. `general` is the reserved implicit component category that is always enabled,
 * cannot be removed, and must never be persisted (`## CraftingSystem` requirement 6a); treating an
 * unauthored world category as authored would silently reset every inheriting system's category to
 * `general` on the first resolve. The failure this prevents is a RESET to `general`, not a blank -
 * a blank is unreachable, because an absent world category falls through to the local value.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeComponentWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, COMPONENT_SCOPE);
}

/**
 * Normalize the component system membership records.
 *
 * An `enabled` key in the input is DROPPED rather than carried: the component path has no such
 * field, and adversarial or hand-edited input must not mint one.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeComponentMemberships(raw) {
  return normalizeMemberships(raw, COMPONENT_SCOPE);
}

/**
 * Whether a category token was actually authored.
 *
 * "Authored" is ABSENCE, not truthiness, and specifically not the `general` default
 * `## Component` requirement 13 gives `Component.category`.
 *
 * @param {unknown} category
 * @returns {boolean}
 */
function isAuthoredCategory(category) {
  return typeof category === 'string' && category.trim().length > 0;
}

/**
 * Resolve a component's effective category on the INHERITING branch.
 *
 * The world category wins when it is AUTHORED; when it is absent or empty the local value falls
 * through rather than resetting to the reserved `general`. A world category the GM later deletes
 * reaches this helper as absence and takes that same path - the deletion behaviour itself is the
 * World Vocabulary's (epic 1357, PR 7), and `## CraftingSystem` requirement 6d governs the
 * system-scope case today.
 *
 * @param {unknown} worldCategory The world default category, taken explicitly.
 * @param {unknown} localCategory The membership record's retained category.
 * @returns {string|undefined} The effective category, or `undefined` when neither is authored.
 */
export function resolveComponentCategory(worldCategory, localCategory) {
  if (isAuthoredCategory(worldCategory)) return worldCategory.trim();
  if (isAuthoredCategory(localCategory)) return localCategory.trim();
  // ABSENCE is the answer when neither scope authored one. Minting the reserved `general` bucket
  // here is exactly the reset this helper exists to prevent.
  return;
}

/**
 * Resolve a component's effective tag set.
 *
 * ADDITIVE, NEVER OVERRIDDEN: the effective set is the world tags minus the record's muted list,
 * plus the record's own tags. There is no inherit switch on this path at all, so the generic
 * section machinery is deliberately not given one - muting is per tag, which a single per-section
 * switch cannot express.
 *
 * @param {unknown} worldTags The world default tags, taken explicitly.
 * @param {object|null} [membership] The system membership record, when there is one.
 * @returns {string[]}
 */
export function resolveComponentTags(worldTags, membership = null) {
  const record = membership && typeof membership === 'object' ? membership : {};
  const muted = new Set(normalizeLabels(record.mutedTags));
  const effective = normalizeLabels(worldTags).filter((tag) => !muted.has(tag));
  const seen = new Set(effective);
  for (const tag of normalizeLabels(record.tags)) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    effective.push(tag);
  }
  return effective;
}

/**
 * Resolve one `(component, system)` pair.
 *
 * The answer carries `category` (when either scope authored one), the effective `tags`, `member`,
 * and the per-section `inherited` map. It carries NO `enabled` key - `'enabled' in result` is
 * `false`, not `enabled: false`.
 *
 * Sections are populated even for a non-member, so `member` is the gate a caller must check.
 *
 * @param {object|null} worldDefault
 * @param {object|null} membership
 * @returns {{category?: string, tags: string[], member: boolean,
 *   inherited: {[section: string]: boolean}}}
 */
export function resolveComponent(worldDefault, membership) {
  const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = resolveScopedDefinition(world, record, COMPONENT_SCOPE);
  if (isSectionInherited(record, 'category')) {
    const category = resolveComponentCategory(world.category, record?.category);
    if (category === undefined) delete resolved.category;
    else resolved.category = category;
  }
  resolved.tags = resolveComponentTags(world.tags, record);
  return resolved;
}
