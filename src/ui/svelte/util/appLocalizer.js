/**
 * The Svelte context through which a Fabricate app root hands its tree `localize(key)`, so a shared
 * primitive localizes its own fallback copy without importing `foundryBridge`. A tree mounted with
 * none, a published mount among them, draws the fallback and calls no `game.i18n` (issue 2454).
 */
export const APP_LOCALIZER = Symbol('fabricate.appLocalizer');

/**
 * The context holding the tooltip facade `{ show(element, text), hide(element), owns(element) }`
 * a root hands its tree, so `IconButton` opens a focus tooltip without reading `game`; a tree
 * mounted with none opens none (issue 2601).
 */
export const APP_TOOLTIPS = Symbol('fabricate.appTooltips');

/**
 * Svelte's `mount` for a Fabricate root: each tree carries `localize`, and `tooltips` when given,
 * beside the caller's context.
 */
export const mountWithLocalizer = (mount, localize, tooltips) => (component, options) =>
  mount(component, {
    ...options,
    context: new Map([
      ...(options?.context ?? []),
      [APP_LOCALIZER, localize],
      ...(tooltips ? [[APP_TOOLTIPS, tooltips]] : []),
    ]),
  });
