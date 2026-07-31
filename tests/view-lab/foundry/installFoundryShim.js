/**
 * The Foundry globals the View Lab installs before it imports any Fabricate runtime module.
 *
 * The point of this file is to be SMALL. Fabricate's own architecture already keeps Foundry at
 * arm's length — the stores inject every side effect, and the app classes route every read through
 * the `game.fabricate` facade — so the lab does not need to reimplement Fabricate. It needs to
 * satisfy the handful of globals that `src/main.js` and the settings module genuinely touch, and
 * then let the REAL `Fabricate` facade, the REAL managers, and the REAL listing builders run.
 *
 * Two globals are load-bearing in ways that are easy to miss:
 *
 * - `game.settings` is the entire persistence layer. Backing it with a Map is what lets
 *   `CraftingSystemManager.initialize()` load real systems and normalize them for real.
 * - `foundry.applications.api.ApplicationV2` must merely EXIST as a class at import time, because
 *   `SvelteFabricateApp` extends it at module scope. The lab never renders through ApplicationV2 —
 *   it borrows `_buildServices`/`_prepareSvelteProps` off the prototype — so a bare class is
 *   enough, and using the real seam builder is what removes any chance of the lab's service bag
 *   drifting from production's.
 */
import { installLabRandom } from './labRandom.js';

/**
 * Compose the Map key for one setting.
 *
 * Exported so the world seeder and the shim cannot drift apart. They did once: the two files used
 * different separators, so every seeded value was invisible to `getSetting` and the app rendered
 * perfectly with nothing in it — a failure that looks like a data bug and is actually a key bug.
 *
 * @param {string} namespace Settings namespace.
 * @param {string} key Setting key.
 * @returns {string} Composite key.
 */
export function settingsKey(namespace, key) {
  return `${namespace}::${key}`;
}

/**
 * Foundry's `game.settings`, backed by a Map.
 *
 * `register` records the declared default so a `get` before any `set` returns what production
 * would return — several managers read a setting during `initialize()` before anything writes one.
 *
 * @param {Map<string, unknown>} store Seeded values, keyed `namespace\0key`.
 * @returns {object} A `game.settings`-shaped object.
 */
function createSettings(store) {
  const defaults = new Map();
  return {
    register(namespace, key, definition = {}) {
      defaults.set(settingsKey(namespace, key), definition.default);
    },
    registerMenu() {},
    settings: defaults,
    get(namespace, key) {
      const composite = settingsKey(namespace, key);
      if (store.has(composite)) return store.get(composite);
      return defaults.get(composite);
    },
    set(namespace, key, value) {
      store.set(settingsKey(namespace, key), value);
      return Promise.resolve(value);
    },
  };
}

function createCollection(entries, { idKey = 'id' } = {}) {
  const byId = new Map(entries.map((entry) => [entry[idKey], entry]));
  return {
    contents: entries,
    get: (id) => byId.get(id) ?? null,
    getName: (name) => entries.find((entry) => entry.name === name) ?? null,
    find: (predicate) => entries.find((element) => predicate(element)) ?? null,
    filter: (predicate) => entries.filter((element) => predicate(element)),
    map: (mapper) => entries.map((element) => mapper(element)),
    reduce: (reducer, initial) => entries.reduce((accumulator, element) => reducer(accumulator, element), initial),
    forEach: (visitor) => entries.forEach((element) => visitor(element)),
    get size() {
      return entries.length;
    },
    [Symbol.iterator]: () => entries[Symbol.iterator](),
  };
}

/** `foundry.utils` — only the members Fabricate actually calls. */
function createUtils(randomID) {
  const getProperty = (object, path) =>
    String(path)
      .split('.')
      .reduce((current, part) => (current == null ? current : current[part]), object);

  const setProperty = (object, path, value) => {
    const parts = String(path).split('.');
    const last = parts.pop();
    let target = object;
    for (const part of parts) {
      if (typeof target[part] !== 'object' || target[part] === null) target[part] = {};
      target = target[part];
    }
    target[last] = value;
    return true;
  };

  const deepClone = (value) => (value === undefined ? value : structuredClone(value));

  const mergeObject = (original, other = {}, { insertKeys = true, overwrite = true } = {}) => {
    const result = deepClone(original) ?? {};
    for (const [key, value] of Object.entries(other ?? {})) {
      const exists = Object.hasOwn(result, key);
      if (!exists && !insertKeys) continue;
      if (exists && !overwrite) continue;
      result[key] =
        value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object'
          ? mergeObject(result[key], value, { insertKeys, overwrite })
          : deepClone(value);
    }
    return result;
  };

  return {
    randomID,
    getProperty,
    setProperty,
    hasProperty: (object, path) => getProperty(object, path) !== undefined,
    deepClone,
    mergeObject,
    duplicate: deepClone,
    isEmpty: (value) => value == null || Object.keys(value).length === 0,
    expandObject: (flat) => {
      const out = {};
      for (const [path, value] of Object.entries(flat ?? {})) setProperty(out, path, value);
      return out;
    },
    parseUuid: (uuid) => {
      const parts = String(uuid ?? '').split('.');
      return { collection: parts[0] ?? null, documentId: parts.at(-1) ?? null, id: parts.at(-1) ?? null };
    },
    debounce: (fn) => fn,
    escapeHTML: (value) =>
      String(value).replace(
        /[&<>"']/g,
        (character) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
      ),
  };
}

/**
 * A no-op `Hooks`. `src/main.js` registers a dozen hooks at module scope, so this has to exist
 * BEFORE that module is imported — which is why the lab imports the Fabricate runtime dynamically,
 * after this shim is installed.
 */
function createHooks() {
  const registrations = new Map();
  let nextId = 0;
  return {
    on(event, handler) {
      nextId += 1;
      registrations.set(nextId, { event, handler });
      return nextId;
    },
    once(event, handler) {
      return this.on(event, handler);
    },
    off(_event, id) {
      registrations.delete(id);
    },
    /** The lab never dispatches; nothing in a static screenshot depends on a hook firing. */
    callAll: () => true,
    call: () => true,
    registrations,
  };
}

/**
 * A minimal `TextEditor`. `CraftingSystemManager` resolves descriptions through Foundry's enricher
 * at its ingestion boundaries; without this, every description panel renders raw `@UUID[...]` text
 * or nothing at all.
 *
 * @param {Map<string, object>} documents The uuid index, for resolving content links to names.
 */
function createTextEditor(documents) {
  const enrich = (raw) =>
    String(raw ?? '').replace(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g, (whole, uuid, label) => {
      const name = label || documents.get(uuid)?.name;
      return name ? `<a class="content-link" data-uuid="${uuid}">${name}</a>` : whole;
    });
  return { implementation: { enrichHTML: async (raw) => enrich(raw) }, enrichHTML: async (raw) => enrich(raw) };
}

/**
 * Install every Foundry global the Fabricate runtime reads, and return a disposer.
 *
 * @param {object} world The lab world (see `../world/labWorld.js`) supplying documents and actors.
 * @returns {{restore: () => void, randomID: (length?: number) => string}}
 */
export function installFoundryShim(world) {
  const random = installLabRandom({ seed: world.seed });
  const utils = createUtils(random.randomID);

  const previous = {
    game: globalThis.game,
    ui: globalThis.ui,
    Hooks: globalThis.Hooks,
    CONST: globalThis.CONST,
    foundry: globalThis.foundry,
    fromUuid: globalThis.fromUuid,
    fromUuidSync: globalThis.fromUuidSync,
  };

  const gmUser = { id: 'user-lab-gm', name: 'Lab GM', isGM: true, color: { css: '#f1d1b5' } };
  const playerUser = { id: 'user-lab-player', name: 'Lab Player', isGM: false, color: { css: '#8ecae6' } };

  const game = {
    ready: true,
    user: gmUser,
    users: Object.assign(createCollection([gmUser, playerUser]), { activeGM: gmUser, players: [playerUser] }),
    actors: createCollection(world.actorList),
    items: createCollection([]),
    scenes: Object.assign(createCollection(world.scenes ?? []), { current: world.scenes?.[0] ?? null }),
    journal: createCollection([]),
    folders: createCollection([]),
    macros: createCollection([]),
    tables: createCollection([]),
    packs: Object.assign(createCollection([]), { get: () => null }),
    system: { id: 'dnd5e', version: '4.0.0' },
    modules: { get: () => ({ id: 'fabricate', version: '0.0.0-viewlab', active: true }) },
    settings: createSettings(world.settings),
    i18n: world.i18n,
    time: { worldTime: world.worldTime, calendar: null, advance: () => {} },
    // Deliberately null: every player seam reads `game?.fabricate?.X?.() ?? fallback`, so leaving
    // this null until the real facade is installed proves nothing reaches around the seam layer.
    fabricate: null,
    keybindings: { register: () => {} },
    socket: null,
  };

  globalThis.game = game;
  globalThis.ui = {
    notifications: { info: () => {}, warn: () => {}, error: () => {}, notify: () => {} },
    windows: {},
  };
  globalThis.Hooks = createHooks();
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
    CANVAS_PERFORMANCE_MODES: { LOW: 0, MED: 1, HIGH: 2, MAX: 3 },
    CHAT_MESSAGE_STYLES: { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 },
  };

  /**
   * ApplicationV2 exists only so `SvelteFabricateApp`/`SvelteCraftingSystemManagerApp` can extend
   * it at module scope. The lab borrows `_buildServices` off the prototype and never constructs an
   * application, so nothing below this class is exercised.
   */
  class LabApplicationV2 {
    static DEFAULT_OPTIONS = { classes: [], window: {}, position: {} };
    static _instances = new Map();
    constructor(options = {}) {
      this.options = options;
    }
    render() {
      return this;
    }
    close() {
      return this;
    }
    setPosition(position) {
      return position;
    }
    _updatePosition(position) {
      return position;
    }
  }

  globalThis.foundry = {
    utils,
    applications: {
      api: { ApplicationV2: LabApplicationV2, HandlebarsApplicationMixin: (base) => base, DialogV2: class {} },
      ux: { TextEditor: createTextEditor(world.documents) },
      instances: new Map(),
    },
    documents: {},
    CONST: globalThis.CONST,
  };

  globalThis.fromUuid = async (uuid) => world.documents.get(uuid) ?? null;
  globalThis.fromUuidSync = (uuid) => world.documents.get(uuid) ?? null;

  return {
    randomID: random.randomID,
    /**
     * Player frames must render as a NON-GM viewer or redaction never engages and the frame lies.
     * The world is built as GM (initialization migrates and writes), then the viewer is flipped
     * before the player services are constructed.
     *
     * @param {'gm'|'player'} role Which viewer the render represents.
     */
    setViewer(role) {
      game.user = role === 'player' ? playerUser : gmUser;
    },
    restore() {
      random.restore();
      globalThis.game = previous.game;
      globalThis.ui = previous.ui;
      globalThis.Hooks = previous.Hooks;
      globalThis.CONST = previous.CONST;
      globalThis.foundry = previous.foundry;
      globalThis.fromUuid = previous.fromUuid;
      globalThis.fromUuidSync = previous.fromUuidSync;
    },
  };
}
