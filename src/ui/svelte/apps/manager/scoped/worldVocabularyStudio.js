/**
 * The pure presentation model behind the world Tags & Categories screen (issue 1392, epic 1357,
 * PR 7a).
 *
 * The sibling of `worldToolStudio.js` and `scopedStudio.js`: it decides nothing about
 * persistence, reads no Foundry global, renders nothing, and imports NOTHING from `src/ui/` —
 * only the two shipped vocabulary guard modules and the World Vocabulary's own pure core. That
 * matters mechanically rather than stylistically: a store module reached from here would land in
 * the closure of every mounted suite that renders this page.
 *
 * ## Three panels are mounted SIMULTANEOUSLY, so per-kind ids are a correctness requirement
 *
 * `VocabularyPanel` calls `rowAttr` and `inputId` a per-tab preference, because the system-scope
 * screen is TABBED and only ever mounts one panel. This screen mounts all three at once, so a
 * shared `data-category-id` would match rows in two panels and make every mounted assertion and
 * every View Lab `expectContained` target ambiguous. The same applies to the `Sort by` micro-
 * label's id: `EntityListInspectorFrame` hardcodes `id="scoped-list-sort-label"`, and three
 * copies of that would send all three `aria-labelledby` references to the first one.
 *
 * So the ids are DATA, declared once here in {@link WORLD_VOCABULARY_PANELS}, and the page reads
 * them rather than spelling them per panel.
 *
 * ## The hint machines take `text`, they do not import it
 *
 * The live add-form hints are authored here rather than extracted from `TagsCategoriesView` —
 * that file belongs to issue 1411 — but the RULES they state are read from the shipped guards
 * (`isGeneralComponentCategory`, `isGeneralRecipeCategory`, and the normalizer's own first-wins
 * id de-duplication) rather than restated, so the hint cannot promise an add the write path
 * refuses. Localization arrives as a `text(key, fallback)` function argument, which is what
 * keeps this module UI-free.
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
 * The three panels, in the order the page draws them: the two category vocabularies in the 2-up
 * grid, then the component tags full width beneath.
 *
 * `column` is what the page groups on, so the layout decision is stated here once instead of by
 * two hand-written blocks in the template.
 *
 * @type {ReadonlyArray<Readonly<object>>}
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

/**
 * The lang key for one panel field.
 *
 * @param {object} panel
 * @param {string} field
 * @returns {string}
 */
export function panelKey(panel, field) {
  return `${LANG_ROOT}.${panel.langGroup}.${field}`;
}

/**
 * The two sort keys the page offers, matching the reference's own pair.
 *
 * NO NEW LANG KEY IS MINTED for either: `Scoped.List.SortKeyName` is the shipped label the three
 * entity catalogues already sort by, and `TagsCategories.References` is the shipped label the
 * system-scope vocabulary screen already uses for this number.
 *
 * @type {ReadonlyArray<Readonly<{id: string, key: string, fallback: string}>>}
 */
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

/**
 * Sort one panel's rows.
 *
 * TOTAL AND STABLE: it copies before sorting, so the projection's published array is never
 * reordered in place, and every comparator falls back to the name so two rows with the same
 * reference count keep a deterministic order rather than depending on the engine's sort.
 *
 * @param {Array<object>} rows
 * @param {string} sortKey One of {@link WORLD_VOCABULARY_SORT_KEYS}' ids.
 * @param {string} direction `asc` or `desc`.
 * @returns {Array<object>}
 */
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
 * One panel's rows, decorated for display.
 *
 * The projection already publishes `{id, name, totalUsage, confirmTokens, silentlyDeletable}`,
 * so nothing is recomputed here. Component tags gain a `displayName` of `#name`, matching the
 * system-scope screen's treatment, WITHOUT disturbing `name` — which is the value handed back to
 * the remove handler and substituted into the confirm sentence.
 *
 * @param {object|null} vocabulary The published `worldScope.vocabulary` state.
 * @param {object} panel
 * @returns {Array<object>}
 */
export function panelRows(vocabulary, panel) {
  const rows = Array.isArray(vocabulary?.[panel.kind]) ? vocabulary[panel.kind] : [];
  if (panel.kind !== 'componentTags') return rows;
  return rows.map((row) => ({ ...row, displayName: `#${row.name}` }));
}

/**
 * Whether this kind refuses the reserved general bucket.
 *
 * Read from the two shipped guards rather than restated, so the hint and the write path cannot
 * disagree about what `general` is.
 *
 * @param {string} kind
 * @param {string} value
 * @returns {boolean}
 */
function refusesGeneral(kind, value) {
  if (kind === 'componentCategories') return isGeneralComponentCategory(value);
  if (kind === 'recipeCategories') return isGeneralRecipeCategory(value);
  return false;
}

/**
 * The number a kind's deletion warning states BESIDE the reference count, and `''` for a kind
 * that has none.
 *
 * @param {object} panel
 * @param {object} row
 * @returns {number|null}
 */
function cascadeCount(panel, row) {
  if (panel.kind === 'componentCategories') return Number(row?.confirmTokens?.defaults) || 0;
  if (panel.kind === 'componentTags') return Number(row?.confirmTokens?.components) || 0;
  return null;
}

/**
 * The confirm sentence's cascade clause for one row, already localized and already substituted.
 *
 * ── WHY THE CLAUSE IS A TOKEN AND NOT A SECOND PANEL PROP ───────────────────────────────
 * `removeConfirmHint` is per PANEL and the clause is per ROW: the common case for both component
 * vocabularies is that NOTHING cascades, and a single sentence then reads "clears it from 0 world
 * components, which 0 crafting systems inherit" — three numbers where the honest answer is one.
 * `row.confirmTokens` is the shipped per-row seam for exactly this, so the clause travels as a
 * token rather than as a third additive prop on a primitive this change is bounded to two of.
 *
 * IT IS SUBSTITUTED HERE rather than left for the panel's own merge, because the panel walks the
 * token map ONCE: a clause inserted with its own `{defaults}` still in it would depend on key
 * insertion order to be filled, and would render a literal brace the day that order changed.
 *
 * @param {object} panel
 * @param {object} row
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
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
 * The value handed to `onAdd`, per kind.
 *
 * Tags are lowercased before submit, matching the system-scope screen; categories keep their
 * authored casing, because only the derived id is folded.
 *
 * @param {string} kind
 * @returns {(value: unknown) => string}
 */
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
 * The live hint machine for one panel.
 *
 * `blocked` refuses submit; `tone` drives the hint styling. The DUPLICATE test is the one place
 * this could drift from the write path, so it asks the normalizer for the id rather than
 * lowercasing by hand — the same first-wins id de-duplication `addEntry` applies.
 *
 * @param {object} panel
 * @param {Array<object>} rows the panel's current rows.
 * @param {(key: string, fallback: string) => string} text
 * @returns {(rawValue: unknown) => {tone: string, message: string, blocked: boolean}}
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
