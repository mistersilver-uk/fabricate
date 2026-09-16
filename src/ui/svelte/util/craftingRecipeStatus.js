// The player Crafting list's callout descriptor per browse status. Keyed by the
// `CRAFTING_BROWSE_STATUS` vocabulary `CraftingListingBuilder` emits, so the UI never branches on a
// raw token, and `tone` is a semantic token CSS resolves — never a colour literal.

import { CRAFTING_BROWSE_STATUS } from '../../../systems/CraftingListingBuilder.js';

const STATUS_PRESENTATION = Object.freeze({
  [CRAFTING_BROWSE_STATUS.AVAILABLE]: Object.freeze({
    tone: 'success',
    icon: 'fa-solid fa-circle-check',
    labelKey: 'FABRICATE.App.Crafting.Status.Available',
  }),
  [CRAFTING_BROWSE_STATUS.LOCKED]: Object.freeze({
    tone: 'neutral',
    icon: 'fa-solid fa-lock',
    labelKey: 'FABRICATE.App.Crafting.Status.Locked',
  }),
  [CRAFTING_BROWSE_STATUS.UNKNOWN]: Object.freeze({
    tone: 'info',
    icon: 'fa-solid fa-circle-question',
    labelKey: 'FABRICATE.App.Crafting.Status.Unknown',
  }),
  [CRAFTING_BROWSE_STATUS.EXHAUSTED]: Object.freeze({
    tone: 'warning',
    icon: 'fa-solid fa-hourglass-end',
    labelKey: 'FABRICATE.App.Crafting.Status.Exhausted',
  }),
  [CRAFTING_BROWSE_STATUS.MISSING_MATERIALS]: Object.freeze({
    tone: 'danger',
    icon: 'fa-solid fa-triangle-exclamation',
    labelKey: 'FABRICATE.App.Crafting.Status.MissingMaterials',
  }),
  [CRAFTING_BROWSE_STATUS.DISCOVERY]: Object.freeze({
    tone: 'info',
    icon: 'fa-solid fa-magnifying-glass',
    labelKey: 'FABRICATE.App.Crafting.Status.Discovery',
  }),
});

const FALLBACK_PRESENTATION = STATUS_PRESENTATION[CRAFTING_BROWSE_STATUS.UNKNOWN];

// An unrecognized status falls back to "unknown", so the list never renders a bare callout.
export function craftingRecipeStatus(status) {
  return STATUS_PRESENTATION[status] ?? FALLBACK_PRESENTATION;
}

export { STATUS_PRESENTATION as CRAFTING_RECIPE_STATUS_PRESENTATION };
