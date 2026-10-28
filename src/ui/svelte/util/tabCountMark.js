import { localizeOr } from './localizeOr.js';

// Each unit is a singular/plural pair of `[key, English fallback]`, so a count of exactly 1 reads
// in the singular and every other count, 0 included, in the plural.
const unit = (singular, plural) => Object.freeze({ one: singular, other: plural });

export const TAB_COUNT_UNITS = Object.freeze({
  linkedRecipes: unit(
    ['FABRICATE.Admin.Manager.TabCounts.LinkedRecipesOne', '{count} linked recipe'],
    ['FABRICATE.Admin.Manager.TabCounts.LinkedRecipesOther', '{count} linked recipes']
  ),
  ingredients: unit(
    ['FABRICATE.Admin.Manager.TabCounts.IngredientsOne', '{count} ingredient'],
    ['FABRICATE.Admin.Manager.TabCounts.IngredientsOther', '{count} ingredients']
  ),
  results: unit(
    ['FABRICATE.Admin.Manager.TabCounts.ResultsOne', '{count} result'],
    ['FABRICATE.Admin.Manager.TabCounts.ResultsOther', '{count} results']
  ),
  tools: unit(
    ['FABRICATE.Admin.Manager.TabCounts.ToolsOne', '{count} tool'],
    ['FABRICATE.Admin.Manager.TabCounts.ToolsOther', '{count} tools']
  ),
  requirements: unit(
    ['FABRICATE.Admin.Manager.TabCounts.RequirementsOne', '{count} requirement'],
    ['FABRICATE.Admin.Manager.TabCounts.RequirementsOther', '{count} requirements']
  ),
  behaviours: unit(
    ['FABRICATE.Admin.Manager.TabCounts.BehavioursOne', '{count} configured behaviour'],
    ['FABRICATE.Admin.Manager.TabCounts.BehavioursOther', '{count} configured behaviours']
  ),
  tasks: unit(
    ['FABRICATE.Admin.Manager.TabCounts.TasksOne', '{count} task'],
    ['FABRICATE.Admin.Manager.TabCounts.TasksOther', '{count} tasks']
  ),
  events: unit(
    ['FABRICATE.Admin.Manager.TabCounts.EventsOne', '{count} event'],
    ['FABRICATE.Admin.Manager.TabCounts.EventsOther', '{count} events']
  ),
  recipeItems: unit(
    ['FABRICATE.Admin.Manager.TabCounts.RecipeItemsOne', '{count} recipe item'],
    ['FABRICATE.Admin.Manager.TabCounts.RecipeItemsOther', '{count} recipe items']
  ),
  learnedRecipes: unit(
    ['FABRICATE.Admin.Manager.TabCounts.LearnedRecipesOne', '{count} learned recipe'],
    ['FABRICATE.Admin.Manager.TabCounts.LearnedRecipesOther', '{count} learned recipes']
  ),
  outcomes: unit(
    ['FABRICATE.Admin.Manager.TabCounts.OutcomesOne', '{count} outcome'],
    ['FABRICATE.Admin.Manager.TabCounts.OutcomesOther', '{count} outcomes']
  ),
  triggers: unit(
    ['FABRICATE.Admin.Manager.TabCounts.TriggersOne', '{count} trigger'],
    ['FABRICATE.Admin.Manager.TabCounts.TriggersOther', '{count} triggers']
  ),
  modifiers: unit(
    ['FABRICATE.Admin.Manager.TabCounts.ModifiersOne', '{count} modifier'],
    ['FABRICATE.Admin.Manager.TabCounts.ModifiersOther', '{count} modifiers']
  ),
});

/**
 * A `count` mark for `EditorTabs` whose `name` states what the numeral counts ("3 linked recipes"),
 * so the tab is spoken as its label plus that phrase; `extra` carries the mark's other fields.
 */
export function tabCountMark(count, countUnit, extra = {}) {
  const [key, fallback] = Number(count) === 1 ? countUnit.one : countUnit.other;
  return { vehicle: 'count', ...extra, label: count, name: localizeOr(key, fallback, { count }) };
}

/**
 * `badges` for `EditorTabs` with each unnamed `count` mark on a tab in `unitsByTab` given the
 * name `tabCountMark` builds; every other mark, and every tab outside the map, passes through.
 */
export function nameTabCounts(badges, unitsByTab) {
  const nameMark = (mark, countUnit) =>
    mark?.vehicle === 'count' && !mark.name
      ? tabCountMark(mark.label ?? mark.value, countUnit, mark)
      : mark;
  return Object.fromEntries(
    Object.entries(badges ?? {}).map(([id, value]) => {
      const countUnit = unitsByTab[id];
      if (!countUnit) return [id, value];
      return [
        id,
        Array.isArray(value)
          ? value.map((mark) => nameMark(mark, countUnit))
          : nameMark(value, countUnit),
      ];
    })
  );
}
