/**
 * What the Primitive Lab's word gates count as a word (issues 1487 and 2339), read by the
 * drawing-text gate over a row and by the fixture gate over a fixture's source.
 */

/**
 * Props whose values are identifiers, enumerations, icon classes or styles rather than words: the
 * drawing shows what they select, never the value. Any other string prop is a word to check.
 */
const VALUE_PROP_NAMES = new Set([
  'id',
  'key',
  'icon',
  'class',
  'style',
  'tone',
  'state',
  'status',
  'kind',
  'kinds',
  'rollModel',
  'tint',
  'type',
  'role',
  'density',
  'as',
  'variant',
  'color',
  'colorToken',
  'ink',
  'art',
  'side',
  'layout',
  'view',
  'fill',
  'pipKind',
  'shape',
  'orientation',
  'align',
  'direction',
  'emphasis',
  'marks',
  'tag',
  'tagMatch',
  'chooser',
  'awardStrategy',
  'vehicle',
  'target',
  'binding',
  'controls',
  'pageSelectionState',
  'activeTab',
  'selectedValue',
  'groupName',
]);

/** A name that ends in an identifier, key, icon or style suffix: `slotId`, `openKey`, `stateIcon`, `wellStyle`. */
const VALUE_PROP_SUFFIX = /^\w+(?:Id|Keys?|Icon|Style)$/;

export const VALUE_PROP = Object.freeze({
  test: (name) => VALUE_PROP_NAMES.has(name) || VALUE_PROP_SUFFIX.test(name),
});

/** The attributes of a row's node, or of the drawing, that hold words a reader meets. */
export const WORD_ATTRIBUTES = Object.freeze(['aria-label', 'placeholder', 'title', 'alt']);
