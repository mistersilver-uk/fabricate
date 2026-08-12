// Pure helper that synthesizes the TWO inventory "rows" the essence editor's "How it
// appears" preview mounts on the REAL player `InventoryItemCard.svelte`:
//
//   1. an ESSENCE-SOURCE row, shaped exactly like `InventoryListingBuilder._buildEssenceRows`
//      emits (the synthetic per-essence aggregate), so the card renders the real player
//      essence glyph tile (`.inventory-card-essence`); and
//   2. a fake CARRYING-COMPONENT row — an ordinary inventory item drawing a CORE Foundry
//      icon that exists in every install ({@link SAMPLE_COMPONENT_IMAGE}) and carrying THIS
//      essence as a pip, shaped like the component rows `InventoryListingBuilder` folds an
//      essence's `essences[]` entry onto.
//
// Mirrors `recipeItemPreviewRow.js`: the editor feeds the REAL player component a synthetic
// row so the preview can never drift from what players actually see. It imports NOTHING, so
// the mounted-test allowlist stays small.

/**
 * The artwork the preview's fake carrying component wears.
 *
 * A real core Foundry pack icon, shipped in the release archive under Foundry's own `public/`
 * root — no `systems/` prefix — so it resolves in every install whatever the game system.
 *
 * It is deliberately NOT `GENERIC_ITEM_IMAGE` (`icons/svg/item-bag.svg`). That path is a
 * load-bearing "no image" SENTINEL: `resolveRecipeImage` and
 * `InventoryListingBuilder._resolveRecipeImg` both read it as *absent* artwork, and a material
 * tile swaps it for a fallback glyph. This tile is asserting "here is a component", not "here
 * is a component nobody gave an image", so it needs artwork the resolvers treat as real.
 */
export const SAMPLE_COMPONENT_IMAGE = 'icons/containers/bags/pack-engraved-leather-leaf-tan.webp';

function str(value) {
  return value == null ? '' : String(value);
}

/**
 * Build the essence-tile + carrying-component preview rows for the "How players see it" card.
 *
 * @param {object} [essence] the live essence draft — `{ id, name, icon, colorToken }`.
 * @param {object} [options]
 * @param {string} [options.sampleComponentName] display name for the fake carrying
 *   component (the caller resolves the fallback copy, so this may be empty).
 * @param {number} [options.totalQuantity=1] owned quantity both sample tiles report; the
 *   preview owns one copy, exactly as `recipeItemPreviewRow` does — no count the store
 *   cannot produce is invented.
 * @returns {{ essence: object, component: object }} two rows shaped like
 *   `InventoryListingBuilder` output, ready to mount on `InventoryItemCard`.
 */
export function buildEssencePreviewRow(
  essence,
  { sampleComponentName = '', totalQuantity = 1 } = {}
) {
  const id = str(essence?.id) || null;
  const name = str(essence?.name);
  const icon = str(essence?.icon) || null;
  // The essence's chosen palette token (a bare `--fab-tag-*` key, or null when unset), shaped
  // exactly like `InventoryListingBuilder._buildEssenceRows` emits, so the mounted essence tile
  // tints its glyph to the essence colour identically to the real player inventory.
  const colorToken = str(essence?.colorToken) || null;

  // The essence pip the carrying component's card reads: the essence's own id, name,
  // authored icon and chosen colour token, shaped exactly like the `essences[]` entries the
  // builder folds onto a component row (the card keys pips on `id`). `colorToken` is the
  // same sanitised bare `--fab-tag-*` token as the row above — null when unset — so the pip
  // tints to the essence's colour instead of the fixed `--fab-text` glyph.
  const pip = { id: str(id), name, icon: icon || 'fas fa-mortar-pestle', colorToken };

  // (1) The synthetic per-essence aggregate — `img: null`, `icon: <essence glyph>`,
  // `isEssenceSource: true` — so `InventoryItemCard` renders its essence-glyph tile branch.
  const essenceRow = {
    key: `essence:preview:${id ?? 'draft'}`,
    componentId: id,
    systemId: null,
    systemName: '',
    name,
    img: null,
    icon,
    colorToken,
    tags: [],
    tier: null,
    isEssenceSource: true,
    isTool: false,
    broken: false,
    salvage: null,
    totalQuantity,
    sources: [],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
  };

  // (2) The fake carrying component — an ordinary item on a CORE Foundry pack icon, carrying
  // the one essence pip. `isEssenceSource: false` routes the card to its artwork branch.
  const componentRow = {
    key: `essence:preview:component:${id ?? 'draft'}`,
    componentId: null,
    systemId: null,
    systemName: '',
    name: str(sampleComponentName),
    img: SAMPLE_COMPONENT_IMAGE,
    icon: null,
    // A carrying component has no essence colour of its own (its face is artwork, and the
    // card ignores `colorToken` on a non-essence row); carried null purely to keep both
    // preview rows the single builder-row shape the card contract reads.
    colorToken: null,
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    broken: false,
    salvage: null,
    totalQuantity,
    sources: [],
    essences: [pip],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
  };

  return { essence: essenceRow, component: componentRow };
}
