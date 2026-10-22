/**
 * The tooltip facade a Fabricate root hands its tree as `APP_TOOLTIPS`. Each call reads
 * `game.tooltip` when it runs, because the facade is built at import and Foundry constructs the
 * manager, from `CONFIG.ux.TooltipManager`, only after `init`; with none, `show` and `hide` do
 * nothing and `owns` answers false.
 */
export const foundryTooltips = Object.freeze({
  /** Show `text` as plain text beside `element`. */
  show(element, text) {
    globalThis.game?.tooltip?.activate(element, { text });
  },
  /** Whether the open tooltip is `element`'s. */
  owns: (element) => Boolean(element) && globalThis.game?.tooltip?.element === element,
  /** Close the open tooltip only while it is `element`'s. */
  hide(element) {
    if (foundryTooltips.owns(element)) globalThis.game.tooltip.deactivate();
  },
});
