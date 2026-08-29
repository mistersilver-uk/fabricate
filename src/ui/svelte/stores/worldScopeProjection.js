/**
 * The GM-facing projection over the three world-scope entity corpora (issue 1362, epic 1357).
 *
 * IT PUBLISHES THE CORPUS, NOT THE UNION. `unionScopedDefinitions` answers what one crafting
 * system's list IS; this answers what the WORLD holds, which is the only thing a world-scope
 * screen can edit. Publishing the union here would hand a world editor a system's resolved
 * values and let it write them back to the world.
 *
 * NO HAND-BUILT ALLOWLIST. Every other projection in `adminStore` names the fields it carries,
 * because the records it projects are open-ended manager objects and a spread would leak
 * whatever the manager happens to hold. A scope corpus is already an allowlist - the three
 * normalizers in `componentScope.js` / `essenceScope.js` / `toolScope.js` rebuild every record
 * from a fixed key set - so restating it here would be a SECOND allowlist that can only ever
 * drift narrower than the first. The failure that produces is the one recorded against
 * `componentCategories` and `categoryIcons`: a persisted field the UI cannot see.
 *
 * A TOP-LEVEL SIBLING KEY, never hung off `selectedSystem`. The corpus is world scope, so
 * hanging it off the selected system would republish it as `null` the moment no system is
 * selected - which is the NORMAL state for a world screen.
 *
 * IT IS PURE. The corpus, the scope descriptor and the crafting-system roster all arrive as
 * arguments; nothing here reads a setting, a store or a Foundry global.
 */

import { COMPONENT_SCOPE, COMPONENT_SECTIONS } from '../../../systems/componentScope.js';
import { ESSENCE_SCOPE, ESSENCE_SECTIONS } from '../../../systems/essenceScope.js';
import {
  isSectionInherited,
  membershipKey,
  resolveScopedDefinition,
} from '../../../systems/scopedDefinitions.js';
import { TOOL_SCOPE, TOOL_SECTIONS } from '../../../systems/toolScope.js';

/**
 * The three entity types, in the order the rail lists their world screens.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_ENTITY_TYPES = Object.freeze(['component', 'essence', 'tool']);

/**
 * The per-entity-type UI descriptor: the scope the resolver reads through, the sections a GM
 * can switch, and the two structural capabilities a screen must not infer.
 *
 * `enableable` and `taggable` are read from HERE rather than tested at a call site, because
 * both absences are structural: a component has no `enabled` flag at all (`resolveComponent`
 * omits the key), and only a component carries world tags with per-tag muting.
 *
 * @type {Readonly<Record<string, Readonly<object>>>}
 */
export const WORLD_SCOPE_DESCRIPTORS = Object.freeze({
  component: Object.freeze({
    entityType: 'component',
    scope: COMPONENT_SCOPE,
    sections: COMPONENT_SECTIONS,
    enableable: false,
    taggable: true,
  }),
  essence: Object.freeze({
    entityType: 'essence',
    scope: ESSENCE_SCOPE,
    sections: ESSENCE_SECTIONS,
    enableable: true,
    taggable: false,
  }),
  tool: Object.freeze({
    entityType: 'tool',
    scope: TOOL_SCOPE,
    sections: TOOL_SECTIONS,
    enableable: true,
    taggable: false,
  }),
});

/**
 * An empty projection for one entity type, used when the store is absent or unreadable.
 *
 * `seeded` is all-false rather than absent, because a screen reading an absent flag as
 * "seeded" would offer a destructive action against an UNKNOWN corpus.
 *
 * @param {string} entityType
 * @returns {object}
 */
export function emptyWorldScopeEntityState(entityType) {
  const descriptor = WORLD_SCOPE_DESCRIPTORS[entityType];
  return {
    entityType,
    sections: descriptor ? [...descriptor.sections] : [],
    enableable: descriptor?.enableable === true,
    taggable: descriptor?.taggable === true,
    available: false,
    seeded: { entities: false, defaults: false, membership: false },
    entities: [],
    entries: [],
  };
}

/**
 * The three vocabularies the World Vocabulary holds, in the order its screen lists them.
 *
 * The World Vocabulary is NOT a scoped-entity layer - it holds the vocabularies the scoped
 * entities draw FROM - so it has no sections, no membership and no per-system rows, and it is
 * projected by its own function rather than through {@link projectWorldScopeEntity}.
 *
 * @type {readonly string[]}
 */
export const WORLD_VOCABULARY_KINDS = Object.freeze([
  'componentCategories',
  'componentTags',
  'recipeCategories',
]);

/**
 * The World Vocabulary projection when no vocabulary store is registered.
 *
 * `total` is 0 and `available` is false, which is the state PR 7 replaces: the rail leaf's
 * count badge reads 0, which is TRUTHFUL rather than a placeholder, because a world with no
 * vocabulary store has no world vocabulary.
 *
 * @returns {object}
 */
export function emptyWorldVocabularyState() {
  const state = { available: false, total: 0 };
  for (const kind of WORLD_VOCABULARY_KINDS) state[kind] = [];
  return state;
}

/**
 * Project the World Vocabulary corpus.
 *
 * `total` IS THE PUBLISHED FIELD NAME, and it is a contract rather than an implementation
 * detail: `CraftingSystemManagerRoot.svelte` reads `worldScope.vocabulary.total` for the
 * `Tags & Categories` rail leaf's count badge, and requirement 7 of
 * `### GM World Scoped Entity Routes` bars PR 7 from that file - so a producer that published
 * `count` or `entries.length` instead would leave the badge reading 0 forever with every test
 * still green. `ui-integration/spec.md`'s `### GM World Vocabulary Route` names it, and
 * `tests/world-scope-projection.test.js` pins it.
 *
 * The three vocabularies are summed rather than deduplicated across kinds: a category and a tag
 * that happen to share a label are two entries in the world's vocabulary, and the prototype's
 * own badge is the same sum of its three lists.
 *
 * @param {{componentCategories?: unknown, componentTags?: unknown, recipeCategories?: unknown}
 *   |null} corpus
 * @returns {object}
 */
export function projectWorldVocabulary(corpus) {
  if (!corpus || typeof corpus !== 'object') return emptyWorldVocabularyState();
  const state = { available: true, total: 0 };
  for (const kind of WORLD_VOCABULARY_KINDS) {
    const entries = Array.isArray(corpus[kind]) ? corpus[kind] : [];
    state[kind] = entries;
    state.total += entries.length;
  }
  return state;
}

/**
 * The empty projection for all three entity types.
 *
 * @returns {{worldScope: object}}
 */
export function emptyWorldScopeState() {
  const worldScope = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    worldScope[entityType] = emptyWorldScopeEntityState(entityType);
  }
  worldScope.vocabulary = emptyWorldVocabularyState();
  return { worldScope };
}

/**
 * The crafting systems a world screen states membership against, projected to the two fields
 * a per-system row needs.
 *
 * @param {unknown} systems
 * @returns {Array<{id: string, name: string}>}
 */
function projectSystems(systems) {
  if (!Array.isArray(systems)) return [];
  return systems
    .map((system) => ({
      id: typeof system?.id === 'string' ? system.id : String(system?.id ?? ''),
      name: typeof system?.name === 'string' ? system.name : '',
    }))
    .filter((system) => system.id !== '' && system.id !== 'undefined' && system.id !== 'null');
}

/**
 * Index the membership records by their `(entityId, systemId)` key.
 *
 * One pass, rather than a `findMembership` scan per `(entity, system)` pair: a world with 400
 * components and 6 systems would otherwise walk the membership list 2,400 times per publish.
 *
 * @param {unknown} memberships
 * @returns {Map<string, object>}
 */
function indexMemberships(memberships) {
  const index = new Map();
  for (const record of Array.isArray(memberships) ? memberships : []) {
    if (!record?.entityId || !record?.systemId) continue;
    index.set(membershipKey(record.entityId, record.systemId), record);
  }
  return index;
}

/**
 * Index the world defaults by entity id.
 *
 * @param {unknown} defaults
 * @returns {Map<string, object>}
 */
function indexDefaults(defaults) {
  const index = new Map();
  for (const record of Array.isArray(defaults) ? defaults : []) {
    if (record?.id) index.set(record.id, record);
  }
  return index;
}

/**
 * One `(entity, system)` row: whether the entity is a member there, whether each section is
 * inherited, and - for an enableable entity ONLY - whether it is on.
 *
 * `enabled` is OMITTED for a component rather than answered `false`, exactly as
 * `resolveComponent` omits it. A row that carried `enabled: false` would hand a later screen
 * the value it would read to draw the toggle the epic's ruling removes.
 *
 * @param {object} descriptor
 * @param {{id: string, name: string}} system
 * @param {object|null} membership
 * @param {object|null} worldDefault
 * @returns {object}
 */
function buildSystemRow(descriptor, system, membership, worldDefault) {
  const resolved = resolveScopedDefinition(worldDefault, membership, descriptor.scope);
  const row = {
    systemId: system.id,
    systemName: system.name,
    member: membership !== null,
    inherited: resolved.inherited,
  };
  if (descriptor.enableable) row.enabled = resolved.enabled === true;
  return row;
}

/**
 * One world entity's entry: its identity record, its world defaults, a row per crafting
 * system, and the counts every world-defaults editor states before an edit lands.
 *
 * `inheritCounts` is PER SECTION and counts MEMBERS ONLY, matching `countInheritingSystems`:
 * a system with no membership record does not have the entity, so editing a world default
 * changes nothing for it.
 *
 * @param {object} descriptor
 * @param {object} entity
 * @param {object|null} worldDefault
 * @param {Array<{id: string, name: string}>} systems
 * @param {Map<string, object>} membershipIndex
 * @returns {object}
 */
function buildEntry(descriptor, entity, worldDefault, systems, membershipIndex) {
  const inheritCounts = {};
  for (const section of descriptor.sections) inheritCounts[section] = 0;
  const rows = [];
  let membershipCount = 0;
  for (const system of systems) {
    const membership = membershipIndex.get(membershipKey(entity.id, system.id)) ?? null;
    if (membership) {
      membershipCount += 1;
      for (const section of descriptor.sections) {
        if (isSectionInherited(membership, section)) inheritCounts[section] += 1;
      }
    }
    rows.push(buildSystemRow(descriptor, system, membership, worldDefault));
  }
  return {
    id: entity.id,
    entity,
    defaults: worldDefault,
    membershipCount,
    inheritCounts,
    systems: rows,
  };
}

/**
 * Project one entity type's world corpus.
 *
 * @param {object} options
 * @param {string} options.entityType One of {@link WORLD_SCOPE_ENTITY_TYPES}.
 * @param {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}|null}
 *   options.corpus The store's published corpus.
 * @param {{entities: boolean, defaults: boolean, membership: boolean}|null} [options.seeded]
 * @param {unknown} [options.systems] The crafting-system roster.
 * @returns {object}
 */
export function projectWorldScopeEntity({ entityType, corpus, seeded = null, systems = [] }) {
  const descriptor = WORLD_SCOPE_DESCRIPTORS[entityType];
  if (!descriptor || !corpus || typeof corpus !== 'object') {
    return emptyWorldScopeEntityState(entityType);
  }
  const entities = Array.isArray(corpus.entities) ? corpus.entities : [];
  const defaultsIndex = indexDefaults(corpus.defaults);
  const membershipIndex = indexMemberships(corpus.membership);
  const projectedSystems = projectSystems(systems);
  const state = {
    entityType,
    sections: [...descriptor.sections],
    enableable: descriptor.enableable,
    taggable: descriptor.taggable,
    available: true,
    seeded: {
      entities: seeded?.entities === true,
      defaults: seeded?.defaults === true,
      membership: seeded?.membership === true,
    },
    entities,
    entries: entities.map((entity) =>
      buildEntry(
        descriptor,
        entity,
        defaultsIndex.get(entity.id) ?? null,
        projectedSystems,
        membershipIndex
      )
    ),
  };
  // The world tool-breakage authority is the one field beside the three sub-keys, and it
  // belongs to the tool scope alone. Carried only when the corpus actually holds one, so an
  // absent world value stays distinguishable from an authored `toolSpecific`.
  if (corpus.toolBreakage) state.toolBreakage = corpus.toolBreakage;
  return state;
}

/**
 * Read one store's corpus and its three seededness flags.
 *
 * GUARDED, for the reason `ScopedDefinitionStore#load` is: a store whose setting cannot be
 * read must degrade to an UNKNOWN corpus rather than take the whole publish down. An absent
 * store takes the same path, so a manager opened before `game.fabricate` is assembled renders
 * a shape rather than throwing.
 *
 * @param {object|null} store
 * @returns {{corpus: object|null, seeded: object|null}}
 */
function readCorpus(store) {
  try {
    const corpus = store?.corpus?.() ?? null;
    if (!corpus) return { corpus: null, seeded: null };
    return {
      corpus,
      seeded: {
        entities: store?.isSeeded?.('entities') === true,
        defaults: store?.isSeeded?.('defaults') === true,
        membership: store?.isSeeded?.('membership') === true,
      },
    };
  } catch {
    return { corpus: null, seeded: null };
  }
}

/**
 * Project all three entity types from their three stores.
 *
 * Answers the top-level `worldScope` key `adminStore` publishes, ALWAYS as a new object, so a
 * `$derived` over it re-propagates on every publish.
 *
 * THE FOURTH LEG IS THE WORLD VOCABULARY, and it is optional. `adminStore`'s `_worldScopeStores`
 * reads it through the same `services.getVocabularyScopeStore?.() ?? null` idiom as the other
 * three, so it degrades to `null` - and to a `total: 0` projection - until PR 7 registers the
 * store. That leg exists NOW because `adminStore.js` is one of the five gateway files
 * requirement 7 of `### GM World Scoped Entity Routes` closes to PR 7: a producer wired later
 * could only be wired by reopening the file this PR promises no later lane needs to touch.
 *
 * @param {object} [options]
 * @param {Record<string, object|null>} [options.stores] `{component, essence, tool, vocabulary}`
 *   scope stores; `vocabulary` may be absent.
 * @param {unknown} [options.systems] The crafting-system roster.
 * @returns {{worldScope: object}}
 */
export function buildWorldScopeState({ stores = {}, systems = [] } = {}) {
  const worldScope = {};
  for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
    worldScope[entityType] = projectWorldScopeEntity({
      entityType,
      systems,
      ...readCorpus(stores?.[entityType] ?? null),
    });
  }
  worldScope.vocabulary = projectWorldVocabulary(readCorpus(stores?.vocabulary ?? null).corpus);
  return { worldScope };
}
