/**
 * The managed-component normalizer (issue 1713): the free pure function the
 * `CraftingSystemManager` delegates to, so a component from any origin loads the same persisted
 * shape. Internal to that aggregate — a private continuation of the `_normalizeSystem` chokepoint,
 * reached only through the manager, so nothing else imports it.
 */
import { normalizeComponentCategory } from '../../utils/componentCategories.js';
import { authoredComplications } from '../../utils/componentComplications.js';
import { plainTextDescription } from '../../utils/plainTextDescription.js';

import { normalizeEssenceQuantities } from './essences.js';
import { normalizeSalvage } from './salvage.js';

/** Normalize a managed component. The salvage context (issue 764) is threaded through an options
 * bag so `_normalizeSalvage` can apply the Simple-mode group-count clamp; a bare call leaves
 * salvage groups untouched. A legacy positional `validEssenceIds` Set is still accepted. */
export function normalizeComponent(item = {}, options = {}) {
  // A bare `validEssenceIds` Set is never an options bag, so it runs with no salvage context.
  const opts = options instanceof Set ? { validEssenceIds: options } : options || {};
  const { validEssenceIds = null, salvageResolutionMode, salvageSimpleCheckHasFormula } = opts;
  const difficulty = Number(item.difficulty);
  // New-name-first, legacy-name-tolerant (issue 560): the pre-#560 shape used
  // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`; accept both and emit the new names
  // so a not-yet-1.16.0-migrated component is never stripped on save.
  const originItemUuid =
    item.originItemUuid ||
    item.registeredItemUuid ||
    item.sourceItemUuid ||
    item.sourceUuid ||
    null;
  const registeredItemUuid =
    item.registeredItemUuid ||
    item.originItemUuid ||
    item.sourceUuid ||
    item.sourceItemUuid ||
    null;
  const primaryRefs = new Set(
    [registeredItemUuid, originItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
  );
  const rawAliasItemUuids = Array.isArray(item.aliasItemUuids)
    ? item.aliasItemUuids
    : Array.isArray(item.fallbackItemIds)
      ? item.fallbackItemIds
      : null;
  const aliasItemUuids = Array.isArray(rawAliasItemUuids)
    ? [
        ...new Set(
          rawAliasItemUuids
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id) => id && !primaryRefs.has(id))
        ),
      ]
    : [];
  return {
    id: item.id || foundry.utils.randomID(),
    name: item.name || 'Unnamed Item',
    img: item.img || 'icons/svg/item-bag.svg',
    description: plainTextDescription(item.description),
    originItemUuid,
    // Transitional alias for current UI/engine references.
    registeredItemUuid,
    aliasItemUuids,
    tier: item.tier || null,
    // Single-valued (issue 676), defaulting to the reserved `general`, never "uncategorized",
    // which is how every existing component gains one without a migration; `tags` is separate.
    category: normalizeComponentCategory(item.category),
    tags: Array.isArray(item.tags) ? item.tags : [],
    essences: normalizeEssenceQuantities(item.essences, validEssenceIds),
    difficulty: Number.isFinite(difficulty) && difficulty >= 1 ? Math.floor(difficulty) : undefined,
    // Progressive component complications (issue 1286) sit TOP-LEVEL and deliberately NOT under
    // `salvage`: a complication fires for a component's part in progressive crafting, salvage OR
    // gathering, while `salvage` is only valid when `features.salvage` is true. The attach is
    // absence-preserving, so a component that authored none needs no migration.
    ...authoredComplications(item.complications),
    // Salvage config is always normalized and preserved on the component so the
    // `features.salvage` toggle is non-destructive: turning salvage off hides and
    // skips it (UI/validation/runtime gate on the flag) but never deletes authored
    // salvage; toggling back on restores it.
    salvage: normalizeSalvage(item.salvage, {
      salvageResolutionMode,
      salvageSimpleCheckHasFormula,
    }),
  };
}
