/**
 * ONE precedence table for Tool display resolution, shared by every surface that
 * renders a Tool (issue 976).
 *
 * `openspec/specs/data-models/spec.md` `## Tool` requirement 13 fixes a single
 * ordering:
 *
 *   name:        label.trim() -> snapshot `name` -> component `name` -> fallback
 *   image:       snapshot `img` -> component `img` -> icons/svg/item-bag.svg
 *   description: snapshot `description` -> component `description`
 *
 * Three surfaces derive this independently — `toolStudio.js` (Tool Studio),
 * `RecipeToolsSection.svelte` (recipe editor) and `GatheringTaskEditView.svelte`
 * (gathering task editor) — because two of them receive the managed-component
 * lookup in different shapes. Pinning all three against this one table is what
 * stops them drifting again; before 976 two of them omitted the snapshot rung
 * entirely and rendered a placeholder for a fully-populated tool.
 *
 * Cases are deliberately authored so that NO case is satisfied by more than one
 * ordering: `snapshot-outranks-component` fails if the rungs are swapped, and
 * `component-linked-unlabelled` fails if the snapshot rung is dropped.
 */

/** Foundry's generic "no image" sentinel, and the last resort for a Tool image. */
export const TOOL_IMAGE_SENTINEL = 'icons/svg/item-bag.svg';

/**
 * The managed components the cases below resolve `componentId` against. Shaped like
 * `selectedSystem.managedItemOptions`.
 */
export const TOOL_PRECEDENCE_MANAGED_ITEMS = Object.freeze([
  Object.freeze({
    id: 'cmp-tongs',
    name: 'Iron Tongs',
    img: 'icons/tools/tongs.webp',
    description: 'A pair of blacksmith tongs.',
  }),
  Object.freeze({
    id: 'cmp-whetstone',
    name: 'Plain Whetstone',
    img: 'icons/tools/whetstone.webp',
    description: 'An ordinary sharpening stone.',
  }),
]);

/**
 * @typedef {object} ToolDisplayPrecedenceCase
 * @property {string} id            stable case key, used in assertion messages
 * @property {string} summary       what the case proves
 * @property {object} tool          the library tool, in its persisted `Tool.toJSON()` shape
 * @property {string|null} expectedName        expected display name, or null when the
 *                                             surface's own localized fallback is expected
 * @property {string} expectedImg              expected image path
 * @property {string} expectedDescription      expected description ('' when none resolves)
 */

/** @type {ReadonlyArray<ToolDisplayPrecedenceCase>} */
export const TOOL_DISPLAY_PRECEDENCE_CASES = Object.freeze([
  Object.freeze({
    id: 'item-sourced-unlabelled',
    summary:
      'the issue-976 defect: a first-class item-sourced tool carries componentId null, so a ' +
      'component-only resolver renders the fallback name and the item-bag sentinel',
    tool: Object.freeze({
      id: 'tool-smith-hammer',
      label: '',
      componentId: null,
      name: "Smith's Hammer",
      img: 'icons/tools/smith-hammer.webp',
      description: 'A well-balanced forging hammer.',
    }),
    expectedName: "Smith's Hammer",
    expectedImg: 'icons/tools/smith-hammer.webp',
    expectedDescription: 'A well-balanced forging hammer.',
  }),
  Object.freeze({
    id: 'authored-label-wins',
    summary: 'an authored label outranks the snapshot it was authored alongside',
    tool: Object.freeze({
      id: 'tool-masterwork',
      label: 'Masterwork Hammer',
      componentId: null,
      name: "Smith's Hammer",
      img: 'icons/tools/smith-hammer.webp',
      description: 'A well-balanced forging hammer.',
    }),
    expectedName: 'Masterwork Hammer',
    // The label overrides the NAME only; the image still comes from the snapshot.
    expectedImg: 'icons/tools/smith-hammer.webp',
    expectedDescription: 'A well-balanced forging hammer.',
  }),
  Object.freeze({
    id: 'whitespace-label-falls-through',
    summary: 'a whitespace-only label is not a label, so the snapshot still wins',
    tool: Object.freeze({
      id: 'tool-whitespace',
      label: '   ',
      componentId: null,
      name: "Smith's Hammer",
      img: 'icons/tools/smith-hammer.webp',
      description: '',
    }),
    expectedName: "Smith's Hammer",
    expectedImg: 'icons/tools/smith-hammer.webp',
    expectedDescription: '',
  }),
  Object.freeze({
    id: 'component-linked-unlabelled',
    summary:
      'a component-linked tool with no snapshot still resolves through its component — this ' +
      'case fails if the component rung is dropped while adding the snapshot rung',
    tool: Object.freeze({
      id: 'tool-tongs',
      label: '',
      componentId: 'cmp-tongs',
      name: null,
      img: null,
      description: '',
    }),
    expectedName: 'Iron Tongs',
    expectedImg: 'icons/tools/tongs.webp',
    expectedDescription: 'A pair of blacksmith tongs.',
  }),
  Object.freeze({
    id: 'snapshot-outranks-component',
    summary:
      'a whetstone that is ALSO a managed component keeps componentId populated, and its own ' +
      'snapshot is the more specific identity — this case fails if the two rungs are swapped',
    tool: Object.freeze({
      id: 'tool-whetstone',
      label: '',
      componentId: 'cmp-whetstone',
      name: 'Runed Whetstone',
      img: 'icons/tools/runed-whetstone.webp',
      description: 'A whetstone cut with sharpening runes.',
    }),
    expectedName: 'Runed Whetstone',
    expectedImg: 'icons/tools/runed-whetstone.webp',
    expectedDescription: 'A whetstone cut with sharpening runes.',
  }),
  Object.freeze({
    id: 'orphan-falls-back',
    summary:
      'no label, no snapshot and an unresolvable componentId is the ONLY case that reaches the ' +
      'localized fallback and the item-bag sentinel',
    tool: Object.freeze({
      id: 'tool-orphan',
      label: '',
      componentId: 'cmp-missing',
      name: null,
      img: null,
      description: '',
    }),
    expectedName: null,
    expectedImg: TOOL_IMAGE_SENTINEL,
    expectedDescription: '',
  }),
]);

/**
 * Reshape a case's tool into the flattened entry `RecipeToolsSection` actually
 * receives.
 *
 * This mirrors the `recipeToolsLibrary` `$derived` in
 * `src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte` exactly: the component
 * lookup happens upstream and arrives as `componentName` / `componentImg`, which is
 * why that component re-derives the ordering instead of importing `toolStudio.js`.
 *
 * @param {object} tool
 * @param {ReadonlyArray<object>} [managedItems]
 * @returns {object}
 */
export function flattenToolForRecipeLibrary(tool, managedItems = TOOL_PRECEDENCE_MANAGED_ITEMS) {
  const component =
    (managedItems || []).find((item) => String(item.id) === String(tool?.componentId)) || null;
  return {
    ...tool,
    componentName: component?.name || '',
    componentImg: component?.img || '',
  };
}
