/**
 * Pure list model for the GM recipe library (issue 643): filter → sort → paginate → group, plus the
 * per-row derivations the rich row renders.
 */

import { isFixedSumOver } from '../../systems/checkTarget.js';
import { currencyUnitDisplayName, findCurrencyUnit } from '../../systems/currencyProfile.js';
import { isChoiceGroup } from '../../utils/choiceGroupShape.js';
import { RESULT_KIND_GLYPHS } from '../presenters/resultKindGlyphs.js';

import {
  buildEntityBrowserModel,
  canonicalBrowserOptions,
  describeActiveEntityFilters,
  filterEntities,
  groupEntitiesByCategory,
  paginateEntities,
  sortEntities,
} from './entityBrowserModel.js';

/** Sort keys offered by the library toolbar, in menu order. */
export const RECIPE_SORT_KEYS = Object.freeze([
  'name',
  'attention',
  'dc',
  'ingredients',
  'results',
]);

/** Status filter values. */
export const RECIPE_STATUS_FILTERS = Object.freeze(['all', 'on', 'off']);

/** Lock filter values. */
export const RECIPE_LOCK_FILTERS = Object.freeze(['all', 'unlocked', 'locked']);

/** Default page size. */
export const RECIPE_DEFAULT_PAGE_SIZE = 25;

/** The filter / sort / group / paginate controls that live above the pure list model. */
export function createRecipeBrowserState() {
  return {
    statusFilter: 'all',
    lockFilter: 'all',
    categoryFilter: 'all',
    groupByCategory: true,
    sortKey: 'name',
    sortDirection: 'asc',
    pageIndex: 0,
    pageSize: RECIPE_DEFAULT_PAGE_SIZE,
    collapsedCategories: new Set(),
    systemId: '',
    bulkSelectedRecipeIds: new Set(),
  };
}

const GENERAL_CATEGORY = 'general';

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The category bucket a row belongs to, falling back to the reserved `general` catch-all. */
export function recipeCategoryOf(recipe) {
  const raw = typeof recipe?.category === 'string' ? recipe.category.trim() : '';
  return raw || GENERAL_CATEGORY;
}

/** The attention rank a row sorts on. */
export function attentionRank(recipe) {
  if (recipe?.enableBlocked !== true) return 0;
  return recipe?.enabled === false ? 2 : 1;
}

/**
 * How the recipe library shapes the shared pipeline. It supplies no category comparator, so
 * `general` sorts alphabetically among the named buckets rather than last; grouping off still draws
 * through one unnamed bucket, because the view renders groups rather than rows; and a non-string
 * search term makes no chip, which is the affordance the GM clears a search with.
 */
const RECIPE_ADAPTER = Object.freeze({
  rowsKey: 'recipes',
  sortKeys: RECIPE_SORT_KEYS,
  defaultPageSize: RECIPE_DEFAULT_PAGE_SIZE,
  categoryOf: recipeCategoryOf,
  ungroupedGroups: 'single',
  searchOf: (options) => (typeof options.search === 'string' ? options.search.trim() : ''),
  // A recipe with no resolvable DC sorts below every recipe that has one, in both directions,
  // rather than colliding with DC 0.
  sortValues: Object.freeze({
    attention: (recipe) => attentionRank(recipe),
    dc: (recipe) => numeric(recipe?.checkSummary?.dc, -Infinity),
    ingredients: (recipe) => numeric(recipe?.ingredientCount),
    results: (recipe) => numeric(recipe?.resultItemCount),
  }),
  // `all`, and any value the toolbar cannot produce, admits every row.
  filters: Object.freeze([
    {
      id: 'status',
      matches: (recipe, value) =>
        value === 'on' ? recipe?.enabled !== false : value !== 'off' || recipe?.enabled === false,
    },
    {
      id: 'lock',
      matches: (recipe, value) =>
        value === 'locked'
          ? recipe?.locked === true
          : value !== 'unlocked' || recipe?.locked !== true,
    },
    {
      id: 'category',
      matches: (recipe, value) => value === 'all' || recipeCategoryOf(recipe) === value,
    },
  ]),
});

export const filterRecipes = (rows, filters) => filterEntities(rows, filters, RECIPE_ADAPTER);
export const sortRecipes = (rows, options) => sortEntities(rows, options, RECIPE_ADAPTER);
export const paginateRecipes = (rows, options) => paginateEntities(rows, options, RECIPE_ADAPTER);
export const describeActiveFilters = (filters) =>
  describeActiveEntityFilters(filters, RECIPE_ADAPTER);
export const groupRecipesByCategory = (rows, totals) =>
  groupEntitiesByCategory(rows, totals, RECIPE_ADAPTER);

/** Pill kinds whose number is a Target, or which name a character value: never a DC (issue 2005). */
const TARGET_CHECK_KINDS = new Set(['target', 'attribute', 'dynamicTarget']);
/** Pill kinds of a counting check, which name its successes needed (issue 2006). */
const COUNT_CHECK_KINDS = new Set(['successes', 'dynamicSuccesses']);

/**
 * The `dc` sort key's label. Every row carries the system's one check, so any row's pill kind
 * says whether it grades a DC, a Target or successes needed; with no rows the system's
 * `evaluation` says, a summed check other than roll-over fixed naming a Target.
 */
export function recipeCheckSortLabel(recipes, text, evaluation = null) {
  const rows = Array.isArray(recipes) ? recipes : [];
  const kinds = new Set(rows.map((recipe) => recipe?.checkSummary?.kind));
  const counts =
    rows.length > 0
      ? [...COUNT_CHECK_KINDS].some((kind) => kinds.has(kind))
      : evaluation?.product === 'count';
  if (counts) return text('FABRICATE.Admin.Manager.Recipe.Count.Sort', 'Successes needed');
  const target =
    rows.length > 0
      ? [...TARGET_CHECK_KINDS].some((kind) => kinds.has(kind))
      : (evaluation?.product ?? 'sum') === 'sum' && !isFixedSumOver(evaluation);
  return target
    ? text('FABRICATE.Admin.Manager.Recipe.SortTarget', 'Check target')
    : text('FABRICATE.Admin.Manager.Recipe.SortDc', 'Check DC');
}

/** `{n} successes`, or `1 success`, for a counting row's pill (issue 2006). */
function successesPill(count, format) {
  return count === 1
    ? format('FABRICATE.Admin.Manager.Recipe.Count.PillOne', '1 success', {})
    : format('FABRICATE.Admin.Manager.Recipe.Count.Pill', '{count} successes', { count });
}

// The check states. `none` is the one WARNING: a system that cannot roll for this recipe is a
// thing the GM must be able to scan a library for. `ingredients` is its neutral sibling — a
// routedByIngredients system resolves off the ingredient set that was used, so no check is a
// working configuration, not a gap.
const CHECK_PILLS = {
  dc: ['FABRICATE.Admin.Manager.Recipe.CheckDc', 'DC {dc}', 'fas fa-dice-d20'],
  // Issue 2005: a roll-under fixed number is a Target, and a character value has no number.
  target: ['FABRICATE.Admin.Manager.Recipe.CheckTarget', 'Target {dc}', 'fas fa-dice-d20'],
  attribute: ['FABRICATE.Admin.Manager.Recipe.CheckAttribute', 'Character value', 'fas fa-user'],
  dynamicTarget: [
    'FABRICATE.Admin.Manager.Recipe.CheckDynamicTarget',
    'Dynamic target',
    'fas fa-dice-d20',
  ],
  dynamic: ['FABRICATE.Admin.Manager.Recipe.CheckDynamic', 'Dynamic DC', 'fas fa-dice-d20'],
  // Issue 2006: a counting check names its successes needed, singular for one.
  successes: ['FABRICATE.Admin.Manager.Recipe.Count.Pill', '{count} successes', 'fas fa-dice-d20'],
  dynamicSuccesses: [
    'FABRICATE.Admin.Manager.Recipe.Count.PillDynamic',
    'Dynamic successes',
    'fas fa-dice-d20',
  ],
  progressive: ['FABRICATE.Admin.Manager.Recipe.CheckProgressive', 'Progressive', 'fas fa-list-ol'],
  ingredients: [
    'FABRICATE.Admin.Manager.Recipe.CheckByIngredients',
    'By ingredients',
    'fas fa-code-branch',
  ],
  // A check the GM SWITCHED OFF, distinct from one the system cannot roll. Same neutral
  // treatment as `progressive` and `ingredients`: a working configuration, not a fault.
  checkOff: ['FABRICATE.Admin.Manager.Recipe.CheckOff', 'Check off', 'fas fa-power-off'],
  none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', 'No check', 'fas fa-triangle-exclamation'],
};

const CHECK_TOOLTIPS = {
  ingredients: [
    'FABRICATE.Admin.Manager.Recipe.CheckByIngredientsTooltip',
    'This system routes results by the ingredient set used, with no crafting check.',
  ],
  checkOff: [
    'FABRICATE.Admin.Manager.Recipe.CheckOffTooltip',
    'This system’s crafting check is switched off, so every matched attempt resolves as a success.',
  ],
  none: [
    'FABRICATE.Admin.Manager.Recipe.CheckNoneTooltip',
    'This system has no usable crafting check.',
  ],
};

/** Pill kinds that carry a number, and so take the mono face with tabular figures. */
const NUMERIC_CHECK_KINDS = new Set(['dc', 'target', 'successes']);

/**
 * The row's check pill from its projected `checkSummary`: `{ kind, icon, label, title, mono }`.
 * `format(key, fallback, replacements)` localizes.
 */
export function recipeCheckPill(summary, format) {
  const { kind = 'none', dc = null } = summary || {};
  const [labelKey, fallback, icon] = CHECK_PILLS[kind] || CHECK_PILLS.none;
  const tooltip = CHECK_TOOLTIPS[kind];
  return {
    kind,
    icon,
    label:
      kind === 'successes'
        ? successesPill(dc, format)
        : format(labelKey, fallback, { dc: dc ?? '' }),
    title: tooltip ? format(tooltip[0], tooltip[1], {}) : '',
    mono: NUMERIC_CHECK_KINDS.has(kind),
  };
}

const CHECK_FACTS = {
  dc: ['FABRICATE.Admin.Manager.Recipe.CheckDcValue', 'DC {dc}'],
  target: ['FABRICATE.Admin.Manager.Recipe.CheckTarget', 'Target {dc}'],
  attribute: ['FABRICATE.Admin.Manager.Recipe.CheckAttribute', 'Character value'],
  dynamicTarget: ['FABRICATE.Admin.Manager.Recipe.CheckDynamicShort', 'Dynamic'],
  dynamic: ['FABRICATE.Admin.Manager.Recipe.CheckDynamicShort', 'Dynamic'],
  dynamicSuccesses: ['FABRICATE.Admin.Manager.Recipe.CheckDynamicShort', 'Dynamic'],
  progressive: ['FABRICATE.Admin.Manager.Recipe.CheckProgressive', 'Progressive'],
  ingredients: ['FABRICATE.Admin.Manager.Recipe.CheckByIngredients', 'By ingredients'],
  checkOff: ['FABRICATE.Admin.Manager.Recipe.CheckOff', 'Check off'],
  none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', 'No check'],
};

/** The inspector's Crafting check fact: the pill's number or word, `Dynamic` for any macro. */
export function recipeCheckFact(summary, format) {
  const { kind = 'none', dc = null } = summary || {};
  if (kind === 'successes') return successesPill(dc, format);
  const [labelKey, fallback] = CHECK_FACTS[kind] || CHECK_FACTS.none;
  return format(labelKey, fallback, { dc: dc ?? '' });
}

/** The recipe editor subline's check part, from the row's pill: ` · DC 12`, ` · 2 successes`, …. */
export function recipeCheckSubtitleSuffix(summary, text) {
  const dcWord = () => text('FABRICATE.Admin.Manager.Recipe.CheckDcShort', 'DC');
  if (summary?.kind === 'dc' && Number.isFinite(Number(summary.dc))) {
    return ` · ${dcWord()} ${summary.dc}`;
  }
  if (summary?.kind === 'none') return ` · ${dcWord()} —`;
  if (summary?.kind === 'target' && Number.isFinite(Number(summary.dc))) {
    const target = text('FABRICATE.Admin.Manager.Recipe.CheckTarget', 'Target {dc}');
    return ` · ${target.replace('{dc}', String(summary.dc))}`;
  }
  if (summary?.kind === 'attribute') {
    return ` · ${text('FABRICATE.Admin.Manager.Recipe.CheckAttribute', 'Character value')}`;
  }
  if (summary?.kind === 'successes' && Number.isFinite(Number(summary.dc))) {
    const format = (key, fallback, { count = '' }) => text(key, fallback).replace('{count}', count);
    return ` · ${successesPill(summary.dc, format)}`;
  }
  return '';
}

/** The row's I/O readout (issue 643 §9 — resolved there, do not re-derive). */
export function deriveRecipeIo(recipe, resolutionMode) {
  const inCount = numeric(recipe?.ingredientCount);
  const showsItemCount = resolutionMode === 'simple' || resolutionMode === 'progressive';
  const outCount = showsItemCount
    ? numeric(recipe?.resultItemCount)
    : numeric(recipe?.resultGroupCount);

  return {
    inCount,
    outKind: showsItemCount ? 'items' : 'groups',
    outCount,
    // A recipe that produces nothing is the readout's one danger state.
    empty: outCount === 0,
  };
}

/** The row's status pills, in render order. */
export function deriveRecipeStatuses(recipe) {
  const pills = [];
  if (recipe?.enabled === false) {
    pills.push({ id: 'disabled', tone: 'subtle', icon: '' });
  }
  if (recipe?.locked === true) {
    pills.push({ id: 'locked', tone: 'accent', icon: 'fas fa-lock' });
  }
  if (recipe?.enableBlocked === true) {
    pills.push(
      recipe?.enabled === false
        ? { id: 'blocked', tone: 'danger', icon: 'fas fa-circle-exclamation' }
        : { id: 'incomplete', tone: 'warning', icon: 'fas fa-pen-ruler' }
    );
  }
  return pills;
}

// ── The library inspector's Requires / Produces lists (issue 643 §3.3) ──

/**
 * The recipe's execution scopes: its explicit `steps[]` when it has any, otherwise the recipe
 * itself as a single implicit scope.
 */
function executionScopes(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length > 0) {
    return steps.map((step, index) => ({
      id: step?.id || `step-${index + 1}`,
      name: step?.name || `Step ${index + 1}`,
      multi: steps.length > 1,
      ingredientSets: Array.isArray(step?.ingredientSets) ? step.ingredientSets : [],
      resultGroups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
    }));
  }
  return [
    {
      id: 'implicit-step',
      name: '',
      multi: false,
      ingredientSets: Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [],
      resultGroups: Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [],
    },
  ];
}

function findById(roster, id) {
  return (Array.isArray(roster) ? roster : []).find((entry) => entry?.id === id) || null;
}

/**
 * The Requires list, one entry per ingredient REQUIREMENT (an `ingredientGroup`), in authoring
 * order.
 */
export function buildRecipeRequirementRows(recipe, rosters = {}) {
  const components = rosters.componentOptions;
  const essences = rosters.essenceOptions;
  const requirements = [];

  for (const scope of executionScopes(recipe)) {
    for (const [setIndex, set] of (scope.ingredientSets || []).entries()) {
      const setId = set?.id || `${scope.id}-set-${setIndex + 1}`;
      const setName = set?.name || '';
      const base = { setId, setName, scopeName: scope.multi ? scope.name : '' };
      const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : [];

      for (const [groupIndex, group] of groups.entries()) {
        const options = Array.isArray(group?.options) ? group.options : [];
        if (options.length === 0) continue;
        const groupId = `${setId}:${group?.id || groupIndex}`;
        const members = options.map((option, optionIndex) => ({
          ...describeRequirementOption(option, components, essences),
          id: `${groupId}:${option?.id || optionIndex}`,
        }));

        if (members.length === 1) {
          requirements.push({ ...base, ...members[0], id: groupId, type: 'requirement' });
        } else {
          requirements.push({ ...base, id: groupId, type: 'anyOf', members });
        }
      }

      for (const [essenceId, amount] of Object.entries(set?.essences || {})) {
        requirements.push({
          ...base,
          id: `${setId}:essence:${essenceId}`,
          type: 'essence',
          kind: 'essence',
          name: findById(essences, essenceId)?.name || '',
          icon: findById(essences, essenceId)?.icon || 'fas fa-flask-vial',
          img: '',
          quantity: Number(amount) || 0,
        });
      }
    }
  }

  return requirements;
}

function describeRequirementOption(option, components, essences) {
  const match = option?.match || {};
  const quantity = Number(option?.quantity) > 0 ? Number(option.quantity) : 1;

  if (match.type === 'essence') {
    const essence = findById(essences, match.essenceId);
    return {
      kind: 'essence',
      essenceId: match.essenceId || '',
      name: essence?.name || '',
      amount: Number(match.amount) || 0,
      icon: essence?.icon || 'fas fa-flask-vial',
      img: '',
      quantity,
    };
  }
  if (match.type === 'tags') {
    return {
      kind: 'tags',
      name: '',
      tags: Array.isArray(match.tags) ? [...match.tags] : [],
      tagMatch: match.tagMatch === 'all' ? 'all' : 'any',
      icon: 'fas fa-tags',
      img: '',
      quantity,
    };
  }
  if (match.type === 'currency') {
    return {
      kind: 'currency',
      name: '',
      unit: match.unit || '',
      amount: Number(match.amount) || 0,
      icon: 'fa-solid fa-coins',
      img: '',
      quantity,
    };
  }

  const component = findById(components, match.componentId);
  return {
    kind: 'component',
    componentId: match.componentId || '',
    name: component?.name || '',
    img: component?.img || '',
    icon: 'fas fa-cube',
    quantity,
  };
}

/** What a reader prints for an amount: the expression when rolled, the number otherwise (1645). */
function amountLabelOf(result) {
  const formula = typeof result?.quantityFormula === 'string' ? result.quantityFormula.trim() : '';
  if (formula.length > 0) return formula;
  return String(Number(result?.quantity) > 0 ? Number(result.quantity) : 1);
}

/**
 * A non-component result's own fields (issue 1773): its kind, what names it and its glyph. A
 * currency row states its amount with its unit's display name, never a generated unit id, and a
 * knowledge row names the recipe it teaches from `recipeOptions` (the GM reads every name).
 */
function rewardProduceFields(result, rosters) {
  if (result?.kind === 'currency') {
    const unit = findCurrencyUnit(rosters.currencyUnits, result.unit);
    const unitName = currencyUnitDisplayName(unit) || result.unit || '';
    return {
      kind: 'currency',
      unit: result.unit || '',
      name: result.label || '',
      icon: RESULT_KIND_GLYPHS.currency,
      amountLabel: `${amountLabelOf(result)} ${unitName}`.trim(),
    };
  }
  const taught = findById(rosters.recipeOptions, result?.recipeId);
  return {
    kind: 'knowledge',
    recipeId: result?.recipeId || '',
    name: taught?.name || '',
    icon: RESULT_KIND_GLYPHS.knowledge,
  };
}

/** What one awarded result reads as: its component, or a reward's own fields. */
function produceFields(result, rosters) {
  const component = findById(rosters.componentOptions, result?.componentId);
  return {
    componentId: result?.componentId || '',
    name: component?.name || '',
    img: component?.img || '',
    quantity: Number(result?.quantity) > 0 ? Number(result.quantity) : 1,
    amountLabel: amountLabelOf(result),
    // The component's authored difficulty (its progressive "cost"/DC).
    difficulty: Number.isFinite(Number(component?.difficulty))
      ? Number(component.difficulty)
      : null,
    ...((result?.kind ?? 'component') !== 'component' && rewardProduceFields(result, rosters)),
  };
}

/**
 * A choice group's own fields (issue 1773): `kind: 'group'`, who chooses, how many it awards, and
 * its alternatives as `members`, each a row of its own.
 */
function choiceProduceFields(result, rowId, rosters) {
  return {
    kind: 'group',
    chooser: result.chooser === 'rolled' ? 'rolled' : 'playerChooses',
    awardStrategy: result.awardStrategy === 'upTo' ? 'upTo' : 'anyOne',
    count: result.awardCountFormula || result.awardCount || null,
    members: result.alternatives.map((member, index) => ({
      id: `${rowId}:${member?.id || index}`,
      ...produceFields(member, rosters),
    })),
  };
}

/**
 * One Produces row per result item, in authoring order, tagged with the result GROUP it belongs to;
 * a currency or knowledge row adds its kind and names itself rather than a component, and a choice
 * group is one row holding its alternatives.
 */
export function buildRecipeProduceRows(recipe, rosters = {}) {
  const rows = [];

  for (const scope of executionScopes(recipe)) {
    for (const [groupIndex, group] of (scope.resultGroups || []).entries()) {
      const groupId = group?.id || `${scope.id}-group-${groupIndex + 1}`;
      const results = Array.isArray(group?.results) ? group.results : [];

      for (const [resultIndex, result] of results.entries()) {
        const id = `${groupId}:${result?.id || resultIndex}`;
        rows.push({
          id,
          ...(isChoiceGroup(result)
            ? choiceProduceFields(result, id, rosters)
            : produceFields(result, rosters)),
          groupId,
          groupName: group?.name || '',
          // The check-outcome tiers this result group is routed to (routed-by-check).
          checkOutcomeIds: Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [],
          // The reserved alchemy-Simple failure group: what a FAILED craft makes.
          failure: group?.role === 'failure',
          scopeName: scope.multi ? scope.name : '',
        });
      }
    }
  }

  return rows;
}

/** Per-step Requires/Produces for a MULTI-step recipe's inspector (issue 643). */
export function buildRecipeStepModel(recipe, rosters = {}) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length <= 1) return [];
  return steps.map((step, index) => {
    const scoped = {
      ingredientSets: Array.isArray(step?.ingredientSets) ? step.ingredientSets : [],
      resultGroups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
    };
    return {
      id: step?.id || `step-${index + 1}`,
      name: step?.name || '',
      requirementRows: buildRecipeRequirementRows(scoped, rosters),
      produceRows: buildRecipeProduceRows(scoped, rosters),
    };
  });
}

/** Group produce rows by their result group, preserving first-seen order (issue 643). */
export function groupProduceRowsByResultGroup(rows) {
  const order = [];
  const byGroup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!byGroup.has(row.groupId)) {
      byGroup.set(row.groupId, {
        groupId: row.groupId,
        groupName: row.groupName || '',
        checkOutcomeIds: Array.isArray(row.checkOutcomeIds) ? row.checkOutcomeIds : [],
        failure: row.failure === true,
        rows: [],
      });
      order.push(row.groupId);
    }
    byGroup.get(row.groupId).rows.push(row);
  }
  return order.map((id) => byGroup.get(id));
}

/**
 * The routed-by-ingredients pairing model for the library inspector (issue 643): the recipe's
 * ingredient sets and result groups, plus the set→group routing each set carries
 * (`IngredientSet.resultGroupId`).
 */
export function buildRecipeRoutingModel(recipe) {
  const sets = (Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []).map(
    (set, index) => ({
      id: set?.id || `set-${index + 1}`,
      name: set?.name || '',
      groupId: set?.resultGroupId || null,
    })
  );
  const groups = (Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []).map(
    (group, index) => ({
      id: group?.id || `group-${index + 1}`,
      name: group?.name || '',
    })
  );
  return { sets, groups };
}

/** Run the whole pipeline in one call: filter → sort → paginate (→ group the page). */
export function buildRecipeBrowserModel(recipes, options = {}) {
  const { filtered, sorted, ...model } = buildEntityBrowserModel(
    recipes,
    canonicalBrowserOptions(options),
    RECIPE_ADAPTER
  );
  // This library's `filtered` is the sorted cohort, which is how its views read it.
  return { filtered: sorted, ...model };
}
