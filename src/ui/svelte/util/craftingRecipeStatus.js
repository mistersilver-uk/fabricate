/**
 * craftingRecipeStatus — pure presentation map from a recipe's browse status to
 * its callout descriptor (`{ tone, icon, labelKey }`) for the player Crafting
 * list. No Foundry/DOM dependencies, so it is fully unit-testable.
 *
 * Keyed by the {@link CRAFTING_BROWSE_STATUS} vocabulary the
 * {@link CraftingListingBuilder} emits, so the UI never branches on a raw status
 * token. `tone` is a semantic token (resolved to a colour by CSS in a later UI
 * slice — never a colour literal here); `icon` is a Font Awesome class; and
 * `labelKey` is a localization key the caller passes through `localize`.
 */

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

/**
 * Resolve the `{ tone, icon, labelKey }` callout descriptor for a browse status.
 * An unrecognized status falls back to the neutral "unknown" descriptor so the
 * list never renders a bare/undefined callout.
 *
 * @param {string} status A {@link CRAFTING_BROWSE_STATUS} value.
 * @returns {{ tone: string, icon: string, labelKey: string }}
 */
export function craftingRecipeStatus(status) {
  return STATUS_PRESENTATION[status] ?? FALLBACK_PRESENTATION;
}

export { STATUS_PRESENTATION as CRAFTING_RECIPE_STATUS_PRESENTATION };
