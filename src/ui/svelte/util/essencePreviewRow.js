// The two synthetic rows the essence editor's "How it appears" preview mounts on the REAL player
// `InventoryItemCard`: the per-essence aggregate `InventoryListingBuilder._buildEssenceRows` emits,
// and a fake carrying component holding this essence as a pip. Feeding the real component a
// synthetic row is what stops the preview drifting from what players see, as `recipeItemPreviewRow`
// does. It imports NOTHING, so the mounted-test allowlist stays small.

// A core Foundry pack icon under Foundry's own `public/` root, so it resolves in every install
// whatever the game system. Deliberately NOT `GENERIC_ITEM_IMAGE`, which is a load-bearing "no
// image" SENTINEL the resolvers read as ABSENT artwork and swap for a fallback glyph; this tile is
// asserting "here is a component", not "here is one nobody gave an image".
export const SAMPLE_COMPONENT_IMAGE = 'icons/containers/bags/pack-engraved-leather-leaf-tan.webp';

function str(value) {
  return value == null ? '' : String(value);
}

// The preview owns ONE copy, exactly as `recipeItemPreviewRow` does: no count the store cannot
// produce is invented.
export function buildEssencePreviewRow(
  essence,
  { sampleComponentName = '', totalQuantity = 1 } = {}
) {
  const id = str(essence?.id) || null;
  const name = str(essence?.name);
  const icon = str(essence?.icon) || null;
  // Shaped exactly as `_buildEssenceRows` emits — a bare `--fab-tag-*` key, or null when unset —
  // so the tile tints its glyph identically to the real player inventory.
  const colorToken = str(essence?.colorToken) || null;

  // Shaped like the `essences[]` entries the builder folds onto a component row; the card keys
  // pips on `id`, and the shared `colorToken` is what tints the pip rather than `--fab-text`.
  const pip = { id: str(id), name, icon: icon || 'fas fa-mortar-pestle', colorToken };

  // `img: null` + `isEssenceSource: true` is what routes the card to its essence-glyph tile branch.
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

  // `isEssenceSource: false` routes the card to its artwork branch instead.
  const componentRow = {
    key: `essence:preview:component:${id ?? 'draft'}`,
    componentId: null,
    systemId: null,
    systemName: '',
    name: str(sampleComponentName),
    img: SAMPLE_COMPONENT_IMAGE,
    icon: null,
    // Null rather than absent, purely so both preview rows keep the one builder-row shape.
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
