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

const HAMMER_IMG = 'icons/tools/smith-hammer.webp';
const TONGS_IMG = 'icons/tools/tongs.webp';
const RUNED_WHETSTONE_IMG = 'icons/tools/runed-whetstone.webp';
const HAMMER_DESC = 'A well-balanced forging hammer.';
const TONGS_DESC = 'A pair of blacksmith tongs.';
const WHETSTONE_DESC = 'A whetstone cut with sharpening runes.';

/**
 * The managed components the cases below resolve `componentId` against. Shaped like
 * `selectedSystem.managedItemOptions`.
 */
export const TOOL_PRECEDENCE_MANAGED_ITEMS = Object.freeze([
  Object.freeze({ id: 'cmp-tongs', name: 'Iron Tongs', img: TONGS_IMG, description: TONGS_DESC }),
  Object.freeze({
    id: 'cmp-whetstone',
    name: 'Plain Whetstone',
    img: 'icons/tools/whetstone.webp',
    description: 'An ordinary sharpening stone.',
  }),
]);

/**
 * Build one case.
 *
 * Every field of `tool` that a case does not set takes the EMPTY value a real
 * `Tool.toJSON()` emits, so each case states only what it is about. That is also why the
 * table does not repeat a six-key literal per case: doing so tripped SonarCloud's
 * `new_duplicated_lines_density` gate, which counts `tests/**` in full because
 * `sonar.cpd.exclusions` is inert under Automatic Analysis.
 *
 * `expected` defaults to the tool's OWN snapshot, because "the tool's own identity wins"
 * IS the rule under test. A case whose point is that something ELSE wins — the authored
 * label, the linked component, or the fallback — states that expectation explicitly, so
 * the interesting cases are never satisfied by the default.
 *
 * @param {string} id Stable case key, used in assertion messages.
 * @param {string} summary What the case proves.
 * @param {object} tool Partial tool; unset fields default to a real tool's empty values.
 * @param {{name?: string|null, img?: string, description?: string}} [expected]
 * @returns {object}
 */
function precedenceCase(id, summary, tool, expected = {}) {
  const merged = {
    label: '',
    componentId: null,
    name: null,
    img: null,
    description: '',
    ...tool,
  };
  return Object.freeze({
    id,
    summary,
    tool: Object.freeze(merged),
    expectedName: 'name' in expected ? expected.name : merged.name,
    expectedImg: 'img' in expected ? expected.img : merged.img || TOOL_IMAGE_SENTINEL,
    expectedDescription:
      'description' in expected ? expected.description : merged.description || '',
  });
}

/**
 * @typedef {object} ToolDisplayPrecedenceCase
 * @property {string} id
 * @property {string} summary
 * @property {object} tool                 the library tool, in persisted `Tool.toJSON()` shape
 * @property {string|null} expectedName    expected display name, or null when the surface's
 *                                         own localized fallback is expected
 * @property {string} expectedImg
 * @property {string} expectedDescription  '' when none resolves
 */

/** @type {ReadonlyArray<ToolDisplayPrecedenceCase>} */
export const TOOL_DISPLAY_PRECEDENCE_CASES = Object.freeze([
  precedenceCase(
    'item-sourced-unlabelled',
    'the issue-976 defect: a first-class item-sourced tool carries componentId null, so a ' +
      'component-only resolver renders the fallback name and the item-bag sentinel',
    { id: 'tool-smith-hammer', name: "Smith's Hammer", img: HAMMER_IMG, description: HAMMER_DESC }
  ),

  precedenceCase(
    'authored-label-wins',
    'an authored label outranks the snapshot NAME it was authored alongside, and nothing else — ' +
      'the image still comes from the snapshot',
    {
      id: 'tool-masterwork',
      label: 'Masterwork Hammer',
      name: "Smith's Hammer",
      img: HAMMER_IMG,
      description: HAMMER_DESC,
    },
    { name: 'Masterwork Hammer' }
  ),

  precedenceCase(
    'whitespace-label-falls-through',
    'a whitespace-only label is not a label, so the snapshot still wins',
    { id: 'tool-whitespace', label: '   ', name: "Smith's Hammer", img: HAMMER_IMG }
  ),

  precedenceCase(
    'component-linked-unlabelled',
    'a component-linked tool with no snapshot resolves through its component — this case ' +
      'fails if the component rung is dropped while adding the snapshot rung',
    { id: 'tool-tongs', componentId: 'cmp-tongs' },
    { name: 'Iron Tongs', img: TONGS_IMG, description: TONGS_DESC }
  ),

  precedenceCase(
    'snapshot-outranks-component',
    'a whetstone that is ALSO a managed component keeps componentId populated, and its own ' +
      'snapshot is the more specific identity — this case fails if the two rungs are swapped',
    {
      id: 'tool-whetstone',
      componentId: 'cmp-whetstone',
      name: 'Runed Whetstone',
      img: RUNED_WHETSTONE_IMG,
      description: WHETSTONE_DESC,
    }
  ),

  precedenceCase(
    'orphan-falls-back',
    'no label, no snapshot and an unresolvable componentId is the ONLY case that reaches the ' +
      'localized fallback and the item-bag sentinel',
    { id: 'tool-orphan', componentId: 'cmp-missing' },
    { name: null, img: TOOL_IMAGE_SENTINEL, description: '' }
  ),
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
