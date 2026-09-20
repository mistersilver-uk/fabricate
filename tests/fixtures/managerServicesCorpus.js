/**
 * The recording fake world both shells' service bags are driven against, plus the per-key
 * disposition table the equivalence oracle reads. Frozen from the pin commit onwards (issue 1674).
 */
import assert from 'node:assert/strict';

import { byCodePoint } from '../helpers/ratchetBaseline.js';


export const MANAGER_SERVICE_KEYS = Object.freeze([
  'choiceDialog',
  'confirmDialog',
  'copyToClipboard',
  'deleteOwnedRecipeItem',
  'downloadFile',
  'enrichToHtml',
  'eraseLearnedRecipe',
  'expendRecipeItemUse',
  'getAccessCharacterActors',
  'getActorOptions',
  'getActorRollData',
  'getActorUuidsInSceneRegion',
  'getCharacterLibrariesStore',
  'getComponentScopeStore',
  'getCraftingSystemManager',
  'getCurrencyConfigStore',
  'getCurrentSceneRegions',
  'getEssenceScopeStore',
  'getFoundrySystemId',
  'getGatheringEnvironmentStore',
  'getGatheringLocationService',
  'getGatheringPartyStore',
  'getGatheringRealmStore',
  'getKnowledgeSnapshot',
  'getModuleVersion',
  'getPlayerCharacterActors',
  'getRecipeManager',
  'getSceneOptions',
  'getScriptMacros',
  'getSetting',
  'getToolScopeStore',
  'getVocabularyScopeStore',
  'getWorldActors',
  'getWorldItemOptions',
  'getWorldUsers',
  'isFabricateReady',
  'localize',
  'notify',
  'onFabricateDataChanged',
  'onFabricateReady',
  'pickImagePath',
  'renderImportDialog',
  'renderSystemImportDialog',
  'resetActorKnowledge',
  'resolveToolSource',
  'setGatheringConditions',
  'setSetting',
  'subscribeSceneChange',
  'subscribeTravelMarkerMove',
]);

/** The world-store accessors asserted by reference identity, never serialised. */
export const HANDLE_KEYS = Object.freeze([
  'getCharacterLibrariesStore',
  'getComponentScopeStore',
  'getCraftingSystemManager',
  'getCurrencyConfigStore',
  'getEssenceScopeStore',
  'getGatheringEnvironmentStore',
  'getGatheringLocationService',
  'getGatheringPartyStore',
  'getGatheringRealmStore',
  'getRecipeManager',
  'getToolScopeStore',
  'getVocabularyScopeStore',
  'getWorldActors',
]);

/** Keys whose observable is the ordered call journal and the unsubscribe return. */
export const JOURNAL_KEYS = Object.freeze([
  'choiceDialog',
  'confirmDialog',
  'copyToClipboard',
  'deleteOwnedRecipeItem',
  'downloadFile',
  'eraseLearnedRecipe',
  'expendRecipeItemUse',
  'notify',
  'onFabricateDataChanged',
  'onFabricateReady',
  'pickImagePath',
  'renderImportDialog',
  'renderSystemImportDialog',
  'resetActorKnowledge',
  'setGatheringConditions',
  'setSetting',
  'subscribeSceneChange',
  'subscribeTravelMarkerMove',
]);

/**
 * Every service key's oracle. A key with no entry is a failure rather than a skip, which is what
 * makes a newly added key visible to the suite.
 */
function dispositionOf(key) {
  if (HANDLE_KEYS.includes(key)) return 'handle';
  if (JOURNAL_KEYS.includes(key)) return 'journal';
  return 'data';
}

export const MANAGER_DISPOSITIONS = Object.freeze(
  Object.fromEntries(MANAGER_SERVICE_KEYS.map((key) => [key, dispositionOf(key)]))
);

// The two list invariants the table's derivation assumes and cannot check: a stale entry in either
// list is never consulted, and an entry in both resolves silently to `handle`.
assert.deepStrictEqual(Object.keys(MANAGER_DISPOSITIONS).sort(byCodePoint), [
  ...MANAGER_SERVICE_KEYS,
]);
assert.deepStrictEqual(
  [...HANDLE_KEYS, ...JOURNAL_KEYS].filter((key) => !MANAGER_SERVICE_KEYS.includes(key)),
  [],
  'a disposition list names a key the bag does not carry'
);
assert.deepStrictEqual(
  HANDLE_KEYS.filter((key) => JOURNAL_KEYS.includes(key)),
  [],
  'a key with two dispositions resolves to the first and the second is never applied'
);

export const PLAYER_SERVICE_KEYS = Object.freeze([
  'actorBar',
  'adjustGatheringStamina',
  'advanceCraftingRun',
  'alchemy',
  'cancelCraftingRun',
  'confirmDialog',
  'craftErrorMessage',
  'craftRecipe',
  'crafting',
  'craftingSources',
  'createProgressReporter',
  'destroyComponents',
  'dismissJournalRun',
  'evaluateSelectedSet',
  'executeJournalRunCommand',
  'getActiveCanvasTool',
  'getCraftingComponentSourceIds',
  'getCraftingSourceActors',
  'getCraftingSystemManager',
  'getDismissedJournalRunKeys',
  'getFavouriteRecipeIds',
  'getGatheringConditions',
  'getGatheringDropBreakdown',
  'getGatheringEconomy',
  'getGatheringStaminaState',
  'getHideUnavailableEnvironments',
  'getJournalRunAuthorityAvailability',
  'getProgressiveResultOrder',
  'getRecipeManager',
  'getSelectedActorId',
  'getSelectedAlchemySystemId',
  'getSelectedCraftingActorId',
  'getWorldTime',
  'getWorldTimeComponents',
  'hydrateCraftingRecipe',
  'inventory',
  'isTravelMarkerActor',
  'journal',
  'learnRecipeFromInventory',
  'listAlchemyForActor',
  'listCraftingForActor',
  'listCraftingSourceActors',
  'listGatheringForActor',
  'listInventoryForActor',
  'listJournalForActor',
  'listSelectableActors',
  'localize',
  'navigateToCraftingRecipe',
  'notify',
  'progressiveOrderRevertMessage',
  'reconcileJournalRunAuthority',
  'restockGatheringNode',
  'salvageComponent',
  'salvageComponents',
  'setCraftingComponentSourceIds',
  'setGatheringEconomy',
  'setGatheringStamina',
  'setHideUnavailableEnvironments',
  'setProgressiveResultOrder',
  'setSelectedActorId',
  'setSelectedAlchemySystemId',
  'setSelectedCraftingActorId',
  'startGatheringAttempt',
  'submitAlchemyAttempt',
  'toggleFavouriteRecipe',
]);

/** The six stores the player bag creates into itself, in creation order. */
export const PLAYER_STORE_KEYS = Object.freeze([
  'actorBar',
  'craftingSources',
  'crafting',
  'inventory',
  'alchemy',
  'journal',
]);

/** The stack-quantity path the golden bakes, pinned rather than inherited from module state. */
export const CORPUS_STACK_QUANTITY_PATH = 'system.quantity';

const FLAG_NAMESPACE = 'fabricate';

/** `flags` is authored in the real persisted shape, and `getFlag` walks the dotted key. */
function fakeDocument({ flags = {}, ...fields }) {
  return {
    ...fields,
    getFlag: (namespace, key) =>
      namespace === FLAG_NAMESPACE
        ? String(key)
            .split('.')
            .reduce((node, part) => node?.[part], flags)
        : undefined,
  };
}

/**
 * An owned-item collection: iterable like Foundry's `EmbeddedCollection`, and answering `get(id)`,
 * which is what the GM-gated item mutations resolve their target through. A plain array is
 * iterable but has no `get`, so every item-scoped mutation would take the silent `noItem` denial.
 */
function itemCollection(items) {
  const collection = [...items];
  collection.get = (id) => collection.find((item) => item.id === id) ?? null;
  return collection;
}

function recipeItem({
  id,
  name,
  uuid,
  quantity,
  flags = {},
  compendiumSource,
  duplicateSource,
  img = 'icons/book.webp',
  record = () => {},
}) {
  return fakeDocument({
    delete: async () => record('item.delete', id),
    id,
    name,
    uuid,
    img,
    documentName: 'Item',
    type: 'loot',
    system: { quantity },
    _stats: { compendiumSource, duplicateSource },
    flags: { [FLAG_NAMESPACE]: flags },
  });
}

/** Two definitions sharing a member recipe, one of them carrying only legacy caps. */
function knowledgeDefinitions() {
  return [
    {
      id: 'def-modern',
      name: 'Bound Primer',
      recipeIds: ['recipe-alpha', 'recipe-shared'],
      registeredItemUuid: 'Item.owned-modern',
      originItemUuid: 'Item.origin-modern',
      caps: { limitUses: true, maxUses: 3 },
    },
    {
      id: 'def-legacy',
      name: 'Weathered Folio',
      recipeIds: ['recipe-shared', 'recipe-beta', 'recipe-gamma'],
      registeredItemUuid: 'Compendium.fab.books.Item.legacy',
      destroyWhenExhausted: true,
      limitRecipes: 2,
    },
  ];
}

/**
 * The caps ladder the snapshot must resolve through. `_capsForDefinition` is preferred over
 * `_getRecipeItemCaps`, and a raw `definition.caps` read misses the legacy derivations entirely.
 */
function recipeVisibilityService(record) {
  return {
    // The two write seams the gated mutations route through. Journalled with their argument lists,
    // because without them every mutation answers `unavailable` and the four returns stop
    // distinguishing a working gate from a broken one.
    expendRecipeItemUse: async (actor, itemId, definition) => {
      record('service.expendRecipeItemUse', actor?.id, itemId, definition?.id);
      return { success: true, timesUsed: 2 };
    },
    forgetLearnedRecipes: async (actor, recipeIds, options) => {
      record('service.forgetLearnedRecipes', actor?.id, recipeIds, options);
      return { success: true, count: recipeIds.length };
    },
    _capsForDefinition: (definition) => ({
      item: {
        limitUses: definition?.caps?.limitUses === true || definition?.destroyWhenExhausted === true,
        maxUses: definition?.caps?.maxUses ?? (definition?.destroyWhenExhausted ? 1 : undefined),
      },
      learn: {
        limitLearning: Number.isFinite(definition?.limitRecipes),
        learnScope: definition?.learningMode === 'all' ? 'perDefinition' : 'perInstance',
      },
    }),
    _getRecipeItemCaps: () => ({ item: {}, learn: {} }),
  };
}

function knowledgeActors(record) {
  const arden = fakeDocument({
    id: 'pc-arden',
    name: 'Arden',
    uuid: 'Actor.pc-arden',
    img: 'icons/arden.webp',
    type: 'character',
    ownership: { default: 0 },
    flags: {
      [FLAG_NAMESPACE]: {
        learnedRecipes: {
          'recipe-alpha': { learnedAt: 11, sourceItemUuid: 'Item.owned-modern' },
          'recipe-shared': { learnedAt: 12, sourceItemUuid: 'Item.owned-identity' },
          'recipe-beta': { learnedAt: 13, sourceItemUuid: 'Item.vanished' },
          'recipe-gamma': { learnedAt: 14, granted: 'yes', grantedBy: 'Wren' },
          'recipe-other-system': { learnedAt: 15 },
          'recipe-unresolvable': { learnedAt: 16 },
        },
      },
    },
  });
  arden.items = itemCollection([
    recipeItem({
      record,
      id: 'owned-modern',
      name: 'Arden Primer',
      uuid: 'Item.owned-modern',
      quantity: 2,
      flags: { recipeItemUsage: { timesUsed: 1, inert: false } },
    }),
    recipeItem({
      record,
      id: 'owned-identity',
      name: 'Claimed Folio',
      uuid: 'Item.owned-identity',
      quantity: 1,
      flags: {
        recipeItemDefinitionId: 'def-legacy',
        recipeItemUsage: { timesUsed: 4, inert: true },
      },
    }),
    recipeItem({
      record,
      id: 'owned-compendium',
      name: 'Imported Folio',
      uuid: 'Item.owned-compendium',
      quantity: 3,
      compendiumSource: 'Compendium.fab.books.Item.legacy',
    }),
    recipeItem({
      record,
      id: 'owned-duplicate',
      name: 'Copied Primer',
      uuid: 'Item.owned-duplicate',
      quantity: 1,
      duplicateSource: 'Item.origin-modern',
    }),
    recipeItem({ record, id: 'plain', name: 'Rope', uuid: 'Item.plain', quantity: 1 }),
  ]);
  arden.testUserPermission = (user, level) => user?.id === 'alice' && level === 'OWNER';
  arden.getRollData = () => ({ abilities: { str: 14 } });

  const brisa = fakeDocument({
    id: 'pc-brisa',
    name: 'Brisa',
    uuid: 'Actor.pc-brisa',
    img: '',
    type: 'familiar',
    ownership: { default: 3 },
    flags: { [FLAG_NAMESPACE]: { learnedRecipes: {} } },
  });
  brisa.items = itemCollection([]);
  brisa.testUserPermission = () => false;

  const grond = fakeDocument({
    id: 'npc-grond',
    name: 'Grond',
    uuid: 'Actor.npc-grond',
    img: 'icons/grond.webp',
    type: 'npc',
    ownership: { default: 0 },
    flags: { [FLAG_NAMESPACE]: { learnedRecipes: { 'recipe-alpha': { learnedAt: 1 } } } },
  });
  grond.items = itemCollection([]);
  grond.testUserPermission = () => false;

  return [arden, brisa, grond];
}

function worldUsers() {
  return [
    { id: 'gm', name: 'Gamemaster', role: 4, isGM: true, hasRole: () => true, avatar: 'gm.webp' },
    {
      id: 'alice',
      name: 'Alice',
      role: 1,
      isGM: false,
      hasRole: (role) => role === 'PLAYER',
      color: { css: 'var(--player-one)' },
      avatar: 'alice.webp',
    },
    {
      id: 'bram',
      name: 'Bram',
      role: 2,
      isGM: false,
      hasRole: (role) => role === 'PLAYER',
      color: 'plain-colour-string',
      img: 'bram.webp',
    },
    { id: 'nyx', name: 'Nyx', role: 0, isGM: false, hasRole: () => false },
  ];
}

function worldScenes() {
  const region = { uuid: 'Scene.stage.Region.grove', name: 'Grove', color: 0x112233 };
  const stage = {
    uuid: 'Scene.stage',
    name: 'Stage',
    img: 'scenes/stage.webp',
    thumb: 'scenes/stage-thumb.webp',
    regions: [region],
  };
  const wings = { uuid: 'Scene.wings', name: 'Wings', img: 'scenes/wings.webp', regions: [] };
  return { stage, wings, region, contents: [wings, stage] };
}

function worldItems() {
  return [
    {
      uuid: 'Item.hammer',
      name: 'Hammer',
      img: 'icons/hammer.webp',
      type: 'tool',
      documentName: 'Item',
      system: { description: { value: '<p>A <b>heavy</b> hammer</p>' } },
    },
    {
      uuid: 'Item.anvil',
      name: 'Anvil',
      img: '',
      type: 'tool',
      documentName: 'Item',
      system: { description: 'A cold anvil' },
    },
  ];
}

/** A region document whose `testPoint` admits one point, for the scene-region filter. */
function sceneRegionDocument(scene) {
  return {
    uuid: 'Scene.stage.Region.grove',
    parent: { uuid: scene.uuid },
    testPoint: ({ x }) => x < 500,
  };
}

function tokenFor(scene, { x, y }) {
  return { x, y, width: 1, height: 1, parent: { uuid: scene.uuid, grid: { size: 100 } } };
}

/**
 * Build one arrangement of the fake world.
 *
 * @param {object} [options] `fabricate: false` removes the facade; `players: false` removes
 *   `game.users.players`; `actors` overrides the actor collection shape; `saveDataToFile: false`
 *   forces `downloadFile` onto its DOM branch; `reportBuilder` throws for control 17.
 */
export function buildManagerWorld(options = {}) {
  const {
    fabricate = true,
    players = true,
    actors: actorCollection,
    saveDataToFile = true,
    importFile = null,
    dialogResults = {},
    filePicker = true,
  } = options;

  const journal = [];
  const record = (channel, ...payload) => journal.push([channel, ...payload]);

  const actorDocuments = knowledgeActors(record);
  const users = worldUsers();
  const scenes = worldScenes();
  const items = worldItems();
  const definitions = knowledgeDefinitions();

  const handles = {
    craftingSystemManager: {
      initialized: true,
      getSystem: (id) => (id === 'sys-1' ? { id, recipeItemDefinitions: definitions } : null),
      getSystems: () => [{ id: 'sys-import', name: 'Imported' }],
    },
    recipeManager: {
      initialized: true,
      getRecipe: (id) => {
        const known = {
          'recipe-alpha': { name: 'Alpha', img: 'a.webp', category: 'metal', craftingSystemId: 'sys-1' },
          'recipe-shared': { name: 'Shared', img: '', category: '', craftingSystemId: 'sys-1' },
          'recipe-beta': { name: 'Beta', img: 'b.webp', category: 'wood', craftingSystemId: 'sys-1' },
          'recipe-gamma': { name: 'Gamma', img: '', category: 'cloth', craftingSystemId: 'sys-1' },
          'recipe-other-system': { name: 'Elsewhere', craftingSystemId: 'sys-2' },
        };
        return known[id] ?? null;
      },
      importRecipes: async (data, overwrite) => record('recipeManager.importRecipes', data, overwrite),
    },
    gatheringEnvironmentStore: { kind: 'gatheringEnvironmentStore' },
    gatheringPartyStore: { kind: 'gatheringPartyStore' },
    currencyConfigStore: { kind: 'currencyConfigStore' },
    characterLibrariesStore: { kind: 'characterLibrariesStore' },
    componentScopeStore: { kind: 'componentScopeStore', listEntities: () => ['component-a'] },
    essenceScopeStore: { kind: 'essenceScopeStore', listEntities: () => ['essence-a'] },
    toolScopeStore: { kind: 'toolScopeStore', listEntities: () => ['tool-a'] },
    vocabularyScopeStore: { kind: 'vocabularyScopeStore' },
    gatheringRealmStore: { kind: 'gatheringRealmStore' },
    gatheringLocationService: { kind: 'gatheringLocationService' },
    actorDocuments,
    regionDocument: sceneRegionDocument(scenes.stage),
  };

  const facade = {
    ready: true,
    getCraftingSystemManager: () => handles.craftingSystemManager,
    getRecipeManager: () => handles.recipeManager,
    getGatheringEnvironmentStore: () => handles.gatheringEnvironmentStore,
    getGatheringPartyStore: () => handles.gatheringPartyStore,
    getCurrencyConfigStore: () => handles.currencyConfigStore,
    getCharacterLibrariesStore: () => handles.characterLibrariesStore,
    getComponentScopeStore: () => handles.componentScopeStore,
    getEssenceScopeStore: () => handles.essenceScopeStore,
    getToolScopeStore: () => handles.toolScopeStore,
    getVocabularyScopeStore: () => handles.vocabularyScopeStore,
    getGatheringRealmStore: () => handles.gatheringRealmStore,
    getGatheringLocationService: () => handles.gatheringLocationService,
    getRecipeVisibilityService: () => recipeVisibilityService(record),
    gathering: { setConditions: async (conditions) => record('gathering.setConditions', conditions) },
    resetActorKnowledge: async (actorId, systemId) => {
      record('fabricate.resetActorKnowledge', actorId, systemId);
      return { success: true };
    },
  };

  const settings = {
    fabricate: {
      additionalPlayerCharacterActorTypes: ['familiar'],
      craftingHints: 'on',
    },
  };

  const actors = actorCollection ?? { contents: actorDocuments, get: (id) => actorDocuments.find((a) => a.id === id) ?? null };

  const game = {
    fabricate: fabricate ? facade : undefined,
    user: { isGM: true, id: 'gm' },
    system: { id: 'dnd5e' },
    modules: { get: (id) => (id === 'fabricate' ? { version: '9.9.9' } : null) },
    settings: {
      get: (namespace, key) => settings[namespace]?.[key],
      set: async (namespace, key, value) => record('settings.set', namespace, key, value),
    },
    i18n: {
      localize: (key) => `[${key}]`,
      format: (key, data) => `[${key}:${JSON.stringify(data)}]`,
    },
    users: players ? { players: users.filter((u) => !u.isGM && u.hasRole('PLAYER')), contents: users } : { contents: users },
    actors,
    items: { contents: items },
    scenes: { contents: scenes.contents, current: scenes.stage },
    macros: {
      contents: [
        { uuid: 'Macro.zed', name: 'Zed', type: 'script' },
        { uuid: 'Macro.abe', name: 'Abe', type: 'Script' },
        { uuid: 'Macro.chat', name: 'Chat', type: 'chat' },
      ],
    },
    clipboard: { copyPlainText: async (text) => record('clipboard.copyPlainText', text) },
  };

  const notifications = {
    info: (message) => record('notify.info', message),
    warn: (message) => record('notify.warn', message),
    error: (message) => record('notify.error', message),
  };

  const uuidTargets = new Map([
    ['Actor.pc-arden', actorDocuments[0]],
    ['Actor.pc-brisa', actorDocuments[1]],
    ['Scene.stage.Region.grove', handles.regionDocument],
    ['Item.hammer', { ...items[0], uuid: 'Item.hammer' }],
  ]);
  actorDocuments[0].getActiveTokens = () => [tokenFor(scenes.stage, { x: 100, y: 100 })];
  actorDocuments[1].getActiveTokens = () => [tokenFor(scenes.stage, { x: 900, y: 900 })];

  // `fromUuidSync` throws two different ways. `strict: true` (the default) throws for an embedded
  // document inside a compendium, which a compendium-sourced party member reaches, and
  // `strict: false` answers null there instead. `parseUuid` throws for a MALFORMED uuid whatever
  // `strict` says, which is why only a `try`/`catch` covers both.
  const resolveUuid = (uuid, { strict = true } = {}) => {
    const text = String(uuid);
    if (text === '' || text.endsWith('.')) throw new Error(`Invalid UUID: ${text}`);
    if (text.startsWith('Compendium.') && text.split('.').length > 4) {
      if (!strict) return null;
      throw new Error('You are attempting to resolve an embedded document synchronously');
    }
    return uuidTargets.get(text) ?? null;
  };

  const dialogV2 = class RecordingDialogV2 {
    constructor(config) {
      record('DialogV2.construct', config.window?.title, (config.buttons ?? []).map((b) => b.action));
      this._config = config;
    }
    render(force) {
      record('DialogV2.render', force);
      this._config.buttons?.[0]?.callback?.(null, null, this);
      // A button with no callback (the synthesised `Close`) leaves the promise open, exactly as a
      // dismissed dialog does, so the close leg settles it.
      this._config.close?.();
    }
    static confirm = async (config) => {
      record('DialogV2.confirm', config.window?.title ?? config.title);
      return true;
    };
    static prompt = async (config) => {
      record('DialogV2.prompt', config.window?.title, config.rejectClose);
      const title = config.window?.title ?? '';
      if (Object.hasOwn(dialogResults, title)) return dialogResults[title];
      if (title === 'Import Recipes') return { raw: '[{"id":"r1"}]', overwrite: true };
      return { file: importFile, conflictMode: 'skip' };
    };
  };

  const filePickerClass = class RecordingFilePicker {
    constructor(config) {
      record('FilePicker.construct', config.type, config.current);
      this._config = config;
    }
    render(force) {
      record('FilePicker.render', force);
      this._config.callback('worlds/chosen.webp');
    }
  };

  const foundry = {
    utils: { deepClone: (value) => (value === null || typeof value !== 'object' ? value : { ...value }) },
    applications: {
      api: { DialogV2: dialogV2 },
      apps: filePicker ? { FilePicker: { implementation: filePickerClass } } : {},
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (text, options) => {
              // `relativeTo` is recorded because it is the only argument the forward can silently
              // drop: `enrichToHtml` defaults it to null, so a one-argument call still answers.
              record(
                'enrichHTML',
                text,
                options.secrets,
                options.rolls,
                options.embeds,
                options.relativeTo
              );
              return `<enriched>${text}</enriched>`;
            },
          },
        },
      },
    },
  };

  return { game, notifications, foundry, journal, record, handles, scenes, users, items, definitions, resolveUuid, saveDataToFile };
}

/**
 * A DOM double just wide enough for `downloadFile`'s anchor fallback. Insertion and removal are
 * recorded as the OPERATION, not the spelling, because `appendChild`/`append` and
 * `removeChild`/`node.remove()` are the same effect and this oracle pins effects.
 */
function anchorDom(record) {
  const insert = (node) => record('document.body.insert', node.tagName, node.download);
  const detach = (node) => record('document.body.detach', node.tagName, node.download);
  return {
    body: { appendChild: insert, append: insert, removeChild: detach },
    createElement: (tag) => {
      const node = {
        tagName: tag.toUpperCase(),
        click: () => record('anchor.click'),
        remove: () => detach(node),
      };
      return node;
    },
  };
}

/**
 * Install one arrangement's globals and return the restore. Every Foundry global the moved regions
 * read is installed here and nowhere else, so a hoisted read fails outside the arrangement.
 */
export function installWorld(world) {
  const saved = new Map();
  const set = (name, value) => {
    saved.set(name, { had: name in globalThis, value: globalThis[name] });
    globalThis[name] = value;
  };

  set('game', world.game);
  set('ui', { notifications: world.notifications });
  set('foundry', world.foundry);
  set('CONST', {
    USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 },
    DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  });
  set('canvas', { scene: world.scenes.stage });
  set('fromUuid', async (uuid) => world.resolveUuid(uuid));
  set('fromUuidSync', (uuid, options) => world.resolveUuid(uuid, options));
  set('document', anchorDom(world.record));
  // A constructible double rather than a class, which would carry a constructor and nothing else.
  function RecordingBlob(parts, options) {
    world.record('Blob.construct', parts.join(''), options.type);
  }
  set('Blob', RecordingBlob);
  set('URL', {
    createObjectURL: () => {
      world.record('URL.createObjectURL');
      return 'blob:fabricate';
    },
    revokeObjectURL: (url) => world.record('URL.revokeObjectURL', url),
  });
  if (world.saveDataToFile) {
    set('saveDataToFile', (json, mime, filename) =>
      world.record('saveDataToFile', json, mime, filename)
    );
  } else {
    set('saveDataToFile', undefined);
  }

  return () => {
    for (const [name, { had, value }] of saved) {
      if (had) globalThis[name] = value;
      else delete globalThis[name];
    }
  };
}

/** A Hooks double that retains handlers and can fire them independently of `off`. */
export function recordingHooks(record) {
  const registered = [];
  const fire = (event, ...args) => {
    // A snapshot, so a handler that subscribes while this fires is not invoked by it.
    const delivering = registered.slice();
    for (const entry of delivering) {
      if (entry.event === event && entry.live) entry.handler(...args);
    }
  };
  return {
    hooks: {
      on: (event, handler) => {
        record('Hooks.on', event);
        registered.push({ event, handler, live: true, once: false });
        return registered.length;
      },
      once: (event, handler) => {
        record('Hooks.once', event);
        registered.push({ event, handler, live: true, once: true });
        return registered.length;
      },
      // Foundry accepts either the handler reference or the numeric registration id, and both miss
      // paths return silently, so a mismatched identity leaks a listener with no diagnostic.
      off: (event, handlerOrId) => {
        const entry = registered.find(
          (candidate, index) =>
            candidate.event === event &&
            candidate.live &&
            (candidate.handler === handlerOrId || index + 1 === handlerOrId)
        );
        record('Hooks.off', event, Boolean(entry));
        if (entry) entry.live = false;
      },
    },
    fire,
    registered,
  };
}

/** The ApplicationV2 base the shells extend under the SSR route. */
export class RecordingApplicationV2 {
  constructor(options) {
    this.options = options;
  }

  async close(options) {
    this._closedWith = options;
    return this;
  }
}

/** Every Foundry global deleted, for the factory-body purity assertion. */
export function withoutFoundryGlobals(run) {
  const names = [
    'game',
    'ui',
    'Hooks',
    'CONFIG',
    'foundry',
    'FilePicker',
    'fromUuid',
    'fromUuidSync',
    'saveDataToFile',
    'canvas',
    'CONST',
    'document',
  ];
  const saved = names.map((name) => [name, name in globalThis, globalThis[name]]);
  for (const name of names) delete globalThis[name];
  try {
    return run();
  } finally {
    for (const [name, had, value] of saved) {
      if (had) globalThis[name] = value;
      else delete globalThis[name];
    }
  }
}

/** Canonical arguments for the player bag's forwarding keys, by key. */
const PLAYER_ARGUMENTS = Object.freeze({
  getWorldTimeComponents: [1234],
  isTravelMarkerActor: ['Actor.marker'],
  navigateToCraftingRecipe: ['recipe-alpha'],
  notify: ['a warning'],
  localize: ['FABRICATE.Key'],
  setCraftingComponentSourceIds: [['src-a']],
  setHideUnavailableEnvironments: [true],
  setProgressiveResultOrder: ['key', ['a', 'b']],
  setSelectedActorId: ['pc-arden'],
  setSelectedAlchemySystemId: ['sys-1'],
  setSelectedCraftingActorId: ['pc-arden'],
  toggleFavouriteRecipe: ['recipe-alpha'],
});

/** The argument list one player service key is exercised with. */
export function playerArgumentsFor(key) {
  return PLAYER_ARGUMENTS[key] ?? [{ actorId: 'pc-arden' }];
}

/**
 * The player world: one recording facade answering every `game.fabricate.*` the bag forwards to,
 * so each key's observable is the method it reached, the arguments it passed and what came back.
 */
export function buildPlayerWorld() {
  const journal = [];
  const record = (channel, ...payload) => journal.push([channel, ...payload]);
  const facade = new Proxy(
    {
      getGatheringPartyStore: () => ({
        list: () => [{ travelActorUuid: 'Actor.marker' }, { travelActorUuid: null }],
      }),
    },
    {
      has: () => true,
      get: (target, property) => {
        if (property in target) return target[property];
        if (typeof property !== 'string') return undefined;
        return (...args) => {
          record(`fabricate.${property}`, ...args);
          return { answeredBy: property };
        };
      },
    }
  );

  const game = {
    fabricate: facade,
    user: { isGM: false, id: 'alice' },
    i18n: { localize: (key) => `[${key}]`, format: (key, data) => `[${key}:${JSON.stringify(data)}]` },
    settings: { get: () => false, set: async () => {} },
  };

  return { game, journal, record, facade };
}

/** Install the player world's globals and return the restore. */
export function installPlayerWorld(world) {
  const saved = [
    ['game', 'game' in globalThis, globalThis.game],
    ['ui', 'ui' in globalThis, globalThis.ui],
  ];
  globalThis.game = world.game;
  globalThis.ui = {
    notifications: {
      info: (message) => world.record('notify.info', message),
      warn: (message) => world.record('notify.warn', message),
      error: (message) => world.record('notify.error', message),
    },
  };
  return () => {
    for (const [name, had, value] of saved) {
      if (had) globalThis[name] = value;
      else delete globalThis[name];
    }
  };
}

/**
 * A JSON-stable clone that keeps a present-but-`undefined` property visible. Plain
 * `JSON.stringify` drops those silently, so a golden built over it cannot tell an absent field
 * from one the projection left undefined.
 */
export function normaliseForGolden(value) {
  if (value === undefined) return '<undefined>';
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? '<function>' : value;
  }
  if (value instanceof Set) return { '<set>': [...value].map(normaliseForGolden) };
  if (value instanceof Map) return { '<map>': [...value].map(normaliseForGolden) };
  if (Array.isArray(value)) return value.map(normaliseForGolden);
  return Object.fromEntries(
    Object.keys(value)
      .sort(byCodePoint)
      .map((key) => [key, normaliseForGolden(value[key])])
  );
}
