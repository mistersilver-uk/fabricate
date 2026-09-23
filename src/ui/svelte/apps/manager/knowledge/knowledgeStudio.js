/**
 * Every DERIVATION behind the GM Knowledge surface, 100% pure: no `game`, `fromUuid` or `getFlag`.
 * `adminStore` imports `recipeItemTypeFromRecipeCount` and `recipeItemLabelFromUuid` back, so the
 * Books & Scrolls Type pill and the Knowledge Type column cannot drift apart.
 */

// The shared recipe-image chokepoint (`data-models` `## Recipe` requirement 16), an import-free leaf.
import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
// Imported, never restated: the write path refuses using this same number.
import { GRANTED_BY_MAX_LENGTH } from '../../../../../systems/companionContract.js';

export const KNOWLEDGE_TAB_RECIPE_ITEMS = 'recipeItems';
export const KNOWLEDGE_TAB_LEARNED_RECIPES = 'learnedRecipes';

/** Uses-chip states. `inert` is a SEPARATE chip and is never folded in here. */
export const USES_CHIP_UNLIMITED = 'unlimited';
export const USES_CHIP_REMAINING = 'remaining';
export const USES_CHIP_SPENT = 'spent';

/** Why an erase frees no learn budget; rendered as one trailing clause on the row's source line. */
export const NO_REFUND_NONE = '';
export const NO_REFUND_NO_SOURCE = 'noSource';
export const NO_REFUND_NOT_OWNED = 'notOwned';
export const NO_REFUND_UNCAPPED = 'uncapped';

/** How a learned entry's source is displayed; the ladder is in `learnedRecipeSource`. */
export const LEARNED_SOURCE_OWNED_COPY = 'ownedCopy';
export const LEARNED_SOURCE_LOST_COPY = 'lostCopy';
export const LEARNED_SOURCE_UUID = 'uuid';
export const LEARNED_SOURCE_AUTO_LEARN = 'autoLearn';
// TWO distinct grant kinds, not one kind with an empty `name`: the kind is rendered into
// `data-knowledge-source`, so collapsing them leaves the label-less grant unaddressable.
export const LEARNED_SOURCE_GRANTED = 'granted';
export const LEARNED_SOURCE_GRANTED_UNLABELLED = 'grantedUnlabelled';

const DEFAULT_RECIPE_ITEM_IMAGE = 'icons/svg/item-bag.svg';

/** Label for an unresolved or deleted recipe item: the trailing UUID segment, as `_labelFromUuid`. */
export function recipeItemLabelFromUuid(uuid) {
  if (!uuid) return '';
  const parts = String(uuid).split('.');
  return parts.at(-1) || '';
}

/**
 * Book / Scroll / Incomplete from the recipe count alone. HARD-CODED English by design: a diagnostic
 * enum, not display copy, which the render site maps to keys rather than minting a second vocabulary.
 */
export function recipeItemTypeFromRecipeCount(count) {
  const n = Number(count) || 0;
  if (n >= 2) return 'Book';
  if (n === 1) return 'Scroll';
  return 'Incomplete';
}

/**
 * Which inner tab opens, keyed on the SYSTEM's definition count, never the character's rows, and
 * computed ONCE on entry: a live `$derived` would yank the tab on an edit made on another surface.
 */
export function defaultKnowledgeTab(definitionCount) {
  return Number(definitionCount) > 0 ? KNOWLEDGE_TAB_RECIPE_ITEMS : KNOWLEDGE_TAB_LEARNED_RECIPES;
}

/** Charges left, or `null` for UNLIMITED. A non-finite `maxUses` is unlimited, failing open. */
export function recipeItemRemainingUses({ limitUses, maxUses, timesUsed } = {}) {
  if (limitUses !== true) return null;
  const max = Number(maxUses);
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, max - Number(timesUsed || 0));
}

/**
 * The exact complement of `RecipeVisibilityService._filterNonExhausted` and nothing more, down to the
 * strict `limitUses === true` and the identical `Number(timesUsed || 0)`: divergence would let a row
 * call a copy spent while the runtime still crafts from it. `inert` is NEVER folded in.
 */
export function isRecipeItemSpent({ limitUses, maxUses, timesUsed } = {}) {
  if (limitUses !== true) return false;
  const max = Number(maxUses);
  if (!Number.isFinite(max) || max <= 0) return false;
  return Number(timesUsed || 0) >= max;
}

/**
 * Whether Expend can act: `limitUses === true && !spent`, deliberately NOT `&& !inert`, which would
 * apply a gate the craft path does not. An uncapped book is DISABLED, never a silent no-op.
 */
export function canExpendRecipeItemUse(caps = {}) {
  return caps.limitUses === true && !isRecipeItemSpent(caps);
}

/** Which uses chip a row carries; `inert` is a SECOND, separate chip and is never folded in. */
export function usesChipState(caps = {}) {
  if (isRecipeItemSpent(caps)) return USES_CHIP_SPENT;
  return recipeItemRemainingUses(caps) === null ? USES_CHIP_UNLIMITED : USES_CHIP_REMAINING;
}

/**
 * Clamp a `grantedBy` label, NOT re-clamp: the write path refuses rather than truncating and the flag
 * is public. INCLUSIVE of the ellipsis, else a label refused at 65 characters renders 65 glyphs, and
 * measured in CODE POINTS, since `slice` cuts surrogate pairs into tofu.
 */
function clampGrantedByLabel(value) {
  const points = [...value];
  if (points.length <= GRANTED_BY_MAX_LENGTH) return points.join('');
  return `${points.slice(0, GRANTED_BY_MAX_LENGTH - 1).join('')}…`;
}

/**
 * The source of a learned entry carrying NO `sourceItemUuid`. The discriminant is `granted === true`,
 * strict not truthy, because the flag is public and `granted: 'yes'` would assert a provenance
 * nothing recorded; the label is a SECOND question. `typeof grantedBy === 'string'` is strict too.
 */
function learnedRecipeGrantSource(raw) {
  if (raw.granted !== true) return { kind: LEARNED_SOURCE_AUTO_LEARN, name: '' };
  const label = typeof raw.grantedBy === 'string' ? raw.grantedBy.trim() : '';
  if (!label) return { kind: LEARNED_SOURCE_GRANTED_UNLABELLED, name: '' };
  return { kind: LEARNED_SOURCE_GRANTED, name: clampGrantedByLabel(label) };
}

/**
 * The display source of a learned entry. `sourceItemUuid` dangles once the copy is gone, so the ladder
 * is: still-owned copy name → member DEFINITION name ("… (copy no longer owned)", the rung that
 * survives source deletion) → uuid segment → and, for a `null` uuid, the GM-grant rungs or "Learned
 * by crafting". Those sit INSIDE the `!uuid` branch, because book provenance wins.
 */
export function learnedRecipeSource(raw = {}) {
  const uuid = raw.sourceItemUuid ? String(raw.sourceItemUuid) : '';
  if (!uuid) return learnedRecipeGrantSource(raw);
  const ownedName = String(raw.sourceItemName || '').trim();
  if (raw.sourceOwned === true && ownedName) {
    return { kind: LEARNED_SOURCE_OWNED_COPY, name: ownedName };
  }
  const definitionName = String(raw.sourceDefinitionName || '').trim();
  if (definitionName) return { kind: LEARNED_SOURCE_LOST_COPY, name: definitionName };
  return { kind: LEARNED_SOURCE_UUID, name: recipeItemLabelFromUuid(uuid) };
}

/** Whether erasing frees NO budget; broader than `_freeLearnBudgetForEntry`'s three early returns. */
export function eraseFreesNoSlot(raw = {}) {
  return eraseNoRefundReason(raw) !== NO_REFUND_NONE;
}

/**
 * WHY the erase frees no budget, or `NO_REFUND_NONE` when it does. The reasons are NOT
 * interchangeable — under `NO_REFUND_UNCAPPED` the copy is still owned — and `eraseFreesNoSlot`
 * derives from this, so the boolean and the reason cannot disagree.
 */
export function eraseNoRefundReason(raw = {}) {
  if (!raw.sourceItemUuid) return NO_REFUND_NO_SOURCE;
  if (raw.sourceOwned !== true) return NO_REFUND_NOT_OWNED;
  if (raw.sourceCapped !== true) return NO_REFUND_UNCAPPED;
  return NO_REFUND_NONE;
}

/** One owned copy as a row, with derived uses, exhaustion and expend affordance. */
export function projectOwnedCopyRow(raw = {}) {
  const caps = {
    limitUses: raw.limitUses === true,
    maxUses: raw.maxUses,
    timesUsed: raw.timesUsed,
  };
  return {
    itemId: String(raw.itemId || ''),
    itemUuid: String(raw.itemUuid || ''),
    name: String(raw.name || '') || recipeItemLabelFromUuid(raw.itemUuid) || 'Recipe item',
    img: String(raw.img || '') || DEFAULT_RECIPE_ITEM_IMAGE,
    quantity: Number(raw.quantity) > 0 ? Number(raw.quantity) : 1,
    definitionId: String(raw.definitionId || ''),
    definitionName: String(raw.definitionName || ''),
    // How durable the definition link is; `duplicate` is the tier bulk auto-learn already refuses.
    matchTier: raw.matchTier || null,
    recipeCount: Number(raw.recipeCount) || 0,
    type: recipeItemTypeFromRecipeCount(raw.recipeCount),
    limitUses: caps.limitUses,
    maxUses: raw.maxUses,
    timesUsed: Number(raw.timesUsed || 0),
    remaining: recipeItemRemainingUses(caps),
    spent: isRecipeItemSpent(caps),
    // Independent projected fact — never folded into `spent`.
    inert: raw.inert === true,
    canExpend: canExpendRecipeItemUse(caps),
    usesChip: usesChipState(caps),
    learnScope: raw.learnScope === 'total' ? 'total' : 'perInstance',
  };
}

/** One learned recipe as a row. Learned entries are INDEPENDENT of currently-owned copies. */
export function projectLearnedRecipeRow(raw = {}) {
  const source = learnedRecipeSource(raw);
  return {
    recipeId: String(raw.recipeId || ''),
    name: String(raw.recipeName || '') || String(raw.recipeId || ''),
    // A learned RECIPE, so it renders the blueprint through the shared chokepoint
    // (`data-models/spec.md` `## Recipe` requirement 16); the bag default above suits an Item.
    img: resolveRecipeImage({ img: raw.recipeImg }),
    category: String(raw.recipeCategory || ''),
    craftingSystemId: String(raw.craftingSystemId || ''),
    learnedAt: Number(raw.learnedAt) || 0,
    sourceItemUuid: raw.sourceItemUuid ? String(raw.sourceItemUuid) : '',
    sourceKind: source.kind,
    sourceName: source.name,
    freesNoSlot: eraseFreesNoSlot(raw),
    noRefundReason: eraseNoRefundReason(raw),
  };
}

/**
 * One roster character: its rows, its roll-ups and the CONDITIONAL ordering hazard. Under
 * `learnScope: "total"` the refund resolves the pool key through a STILL-OWNED source copy, so
 * Delete→Erase strands a slot Erase→Delete reclaims; only a character owning such a copy sees it.
 */
export function projectKnowledgeCharacter(raw = {}) {
  const ownedCopies = (Array.isArray(raw.ownedCopies) ? raw.ownedCopies : []).map(
    projectOwnedCopyRow
  );
  const learnedRecipes = (Array.isArray(raw.learnedRecipes) ? raw.learnedRecipes : []).map(
    projectLearnedRecipeRow
  );
  const learnedSourceUuids = new Set(
    learnedRecipes.map((row) => row.sourceItemUuid).filter(Boolean)
  );
  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    img: String(raw.img || ''),
    ownedCopies,
    learnedRecipes,
    itemCount: ownedCopies.length,
    learnedCount: learnedRecipes.length,
    // Entries of ANOTHER system (`learnedRecipes` is system-agnostic) plus entries whose recipe no
    // longer resolves. Rendered only when non-zero.
    otherSystemCount: Number(raw.otherSystemCount) || 0,
    orphanCount: Number(raw.orphanCount) || 0,
    hasPartyPoolHazard: ownedCopies.some(
      (row) => row.learnScope === 'total' && learnedSourceUuids.has(row.itemUuid)
    ),
    tracked: ownedCopies.length > 0 || learnedRecipes.length > 0,
  };
}

/** Roster search, kept here so the filter the disarm rules key on is one testable pure function. */
export function filterKnowledgeRoster(characters = [], term = '') {
  const needle = String(term || '')
    .trim()
    .toLowerCase();
  const rows = Array.isArray(characters) ? characters : [];
  if (!needle) return [...rows];
  return rows.filter((character) =>
    String(character?.name || '')
      .toLowerCase()
      .includes(needle)
  );
}

/**
 * The whole snapshot published as `viewState.knowledge`, ALWAYS a new object. A `null` snapshot or an
 * inactive surface yields the empty state, which is what makes `refreshKnowledge` free when closed.
 * `options.loading` and `options.error` reach only an open surface holding no snapshot, so a
 * populated or closed projection is never loading and never in error, and loading masks error.
 */
export function projectKnowledgeSnapshot(raw, options = {}) {
  const active = options.active === true;
  const defaultTab = options.defaultTab || KNOWLEDGE_TAB_RECIPE_ITEMS;
  const loading = active && !raw && options.loading === true;
  const error = active && !raw && !loading && options.error === true;
  if (!active || !raw) {
    return {
      active,
      loading,
      error,
      systemId: '',
      definitionCount: 0,
      defaultTab,
      characters: [],
      selectedActorId: '',
      selectedCharacter: null,
    };
  }

  const characters = (Array.isArray(raw.characters) ? raw.characters : []).map(
    projectKnowledgeCharacter
  );
  const requested = String(options.selectedActorId || '');
  const selectedCharacter =
    characters.find((character) => character.id === requested) || characters[0] || null;
  return {
    active,
    loading,
    error,
    systemId: String(raw.systemId || ''),
    definitionCount: Number(raw.definitionCount) || 0,
    defaultTab,
    characters,
    selectedActorId: selectedCharacter?.id || '',
    selectedCharacter,
  };
}
