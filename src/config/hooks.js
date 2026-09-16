/**
 * Public Foundry hook names that Fabricate publishes for other module authors to
 * subscribe to. These are part of the module's public API contract: subscribe with
 * `Hooks.on(name, handler)` and treat the payload shape as stable within a major
 * version. The same constants are exposed on `game.fabricate.api.HOOKS` so authors
 * can reference them without hard-coding the literal strings.
 *
 * Only hooks intended as a documented integration surface live here. Lower-level
 * internal signals (for example `fabricate.gathering.richAttemptCommitted`) are not
 * part of this contract and may change without notice.
 */

/** Gathering lifecycle hooks. */
export const GATHERING_HOOKS = Object.freeze({
  ATTEMPT_COMPLETED: 'fabricate.gathering.attemptCompleted',
  EVENT_TRIGGERED: 'fabricate.gathering.eventTriggered',
});

/** GM Manager extension-surface hooks. */
export const MANAGER_HOOKS = Object.freeze({
  NAV_PROVIDER_REGISTERED: 'fabricate.manager.navProviderRegistered',
  NAV_PROVIDER_UNREGISTERED: 'fabricate.manager.navProviderUnregistered',
  SURFACE_MOUNTED: 'fabricate.manager.surfaceMounted',
  SURFACE_UNMOUNTED: 'fabricate.manager.surfaceUnmounted',
  SURFACE_TAB_CHANGED: 'fabricate.manager.surfaceTabChanged',
});

/** Player-window extension-surface hooks. */
export const PLAYER_HOOKS = Object.freeze({
  NAV_PROVIDER_REGISTERED: 'fabricate.player.navProviderRegistered',
  NAV_PROVIDER_UNREGISTERED: 'fabricate.player.navProviderUnregistered',
  SURFACE_MOUNTED: 'fabricate.player.surfaceMounted',
  SURFACE_UNMOUNTED: 'fabricate.player.surfaceUnmounted',
  SURFACE_TAB_CHANGED: 'fabricate.player.surfaceTabChanged',
});

/** Aggregate of every public Fabricate hook namespace, grouped by domain. */
export const FABRICATE_HOOKS = Object.freeze({
  gathering: GATHERING_HOOKS,
  manager: MANAGER_HOOKS,
  player: PLAYER_HOOKS,
});
