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

/**
 * Gathering lifecycle hooks.
 *
 * - `ATTEMPT_COMPLETED` fires exactly once for every terminal gathering attempt
 *   (success or failure, immediate or matured timed run), after all side effects
 *   (item creation, tool breakage, chat output) have been committed.
 * - `EVENT_TRIGGERED` fires once per encounter/event triggered by an attempt.
 *
 * @type {Readonly<{ATTEMPT_COMPLETED: string, EVENT_TRIGGERED: string}>}
 */
export const GATHERING_HOOKS = Object.freeze({
  ATTEMPT_COMPLETED: 'fabricate.gathering.attemptCompleted',
  EVENT_TRIGGERED: 'fabricate.gathering.eventTriggered',
});

/**
 * GM Manager extension-surface hooks.
 *
 * These are purely OBSERVATIONAL: Fabricate publishes them after it has already acted,
 * a listener's return value is ignored, and nothing a listener does changes what the
 * Manager renders. A companion that wants to CHANGE the Manager registers a World
 * navigation provider (`game.fabricate.api.managerExtensions.registerWorldNavProvider`)
 * — these hooks exist so a companion can react to a surface it does not own.
 *
 * - `NAV_PROVIDER_REGISTERED` / `NAV_PROVIDER_UNREGISTERED` fire when a provider takes
 *   or releases a Manager surface, with `{ schemaVersion, surfaceId, tabIds }`.
 * - `SURFACE_MOUNTED` / `SURFACE_UNMOUNTED` fire when the Manager route hosting an
 *   extension surface is rendered and torn down, with
 *   `{ schemaVersion, surfaceId, route, tabId, providerId, coreFallback }`.
 * - `SURFACE_TAB_CHANGED` fires when the active tab of a hosted surface changes, with
 *   `{ schemaVersion, surfaceId, route, tabId, previousTabId, providerId, coreFallback }`.
 *
 * @type {Readonly<{NAV_PROVIDER_REGISTERED: string, NAV_PROVIDER_UNREGISTERED: string, SURFACE_MOUNTED: string, SURFACE_UNMOUNTED: string, SURFACE_TAB_CHANGED: string}>}
 */
export const MANAGER_HOOKS = Object.freeze({
  NAV_PROVIDER_REGISTERED: 'fabricate.manager.navProviderRegistered',
  NAV_PROVIDER_UNREGISTERED: 'fabricate.manager.navProviderUnregistered',
  SURFACE_MOUNTED: 'fabricate.manager.surfaceMounted',
  SURFACE_UNMOUNTED: 'fabricate.manager.surfaceUnmounted',
  SURFACE_TAB_CHANGED: 'fabricate.manager.surfaceTabChanged',
});

/**
 * Aggregate of every public Fabricate hook namespace, grouped by domain. Exposed on
 * `game.fabricate.api.HOOKS`.
 *
 * @type {Readonly<{gathering: typeof GATHERING_HOOKS, manager: typeof MANAGER_HOOKS}>}
 */
export const FABRICATE_HOOKS = Object.freeze({
  gathering: GATHERING_HOOKS,
  manager: MANAGER_HOOKS,
});
