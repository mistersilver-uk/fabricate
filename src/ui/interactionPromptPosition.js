/**
 * Pure anchor → inline-position mapping for the region-entry interaction prompt
 * toast (see InteractionPromptApp). The prompt is a plain fixed-position DOM
 * toast; this module turns a configured anchor id into the CSS position
 * declarations applied inline, so a GM/player can move the prompt away from a
 * conflicting on-screen widget (e.g. a camera-control panel that occupies the
 * default bottom-center). No DOM, Foundry, or Svelte dependencies so it stays
 * unit-testable.
 */

/** The default anchor — the prompt's historical bottom-center position. */
export const DEFAULT_INTERACTION_PROMPT_POSITION = 'bottom-center';

/**
 * The offered anchors: the four screen corners and the four edge-centers, plus
 * the default bottom-center. Values are i18n label keys for the setting picker.
 * @type {Readonly<Record<string, string>>}
 */
export const INTERACTION_PROMPT_POSITION_CHOICES = Object.freeze({
  'top-left': 'FABRICATE.Settings.InteractionPromptPosition.Choices.TopLeft',
  'top-center': 'FABRICATE.Settings.InteractionPromptPosition.Choices.TopCenter',
  'top-right': 'FABRICATE.Settings.InteractionPromptPosition.Choices.TopRight',
  'middle-left': 'FABRICATE.Settings.InteractionPromptPosition.Choices.MiddleLeft',
  'middle-right': 'FABRICATE.Settings.InteractionPromptPosition.Choices.MiddleRight',
  'bottom-left': 'FABRICATE.Settings.InteractionPromptPosition.Choices.BottomLeft',
  'bottom-center': 'FABRICATE.Settings.InteractionPromptPosition.Choices.BottomCenter',
  'bottom-right': 'FABRICATE.Settings.InteractionPromptPosition.Choices.BottomRight',
});

// Edge insets. The bottom inset clears Foundry's macro hotbar; the others clear
// the scene navigation / sidebar with a comfortable margin.
const EDGE_INSET = '16px';
const BOTTOM_INSET = '96px';

const HORIZONTAL = Object.freeze({
  left: `left:${EDGE_INSET}`,
  center: 'left:50%',
  right: `right:${EDGE_INSET}`,
});

const VERTICAL = Object.freeze({
  top: `top:${EDGE_INSET}`,
  middle: 'top:50%',
  bottom: `bottom:${BOTTOM_INSET}`,
});

/**
 * Resolve an anchor id to the inline CSS position declarations (excluding the
 * constant `position:fixed`, z-index, sizing, and pointer-events the caller
 * always applies). Unknown/invalid anchors fall back to the default
 * bottom-center, so a corrupt setting never mispositions the prompt off-screen.
 *
 * @param {string} anchor One of the `INTERACTION_PROMPT_POSITION_CHOICES` keys.
 * @returns {string[]} CSS declarations, e.g. `['left:50%','bottom:96px','transform:translateX(-50%)']`.
 */
export function resolveInteractionPromptPositionStyle(anchor) {
  const id = Object.hasOwn(INTERACTION_PROMPT_POSITION_CHOICES, anchor)
    ? anchor
    : DEFAULT_INTERACTION_PROMPT_POSITION;
  const [vertical, horizontal] = id.split('-');

  const declarations = [HORIZONTAL[horizontal], VERTICAL[vertical]];

  const transforms = [];
  if (horizontal === 'center') transforms.push('translateX(-50%)');
  if (vertical === 'middle') transforms.push('translateY(-50%)');
  if (transforms.length > 0) declarations.push(`transform:${transforms.join(' ')}`);

  return declarations;
}
