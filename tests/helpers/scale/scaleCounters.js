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
 * The array methods that reach every element through a per-element CALLBACK, and that
 * {@link countingCandidates}' `PREDICATE_METHODS` list does not carry.
 *
 * `findLastIndex` is in here rather than being a `PREDICATE_METHODS` omission worth fixing in
 * place: widening the predicate list moves every committed benchmark count that walks a
 * component array and needs a `--record` pass, which is a separate change from making a guard
 * able to fail.
 */
const CALLBACK_ENUMERATORS = ['forEach', 'reduce', 'reduceRight', 'flatMap', 'findLastIndex'];

/**
 * The iterator-returning methods that reach every element WITHOUT a callback and that do not
 * collide with `definitionIndex`'s own instrumentation. `entries` is deliberately absent — see
 * {@link countingEnumerations}.
 */
const ITERATOR_ENUMERATORS = ['keys', 'values'];

/**
 * Layer "every ENUMERATION of this array is counted" on top of {@link countingCandidates}'
 * "every PREDICATE invocation is counted" (issue 1204, second pass; shared for issue 1202).
 *
 * {@link countingCandidates} counts only the predicate-taking subset (`find` / `filter` /
 * `some` / `every` / `map` / …), which means the single most common way to walk an array in
 * this repository — a plain `for (const candidate of components)` — bumps NOTHING. Production
 * already uses exactly that idiom on exactly this array (`src/utils/essenceResolver.js`,
 * `src/utils/definitionIndex.js`, `src/systems/inventorySnapshot.js`,
 * `src/utils/sourceUuid.js`), so an `items x components` product term could be re-landed in
 * its most natural form with a `.find()`-only guard still green.
 *
 * This is a SEPARATE wrapper rather than a widening of {@link countingCandidates}, and
 * deliberately so: `countingCandidates` is what `createBenchWorld` hands the benchmark cases,
 * and widening it would move every committed class-1 baseline that walks a component array.
 * A caller that wants both opts in by composing them, which is why this mutates the array it
 * is handed IN PLACE and returns it — `definitionIndex` keys its retained index on array
 * IDENTITY, so a second copy here would hand the code under measurement a different array
 * from the one a test warmed.
 *
 * `entries` is routed to a SEPARATE key because it is the one enumerator that overlaps
 * `definitionIndex`'s own counter: `buildIndex` reaches its elements through
 * `definitions.entries()`, so counting that walk on both seams would count the one-off index
 * build twice. `Symbol.iterator` does NOT overlap — a `for...of` over the array-iterator
 * `entries()` returns invokes the ITERATOR's `Symbol.iterator`, never the array's — and
 * measurement agrees: with this layer installed and no per-item scan present,
 * `Symbol.iterator`, `keys` and `values` all read 0 while `entries` reads exactly
 * `componentCount`.
 *
 * ## What an own-property override still cannot see
 *
 * A read that never goes through a method: indexed access (`components[i]`, `.at(i)`, a
 * `for (let i = 0; i < components.length; i++)` loop), the callback-free O(n) methods
 * (`indexOf`, `includes`, `lastIndexOf`, `join`, a default-comparator `sort`), and any caller
 * reaching the prototype directly (`Array.prototype.find.call(components, …)`). Closing those
 * needs a Proxy instead of own properties, which is a larger change than these guards need.
 * The gap is recorded here rather than papered over with a claim of exhaustiveness, because
 * the defect this wrapper was written for was precisely a property asserted more broadly than
 * it was checked.
 *
 * @template T
 * @param {T[]} array The array {@link countingCandidates} already wrapped; mutated in place.
 * @param {{bump: (key: string, amount?: number) => void}} counters
 * @param {{key: string, entriesKey: string}} keys
 * @returns {T[]} `array`, so it can be used inline.
 */
export function countingEnumerations(array, counters, { key, entriesKey }) {
  const define = (name, value) =>
    Object.defineProperty(array, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value,
    });
  const countedIterator = (walk, counterKey) =>
    function* counted() {
      for (const value of walk(this)) {
        counters.bump(counterKey);
        yield value;
      }
    };

  for (const method of CALLBACK_ENUMERATORS) {
    define(method, function counted(callback, ...rest) {
      return Array.prototype[method].call(
        this,
        function countedCallback(...args) {
          counters.bump(key);
          return callback.apply(this, args);
        },
        ...rest
      );
    });
  }
  for (const method of ITERATOR_ENUMERATORS) {
    define(
      method,
      countedIterator((self) => Array.prototype[method].call(self), key)
    );
  }
  define(
    Symbol.iterator,
    countedIterator((self) => Array.prototype[Symbol.iterator].call(self), key)
  );
  define(
    'entries',
    countedIterator((self) => Array.prototype.entries.call(self), entriesKey)
  );
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
