/**
 * A Foundry-shaped world for the companion reward executor (issue 1954): one private ledger whose
 * pages apply `updateEmbeddedDocuments` as Foundry does (values are dot-expanded, dotted keys
 * merge, forced replacement replaces), world actors whose items and updates land on `_source`, and the real Journal run
 * and companion authorities over that ledger.
 */
import { createCompanionOperationAuthority } from '../../src/systems/companionOperationAuthority.js';
import { createCompanionOperationStore } from '../../src/systems/companionOperationStore.js';
import {
  JOURNAL_RUN_CLAIM_PAGE_ID,
  createJournalRunAuthority,
} from '../../src/systems/journalRunAuthority.js';
import { isForcedReplacement, replacedKey } from './forcedDeletion.js';
import { expandObject } from './foundryExpandObject.js';

export const CLAIM = JOURNAL_RUN_CLAIM_PAGE_ID;
export const OPERATION_ID = 'AbCdEfGhIjKlMn01';

const isMergeable = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !isForcedReplacement(value);

function mergeInto(node, key, value) {
  if (!isMergeable(value) || !isMergeable(node[key])) {
    node[key] = structuredClone(value);
    return;
  }
  for (const [innerKey, inner] of Object.entries(value)) mergeInto(node[key], innerKey, inner);
}

/** `Document#update` on a source tree; `drop` lists paths the schema discards. */
export function applyDocumentUpdate(source, changes, { drop = [] } = {}) {
  for (const [path, value] of Object.entries(changes)) {
    if (path === '_id' || drop.includes(path)) continue;
    const segments = path.split('.');
    const leaf = segments.pop();
    const node = segments.reduce((target, segment) => (target[segment] ??= {}), source);
    const replaced = replacedKey(leaf, value);
    if (replaced) node[replaced.key] = structuredClone(expandObject(replaced.value));
    else mergeInto(node, leaf, expandObject(value));
  }
}

function view(page) {
  if (!page) return null;
  const copy = structuredClone(page);
  copy.getFlag = (scope, key) => copy.flags?.[scope]?.[key];
  return copy;
}

/** A world item: prepared `system` mirrors `_source.system`. */
function makeItem(actor, data, id) {
  const item = {
    id,
    uuid: `${actor.uuid}.Item.${id}`,
    _source: structuredClone(data),
    updates: [],
    get system() {
      return item._source.system;
    },
    get name() {
      return item._source.name;
    },
    async update(payload) {
      item.updates.push(payload);
      const answer = actor.hooks.itemUpdate?.(payload, item);
      if (answer !== undefined) return answer;
      applyDocumentUpdate(item._source, payload);
      return item;
    },
  };
  return item;
}

/**
 * A world actor. `hooks.create(data)` may answer a create result, `hooks.itemUpdate` an item
 * update result, and `hooks.drop` lists actor update paths the schema discards.
 */
export function makeWorldActor(id, { system = {}, hooks = {} } = {}) {
  let ids = 0;
  const actor = {
    id,
    uuid: `Actor.${id}`,
    name: id,
    hooks,
    items: [],
    createCalls: [],
    updates: [],
    _source: { name: id, system: structuredClone(system), flags: {} },
    get system() {
      return actor._source.system;
    },
    get flags() {
      return actor._source.flags;
    },
    async createEmbeddedDocuments(_type, payloads) {
      actor.createCalls.push(structuredClone(payloads));
      const answer = hooks.create?.(payloads);
      if (answer !== undefined) return answer;
      const created = payloads.map((data) => makeItem(actor, data, `item${++ids}`));
      actor.items.push(...created);
      return created;
    },
    async update(payload) {
      actor.updates.push(payload);
      if (hooks.actorUpdate) return hooks.actorUpdate(payload, actor);
      applyDocumentUpdate(actor._source, payload, { drop: hooks.drop ?? [] });
      return actor;
    },
  };
  return actor;
}

const LEARNED_KEY = 'fabricate.learnedRecipes';

/** Give a history fixture's crafter a `_source` its currency and learned-recipe writes land on. */
export function rewardableCrafter(actor) {
  const getFlag = actor.getFlag.bind(actor);
  actor._source = { system: { currency: { gp: 1, sp: 0 } }, flags: {} };
  Object.defineProperty(actor, 'system', { get: () => actor._source.system, configurable: true });
  actor.getFlag = (namespace, key) =>
    key === LEARNED_KEY
      ? actor._source.flags.fabricate?.fabricate?.learnedRecipes
      : getFlag(namespace, key);
  actor.update = async (payload) => {
    applyDocumentUpdate(actor._source, payload);
    return actor;
  };
  actor.updateSource = () => {};
  return actor;
}

/** Give an existing item to an actor, as though it had been created earlier. */
export function giveItem(actor, data) {
  const item = makeItem(actor, data, `held${actor.items.length + 1}`);
  actor.items.push(item);
  return item;
}

/**
 * One world. `hooks.beforeUpdate(update)` may throw, or answer a ledger update result, before the
 * page write; `hooks.afterUpdate(update)` sees every applied page write.
 */
export function rewardWorld() {
  const pages = new Map();
  const users = new Map([
    ['gm', { id: 'gm', isGM: true }],
    ['gm2', { id: 'gm2', isGM: true }],
  ]);
  const hooks = { beforeUpdate: null, afterUpdate: null };
  let elected = 'gm';
  let ids = 0;
  let now = 500;
  const ledger = {
    id: 'ledger',
    createdTime: 1,
    state: { version: 1, requests: {}, prepareTokens: {}, reconciliations: [] },
    pages: { get: (id) => view(pages.get(id)) },
    async createEmbeddedDocuments(_type, [source]) {
      if (pages.has(source._id)) throw new Error(`The _id [${source._id}] already exists`);
      pages.set(source._id, { id: source._id, _id: source._id, flags: structuredClone(source.flags) });
      return [view(pages.get(source._id))];
    },
    async updateEmbeddedDocuments(_type, [update]) {
      const early = await hooks.beforeUpdate?.(update);
      if (early !== undefined) return early;
      const page = pages.get(update._id);
      if (!page) throw new Error('missing page');
      applyDocumentUpdate(page, update);
      hooks.afterUpdate?.(update, structuredClone(record()));
      return [view(page)];
    },
  };
  const readAuthoritativeLedger = async (ledgerId) => {
    if (ledgerId !== ledger.id) return { status: 'unavailable' };
    return { status: 'available', ledger: { id: ledger.id, pages: new Map([...pages].map(([id, page]) => [id, view(page)])) } };
  };
  const clock = () => ++now;

  function record(id = OPERATION_ID) {
    return pages.get(id)?.flags.fabricate.companionOperationRecord ?? null;
  }

  function store() {
    return createCompanionOperationStore({ ledger, readAuthoritativeLedger, clock });
  }

  /**
   * A direct held claim over the ledger. `held(call)` decides each `claimStillHeld` call by its
   * one-based index; every call is logged.
   */
  function heldClaim(held = () => true) {
    const calls = [];
    return {
      calls,
      ledger,
      readAuthoritativeLedger,
      claimStillHeld: async () => {
        calls.push(calls.length + 1);
        return held(calls.length);
      },
    };
  }

  function realm(userId, { executor = null, createStore = createCompanionOperationStore } = {}) {
    const currentUser = () => users.get(userId);
    const activeGM = () => users.get(elected) ?? null;
    const authority = createJournalRunAuthority({
      currentUser,
      activeGM,
      listLedgers: async () => [ledger],
      createLedger: async () => {
        throw new Error('the ledger already exists');
      },
      readState: async () => structuredClone(ledger.state),
      writeState: async (_entry, state) => {
        ledger.state = structuredClone(state);
      },
      createClaim: async (_entry, source) => {
        if (pages.has(CLAIM)) throw new Error('duplicate claim');
        const fabricate = {
          journalRunClaimId: source.claimId,
          journalRunRequestId: source.requestId,
          journalRunClaimedAt: source.acquiredAt,
        };
        pages.set(CLAIM, { id: CLAIM, flags: { fabricate } });
        return view(pages.get(CLAIM));
      },
      readClaim: async (entry) => {
        const page = entry.pages.get(CLAIM);
        if (!page) return null;
        return {
          claimId: page.getFlag('fabricate', 'journalRunClaimId'),
          requestId: page.getFlag('fabricate', 'journalRunRequestId'),
          acquiredAt: page.getFlag('fabricate', 'journalRunClaimedAt'),
        };
      },
      deleteClaim: async (_entry, claimId) => {
        const page = pages.get(CLAIM);
        if (!page) return true;
        if (page.flags.fabricate.journalRunClaimId !== claimId) return false;
        pages.delete(CLAIM);
        return true;
      },
      readAuthoritativeLedger,
      reconstructExecutions: async () => ({ success: true }),
      randomId: () => `${userId}-claim-${++ids}`,
      now: () => 1000,
    });
    const companion = createCompanionOperationAuthority({
      authority,
      createStore,
      currentUser,
      activeGM,
      getUser: (id) => users.get(id) ?? null,
      emit: () => {},
      randomId: () => `${userId}-${++ids}`,
      clock,
      executor,
    });
    return { companion, authority };
  }

  /** The command request records the run authority persisted, in order. */
  function requests() {
    return Object.values(ledger.state.requests).filter((entry) => entry.kind === 'command');
  }

  return {
    pages,
    hooks,
    ledger,
    clock,
    record,
    store,
    heldClaim,
    realm,
    requests,
    elect: (id) => (elected = id),
  };
}

/** A version-1 plan over `effects`, each `[effectId, kind, payload, requiresDecisionIds?]`. */
export function rewardPlan(effects, decisions = []) {
  return {
    schemaVersion: 1,
    source: { namespace: 'fabricate-premium', occurrenceId: 'activity-1', kind: 'resolution' },
    decisions: decisions.map((decisionId) => ({ decisionId, kind: 'check', payload: {} })),
    effects: effects.map(([effectId, kind, payload, requiresDecisionIds = []]) => ({
      effectId,
      kind,
      payload,
      requiresDecisionIds,
    })),
  };
}
