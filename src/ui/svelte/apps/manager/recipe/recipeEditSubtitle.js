/**
 * The recipe editor's header subline, "<category> · <mode>" with the check the row's pill states,
 * and the mode word the title bar shares. An iterative recipe states no check, and a multi-step one
 * adds its step count.
 */
import { fill } from '../../../../../utils/fillPlaceholders.js';
import {
  getRecipeCategoryLabel,
  normalizeRecipeCategory,
} from '../../../../../utils/recipeCategories.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';
import { recipeCheckSubtitleSuffix } from '../../../../model/recipeBrowserModel.js';
import { iterativeResolutionModeOption } from '../resolutionModeOptions.js';

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
  iterative: [iterativeResolutionModeOption.labelKey, iterativeResolutionModeOption.fallback],
});

/** The mode's word; an unknown mode reads as its own token, and an absent one as Simple. */
export function resolutionModeLabel(mode, text) {
  if (Object.hasOwn(MODE_LABELS, mode)) return text(...MODE_LABELS[mode]);
  return mode || text(...SIMPLE);
}

/**
 * @param {object} input
 * @param {object|null} input.recipe The staged draft, for its category and steps.
 * @param {string} input.mode The system's resolution mode.
 * @param {object|null} input.checkSummary The projected row's check pill.
 * @param {(key: string, fallback: string) => string} input.text The shell's localizer.
 * @param {Function} input.localize The bridge localizer the category label reads.
 */
export function recipeEditSubtitle({ recipe, mode, checkSummary, text, localize }) {
  const category = getRecipeCategoryLabel(normalizeRecipeCategory(recipe?.category), localize);
  const head = `${category} · ${resolutionModeLabel(mode, text)}`;
  if (mode !== 'iterative') return `${head}${recipeCheckSubtitleSuffix(checkSummary, text)}`;
  const count = arrayOrEmpty(recipe?.steps).length;
  if (count < 2) return head;
  const steps = text(
    'FABRICATE.Admin.Manager.Recipe.Iterative.SublineSteps',
    '{count} steps, each worked over sessions'
  );
  return `${head} · ${fill(steps, { count })}`;
}
