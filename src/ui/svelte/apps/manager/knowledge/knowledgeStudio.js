/**
 * Knowledge surface pure projection (issue 785).
 *
 * The GM Knowledge surface audits per-character RUNTIME recipe knowledge: the
 * owned copies of a system's recipe items a character carries, and the recipes
 * they have learned. This module owns every DERIVATION on that data and is
 * deliberately 100% pure — it never touches `game`, `fromUuid` or `getFlag`,
 * mirroring `tools/toolStudio.js`. Foundry-facing enumeration lives in the
 * service seam (`SvelteCraftingSystemManagerApp`), publication in `adminStore`.
 *
 * `recipeItemTypeFromRecipeCount` and `recipeItemLabelFromUuid` live here (they
 * moved out of `adminStore`, which imports them back) so the Books & Scrolls
 * Type pill and the Knowledge Type column cannot drift apart.
 */

// The shared recipe-image chokepoint (`data-models` `## Recipe` requirement 16). An
// import-free leaf, so it keeps this module pure and adds no mounted-harness edge
// beyond the one raw-module entry each Knowledge suite lists.
import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';

/** The two inner tabs of the Knowledge surface. */
export const KNOWLEDGE_TAB_RECIPE_ITEMS = 'recipeItems';
export const KNOWLEDGE_TAB_LEARNED_RECIPES = 'learnedRecipes';

/** Uses-chip states. `inert` is a SEPARATE chip and is never folded in here. */
export const USES_CHIP_UNLIMITED = 'unlimited';
export const USES_CHIP_REMAINING = 'remaining';
export const USES_CHIP_SPENT = 'spent';

/** How a learned entry's source is displayed; the ladder is in `learnedRecipeSource`. */
/**
 * Why an erase frees no learn budget. Rendered as a single trailing clause on the
 * learned row's source line, replacing the old separate "Frees no slot" sub-label,
 * which restated a cause the same row had already given ("copy no longer owned").
 */
export const NO_REFUND_NONE = '';
export const NO_REFUND_NO_SOURCE = 'noSource';
export const NO_REFUND_NOT_OWNED = 'notOwned';
export const NO_REFUND_UNCAPPED = 'uncapped';

export const LEARNED_SOURCE_OWNED_COPY = 'ownedCopy';
export const LEARNED_SOURCE_LOST_COPY = 'lostCopy';
export const LEARNED_SOURCE_UUID = 'uuid';
export const LEARNED_SOURCE_AUTO_LEARN = 'autoLearn';

const DEFAULT_RECIPE_ITEM_IMAGE = 'icons/svg/item-bag.svg';

/**
 * Human label for a recipe item whose linked game-world item has not resolved
 * (or was deleted) — the trailing UUID segment, matching the manager's own
 * `_labelFromUuid`.
 *
 * @param {string|null|undefined} uuid
 * @returns {string}
 */
export function recipeItemLabelFromUuid(uuid) {
  if (!uuid) return '';
  const parts = String(uuid).split('.');
  return parts.at(-1) || '';
}

/**
 * Best-effort Book / Scroll / Incomplete label derived purely from how many
 * recipes a recipe item grants: a multi-recipe tome is a "Book", a single-recipe
 * item is a "Scroll", and an item with no recipes linked yet is "Incomplete"
 * (distinct from the Books & Scrolls `linkMissing` broken-link state).
 *
 * Returns HARD-CODED English by design — it is a diagnostic enum, not display
 * copy. The render site maps the enum to localization keys rather than minting a
 * second localized type vocabulary.
 *
 * @param {number|string|null|undefined} count
 * @returns {'Book'|'Scroll'|'Incomplete'}
 */
export function recipeItemTypeFromRecipeCount(count) {
  const n = Number(count) || 0;
  if (n >= 2) return 'Book';
  if (n === 1) return 'Scroll';
  return 'Incomplete';
}

/**
 * Which inner tab the surface opens on. Keys on the SELECTED SYSTEM's recipe
 * item DEFINITION count, never the selected character's row counts, so the tab
 * does not shift under the GM as they move down the roster.
 *
 * Under the widened membership gate the Recipe items tab can be permanently
 * empty (a `global` + alchemy system reveals recipes solely through
 * `learnedRecipes`), and landing on an empty tab as the surface's first visible
 * state would hide the only populated one behind a click.
 *
 * Callers compute this ONCE on surface entry — never as a live `$derived` over
 * the definition count, which would yank the open tab (and disarm an armed row)
 * the moment a GM authored the system's first recipe item on another surface.
 *
 * @param {number|string|null|undefined} definitionCount
 * @returns {'recipeItems'|'learnedRecipes'}
 */
export function defaultKnowledgeTab(definitionCount) {
  return Number(definitionCount) > 0 ? KNOWLEDGE_TAB_RECIPE_ITEMS : KNOWLEDGE_TAB_LEARNED_RECIPES;
}

/**
 * Charges left on one owned copy, or `null` for UNLIMITED (render "Unlimited",
 * never "0 left"). A `maxUses` that is not a finite number greater than zero is
 * treated as unlimited — the same fail-open convention
 * `RecipeVisibilityService._filterNonExhausted` applies.
 *
 * @param {{limitUses?: boolean, maxUses?: unknown, timesUsed?: unknown}} caps
 * @returns {number|null}
 */
export function recipeItemRemainingUses({ limitUses, maxUses, timesUsed } = {}) {
  if (limitUses !== true) return null;
  const max = Number(maxUses);
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, max - Number(timesUsed || 0));
}

/**
 * The engine's exhaustion predicate and NOTHING more — the exact complement of
 * `RecipeVisibilityService._filterNonExhausted`, on both axes:
 *
 * - `limitUses` must be literally `true` (`_getRecipeItemCaps` already coerces it);
 * - a non-finite or non-positive `maxUses` is UNLIMITED (fail-open), not spent;
 * - `timesUsed` passes through the identical `Number(timesUsed || 0)` coercion,
 *   so the two cannot diverge on a `null` / `undefined` / string count.
 *
 * Divergence here would let a row claim a copy is spent while the runtime still
 * grants craftability from it. `inert` is NEVER folded in: `_filterNonExhausted`
 * does not read it, and it is projected as an independent row fact.
 *
 * @param {{limitUses?: boolean, maxUses?: unknown, timesUsed?: unknown}} caps
 * @returns {boolean}
 */
export function isRecipeItemSpent({ limitUses, maxUses, timesUsed } = {}) {
  if (limitUses !== true) return false;
  const max = Number(maxUses);
  if (!Number.isFinite(max) || max <= 0) return false;
  return Number(timesUsed || 0) >= max;
}

/**
 * Whether the GM's Expend use action can act on this copy.
 *
 * `limitUses === true && !spent` — and deliberately NOT `&& !inert`. `inert` does
 * not gate the craft path (`_filterNonExhausted` reads `timesUsed` alone), so an
 * inert-but-not-spent copy still has charges the runtime will spend on a craft;
 * disabling the GM's button on it would apply a gate the engine does not, and
 * `_applyRecipeItemUse` is the single decision point with no gate on the GM path.
 * An uncapped book writes nothing, so its button is DISABLED, never a silent no-op.
 *
 * @param {{limitUses?: boolean, maxUses?: unknown, timesUsed?: unknown}} caps
 * @returns {boolean}
 */
export function canExpendRecipeItemUse(caps = {}) {
  return caps.limitUses === true && !isRecipeItemSpent(caps);
}

/**
 * Which uses chip a row carries. `inert` renders as a SECOND, separate chip and
 * is not represented here, so an inert-but-not-spent copy keeps its
 * remaining-tone uses chip alongside the Inert chip.
 *
 * @param {{limitUses?: boolean, maxUses?: unknown, timesUsed?: unknown}} caps
 * @returns {'unlimited'|'remaining'|'spent'}
 */
export function usesChipState(caps = {}) {
  if (isRecipeItemSpent(caps)) return USES_CHIP_SPENT;
  return recipeItemRemainingUses(caps) === null ? USES_CHIP_UNLIMITED : USES_CHIP_REMAINING;
}

/**
 * Resolve the display source of a learned entry.
 *
 * `sourceItemUuid` is the ACTOR-OWNED item uuid and dangles forever once the copy
 * is gone, so the ladder is: still-owned copy name → the member recipe-item
 * DEFINITION name (rendered "… (copy no longer owned)", the rung that satisfies
 * the survives-source-deletion requirement) → the trailing uuid segment →
 * "Learned by crafting" for a `null` uuid (every `learnRecipeOnCraft` entry).
 *
 * @param {{sourceItemUuid?: string|null, sourceOwned?: boolean, sourceItemName?: string,
 *   sourceDefinitionName?: string}} raw
 * @returns {{kind: string, name: string}}
 */
export function learnedRecipeSource(raw = {}) {
  const uuid = raw.sourceItemUuid ? String(raw.sourceItemUuid) : '';
  if (!uuid) return { kind: LEARNED_SOURCE_AUTO_LEARN, name: '' };
  const ownedName = String(raw.sourceItemName || '').trim();
  if (raw.sourceOwned === true && ownedName) {
    return { kind: LEARNED_SOURCE_OWNED_COPY, name: ownedName };
  }
  const definitionName = String(raw.sourceDefinitionName || '').trim();
  if (definitionName) return { kind: LEARNED_SOURCE_LOST_COPY, name: definitionName };
  return { kind: LEARNED_SOURCE_UUID, name: recipeItemLabelFromUuid(uuid) };
}

/**
 * Whether erasing this learned entry will free NO learn budget.
 *
 * Broader than `_freeLearnBudgetForEntry`'s three early-returns: an entry whose
 * source copy IS still owned but whose definition carries no learn cap also frees
 * nothing (`learnRecipeFromOwnedBook` increments the count only for a capped book,
 * and `_setRecipeItemLearnCount` clamps at `0`). Phrased positively as "the erase
 * will free no budget" so it subsumes all four cases, and the UI states that fact
 * rather than promising slot recovery it cannot deliver.
 *
 * @param {{sourceItemUuid?: string|null, sourceOwned?: boolean, sourceCapped?: boolean}} raw
 * @returns {boolean}
 */
export function eraseFreesNoSlot(raw = {}) {
  return eraseNoRefundReason(raw) !== NO_REFUND_NONE;
}

/**
 * WHY erasing this entry frees no learn budget, or `NO_REFUND_NONE` when it does.
 *
 * The three reasons are NOT interchangeable in the UI, which is the whole point of
 * naming them: only `NO_REFUND_NOT_OWNED` is caused by the copy being gone. Under
 * `NO_REFUND_UNCAPPED` the copy IS still owned and the source line says so, so a
 * blanket "no owned copy to refund" would be a false statement about that row.
 *
 * `eraseFreesNoSlot` is derived from this, so the boolean and the reason cannot
 * disagree about whether a refund happens.
 *
 * @param {{sourceItemUuid?: string|null, sourceOwned?: boolean, sourceCapped?: boolean}} raw
 * @returns {string} one of the `NO_REFUND_*` values
 */
export function eraseNoRefundReason(raw = {}) {
  if (!raw.sourceItemUuid) return NO_REFUND_NO_SOURCE;
  if (raw.sourceOwned !== true) return NO_REFUND_NOT_OWNED;
  if (raw.sourceCapped !== true) return NO_REFUND_UNCAPPED;
  return NO_REFUND_NONE;
}

/**
 * Project one owned copy of a recipe item into a row.
 *
 * @param {object} raw Seam-collected owned-copy facts.
 * @returns {object} Row with derived uses, exhaustion, and expend affordance.
 */
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
    // GM diagnostic info: how durable the definition link is. `duplicate` is the
    // low-confidence tier the bulk auto-learn gate already refuses.
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

/**
 * Project one learned recipe into a row. Learned entries are INDEPENDENT of
 * currently-owned copies — the two lists are never coupled.
 *
 * @param {object} raw Seam-collected learned-entry facts.
 * @returns {object}
 */
export function projectLearnedRecipeRow(raw = {}) {
  const source = learnedRecipeSource(raw);
  return {
    recipeId: String(raw.recipeId || ''),
    name: String(raw.recipeName || '') || String(raw.recipeId || ''),
    // A learned RECIPE, not a recipe item: it resolves through the shared chokepoint, so
    // an image-less recipe renders the blueprint rather than the generic item bag
    // (`data-models/spec.md` `## Recipe` requirement 16). The bag default above is
    // correct for an owned recipe-ITEM copy, which really is an Item (issue 887).
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
 * Project one roster character: its rows, its per-character roll-ups, and the D8
 * ordering hazard.
 *
 * The hazard band is CONDITIONAL — under `learnScope: "total"` the budget refund
 * resolves the party-pool key through a STILL-OWNED source copy, so Delete→Erase
 * permanently strands one party-pool slot while Erase→Delete reclaims it. It is
 * raised only when this character owns a `total`-scope copy that is the source of
 * a still-learned entry; a permanent band for a conditional hazard is noise.
 *
 * @param {object} raw Seam-collected character facts.
 * @returns {object}
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
    // Learned entries belonging to ANOTHER system (`learnedRecipes` is
    // system-agnostic; definitions are per-system) and entries whose recipe no
    // longer resolves at all. Rendered only when non-zero.
    otherSystemCount: Number(raw.otherSystemCount) || 0,
    orphanCount: Number(raw.orphanCount) || 0,
    hasPartyPoolHazard: ownedCopies.some(
      (row) => row.learnScope === 'total' && learnedSourceUuids.has(row.itemUuid)
    ),
    tracked: ownedCopies.length > 0 || learnedRecipes.length > 0,
  };
}

/**
 * Roster search. Kept here so the filter the disarm rules key on is one testable
 * pure function rather than component-local logic.
 *
 * @param {Array<object>} characters
 * @param {string} term
 * @returns {Array<object>}
 */
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
 * Project the whole Knowledge surface snapshot published as top-level
 * `viewState.knowledge`. ALWAYS returns a new object.
 *
 * A `null` snapshot (or an inactive surface) yields the empty state, which is
 * what makes `refreshKnowledge` free while the surface is closed.
 *
 * @param {object|null} raw Seam snapshot, or null when the surface is closed.
 * @param {object} [options]
 * @param {boolean} [options.active] Whether the Knowledge surface is open.
 * @param {string} [options.selectedActorId] Roster selection.
 * @param {string} [options.defaultTab] Tab resolved ONCE on surface entry.
 * @returns {object}
 */
export function projectKnowledgeSnapshot(raw, options = {}) {
  const active = options.active === true;
  const defaultTab = options.defaultTab || KNOWLEDGE_TAB_RECIPE_ITEMS;
  if (!active || !raw) {
    return {
      active,
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
    systemId: String(raw.systemId || ''),
    definitionCount: Number(raw.definitionCount) || 0,
    defaultTab,
    characters,
    selectedActorId: selectedCharacter?.id || '',
    selectedCharacter,
  };
}
