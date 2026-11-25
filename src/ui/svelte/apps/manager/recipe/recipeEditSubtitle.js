/**
 * The recipe editor's header subline, "<category> · <mode>" with the check the row's pill states,
 * and the mode word the title bar shares.
 */
import {
  getRecipeCategoryLabel,
  normalizeRecipeCategory,
} from '../../../../../utils/recipeCategories.js';
import { recipeCheckSubtitleSuffix } from '../../../../model/recipeBrowserModel.js';

const SIMPLE = ['FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'];

const MODE_LABELS = Object.freeze({
  simple: SIMPLE,
  routedByIngredients: [
    'FABRICATE.Admin.Manager.ResolutionRoutedByIngredients',
    'Routed by ingredients',
  ],
  routedByCheck: ['FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'],
  progressive: ['FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'],
  alchemy: ['FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy'],
});

/** The mode's word; an unknown mode reads as its own token, and an absent one as Simple. */
export function resolutionModeLabel(mode, text) {
  if (Object.hasOwn(MODE_LABELS, mode)) return text(...MODE_LABELS[mode]);
  return mode || text(...SIMPLE);
}

/**
 * @param {object} input
 * @param {object|null} input.recipe The staged draft, for its category.
 * @param {string} input.mode The system's resolution mode.
 * @param {object|null} input.checkSummary The projected row's check pill.
 * @param {(key: string, fallback: string) => string} input.text The shell's localizer.
 * @param {Function} input.localize The bridge localizer the category label reads.
 */
export function recipeEditSubtitle({ recipe, mode, checkSummary, text, localize }) {
  const category = getRecipeCategoryLabel(normalizeRecipeCategory(recipe?.category), localize);
  return `${category} · ${resolutionModeLabel(mode, text)}${recipeCheckSubtitleSuffix(checkSummary, text)}`;
}
