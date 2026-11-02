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
   * Writes `read()` back as `element`'s `aria-describedby` whenever it changes while no tooltip is
   * `element`'s, because Foundry's tooltip replaces the attribute while open and removes it on
   * close (issue 2895); returns the stop.
   */
  holdDescribedBy(element, read) {
    const observer = new MutationObserver(() => {
      const ids = read();
      if (!ids || foundryTooltips.owns(element)) return;
      if (element.getAttribute('aria-describedby') !== ids) {
        element.setAttribute('aria-describedby', ids);
      }
    });
    observer.observe(element, { attributeFilter: ['aria-describedby'] });
    return () => observer.disconnect();
  },
});
