/** The tones `FillBar` publishes for a fill or a share, and `Meter` for a segment (issue 2789). */
export const SEMANTIC_TONES = Object.freeze([
  'success',
  'warning',
  'danger',
  'info',
  'accent',
  'neutral',
]);

/** The tag-palette names: the tint keys `Avatar` takes that a contributor stack draws, in order. */
export const TAG_TONES = Object.freeze([
  'ember',
  'butter',
  'peach',
  'verdant',
  'mist',
  'azure',
  'lavender',
  'rose',
  'bone',
  'slate',
]);

/** Tag tokens and spellings that are not in the closed set, and so draw neutral. */
export const OUT_OF_SET_TONES = Object.freeze([
  'sage',
  'aqua',
  'mauve',
  'gold',
  'Ember',
  '--fab-tag-ember',
  'tag-ember',
  'var(--fab-tag-ember)',
  'constructor',
]);
