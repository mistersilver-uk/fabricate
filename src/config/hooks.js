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
 * Aggregate of every public Fabricate hook namespace, grouped by domain. Exposed on
 * `game.fabricate.api.HOOKS`.
 *
 * @type {Readonly<{gathering: typeof GATHERING_HOOKS}>}
 */
export const FABRICATE_HOOKS = Object.freeze({
  gathering: GATHERING_HOOKS,
});
