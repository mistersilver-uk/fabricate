/**
 * The pure presentation model behind the WORLD Tags & Categories screen (issue 1392, epic 1357).
 * It imports NOTHING from `src/ui/` except the shared shell's own pure leaf: a store reached from
 * here would land in the closure of every mounted suite rendering this page. Three panels mount
 * SIMULTANEOUSLY, so per-kind row attributes and control ids are DATA in
 * {@link WORLD_VOCABULARY_PANELS}, not spelled per panel.
 */

import {
  normalizeWorldVocabularyEntries,
  worldVocabularyEntryId,
} from '../../../../../systems/worldVocabulary.js';
import { isGeneralComponentCategory } from '../../../../../utils/componentCategories.js';
import { isGeneralRecipeCategory } from '../../../../../utils/recipeCategories.js';
import {
  decorateTagRows,
  defineVocabularyPanel,
  inputNormalizer,
  vocabularyPanelProps,
} from '../vocabularyShell.js';

// Re-exported because the screen's whole add-path contract is read from this module.
export { inputNormalizer } from '../vocabularyShell.js';

/** The lang-key root every world vocabulary string hangs off. */
const LANG_ROOT = 'FABRICATE.Admin.Manager.Scoped.WorldVocabulary';

/**
 * The three panels, in draw order: the two category vocabularies in the 2-up grid, then the
 * component tags full width. Only the fields the WORLD scope owns are stated; the column and the
 * head glyph belong to the vocabulary and come from `defineVocabularyPanel`.
 */
export const WORLD_VOCABULARY_PANELS = Object.freeze([
  defineVocabularyPanel({
    kind: 'recipeCategories',
    langGroup: 'RecipeCategories',
    rowAttr: 'data-recipe-category-id',
    inputId: 'world-vocabulary-recipe-category-add',
    sortLabelId: 'world-vocabulary-sort-recipe-categories',
  }),
  defineVocabularyPanel({
    kind: 'componentCategories',
    langGroup: 'ComponentCategories',
    rowAttr: 'data-component-category-id',
    inputId: 'world-vocabulary-component-category-add',
    sortLabelId: 'world-vocabulary-sort-component-categories',
  }),
  defineVocabularyPanel({
    kind: 'componentTags',
    langGroup: 'ComponentTags',
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

/**
 * One panel's rows, decorated; nothing is recomputed. Component tags gain a `displayName` of
 * `#name` WITHOUT disturbing `name`, which the remove handler and confirm sentence both read.
 */
export function panelRows(vocabulary, panel) {
  const rows = Array.isArray(vocabulary?.[panel.kind]) ? vocabulary[panel.kind] : [];
  return panel.kind === 'componentTags' ? decorateTagRows(rows) : rows;
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

/**
 * One panel's localized string. The panel is the FIRST argument at every call site because
 * `world-vocabulary-lang-contract.test.js` extracts the field names from that shape.
 */
function panelText(panel, field, text, fallback = '') {
  return text(panelKey(panel, field), fallback);
}

/**
 * The whole prop bag for one world panel. Every per-kind copy spelling lives here rather than on
 * the page, and the shared assembler carries the structural half both scopes agree on.
 *
 * @param {object} panel one {@link WORLD_VOCABULARY_PANELS} descriptor
 * @param {{rows: object[], text: Function, routeIcon: string, onAdd: Function, onRemove: Function}} wiring
 * @returns {object} the props `VocabularyShellPanel` takes and spreads over `VocabularyPanel`
 */
export function worldPanelProps(panel, { rows, text, routeIcon = '', onAdd, onRemove }) {
  const label = panelText(panel, 'Title', text);
  return vocabularyPanelProps(
    panel,
    {
      label,
      subline: panelText(panel, 'Subline', text),
      sortToolbarLabel: text(`${LANG_ROOT}.SortToolbar`, 'Sort {vocabulary}').replace(
        '{vocabulary}',
        label
      ),
      inputLabel: panelText(panel, 'InputLabel', text),
      inputPlaceholder: panelText(panel, 'Placeholder', text),
      addLabel: panelText(panel, 'AddLabel', text),
      emptyTitle: panelText(panel, 'EmptyTitle', text),
      emptyHint: panelText(panel, 'EmptyHint', text),
      searchPlaceholder: panelText(panel, 'SearchPlaceholder', text),
      searchLabel: panelText(panel, 'SearchLabel', text),
      searchMissTitle: panelText(panel, 'SearchMiss', text, 'No matches for "{query}".'),
      removeLabel: panelText(panel, 'RemoveLabel', text),
      removeNamedLabel: panelText(panel, 'RemoveNamedLabel', text, '{name}'),
      removeConfirmHint: panelText(panel, 'RemoveConfirm', text),
      confirmRemoveLabel: text(
        'FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove',
        'Delete anyway'
      ),
      cancelRemoveLabel: text('FABRICATE.Admin.Manager.Cancel', 'Cancel'),
      addFailedFeedback: panelText(panel, 'AddFailedFeedback', text),
    },
    {
      icon: panel.icon || routeIcon,
      rows,
      describeInput: describeVocabularyInput(panel, rows, text),
      normalize: inputNormalizer(panel.kind),
      successFeedback: () => panelText(panel, 'AddedFeedback', text),
      onAdd: (value) => onAdd(panel, value),
      onRemove: (row) => onRemove(panel, row),
    }
  );
}
