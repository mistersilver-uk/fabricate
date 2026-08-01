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
import { createLabDialogV2 } from '../foundryDialog.js';
import { installUpdateSemantics, makeGetFlag, makeSetFlag } from '../world/labFlags.js';

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
    // Inert, and that is a finding rather than laziness.
    //
    // `Hooks.once('ready')` in `src/main.js` runs `processFabricateWorldTime` and four flag
    // auto-stamps that the lab therefore never runs, so tool and component identity resolves through
    // the name-matching fallback tier rather than the tier-1 `roles` flag production reaches first.
    // Dispatching the event is the only faithful route, because none of those functions is exported.
    //
    // It was tried and reverted. The same body reaches `addModuleButtonsToItemsDirectory`, which
    // injects a button into Foundry's Items sidebar and `console.error`s when it is absent — and the
    // lab has no sidebar by design. Satisfying it would mean building a facsimile of Foundry chrome,
    // which is the one thing this harness must not do; muting the error would blind the gate that
    // catches real fixture defects. Neither trade is worth what the unrun body currently buys: no
    // captured surface draws the identity tier, and `ownedItem` sets its uuid from the component's
    // declared `originItemUuid`, so the source-ref tier resolves correctly anyway.
    //
    // Tracked in issue #953, with that reasoning, rather than left as a silent gap.
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
/**
 * The prefix every routed notification carries.
 *
 * `Fabricate | ` is what `scripts/view-lab-screenshots.mjs` scopes its warning gate to, so this is
 * not decoration — it is the token that decides whether a warning fails a capture.
 */
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
 * @returns {{restore: () => void, randomID: (length?: number) => string}}
 */
/**
 * A calendar, because `game.time.calendar` is never null in a booted V13 world.
 *
 * `Time#initializeCalendar` constructs one unconditionally from
 * `CONFIG.time.worldCalendarClass`, so `null` is not a state Foundry can be in. The lab had it null,
 * and the consequence was visible: `getWorldTimeComponents` bails on a missing `timeToComponents`,
 * `worldTimeLabel` then returns `''`, and every "Day N, <phase>" label on the Journal screen and
 * every maturing time-gate rendered EMPTY — a blank where production has text, which reads as a
 * Fabricate layout bug in a published frame.
 *
 * Simplified Gregorian, matching Foundry's own default. `day` is a 0-based day-of-year, which is
 * what `timeToComponents` returns and what `worldTimeLabel` compensates for.
 */
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
 * The two `Roll` statics Fabricate reads, and nothing else.
 *
 * `checkRoll.js` returns null the moment `Roll.replaceFormulaData` is missing, so every check card
 * fell through to the RAW formula: a published frame printed `1d20 + @prof` where Foundry prints
 * `1d20 + 3`. That is an under-show rather than a lie, but it is a visible content difference across
 * roughly fifteen recipes, and the fidelity register never disclosed it.
 *
 * Both methods are pure string work — no dice engine is involved in resolving a formula for DISPLAY,
 * which is all the lab ever needs. Rolling is not implemented and must not be: a lab that could roll
 * would invite fixtures whose frames depend on an outcome this harness does not actually compute.
 */
const LAB_ROLL = {
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
    time: { worldTime: world.worldTime, calendar: LAB_CALENDAR, advance: () => {} },
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
    //
    // This is also where the old literal-key `getFlag` did the most damage. Under `--smoke-fixtures`
    // the crafting actor IS a `makeDocument` hero, so every `learnedRecipes`, `roles`, `toolUsage`
    // and `toolBroken` read on it — and on every item it embeds — answered `null` and rendered a
    // pristine, unworn, unlearned frame regardless of what the fixture seeded.
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

  // A run that SUCCEEDS posts a chat card. Without this the engine's `ChatMessage.create` throws,
  // the engine catches it and logs, and the driver's console-error gate fails the whole case — so
  // the lab could photograph a gather that was blocked, in progress, or missing a tool, but never
  // one that worked. The alternative considered and rejected was turning the system's `chatOutput`
  // feature off, which would have hidden a missing seam rather than supplied one, and would have
  // made the frame a picture of a configuration the fixture does not otherwise use.
  //
  // Nothing renders the returned document — the chat log is Foundry's, not Fabricate's, and is one
  // of the disclosed gaps — so this is a sink with a realistic shape, not a stub pretending to be a
  // chat log.
  globalThis.Roll = LAB_ROLL;

  globalThis.ChatMessage = {
    async create(data = {}) {
      return makeDocument({ ...data, _id: `lab-chat-${chatMessageSequence++}` }, 'ChatMessage');
    },
    async createDocuments(specs = []) {
      return Promise.all(specs.map((spec) => globalThis.ChatMessage.create(spec)));
    },
    getSpeaker(options = {}) {
      return { alias: options.actor?.name ?? 'Fabricate', actor: options.actor?.id ?? null };
    },
  };

  // The smoke's world-document block opens by deleting stale data from a previous run. In a lab
  // realm there is never any, so these are no-ops — but they must EXIST, because the seed calls
  // them unconditionally and a missing static would abort the whole replay on its first line.
  for (const collection of [globalThis.Item, globalThis.Actor, globalThis.Scene, globalThis.User]) {
    collection.deleteDocuments = async () => [];
    collection.updateDocuments = async (updates = []) => updates;
  }

  // Notifications are Fabricate TELLING THE USER something went wrong, so swallowing them is the
  // most expensive stub in this file. It hid `manager-import-report` for the whole of increment 2:
  // the case fed `renderSystemImportDialog` a payload with no `system` key, `validateImportData`
  // rejected it, production called `ui.notifications.error('Invalid file: ...')`, and the no-op
  // above dropped it — so the capture passed and published a clean systems browser under the name
  // "Import report". Routing to `console` hands them to the driver's existing console gate, which
  // makes an errored notification FAIL the frame instead of silently retitling it.
  //
  // `info` stays quiet, and that is checked rather than assumed: `CompendiumImporter` calls
  // `notifications.info(message, { progress: true, console: false })` on every progress tick and
  // reads the return value, so routing it would both flood the gate and contradict the caller's
  // own `console: false`.
  //
  // THE PREFIX IS LOAD-BEARING. The driver's warning gate collects on `Fabricate |`, so a message
  // prefixed anything else is dropped by Playwright and never seen. This shipped once as
  // `fabricate notification:`, which matches nothing: `error` still failed a capture (the gate
  // takes every console error), but `warn` was behaviourally identical to the no-op it replaced,
  // and whether a warning was fatal depended on whether the PRODUCT string happened to already
  // begin `Fabricate | `. Two `CraftingSystemManager` warnings did; the import path's validation
  // warnings, its failed-recipe summary, and every localized `FABRICATE.Admin.*` warning did not.
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

  // A REAL DialogV2, drawn from Foundry's own `client/applications/api/dialog.mjs`. It used to be
  // `class {}`, which made `confirmDialog` return false unconditionally (`foundryBridge.js`:105) —
  // so every Fabricate confirmation was unreachable and three registry cases could photograph the
  // screen behind a dialog but never the dialog. See `../foundryDialog.js`.
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
     * The world is built as GM (initialization migrates and writes), then the viewer is flipped
     * before the player services are constructed.
     *
     * @param {'gm'|'player'} role Which viewer the render represents.
     */
    setViewer(role) {
      game.user = role === 'player' ? playerUser : gmUser;
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
