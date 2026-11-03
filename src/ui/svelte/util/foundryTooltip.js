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
  /**
   * Holds `element`'s `aria-describedby` at `read()` whenever it changes, after `tooltip` while the
   * open tooltip is `element`'s, because Foundry's tooltip writes `tooltip` alone on open and
   * removes the attribute on close (issue 2895); returns the stop.
   */
  holdDescribedBy(element, read) {
    const observer = new MutationObserver(() => {
      const ids = read();
      if (!ids) return;
      const held = foundryTooltips.owns(element) ? `tooltip ${ids}` : ids;
      if (element.getAttribute('aria-describedby') !== held) {
        element.setAttribute('aria-describedby', held);
      }
    });
    observer.observe(element, { attributeFilter: ['aria-describedby'] });
    return () => observer.disconnect();
  },
});
