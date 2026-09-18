/**
 * The Foundry globals the View Lab installs before it imports any Fabricate runtime module.
 * `game.settings` is the entire persistence layer.
 */
import { createLabRoll } from './labRoll.js';
import { installLabRandom } from './labRandom.js';
import { createLabDialogV2 } from '../foundryDialog.js';
import { installUpdateSemantics, makeGetFlag, makeSetFlag } from '../world/labFlags.js';

/**
 * Compose the Map key for one setting.
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
    // Inert, and that is a finding rather than laziness (issue 953).
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

/** The two dnd5e Starter Heroes the smoke imports, reconstructed. */
/** The prefix every routed notification carries. */
const NOTIFICATION_PREFIX = 'Fabricate | notification: ';

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
 */
/** A calendar, because `game.time.calendar` is never null in a booted V13 world. */
const LAB_CALENDAR = Object.freeze({
  days: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60, daysPerYear: 365 },
  timeToComponents(time = 0) {
    const seconds = Math.max(0, Math.floor(Number(time) || 0));
    const secondsPerDay = 86_400;
    const dayIndex = Math.floor(seconds / secondsPerDay);
    const within = seconds % secondsPerDay;
    return {
      year: Math.floor(dayIndex / 365),
      day: dayIndex % 365,
      hour: Math.floor(within / 3600),
      minute: Math.floor((within % 3600) / 60),
      second: within % 60,
    };
  },
  componentsToTime(components = {}) {
    const { year = 0, day = 0, hour = 0, minute = 0, second = 0 } = components;
    return ((year * 365 + day) * 24 + hour) * 3600 + minute * 60 + second;
  },
});

/**
 * The two `Roll` statics Fabricate reads, and nothing else. `checkRoll.js` returns null the moment
 * `Roll.replaceFormulaData` is missing, so every check card fell through to the RAW formula: a
 * published frame printed `1d20 + @prof` where Foundry prints `1d20 + 3`.
 */
const LAB_ROLL_STATICS = {
  replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
    return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = String(path)
        .split('.')
        .reduce((current, part) => (current == null ? undefined : current[part]), data);
      return value === undefined || value === null ? missing : String(value);
    });
  },
  // A formula is valid here when nothing unresolved survives. Foundry parses the expression; the
  // lab only has to answer the question `checkRoll.js` actually asks of it.
  validate(formula) {
    return !/NaN|@/.test(String(formula));
  },
};

/** THE PLAYER ROSTER A CROWDED WORLD HAS, seeded on request rather than by default (issue 1515). */
const LAB_EXTRA_PLAYER_USERS = Object.freeze([
  { id: 'user-lab-player-bram', name: 'Bram Holt', role: 1, css: '#a3c9a8' },
  { id: 'user-lab-player-cass', name: 'Cass Vane', role: 2, css: '#e0b1cb' },
  { id: 'user-lab-player-doryn', name: 'Doryn Vale', role: 1, css: '#ffb703' },
  { id: 'user-lab-player-elspeth', name: 'Elspeth Rue', role: 1, css: '#bde0fe' },
  { id: 'user-lab-player-ferrin', name: 'Ferrin Ashe', role: 2, css: '#c77dff' },
  { id: 'user-lab-player-goss', name: 'Goss Merrow', role: 1, css: '#90be6d' },
  { id: 'user-lab-player-hallis', name: 'Hallis Tarn', role: 1, css: '#f4a261' },
]);

export function installFoundryShim(world) {
  const random = installLabRandom({ seed: world.seed });
  const utils = createUtils(random.randomID);
  // A counter rather than `randomID()`: chat ids never reach a frame, and a counter keeps them
  // stable across runs without spending the seeded stream, which the rendered ids do depend on.
  let chatMessageSequence = 0;

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
    // DECLARED, and it was not before (issue 1515).
    role: 1,
    color: { css: '#8ecae6' },
  };

  // Rebuilt rather than mutated when the crowded roster is asked for: `createCollection` closes
  // over the array it was handed AND over an id map built once, so pushing into `contents` would
  // leave `game.users.get()` unable to find anything added.
  function usersCollection(players) {
    return Object.assign(createCollection([gmUser, ...players]), {
      activeGM: gmUser,
      players,
    });
  }

  const game = {
    ready: true,
    user: gmUser,
    users: usersCollection([playerUser]),
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
    // THE WORLD ITEM ROSTER, SEEDED FROM THE DOCUMENT INDEX RATHER THAN LEFT EMPTY. Two
    // consequences, and both were invisible.
    items: createCollection(
      Array.from(world.documents?.values?.() ?? []).filter((document) =>
        String(document?.uuid ?? '').startsWith('Item.')
      )
    ),
    // `current` is what the Manager's Travel → Map Region Links tab reads; `active` is what the
    // three canvas windows fall back to (issue 1520).
    scenes: Object.assign(createCollection(world.scenes ?? []), {
      current: world.scenes?.[0] ?? null,
      active: world.scenes?.[0] ?? null,
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
    time: { worldTime: world.worldTime, calendar: LAB_CALENDAR, advance: () => {} },
    // Deliberately null: every player seam reads `game?.fabricate?.X?.() ?? fallback`, so leaving
    // this null until the real facade is installed proves nothing reaches around the seam layer.
    fabricate: null,
    keybindings: { register: () => {} },
    socket: null,
  };

  globalThis.game = game;

  /** A world `Item` collection good enough for the smoke's seed. */
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
        };
        // Real V13 semantics rather than three literal-key stubs: getFlag walks dotted keys,
        // update expands and deep-merges, and -=key deletes. See world/labFlags.js.
        document.getFlag = makeGetFlag(document);
        document.setFlag = makeSetFlag(document);
        installUpdateSemantics(document);
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
   * embedded-collection call it uses.
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
    // Real V13 semantics: `getFlag` walks dotted keys, `update` expands and deep-merges, `-=key`
    // deletes, and `updateSource` exists so `setFabricateFlag` takes the branch production takes.
    document.getFlag = makeGetFlag(document);
    document.setFlag = makeSetFlag(document);
    installUpdateSemantics(document);
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

  // A CONSTRUCTOR, not the old two-static object (issue 855).
  globalThis.Roll = createLabRoll({
    random: random.random,
    replaceFormulaData: LAB_ROLL_STATICS.replaceFormulaData,
    validate: LAB_ROLL_STATICS.validate,
  });

  // A run that SUCCEEDS posts a chat card.
  const createChatMessage = async (spec = {}) =>
    makeDocument({ ...spec, _id: `lab-chat-${chatMessageSequence++}` }, 'ChatMessage');

  globalThis.ChatMessage = {
    async create(data = {}) {
      return createChatMessage(data);
    },
    async createDocuments(specs = []) {
      return Promise.all(specs.map((spec) => createChatMessage(spec)));
    },
    getSpeaker(options = {}) {
      return { alias: options.actor?.name ?? 'Fabricate', actor: options.actor?.id ?? null };
    },

    // Visibility, and why BOTH statics are modelled rather than the one this lab's version needs
    // (issue 1286).
    applyMode(chatData, mode) {
      const data = chatData ?? {};
      let whisper = data.whisper ?? [];
      if (mode === 'public') whisper = [];
      else if (mode === 'self') whisper = [globalThis.game?.user?.id].filter(Boolean);
      else if (whisper.length === 0 && (mode === 'gm' || mode === 'blind')) {
        whisper = (globalThis.game?.users?.filter((user) => user.isGM) ?? []).map((user) => user.id);
      }
      data.whisper = whisper;
      data.blind = mode === 'blind';
      return data;
    },
    applyRollMode(chatData, mode) {
      // The deprecated spelling maps the legacy token and delegates, exactly as V14 does.
      const V14_MODE_BY_LEGACY = {
        publicroll: 'public',
        gmroll: 'gm',
        blindroll: 'blind',
        selfroll: 'self',
      };
      return globalThis.ChatMessage.applyMode(chatData, V14_MODE_BY_LEGACY[mode] ?? mode);
    },
  };

  // The smoke's world-document block opens by deleting stale data from a previous run.
  for (const collection of [globalThis.Item, globalThis.Actor, globalThis.Scene, globalThis.User]) {
    collection.deleteDocuments = async () => [];
    collection.updateDocuments = async (updates = []) => updates;
  }

  // Notifications are Fabricate TELLING THE USER something went wrong, so swallowing them is the
  // most expensive stub in this file.
  globalThis.ui = {
    notifications: {
      info: () => {},
      warn: (message) => console.warn(`${NOTIFICATION_PREFIX}${message}`),
      error: (message) => console.error(`${NOTIFICATION_PREFIX}${message}`),
      notify: (message, type = 'info') => {
        if (type === 'error') console.error(`${NOTIFICATION_PREFIX}${message}`);
        else if (type === 'warning' || type === 'warn')
          console.warn(`${NOTIFICATION_PREFIX}${message}`);
      },
    },
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
   * it at module scope.
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

  // A REAL DialogV2, drawn from Foundry's own `client/applications/api/dialog.mjs`.
  const dialogs = createLabDialogV2({ localize: world.i18n.localize });

  globalThis.foundry = {
    utils,
    applications: {
      api: {
        ApplicationV2: LabApplicationV2,
        HandlebarsApplicationMixin: (base) => base,
        DialogV2: dialogs.DialogV2,
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
     *
     * @param {'gm'|'player'} role Which viewer the render represents.
     */
    setViewer(role) {
      game.user = role === 'player' ? playerUser : gmUser;
    },
    /**
     * Grow the world's non-GM roster to the crowded shape two Access frames need (issue 1515).
     *
     * @returns {number} How many non-GM users the roster now holds, so a caller can assert it.
     */
    seedPlayerRoster() {
      const players = [
        playerUser,
        ...LAB_EXTRA_PLAYER_USERS.map(({ id, name, role, css }) => ({
          id,
          name,
          isGM: false,
          role,
          color: { css },
        })),
      ];
      game.users = usersCollection(players);
      return players.length;
    },
    /**
     * Choose how the lab answers a dialog Foundry would wait on a human for: `open` to leave it
     * standing for a screenshot, `enter` (the default) to press whichever button Foundry marks
     * default, or a button action by name.
     *
     * @param {string} answer Answer mode.
     */
    setDialogAnswer(answer) {
      dialogs.setAnswer(answer);
    },
    /** @returns {HTMLElement[]} The dialog elements currently rendered into the page. */
    openDialogs() {
      return dialogs.openDialogs();
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
