/**
 * The probes a published control's keyboard tooltip is read with (issue 2852): a keyboard focus,
 * which happy-dom cannot tell from a pointer one, and the lab's call-recording stand-in for
 * Foundry's `TooltipManager` as `game.tooltip`, which the caller deletes after each test.
 */
import { createLabTooltipManager } from '../view-lab/foundry/installFoundryShim.js';

/** Focuses `node`, answering `:focus-visible` as a keyboard focus does. */
export function keyboardFocus(node) {
  const matches = node.matches.bind(node);
  node.matches = (selector) => selector === ':focus-visible' || matches(selector);
  node.focus();
}

/** Installs and returns a recording `game.tooltip`. */
export function withTooltip() {
  const tooltip = createLabTooltipManager();
  globalThis.game.tooltip = tooltip;
  return tooltip;
}

/** An Escape keydown that bubbles, made in `node`'s window. */
export function escapeKey(node) {
  const { KeyboardEvent } = node.ownerDocument.defaultView;
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
}
