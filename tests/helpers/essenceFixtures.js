/**
 * Shared essence builders and the Foundry-ish engine harness for the issue-1036 essence
 * suites.
 *
 * Hoisted so the essence-definition shape, the crafting-system stub and the capturing
 * actor are defined ONCE rather than re-pasted into each essence test file: SonarCloud's
 * new-code duplication gate counts `tests/**` exactly like `src/**`, and
 * `sonar.cpd.exclusions` is inert under Automatic Analysis.
 *
 * `makeEssence` deliberately emits BOTH new persisted fields with explicit values. An
 * `enabled` default of `true` is an INVERTED-DEFAULT hazard — a `true` fixture round-trips
 * green through a dropped field — so every suite that pins persistence uses a `false`
 * override, and the builder makes that a one-word change rather than a fresh literal.
 */

/**
 * One essence definition in the exact shape `_normalizeEssenceDefinition` emits.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function makeEssence(overrides = {}) {
  return {
    id: 'fire',
    name: 'Fire',
    description: 'Elemental heat',
    icon: 'fas fa-fire',
    colorToken: null,
    enabled: true,
    propertyMacroUuid: null,
    sourceComponentId: null,
    sourceItemUuid: null,
    associatedSystemItemId: null,
    ...overrides,
  };
}

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setProperty(object, path, value) {
  const parts = String(path).split('.');
  let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (current[parts[index]] == null) current[parts[index]] = {};
    current = current[parts[index]];
  }
  current[parts.at(-1)] = value;
}

/**
 * Install the Foundry globals the crafting engine reads, and return the notification
 * spies so a suite can assert that an unresolvable macro raised NO toast.
 *
 * @returns {{errors: string[], warnings: string[], infos: string[]}}
 */
export function installEngineGlobals() {
  const errors = [];
  const warnings = [];
  const infos = [];
  let ids = 0;
  globalThis.foundry = {
    utils: {
      getProperty,
      setProperty,
      randomID: () => `rid-${(ids += 1)}`,
      deepClone: (value) => JSON.parse(JSON.stringify(value)),
    },
  };
  globalThis.ui = {
    notifications: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      info: (message) => infos.push(String(message)),
    },
  };
  return { errors, warnings, infos };
}

/**
 * Publish a crafting system on `game.fabricate` and resolve the supplied documents
 * through `fromUuid`.
 *
 * `documents` is a plain uuid -> document map, so a suite lists exactly the macros and
 * source items it means to be resolvable and every other uuid resolves to `null` — which
 * is the state the silent-skip path exists for.
 *
 * @param {object} system
 * @param {Record<string, object>} [documents]
 */
export function publishSystem(system, documents = {}) {
  globalThis.game = {
    user: { isGM: true },
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async (uuid) => documents[uuid] ?? null;
}

/**
 * A script Macro stand-in. `command` is a string, which is the ONLY thing
 * `MacroExecutor.run` requires, and the body is evaluated as an async function whose
 * `context` argument is the macro context.
 *
 * @param {string} command
 * @returns {{command: string, type: string}}
 */
export function makeScriptMacro(command) {
  return { command, type: 'script' };
}

/**
 * An actor that records every item payload handed to `createEmbeddedDocuments` and
 * exposes an iterable `items` collection, which is what the engine's stacking lookup
 * requires before it will even consider a match.
 *
 * @param {object[]} [items]
 */
export function makeCapturingActor(items = []) {
  const captured = [];
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    captured,
    items: {
      contents: items,
      [Symbol.iterator]() {
        return items[Symbol.iterator]();
      },
    },
    async createEmbeddedDocuments(_type, dataArray) {
      captured.push(...dataArray);
      return dataArray.map((data, index) => ({
        ...data,
        uuid: `Item.created-${index}`,
        effects: [],
        async createEmbeddedDocuments(_effectType, effects) {
          this.effects.push(...effects);
          return effects;
        },
      }));
    },
  };
}

/**
 * An owned inventory item the stacking path can update, matched by NAME (the engine's
 * case-sensitive name fallback) so a fixture needs no uuid plumbing.
 *
 * @param {string} name
 * @param {number} quantity
 */
export function makeOwnedStack(name, quantity = 1) {
  return {
    id: `owned-${name.toLowerCase().replaceAll(/\W+/g, '-')}`,
    uuid: `Item.owned-${name}`,
    name,
    system: { quantity },
    flags: {},
    updates: [],
    getFlag: () => null,
    async update(payload) {
      this.updates.push({ ...payload });
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
    },
  };
}
