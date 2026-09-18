/** Instrumentation probes for the deterministic scale guards (issue 1072). */

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

/** A Map-backed `game.settings` stand-in that counts SERIALIZED PAYLOAD BYTES per key. */
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
 * Assert that a measured operation count does not grow FASTER than linearly when a fixture axis is
 * scaled by `factor`.
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
