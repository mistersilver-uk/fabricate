/**
 * The Svelte context through which a Fabricate app root hands its tree `localize(key)`, so a shared
 * primitive localizes its own fallback copy without importing `foundryBridge`. A tree mounted with
 * none, a published mount among them, draws the fallback and calls no `game.i18n` (issue 2454).
 */
export const APP_LOCALIZER = Symbol('fabricate.appLocalizer');

/** Svelte's `mount` for a Fabricate root: each tree carries `localize` beside the caller's context. */
export const mountWithLocalizer = (mount, localize) => (component, options) =>
  mount(component, {
    ...options,
    context: new Map([...(options?.context ?? []), [APP_LOCALIZER, localize]]),
  });
