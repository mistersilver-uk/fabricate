/**
 * The pure leaf behind BOTH Tags & Categories screens (issue 1915). It imports nothing from
 * `src/ui/`, so neither screen's mounted closure grows a store. The panel descriptor is the one
 * shape both scopes build, through {@link defineVocabularyPanel}: a scope supplies only the fields
 * that genuinely differ, and the facts that belong to the VOCABULARY rather than to the scope —
 * where the panel sits and which glyph heads it — are answered here once.
 */

import { normalizeTag } from '../../../../utils/scalars.js';

/**
 * The per-kind facts neither scope gets to choose. `column` is what the shell partitions on and
 * `icon` is the panel head's glyph, so the two screens read as one shell rather than two.
 */
const KIND_FACTS = Object.freeze({
  recipeCategories: Object.freeze({ column: 'grid', icon: 'fas fa-scroll' }),
  componentCategories: Object.freeze({ column: 'grid', icon: 'fas fa-cubes-stacked' }),
  componentTags: Object.freeze({ column: 'full', icon: 'fas fa-hashtag' }),
});

/**
 * One panel descriptor. The caller passes its DIVERGENT fields only; everything a scope does not
 * state falls to the kind's own facts. `kind` is the SCREEN's vocabulary id for one panel, on both
 * routes — never the persisted field name and never `row.kind`.
 *
 * @param {object} divergentFields at least `kind`, plus whatever the scope owns
 * @returns {Readonly<object>} the frozen descriptor
 */
export function defineVocabularyPanel(divergentFields) {
  const facts = KIND_FACTS[divergentFields?.kind] ?? { column: 'grid', icon: '' };
  return Object.freeze({
    ...facts,
    emptyIcon: facts.icon,
    decorativeIcon: '',
    showIcon: false,
    ...divergentFields,
  });
}

/** The two sort keys both screens offer; both labels are shipped keys, and neither is minted here. */
export const VOCABULARY_SORT_KEYS = Object.freeze([
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
 * Component tag rows gain a `displayName` of `#name` WITHOUT disturbing `name`, which the remove
 * handler and the confirm sentence both read.
 */
export function decorateTagRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, displayName: `#${row.name}` }));
}

/** The shell's two bands: the 2-up grid, then the full-width panels beneath it. */
export function partitionVocabularyPanels(panels) {
  const list = Array.isArray(panels) ? panels : [];
  return {
    grid: list.filter((panel) => panel?.column === 'grid'),
    full: list.filter((panel) => panel?.column === 'full'),
  };
}

/** The direction a toggle click moves to; anything that is not `asc` reads as `desc`. */
export function toggledDirection(direction) {
  return direction === 'asc' ? 'desc' : 'asc';
}

/** The value handed to `onAdd`: tags are lowercased, categories keep their authored casing. */
export function inputNormalizer(kind) {
  return kind === 'componentTags' ? normalizeTag : (value) => String(value || '').trim();
}

/**
 * One panel's whole prop bag, assembled once for both scopes. The descriptor supplies the
 * structural half (hooks, ids, glyphs), `copy` the already-localized strings under the scope's own
 * lang root, and `wiring` the rows and callbacks. Each scope therefore states only what diverges.
 *
 * @param {object} panel a {@link defineVocabularyPanel} descriptor
 * @param {object} copy already-localized strings, keyed by the prop they land on
 * @param {object} wiring rows, row predicates and callbacks
 * @returns {object} the props `VocabularyShellPanel` takes and spreads over `VocabularyPanel`
 */
export function vocabularyPanelProps(panel, copy, wiring) {
  return {
    kind: panel.kind,
    icon: panel.icon,
    title: copy.label,
    sortLabelId: panel.sortLabelId,
    inputId: panel.inputId,
    rowAttr: panel.rowAttr,
    emptyIcon: panel.emptyIcon,
    showIcon: panel.showIcon,
    decorativeIcon: panel.decorativeIcon,
    // The world scope has no reserved entry; the system scope overrides this through `wiring`.
    lockedRow: null,
    ...copy,
    ...wiring,
  };
}
