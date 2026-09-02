/**
 * The smallest world `installFoundryShim` will accept.
 *
 * ── WHY THE PRIMITIVE LAB DOES NOT CALL `buildLabWorld()` ─────────────────────────────────────
 *
 * `world/labWorld.js` seeds three crafting systems, their components, recipes, environments,
 * gathering config and currency ladder, imports two actors, boots `src/main.js`, runs every
 * migration and constructs the real manager services. The View Lab needs all of it, because it
 * renders whole application screens driven by real data.
 *
 * A specimen on the Primitive Lab is mounted with props from a catalogue row. It reads no crafting
 * system, no recipe and no actor. Booting the runtime to render a `<Stepper>` would make the page
 * depend on every migration and every store — and this project has already measured what that
 * costs: a warn-level migration notice reddened all ~263 View Lab captures at once, because the lab
 * runs every migration whether or not the frame needs one. A page that mounts leaves has no reason
 * to inherit that.
 *
 * ── SEVEN FIELDS, BECAUSE THE SHIM READS SEVEN ────────────────────────────────────────────────
 *
 * `installFoundryShim` reads exactly `seed`, `actorList`, `scenes`, `settings`, `i18n`, `worldTime`
 * and `documents`. `localize` is deliberately NOT here: `buildLabWorld` sets it for its own use and
 * the shim never touches it, so carrying it would be an eighth field that looks required.
 *
 * Three of the seven fail LATE when absent rather than at install time — `settings`, `documents`
 * and `worldTime` are each read inside a closure, so a missing one surfaces as a `TypeError` from
 * somewhere unrelated the first time a component happens to reach it, or never. That is why this is
 * an exported factory with a name rather than an object literal at the call site: it can be read,
 * and Phase 2's coverage gate scans the shim for `world.<identifier>` and asserts each is a key
 * here.
 */

/**
 * A world time that is not zero.
 *
 * Zero is midnight on day zero, which is also what an uninitialised field reads as — so a
 * time-of-day derivation that silently received nothing and one that received the epoch render
 * identically. Two weeks in is unambiguous and matches the View Lab's own fixture.
 */
export const MINIMAL_LAB_WORLD_TIME = 1_209_600;

/**
 * Build the world the Primitive Lab installs its Foundry globals from.
 *
 * @param {object} options Options.
 * @param {{localize: Function, format: Function}} options.i18n The `game.i18n` pair, from
 *   `labI18n.js`. Required rather than defaulted: a stub that echoed keys would put raw
 *   `FABRICATE.*` strings into every specimen that localizes, which reads as a missing translation
 *   rather than as a harness that was not wired.
 * @param {number} [options.seed] Seed for the lab's deterministic `randomID` stream. Pinned by
 *   default so two loads of the same specimen generate the same ids and a diff of two captures
 *   shows only what changed.
 * @returns {{seed: number, actorList: object[], scenes: object[], settings: Map<string, unknown>,
 *   i18n: object, worldTime: number, documents: Map<string, object>}} The seven fields.
 */
export function createMinimalLabWorld({ i18n, seed = 20_260_601 } = {}) {
  if (!i18n?.localize) throw new Error('createMinimalLabWorld requires a game.i18n stub');
  return {
    seed,
    // Empty rather than populated. Nothing a primitive renders resolves an actor, a scene or a
    // uuid, and a fixture nobody reads is a fixture nobody notices going stale.
    actorList: [],
    scenes: [],
    settings: new Map(),
    i18n,
    worldTime: MINIMAL_LAB_WORLD_TIME,
    documents: new Map(),
  };
}
