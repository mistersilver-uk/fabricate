/**
 * The resolution-mode change confirm's HTML, from a `summarizeModeChange` summary: the migrate or
 * delete sentence, then the ingredient sets an alchemy collapse drops, then the recipes that lose
 * their failure set; each list's paragraph is omitted when it is empty. Every name is escaped.
 */
import { esc } from '../../presenters/htmlEscape.js';

const RESOLUTION_MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  routedByIngredients: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredients',
  routedByCheck: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheck',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy',
};

function _resolutionModeLabel(mode, localize) {
  const key = RESOLUTION_MODE_LABEL_KEYS[mode];
  return key ? localize?.(key) || mode : mode;
}

/** The set's trimmed name, else "Set N", as `setDisplayName` reads it. */
function _setLabel(set, localize) {
  const name = String(set?.name ?? '').trim();
  if (name) return name;
  return `${localize?.('FABRICATE.Admin.Manager.Recipe.SetLabel') || 'Set'} ${set.index + 1}`;
}

function _migrateSentence({ migrated: count, deleted }, mode, localize) {
  if (deleted.length === 0) {
    return (
      localize?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeContent', { count, mode }) ||
      `${count} recipe(s) will be migrated to ${mode}.`
    );
  }
  const names = deleted.map(esc).join(', ');
  const deleteCount = deleted.length;
  return (
    localize?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeContentDelete', {
      count,
      deleteCount,
      names,
      mode,
    }) ||
    `${count} recipe(s) will be migrated to ${mode}; ${deleteCount} cannot be migrated and will be deleted: ${names}.`
  );
}

function _droppedSetsSentence(dropped, localize) {
  const sets = dropped
    .map(({ recipe, sets: lost }) => {
      const labels = lost.map((set) => esc(_setLabel(set, localize))).join(', ');
      return `${esc(recipe)} (${labels})`;
    })
    .join('; ');
  const count = dropped.length;
  return (
    localize?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeDroppedSets', { count, sets }) ||
    `${count} recipe(s) will keep only their first ingredient set; these ingredient sets will be dropped: ${sets}.`
  );
}

function _droppedFailureSetsSentence(recipes, mode, localize) {
  const names = recipes.map(esc).join(', ');
  const count = recipes.length;
  return (
    localize?.('FABRICATE.Admin.SystemSettings.ResolutionModeChangeDroppedFailureSets', {
      count,
      mode,
      names,
    }) ||
    `${count} recipe(s) will lose their failure result set, which ${mode} does not have: ${names}.`
  );
}

/** One to three `<p>` blocks; a `localize` returning `''` or `undefined` falls back to English. */
export function modeChangeConfirmContent(summary, toMode, localize) {
  const mode = _resolutionModeLabel(toMode, localize);
  const blocks = [_migrateSentence(summary, mode, localize)];
  if (summary.droppedIngredientSets.length > 0) {
    blocks.push(_droppedSetsSentence(summary.droppedIngredientSets, localize));
  }
  if (summary.droppedFailureSets.length > 0) {
    blocks.push(_droppedFailureSetsSentence(summary.droppedFailureSets, mode, localize));
  }
  return blocks.map((block) => `<p>${block}</p>`).join('');
}
