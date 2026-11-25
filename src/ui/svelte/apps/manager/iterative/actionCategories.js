/**
 * The categories a Crafting Action can be filed under: the union of those the system's actions and
 * the draft already use, and the live check a new one is typed against. Every key is a literal,
 * because `lang-keys-no-orphans` cannot see a built one.
 */
import { arrayOrEmpty, trimString } from '../../../../../utils/scalars.js';
import { interpolate } from '../checks/checksCopy.js';

const fold = (name) => trimString(name).toLowerCase();

/** The category names `actions` and `draftCategories` use, each once, in alphabetical order. */
export function actionCategoryNames(actions, draftCategories = []) {
  const seen = new Map();
  const names = [
    ...arrayOrEmpty(actions).flatMap((action) => arrayOrEmpty(action?.categories)),
    ...arrayOrEmpty(draftCategories),
  ];
  for (const name of names) {
    const trimmed = trimString(name);
    if (trimmed && !seen.has(fold(trimmed))) seen.set(fold(trimmed), trimmed);
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

/** Levenshtein distance between `left` and `right`, case-folded. */
export function editDistance(left, right) {
  const a = fold(left);
  const b = fold(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** The existing name `value` repeats ignoring case, else the nearest within two edits, else `null`. */
export function nearCategory(value, names) {
  const typed = trimString(value);
  if (!typed) return null;
  const exact = names.find((name) => fold(name) === fold(typed));
  if (exact) return { name: exact, exact: true };
  const near = names
    .map((name) => ({ name, distance: editDistance(name, typed) }))
    .filter(({ distance }) => distance <= 2)
    .sort((left, right) => left.distance - right.distance)[0];
  return near ? { name: near.name, exact: false } : null;
}

/**
 * The `InlineVocabularyAdd` `describeInput` for a new category: an exact repeat blocks, a near name
 * is offered as "Did you mean X?" and does not.
 * @returns {{ tone: string, message: string, blocked: boolean }}
 */
export function describeCategoryInput(value, names, text) {
  const match = nearCategory(value, names);
  if (!match) return { tone: '', message: '', blocked: false };
  if (match.exact) {
    return {
      tone: 'danger',
      blocked: true,
      message: interpolate(
        text(
          'FABRICATE.Admin.Manager.Iterative.CategoryExists',
          '{name} already exists. Pick it from the list instead.'
        ),
        { name: match.name }
      ),
    };
  }
  return {
    tone: 'warning',
    blocked: false,
    message: interpolate(
      text('FABRICATE.Admin.Manager.Iterative.CategoryDidYouMean', 'Did you mean {name}?'),
      { name: match.name }
    ),
  };
}
