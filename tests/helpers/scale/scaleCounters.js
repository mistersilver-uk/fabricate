/**
 * Operation counters — the class-1, machine-invariant half of the benchmark harness
 * (issue 1071).
 *
 * Wall-clock numbers cannot be committed and compared: this repository has already
 * re-estimated the Foundry `rc` walk budget three times because hosted-runner timing did not
 * match local (`scripts/lib/foundryRunBudget.js`). Counts do not have that problem. The same
 * fixture examines the same number of candidates on every machine and every Node build, so a
 * count is a value a reviewer can read in a diff and a test can assert.
 *
 * ## Why the counters live in the FIXTURE and not in `src/`
 *
 * Issue 1071 is explicitly a no-production-change issue, and instrumentation seams are #1072's
 * job. So nothing here edits the code under measurement. Instead the counters ride on the
 * inputs the code is handed:
 *
 * - {@link countingCandidates} returns a real array (`Array.isArray` still true — every
 *   resolver guards on it) whose `find` / `filter` / `some` / `every` / `findIndex` wrap the
 *   caller's predicate. The predicate of `Array.prototype.find` is invoked exactly once per
 *   element examined, so counting invocations counts candidates examined — which is the term
 *   `resolveComponentForItem`'s raw-reference tier and `findComponentByName`'s fallback scan
 *   are linear in.
 * - {@link countingActor} makes `items` a getter, so it counts BOTH how many times a hot path
 *   re-reads an actor's inventory and how many item objects that cost. That is the
 *   `sourceActors.flatMap((actor) => [...actor.items])` re-flattening `evaluateCraftability`
 *   performs once per recipe.
 * - {@link countCalls} wraps one method on one instance, for a collaborator the harness
 *   constructs itself (`SignatureValidator#signaturesOverlap`, the ingredient matcher).
 *
 * ## Non-vacuity
 *
 * A counter that cannot go up is worse than no counter: it reports a green baseline forever.
 * `tests/benchmark-harness.test.js` therefore asserts each counter kind against a case whose
 * expected value is derived from the fixture's declared scale rather than from a recorded
 * observation — a miss over an N-component library examines at least N candidates, and a
 * durable-flag hit examines strictly fewer.
 */

/**
 * A counter bag. Keys are created on first use, so a case only pays for what it names.
 *
 * @returns {{bump: (key: string, amount?: number) => void, get: (key: string) => number,
 *   snapshot: () => Record<string, number>, reset: () => void}}
 */
export function createOperationCounters() {
  const counts = new Map();
  return {
    bump(key, amount = 1) {
      counts.set(key, (counts.get(key) ?? 0) + amount);
    },
    get(key) {
      return counts.get(key) ?? 0;
    },
    snapshot() {
      // Sorted so a baseline diff is stable regardless of which case bumped first.
      return Object.fromEntries([...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
    },
    reset() {
      counts.clear();
    },
  };
}

/** The array methods that take a per-element predicate and therefore measure examination. */
const PREDICATE_METHODS = ['find', 'findIndex', 'findLast', 'filter', 'some', 'every', 'map'];

/**
 * A real array that counts how many times a caller's per-element predicate runs.
 *
 * The returned value is a fresh array with OWN-PROPERTY overrides, not a subclass: every
 * resolver in `src/utils/sourceUuid.js` and `src/utils/componentNameMatch.js` guards with
 * `Array.isArray(...)`, and an own-property override keeps that true while a Proxy or a
 * plain object would not.
 *
 * @template T
 * @param {T[]} values
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {string} key Counter name, e.g. `componentCandidatesExamined`.
 * @returns {T[]}
 */
export function countingCandidates(values, counters, key) {
  const array = [...values];
  for (const method of PREDICATE_METHODS) {
    Object.defineProperty(array, method, {
      configurable: true,
      enumerable: false,
      writable: true,
      value(predicate, thisArg) {
        return Array.prototype[method].call(
          this,
          function countedPredicate(...args) {
            counters.bump(key);
            return predicate.apply(this, args);
          },
          thisArg
        );
      },
    });
  }
  return array;
}

/**
 * Wrap an actor-like object so every read of `items` is counted.
 *
 * Two counters, because they answer different questions. `<key>Reads` is how many times a
 * path re-derived the inventory — the per-recipe re-flattening #1077 targets — and
 * `<key>Scanned` is the total item objects that cost, which is the term that actually grows
 * with held-inventory size.
 *
 * @template {{items: object[]}} A
 * @param {A} actor
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {string} key Counter prefix, e.g. `actorItems`.
 * @returns {A}
 */
export function countingActor(actor, counters, key) {
  const items = actor.items;
  // A flat own-property copy rather than `Object.create(actor, …)`: the listing builders
  // read actor fields with `Object.keys`-shaped helpers and spread actors into new objects,
  // and a prototype-only field is invisible to both.
  const wrapped = { ...actor };
  Object.defineProperty(wrapped, 'items', {
    enumerable: true,
    configurable: true,
    get() {
      counters.bump(`${key}Reads`);
      counters.bump(`${key}Scanned`, items.length);
      return items;
    },
  });
  return wrapped;
}

/**
 * Count calls to one method of one instance the harness owns.
 *
 * Deliberately per-instance and never on a prototype: a prototype patch would leak into
 * every other case in the same process and turn a shared count into a running total.
 *
 * @param {object} target
 * @param {string} method
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {string} key
 * @returns {() => void} A disposer restoring the original method.
 */
export function countCalls(target, method, counters, key) {
  const original = target[method].bind(target);
  target[method] = (...args) => {
    counters.bump(key);
    return original(...args);
  };
  return () => {
    delete target[method];
  };
}
