// Pure helper that synthesizes ONE book "row" matching the exact shape
// `InventoryListingBuilder._buildRecipeItemRows` produces (the shape locked by
// `tests/inventory-listing-builder.test.js`). It lets the GM recipe-item editor feed
// the REAL player `InventoryDetail.svelte` component a synthetic row so the "How
// players see it" preview can never drift from the actual player UI.
//
// It imports ONLY the sibling pure `craftingImageDefaults` helper (already a harness
// rawModule), keeping the mounted-test allowlist minimal.

import { resolveRecipeImage } from './craftingImageDefaults.js';

function str(value) {
  return value == null ? '' : String(value);
}

// The preview owns ONE copy: no count the store cannot produce is invented.
export function buildRecipeItemPreviewRow({
  key,
  name,
  img,
  description,
  totalQuantity = 1,
  mode,
  caps,
  recipes,
  requirements,
} = {}) {
  const learnable = mode === 'knowledge';
  const craftable = mode === 'item';
  const limitLearning = caps?.learn?.limitLearning === true || caps?.learn?.limitRecipes === true;

  // Requirements are only surfaced when the book is learnable AND Limited learning is
  // on — parity with the builder's `_evaluateBookRequirements` toggle-gating.
  const rawRequirements = Array.isArray(requirements) ? requirements : [];
  const effectiveRequirements = learnable && limitLearning ? rawRequirements : [];
  const unmet = effectiveRequirements.filter((requirement) => !requirement?.met);
  const blocked = effectiveRequirements.length > 0 && unmet.length > 0;
  const reason = unmet.map((requirement) => str(requirement?.name)).join(', ');

  const linkedRecipes = (Array.isArray(recipes) ? recipes : []).map((recipe) => ({
    id: str(recipe?.id) || null,
    name: str(recipe?.name),
    description: str(recipe?.description),
    // Mirror the builder's image resolution so an empty/generic-bag recipe image
    // falls back to the blueprint (never the item-bag SVG) in the embedded preview.
    img: resolveRecipeImage(recipe),
    learned: false,
    learnBlocked: blocked,
    learnBlockedReason: reason,
  }));

  return {
    key,
    recipeItemId: str(key) || null,
    componentId: null,
    systemId: null,
    systemName: '',
    name: str(name),
    img: img ?? null,
    icon: null,
    description: str(description),
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    isRecipeItem: true,
    learnable,
    craftable,
    totalQuantity,
    sources: [],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    recipes: linkedRecipes,
    requirements: effectiveRequirements,
    // Applicability-suppressed exactly like the builder: the use cap only for a held
    // (item) book, the learn cap only for a teachable book.
    caps: {
      item: craftable
        ? { limitUses: caps?.item?.limitUses === true, maxUses: caps?.item?.maxUses }
        : { limitUses: false },
      learn: learnable
        ? {
            limitLearning,
            learnsAllowed: caps?.learn?.learnsAllowed ?? caps?.learn?.maxRecipes,
            learnScope: caps?.learn?.learnScope,
            learningMode: caps?.learn?.learningMode,
          }
        : { limitLearning: false },
    },
    // No runtime per-document counters exist for a synthetic preview row.
    limits: { uses: null, learning: null },
  };
}
