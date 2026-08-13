/**
 * Instrumentation probes for the deterministic scale guards (issue 1072).
 *
 * These are the COLLABORATOR-side half of the counting vocabulary issue 1071 established.
 * That issue could only ride on the *inputs* a path is handed — {@link countingCandidates}
 * wraps a component array, {@link countingActor} wraps an inventory — because it was
 * explicitly a no-production-change issue. Instrumenting the collaborators themselves is
 * this issue's job, and it needs no monkey-patching: `CraftingListingBuilder`,
 * `InventoryListingBuilder`, `RecipeVisibilityService` and (since this issue)
 * `RecipeManager` all take their system/recipe collaborators through a constructor, so a
 * counting wrapper goes in the same way the real object does.
 *
 * Everything here bumps the SAME counter bag as issue 1071 ({@link createOperationCounters}
 * — re-exported below so a guard imports one vocabulary from one place). There is
 * deliberately no second counter type, no second snapshot format and no second baseline
 * convention: a guard's counts and a benchmark case's counts have to be comparable, and
 * two mechanisms would silently diverge the first time one of them learned to reset.
 *
 * ## Why these guards count instead of timing
 *
 * A wall-clock assertion is not a regression guard, it is a flaky test. The measured
 * signature curve settles it: `validateSystem()` is quadratic and already costs 979 ms at
 * N=2,000, so at the programme's target scale the pre-fix behaviour extrapolates to hours
 * and simply cannot be timed. Only a count can prove that class of fix.
 */

import { createOperationCounters } from './scaleCounters.js';

export { createOperationCounters };

/**
 * Wrap an object so named method calls are counted, WITHOUT mutating it.
 *
 * `countCalls` (issue 1071) patches a method onto the instance itself, which is right for a
 * collaborator the harness constructed and owns. A guard instead wraps an object it is
 * about to inject — often a real `CraftingSystemManager` shared with other fixtures — so
 * the probe must leave the original untouched. `Object.create(target)` delegates every
 * method and getter that is NOT being counted to the real object, so the wrapper stays
 * faithful as the class grows rather than needing a hand-maintained method list.
 *
 * Throws on a method that does not exist. That is the whole point: the failure mode this
 * repository has repeatedly hit is a counter that CANNOT go up — a typo'd or renamed method
 * name makes every assertion against it vacuously true and reports a green baseline
 * forever. Failing at wrap time turns a silent zero into a loud error.
 *
 * @template {object} T
 * @param {T} target
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {{prefix: string, methods: string[]}} options `prefix` namespaces the counter keys,
 *   so `{prefix: 'csm', methods: ['getSystem']}` bumps `csmGetSystem`.
 * @returns {T}
 */
export function countingFacade(target, counters, { prefix, methods }) {
  const facade = Object.create(target);
  for (const method of methods) {
    if (typeof target?.[method] !== 'function') {
      throw new Error(
        `countingFacade: "${method}" is not a function on the target, so a counter on it ` +
          `could never go up. Fix the probe rather than asserting against a vacuous zero.`
      );
    }
    const key = `${prefix}${method[0].toUpperCase()}${method.slice(1)}`;
    Object.defineProperty(facade, method, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (...args) => {
        counters.bump(key);
        return target[method](...args);
      },
    });
  }
  return facade;
}

/**
 * A Map-backed `game.settings` stand-in that counts SERIALIZED PAYLOAD BYTES per key.
 *
 * Bytes, not `set` invocations, because the defect being guarded is write SIZE: a single
 * `save()` that serializes the whole corpus is the regression, and it is one call. The
 * measured shape of that defect — 10,000 recipes serializing to 22.3 MB, replicated to
 * every connected client — is invisible to a call counter and obvious to a byte counter.
 *
 * Both counters are kept because they answer different questions: `settingWrites<Key>` is
 * how many times a path persisted at all (the batching boundary), and `settingBytes<Key>`
 * is what each of those writes cost (the amplification).
 *
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {{initial?: Iterable<[string, any]>}} [options]
 * @returns {{settings: Map<string, any>, get: Function, set: Function}}
 */
export function countingSettings(counters, { initial = [] } = {}) {
  const settings = new Map(initial);
  return {
    settings,
    get: (_namespace, key) => settings.get(key),
    set: async (_namespace, key, value) => {
      const suffix = `${String(key)[0].toUpperCase()}${String(key).slice(1)}`;
      counters.bump(`settingWrites${suffix}`);
      // Buffer.byteLength over the JSON is exactly what Foundry ships to the server and
      // replicates to every client, and is deterministic for a deterministic fixture.
      counters.bump(`settingBytes${suffix}`, Buffer.byteLength(JSON.stringify(value), 'utf8'));
      settings.set(key, value);
      return value;
    },
  };
}

/**
 * Assert that a measured operation count does not grow FASTER than linearly when a fixture
 * axis is scaled by `factor`.
 *
 * This is the guard shape that survives the optimisations this programme is going to land.
 * Pinning an exact count would encode today's whole-corpus behaviour, so the guard would go
 * red the moment the path it protects got faster and would be deleted by whoever landed the
 * fix. An at-most-linear bound is satisfied by today's linear scan, still satisfied when the
 * scan becomes an indexed constant, and violated by exactly the regression the parent epic
 * names: a term that is a PRODUCT (`items × components`, `recipes × items`) rather than a sum.
 *
 * It is also why the fixture stays small. Sensitivity here comes from scaling ONE axis and
 * comparing, not from fixture size — a guard that scaled both axes at once could not
 * attribute a regression to either.
 *
 * @param {{baseline: number, scaled: number, factor: number, axis: string, what: string}} measurement
 * @returns {{ok: boolean, message: string}}
 */
export function atMostLinear({ baseline, scaled, factor, axis, what }) {
  const budget = baseline * factor;
  return {
    ok: scaled <= budget,
    message:
      `${what} grew faster than linearly in ${axis}: ${baseline} -> ${scaled} when ${axis} ` +
      `scaled ${factor}x, which exceeds the linear budget of ${budget}. That is the ` +
      `product-term regression (e.g. items x components) this guard exists to catch.`,
  };
}
