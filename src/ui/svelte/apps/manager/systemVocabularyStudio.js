/**
 * The pure presentation model behind the SYSTEM Tags & Categories screen (issue 1915), mirroring
 * `scoped/worldVocabularyStudio.js` at the other scope. It imports nothing from `src/ui/` beyond
 * the shared shell's own leaf. Three panels mount SIMULTANEOUSLY, so per-kind row attributes and
 * control ids are DATA in {@link SYSTEM_VOCABULARY_PANELS}, not spelled per panel.
 *
 * Every lang key is a COMPLETE literal in the `keys` table: a key composed from a base is invisible
 * to `ui-lang-keys-resolve` and `lang-keys-no-orphans` alike.
 */

import { normalizeTag } from '../../../../utils/scalars.js';

import { decorateTagRows, defineVocabularyPanel, vocabularyPanelProps } from './vocabularyShell.js';

/** The id the reserved bucket carries in every system vocabulary row set. */
const GENERAL_ROW_ID = 'general';

/**
 * The three panels, in draw order: the two category vocabularies in the 2-up grid, then the
 * component tags full width. Only the fields the SYSTEM scope owns are stated; the column and the
 * head glyph belong to the vocabulary and come from `defineVocabularyPanel`.
 */
export const SYSTEM_VOCABULARY_PANELS = Object.freeze([
  defineVocabularyPanel({
    kind: 'recipeCategories',
    rowAttr: 'data-category-id',
    inputId: 'manager-category-add',
    sortLabelId: 'manager-vocabulary-sort-recipeCategories',
    // TWO SYSTEM-ONLY DIVERGENCES: a locked reserved row, and a persisted per-row icon. The world
    // scope has neither, which is why they are DATA here rather than shape in the shell.
    reservesGeneral: true,
    showIcon: true,
    keys: Object.freeze({
      Title: ['FABRICATE.Admin.Manager.TagsCategories.Categories', 'Recipe categories'],
      Subline: [
        'FABRICATE.Admin.Manager.TagsCategories.CategoriesSubline',
        'One per recipe, in this crafting system.',
      ],
      InputLabel: ['FABRICATE.Admin.Manager.TagsCategories.CategoryName', 'Category name'],
      Placeholder: ['FABRICATE.Admin.Manager.TagsCategories.CategoryPlaceholder', 'e.g. Potions'],
      AddLabel: ['FABRICATE.Admin.Manager.TagsCategories.AddCategory', 'Add category'],
      EmptyTitle: ['FABRICATE.Admin.Manager.TagsCategories.OnlyGeneral', 'Only General so far'],
      EmptyHint: [
        'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralHint',
        'Every recipe falls under General until you add one. Group recipes that need clearer organisation by adding a category above.',
      ],
      SearchPlaceholder: [
        'FABRICATE.Admin.Manager.TagsCategories.SearchCategories',
        'Search recipe categories...',
      ],
      SearchLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.SearchCategoriesLabel',
        'Search recipe categories',
      ],
      SearchMiss: [
        'FABRICATE.Admin.Manager.TagsCategories.NoCategoryMatches',
        'No matches for "{query}".',
      ],
      RemoveLabel: ['FABRICATE.Admin.Manager.TagsCategories.RemoveCategory', 'Remove category'],
      RemoveNamedLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryNamed',
        'Remove category {name}',
      ],
      RemoveConfirm: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryConfirmHint',
        '"{name}" is used by {count} recipes. Deleting reassigns them to General.',
      ],
      AddFailedFeedback: [
        'FABRICATE.Admin.Manager.TagsCategories.CategoryAddFailedFeedback',
        'Category could not be added.',
      ],
    }),
  }),
  defineVocabularyPanel({
    kind: 'componentCategories',
    rowAttr: 'data-component-category-id',
    inputId: 'manager-component-category-add',
    sortLabelId: 'manager-vocabulary-sort-componentCategories',
    reservesGeneral: true,
    showIcon: true,
    keys: Object.freeze({
      Title: ['FABRICATE.Admin.Manager.TagsCategories.ComponentCategories', 'Component categories'],
      Subline: [
        'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoriesSubline',
        'One per component, in this crafting system.',
      ],
      InputLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryName',
        'Component category name',
      ],
      Placeholder: [
        'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryPlaceholder',
        'e.g. Reagent',
      ],
      AddLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.AddComponentCategory',
        'Add component category',
      ],
      EmptyTitle: [
        'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponent',
        'Only General so far',
      ],
      EmptyHint: [
        'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponentHint',
        'Every component falls under General until you add one. Group your component directory by adding a category above.',
      ],
      SearchPlaceholder: [
        'FABRICATE.Admin.Manager.TagsCategories.SearchComponentCategories',
        'Search component categories...',
      ],
      SearchLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.SearchComponentCategoriesLabel',
        'Search component categories',
      ],
      SearchMiss: [
        'FABRICATE.Admin.Manager.TagsCategories.NoComponentCategoryMatches',
        'No matches for "{query}".',
      ],
      RemoveLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategory',
        'Remove component category',
      ],
      RemoveNamedLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategoryNamed',
        'Remove component category {name}',
      ],
      RemoveConfirm: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategoryConfirmHint',
        '"{name}" is used by {count} components. Deleting reassigns them to General.',
      ],
      AddFailedFeedback: [
        'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryAddFailedFeedback',
        'Component category could not be added.',
      ],
    }),
  }),
  defineVocabularyPanel({
    kind: 'componentTags',
    rowAttr: 'data-tag-id',
    inputId: 'manager-tag-add',
    sortLabelId: 'manager-vocabulary-sort-componentTags',
    emptyIcon: 'fas fa-tag',
    decorativeIcon: 'fas fa-tag',
    keys: Object.freeze({
      Title: ['FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Component tags'],
      Subline: [
        'FABRICATE.Admin.Manager.TagsCategories.ItemTagsSubline',
        'Stored lowercase, reusable across this crafting system.',
      ],
      InputLabel: ['FABRICATE.Admin.Manager.TagsCategories.TagName', 'Tag name'],
      Placeholder: ['FABRICATE.Admin.Manager.TagsCategories.TagPlaceholder', 'e.g. herb'],
      AddLabel: ['FABRICATE.Admin.Manager.TagsCategories.AddTag', 'Add tag'],
      EmptyTitle: ['FABRICATE.Admin.Manager.TagsCategories.NoTags', 'No component tags yet'],
      EmptyHint: [
        'FABRICATE.Admin.Manager.TagsCategories.NoTagsHint',
        'Tags let a recipe require any component that carries them. Add a tag above, then apply it to components.',
      ],
      SearchPlaceholder: [
        'FABRICATE.Admin.Manager.TagsCategories.SearchTags',
        'Search item tags...',
      ],
      SearchLabel: ['FABRICATE.Admin.Manager.TagsCategories.SearchTagsLabel', 'Search item tags'],
      SearchMiss: [
        'FABRICATE.Admin.Manager.TagsCategories.NoTagMatches',
        'No matches for "{query}".',
      ],
      RemoveLabel: ['FABRICATE.Admin.Manager.TagsCategories.RemoveTag', 'Remove tag'],
      RemoveNamedLabel: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveTagNamed',
        'Remove tag {name}',
      ],
      RemoveConfirm: [
        'FABRICATE.Admin.Manager.TagsCategories.RemoveTagConfirmHint',
        '"{name}" is on {count} components. Deleting removes the tag from them.',
      ],
      AddFailedFeedback: [
        'FABRICATE.Admin.Manager.TagsCategories.TagAddFailedFeedback',
        'Tag could not be added.',
      ],
    }),
  }),
]);

/** Which `VocabularyPanel` prop each `keys` field lands on, so the copy bag is walked rather than spelled. */
const COPY_PROPS = Object.freeze({
  Title: 'label',
  Subline: 'subline',
  InputLabel: 'inputLabel',
  Placeholder: 'inputPlaceholder',
  AddLabel: 'addLabel',
  EmptyTitle: 'emptyTitle',
  EmptyHint: 'emptyHint',
  SearchPlaceholder: 'searchPlaceholder',
  SearchLabel: 'searchLabel',
  SearchMiss: 'searchMissTitle',
  RemoveLabel: 'removeLabel',
  RemoveNamedLabel: 'removeNamedLabel',
  RemoveConfirm: 'removeConfirmHint',
  AddFailedFeedback: 'addFailedFeedback',
});

/**
 * The locked General row and the custom rows beside it. The reserved bucket is rendered outside the
 * sortable set, because it is not an entry the GM authored and cannot be removed. It is asked of
 * the PANEL rather than of the id alone: a component tag may legitimately be called `general`, and
 * splitting it out would silently stop rendering it.
 */
export function splitGeneralRow(panel, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!panel?.reservesGeneral) return { locked: null, custom: list };
  return {
    locked: list.find((row) => row?.id === GENERAL_ROW_ID) ?? null,
    custom: list.filter((row) => row?.id !== GENERAL_ROW_ID),
  };
}

/** Whether `value` already names an entry in `rows`, compared on the folded name. */
function existsIn(rows, value) {
  const normalized = normalizeTag(value);
  return (rows || []).some((row) => String(row?.name || '').toLowerCase() === normalized);
}

function isGeneral(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === GENERAL_ROW_ID
  );
}

/**
 * The live hint machine shared by BOTH category vocabularies: same rules, its own row set (so a
 * recipe and a component category may share a name without a false duplicate). `blocked` refuses
 * submit; `tone` drives the hint styling.
 */
export function categoryHint(rows, text) {
  return (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return { tone: '', message: '', blocked: true };
    if (isGeneral(value)) {
      return {
        tone: 'danger',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback',
          'General is already available as the base category.'
        ),
        blocked: true,
      };
    }
    if (existsIn(rows, value)) {
      return {
        tone: 'danger',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.DuplicateCategoryFeedback',
          'That category already exists.'
        ),
        blocked: true,
      };
    }
    return {
      tone: 'success',
      message: text(
        'FABRICATE.Admin.Manager.TagsCategories.ReadyToAddCategory',
        'Ready to add "{name}".'
      ).replace('{name}', value),
      blocked: false,
    };
  };
}

/** The tag vocabulary's own hint machine: it previews the lowercase form rather than refusing it. */
export function tagHint(rows, text) {
  return (rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return { tone: '', message: '', blocked: true };
    const lower = raw.toLowerCase();
    if (existsIn(rows, lower)) {
      return {
        tone: 'danger',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.DuplicateTagFeedback',
          'That tag already exists.'
        ),
        blocked: true,
      };
    }
    if (lower !== raw) {
      return {
        tone: 'info',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.TagLowercasePreview',
          'Will be added as "{name}" — tags are stored lowercase.'
        ).replace('{name}', lower),
        blocked: false,
      };
    }
    return {
      tone: 'success',
      message: text(
        'FABRICATE.Admin.Manager.TagsCategories.ReadyToAddTag',
        'Ready to add "{name}".'
      ).replace('{name}', lower),
      blocked: false,
    };
  };
}

/** The value handed to `onAdd`: tags are lowercased, categories keep their authored casing. */
function inputNormalizer(kind) {
  return kind === 'componentTags' ? normalizeTag : (value) => String(value || '').trim();
}

/** The confirmation one panel posts after a successful add. */
function successFeedbackFor(kind, text) {
  if (kind !== 'componentTags') {
    return () =>
      text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback', 'Category added.');
  }
  // The tag vocabulary says so when it CHANGED the value, which the category vocabularies never do.
  return (value, rawValue) =>
    value === rawValue
      ? text('FABRICATE.Admin.Manager.TagsCategories.TagAddedFeedback', 'Tag added.')
      : text(
          'FABRICATE.Admin.Manager.TagsCategories.TagNormalizedFeedback',
          'Tag added with cleaned-up lowercase text.'
        );
}

/** The per-row icon props, present only where a row carries a persisted icon. */
function iconProps(panel, text, onSetIcon) {
  if (!panel.showIcon) return {};
  return {
    iconLabel: text('FABRICATE.Admin.Manager.TagsCategories.IconLabel', 'Icon'),
    changeIconLabel: text('FABRICATE.Admin.Manager.TagsCategories.ChangeIcon', 'Change icon'),
    onSetIcon: (name, icon) => onSetIcon(panel, name, icon),
  };
}

/**
 * The whole prop bag for one system panel. `rows` is the panel's RAW row set as the root publishes
 * it, General included; the reserved row is split out here so neither the view nor the shell has
 * to know which vocabularies have one.
 *
 * @param {object} panel one {@link SYSTEM_VOCABULARY_PANELS} descriptor
 * @param {{rows: object[], text: Function, onAdd: Function, onRemove: Function, onSetIcon: Function}} wiring
 * @returns {object} the props `VocabularyShellPanel` takes and spreads over `VocabularyPanel`
 */
export function systemPanelProps(panel, { rows, text, onAdd, onRemove, onSetIcon }) {
  const { locked, custom } = splitGeneralRow(panel, rows);
  const copy = {};
  for (const [field, prop] of Object.entries(COPY_PROPS)) copy[prop] = text(...panel.keys[field]);
  copy.sortToolbarLabel = text(
    'FABRICATE.Admin.Manager.TagsCategories.SortToolbar',
    'Sort {vocabulary}'
  ).replace('{vocabulary}', copy.label);
  copy.confirmRemoveLabel = text('FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove', 'Remove');
  copy.cancelRemoveLabel = text('FABRICATE.Admin.Manager.Cancel', 'Cancel');

  const isTags = panel.kind === 'componentTags';
  return vocabularyPanelProps(panel, copy, {
    rows: isTags ? decorateTagRows(custom) : custom,
    lockedRow: locked,
    describeInput: isTags ? tagHint(custom, text) : categoryHint(custom, text),
    normalize: inputNormalizer(panel.kind),
    successFeedback: successFeedbackFor(panel.kind, text),
    // The ICON RIDES ALONG: the add form offers one wherever rows carry a persisted icon, and a
    // wrapper that forwarded the value alone would silently drop the GM's choice.
    onAdd: (value, icon) => onAdd(panel, value, icon),
    onRemove: (row) => onRemove(panel, row),
    ...iconProps(panel, text, onSetIcon),
  });
}
