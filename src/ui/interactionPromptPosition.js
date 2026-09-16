// Anchor id to inline CSS position, for the region-entry prompt toast (`InteractionPromptApp`), so
// a GM or player can move it away from a conflicting widget such as a camera-control panel over the
// default bottom-center. No DOM, Foundry or Svelte dependency.

// The prompt's historical position, and the fallback for a corrupt setting.
export const DEFAULT_INTERACTION_PROMPT_POSITION = 'bottom-center';

// The offered anchors; values are i18n label keys for the setting picker.
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

// The bottom inset clears Foundry's macro hotbar; the rest clear scene nav and sidebar.
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

// Position declarations only: `position:fixed`, z-index, sizing and pointer-events stay the
// caller's. An unknown anchor falls back, so a corrupt setting never puts the prompt off-screen.
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
