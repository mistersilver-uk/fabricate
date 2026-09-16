/**
 * The pure presentation model behind the world Tags & Categories screen (issue 1392, epic 1357).
 * It imports NOTHING from `src/ui/`: a store reached from here would land in the closure of every
 * mounted suite rendering this page. Three panels mount SIMULTANEOUSLY, so per-kind row
 * attributes and control ids are DATA in {@link WORLD_VOCABULARY_PANELS}, not spelled per panel.
 */

import {
  normalizeWorldVocabularyEntries,
  worldVocabularyEntryId,
} from '../../../../../systems/worldVocabulary.js';
import { isGeneralComponentCategory } from '../../../../../utils/componentCategories.js';
import { isGeneralRecipeCategory } from '../../../../../utils/recipeCategories.js';

/** The lang-key root every world vocabulary string hangs off. */
const LANG_ROOT = 'FABRICATE.Admin.Manager.Scoped.WorldVocabulary';

/**
 * The three panels, in draw order: the two category vocabularies in the 2-up grid, then the
 * component tags full width. `column` is what the page groups on, so the layout is stated once.
 */
export const WORLD_VOCABULARY_PANELS = Object.freeze([
  Object.freeze({
    kind: 'recipeCategories',
    column: 'grid',
    langGroup: 'RecipeCategories',
    icon: 'fas fa-scroll',
    emptyIcon: 'fas fa-scroll',
    decorativeIcon: '',
    rowAttr: 'data-recipe-category-id',
    inputId: 'world-vocabulary-recipe-category-add',
    sortLabelId: 'world-vocabulary-sort-recipe-categories',
  }),
  Object.freeze({
    kind: 'componentCategories',
    column: 'grid',
    langGroup: 'ComponentCategories',
    icon: 'fas fa-cubes-stacked',
    emptyIcon: 'fas fa-cubes-stacked',
    decorativeIcon: '',
    rowAttr: 'data-component-category-id',
    inputId: 'world-vocabulary-component-category-add',
    sortLabelId: 'world-vocabulary-sort-component-categories',
  }),
  Object.freeze({
    kind: 'componentTags',
    column: 'full',
    langGroup: 'ComponentTags',
    icon: 'fas fa-hashtag',
    emptyIcon: 'fas fa-hashtag',
    // The tag rows take the shipped `decorativeIcon` card treatment rather than the reference's
    // pill: a pill needs a panel prop issue 1411 owns. Recorded as an accepted deviation.
    decorativeIcon: 'fas fa-hashtag',
    rowAttr: 'data-component-tag-id',
    inputId: 'world-vocabulary-component-tag-add',
    sortLabelId: 'world-vocabulary-sort-component-tags',
  }),
]);

/** The lang key for one panel field. */
export function panelKey(panel, field) {
  return `${LANG_ROOT}.${panel.langGroup}.${field}`;
}

/** The two sort keys the page offers; both labels are shipped keys, and neither is minted here. */
export const WORLD_VOCABULARY_SORT_KEYS = Object.freeze([
  Object.freeze({
    id: 'name',
    key: 'FABRICATE.Admin.Manager.Scoped.List.SortKeyName',
    fallback: 'Name',
  }),
  Object.freeze({
    id: 'references',
    key: 'FABRICATE.Admin.Manager.TagsCategories.References',
    fallback: 'References',
  }),
]);

/** Sort one panel's rows: copied before sorting, and every comparator ties back to the name. */
export function sortVocabularyRows(rows, sortKey, direction) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const sign = direction === 'desc' ? -1 : 1;
  const byName = (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
  list.sort((a, b) => {
    if (sortKey === 'references') {
      const delta = (Number(a?.totalUsage) || 0) - (Number(b?.totalUsage) || 0);
      return delta === 0 ? byName(a, b) : sign * delta;
    }
    return sign * byName(a, b);
  });
  return list;
}

/**
 * One panel's rows, decorated; nothing is recomputed. Component tags gain a `displayName` of
 * `#name` WITHOUT disturbing `name`, which the remove handler and confirm sentence both read.
 */
export function panelRows(vocabulary, panel) {
  const rows = Array.isArray(vocabulary?.[panel.kind]) ? vocabulary[panel.kind] : [];
  if (panel.kind !== 'componentTags') return rows;
  return rows.map((row) => ({ ...row, displayName: `#${row.name}` }));
}

/** Whether this kind refuses the reserved general bucket, read from the shipped guards. */
function refusesGeneral(kind, value) {
  if (kind === 'componentCategories') return isGeneralComponentCategory(value);
  if (kind === 'recipeCategories') return isGeneralRecipeCategory(value);
  return false;
}

/** The number a kind's deletion warning states beside the reference count; `''` for none. */
function cascadeCount(panel, row) {
  if (panel.kind === 'componentCategories') return Number(row?.confirmTokens?.defaults) || 0;
  if (panel.kind === 'componentTags') return Number(row?.confirmTokens?.components) || 0;
  return null;
}

/**
 * The confirm sentence's cascade clause for one row, already localized and substituted. A TOKEN
 * rather than a panel prop: the hint is per PANEL and the clause is per ROW. Substituted HERE
 * because the panel walks the token map once, so a `{defaults}` left in would depend on key order.
 */
export function cascadeClause(panel, row, text) {
  const count = cascadeCount(panel, row);
  if (count === null) return '';
  if (count === 0) return text(panelKey(panel, 'CascadeNone'), '');
  let clause = text(panelKey(panel, 'CascadeSome'), '');
  for (const [token, value] of Object.entries(row?.confirmTokens ?? {})) {
    clause = clause.split(`{${token}}`).join(String(value));
  }
  return clause;
}

/** The value handed to `onAdd`: tags are lowercased, categories keep their authored casing. */
export function inputNormalizer(kind) {
  if (kind === 'componentTags') {
    return (value) =>
      String(value || '')
        .trim()
        .toLowerCase();
  }
  return (value) => String(value || '').trim();
}

/**
 * The live hint machine for one panel: `blocked` refuses submit, `tone` drives styling. The
 * DUPLICATE test asks the normalizer for the id, so a hint cannot promise an add `addEntry` refuses.
 */
export function describeVocabularyInput(panel, rows, text) {
  return (rawValue) => {
    const value = inputNormalizer(panel.kind)(rawValue);
    if (!value) return { tone: '', message: '', blocked: true };
    if (refusesGeneral(panel.kind, value)) {
      return {
        tone: 'danger',
        message: text(panelKey(panel, 'ReservedFeedback'), 'General is always available.'),
        blocked: true,
      };
    }
    const id = worldVocabularyEntryId(value);
    if ((rows || []).some((row) => row?.id === id)) {
      return {
        tone: 'danger',
        message: text(panelKey(panel, 'DuplicateFeedback'), 'That entry already exists.'),
        blocked: true,
      };
    }
    // The normalizer is the arbiter of what can be added at all, so a value it drops is refused
    // here rather than accepted and silently lost by the write path.
    if (normalizeWorldVocabularyEntries(panel.kind, [value]).length === 0) {
      return {
        tone: 'danger',
        message: text(panelKey(panel, 'AddFailedFeedback'), 'That entry could not be added.'),
        blocked: true,
      };
    }
    return {
      tone: 'success',
      message: text(panelKey(panel, 'ReadyFeedback'), 'Ready to add "{name}".').replace(
        '{name}',
        value
      ),
      blocked: false,
    };
  };
}
