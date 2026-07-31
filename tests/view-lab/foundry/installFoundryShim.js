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
    reduce: (reducer, initial) =>
      entries.reduce((accumulator, element) => reducer(accumulator, element), initial),
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
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object'
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
      return {
        collection: parts[0] ?? null,
        documentId: parts.at(-1) ?? null,
        id: parts.at(-1) ?? null,
      };
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
  return {
    implementation: { enrichHTML: async (raw) => enrich(raw) },
    enrichHTML: async (raw) => enrich(raw),
  };
}

/**
 * The two dnd5e Starter Heroes the smoke imports, reconstructed.
 *
 * HONEST LIMIT. Everything else the smoke seeds — systems, components, recipes, tools, inventories,
 * gathering library — is the smoke's own code replayed verbatim. These two actors are not: the real
 * `dnd5e.heroes` compendium is a LevelDB pack with snappy-compressed blocks, which cannot be read
 * without a decoder the lab does not carry. So their identity is reconstructed from what the smoke
 * demonstrably uses — the names appear on its own actor-sheet frames, and the portraits come from
 * the dnd5e system's own class art.
 *
 * The seed sorts the index by name and imports the first two `character` entries, so the order here
 * is what decides which is the crafter and which the travel member.
 */
const DND5E_STARTER_HEROES = Object.freeze([
  {
    _id: 'labhero000000001',
    name: 'Akra (Dragonborn Cleric)',
    type: 'character',
    img: '/@foundry-system/dnd5e/icons/classes/cleric.webp',
  },
  {
    _id: 'labhero000000002',
    name: 'Aoth (Human Druid)',
    type: 'character',
    img: '/@foundry-system/dnd5e/icons/classes/druid.webp',
  },
]);

/** A `game.packs` carrying just the hero pack the smoke's seed asks for by id. */
function createHeroPacks() {
  const pack = {
    collection: 'dnd5e.heroes',
    documentName: 'Actor',
    metadata: { id: 'dnd5e.heroes', label: 'Starter Heroes', type: 'Actor' },
    async getIndex() {
      return DND5E_STARTER_HEROES.map((hero) => ({ ...hero }));
    },
    async getDocument(id) {
      return DND5E_STARTER_HEROES.find((hero) => hero._id === id) ?? null;
    },
  };
  const packs = createCollection([pack], { idKey: 'collection' });
  return Object.assign(packs, {
    get: (id) => (id === 'dnd5e.heroes' ? pack : null),
    find: (predicate) => [pack].find((element) => predicate(element)) ?? null,
  });
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
  const playerUser = {
    id: 'user-lab-player',
    name: 'Lab Player',
    isGM: false,
    color: { css: '#8ecae6' },
  };

  const game = {
    ready: true,
    user: gmUser,
    users: Object.assign(createCollection([gmUser, playerUser]), {
      activeGM: gmUser,
      players: [playerUser],
    }),
    actors: Object.assign(createCollection(world.actorList), {
      // The smoke imports its crafter and travel member from the hero pack rather than creating
      // them, so this is the call that decides who owns the inventory every craftability frame reads.
      async importFromCompendium(pack, id) {
        const entry = await pack.getDocument(id);
        if (!entry) return null;
        const [actor] = await globalThis.Actor.createDocuments([
          { name: entry.name, type: entry.type, img: entry.img },
        ]);
        return actor;
      },
    }),
    items: createCollection([]),
    scenes: Object.assign(createCollection(world.scenes ?? []), {
      current: world.scenes?.[0] ?? null,
    }),
    journal: createCollection([]),
    folders: createCollection([]),
    macros: createCollection([]),
    tables: createCollection([]),
    packs: createHeroPacks(),
    system: {
      id: 'dnd5e',
      version: '4.0.0',
      documentTypes: { Item: ['loot', 'weapon', 'equipment', 'consumable'] },
    },
    // The smoke's seed picks an item type from here before creating its world items.
    documentTypes: { Item: ['loot', 'weapon', 'equipment', 'consumable'] },
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

  /**
   * A world `Item` collection good enough for the smoke's seed.
   *
   * `Item.createDocuments` is the seed's only document-creation call, and everything downstream
   * resolves those items through `fromUuid` — `csm.addItemFromUuid` in particular — so a created
   * item MUST land in the uuid index or the whole seed registers nothing.
   */
  globalThis.Item = {
    async createDocuments(specs = []) {
      return specs.map((spec) => {
        const id = random.randomID(16);
        const document = {
          id,
          _id: id,
          uuid: `Item.${id}`,
          name: spec.name,
          type: spec.type ?? 'loot',
          img: spec.img ?? null,
          system: { quantity: 1, description: { value: '' }, ...(spec.system ?? {}) },
          flags: spec.flags ?? {},
          getFlag(scope, key) {
            return this.flags?.[scope]?.[key] ?? null;
          },
          async setFlag(scope, key, value) {
            this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value };
            return this;
          },
          async update(changes) {
            Object.assign(this, changes);
            return this;
          },
        };
        world.documents.set(document.uuid, document);
        game.items.contents.push(document);
        return document;
      });
    },
    async create(spec) {
      return (await this.createDocuments([spec]))[0];
    },
  };
  /**
   * Enough of a document to satisfy the smoke's seed: an id, a uuid the index resolves, and the
   * embedded-collection call it uses. `Scene` needs `createEmbeddedDocuments('Region', …)` because
   * the seed attaches Fabricate interactable behaviours to regions.
   */
  const makeDocument = (spec, prefix, extra = {}) => {
    const id = random.randomID(16);
    const document = {
      id,
      _id: id,
      uuid: `${prefix}.${id}`,
      name: spec.name,
      img: spec.img ?? null,
      flags: spec.flags ?? {},
      ...spec,
      ...extra,
      getFlag(scope, key) {
        return this.flags?.[scope]?.[key] ?? null;
      },
      async setFlag(scope, key, value) {
        this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value };
        return this;
      },
      async update(changes) {
        Object.assign(this, changes);
        return this;
      },
      async createEmbeddedDocuments(type, embedded = []) {
        const created = embedded.map((entry) => makeDocument(entry, `${prefix}.${id}.${type}`));
        this[type] = [...(this[type] ?? []), ...created];
        for (const child of created) world.documents.set(child.uuid, child);
        return created;
      },
      async deleteEmbeddedDocuments() {
        return [];
      },
    };
    // The id is regenerated above via spread order, so pin the canonical one back.
    document.id = id;
    document._id = id;
    document.uuid = `${prefix}.${id}`;
    world.documents.set(document.uuid, document);
    return document;
  };

  globalThis.Scene = {
    async create(spec) {
      const scene = makeDocument(spec, 'Scene', { regions: [] });
      game.scenes.contents.push(scene);
      return scene;
    },
    async createDocuments(specs = []) {
      return Promise.all(specs.map((spec) => globalThis.Scene.create(spec)));
    },
  };
  globalThis.Actor = {
    async createDocuments(specs = []) {
      const created = specs.map((spec) =>
        makeDocument(spec, 'Actor', { items: [], type: spec.type ?? 'character', isOwner: true })
      );
      game.actors.contents.push(...created);
      return created;
    },
  };
  globalThis.Folder = {
    async createDocuments(specs = []) {
      return specs;
    },
  };
  globalThis.User = {
    async createDocuments(specs = []) {
      return specs.map((spec) => makeDocument(spec, 'User', { isGM: spec.role >= 3 }));
    },
  };

  // The smoke's world-document block opens by deleting stale data from a previous run. In a lab
  // realm there is never any, so these are no-ops — but they must EXIST, because the seed calls
  // them unconditionally and a missing static would abort the whole replay on its first line.
  for (const collection of [globalThis.Item, globalThis.Actor, globalThis.Scene, globalThis.User]) {
    collection.deleteDocuments = async () => [];
    collection.updateDocuments = async (updates = []) => updates;
  }

  globalThis.ui = {
    notifications: { info: () => {}, warn: () => {}, error: () => {}, notify: () => {} },
    windows: {},
  };
  globalThis.Hooks = createHooks();
  globalThis.CONST = {
    DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
    CANVAS_PERFORMANCE_MODES: { LOW: 0, MED: 1, HIGH: 2, MAX: 3 },
    CHAT_MESSAGE_STYLES: { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 },
    // The smoke's seed creates its gatherer user at PLAYER role.
    USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 },
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
      api: {
        ApplicationV2: LabApplicationV2,
        HandlebarsApplicationMixin: (base) => base,
        DialogV2: class {},
      },
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
