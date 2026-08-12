/**
 * The HELD-INVENTORY axis (issues 1070, 1071).
 *
 * ## Why this is its own module and its own dimension
 *
 * Every other generator in this directory scales the CORPUS. The failure that started this
 * programme did not: a user with 1,080 components reported a 7.5 s crafting-menu open and
 * then traced it themselves to one character carrying hundreds of salvageable materials. The
 * terms that blew up are PRODUCTS — `items × components` for identity resolution and
 * `CraftingEngine.findComponentItems`, `recipes × items` for `evaluateCraftability`'s
 * per-call `sourceActors.flatMap((actor) => [...actor.items])`.
 *
 * Two consequences, both easy to get wrong and both fatal to the harness if got wrong:
 *
 * 1. **Held-item count varies independently of corpus size.** This module takes `stacks` and
 *    a component LIBRARY; it has no idea how many recipes exist and cannot be made to care.
 *    A profile that grew both together could not attribute a regression to either, which is
 *    the entire purpose of the harness. `assertInventoryIndependentOfCorpus` in the harness
 *    test proves the independence rather than asserting it in prose.
 *
 * 2. **Most held items resolve to NO component.** This is the counter-intuitive half. An
 *    inventory made entirely of registered components exercises the CHEAP identity tier: a
 *    durable `flags.fabricate.roles[systemId].componentId` hits on the first tier and stops.
 *    An ordinary item — mundane gear, ammo, loot, most of a real character sheet — carries no
 *    Fabricate flags, so it falls through both durable tiers, fails the source-reference
 *    intersection after scanning the WHOLE library, and then pays a second full scan in the
 *    name fallback before returning `null` (`essenceResolver.js` `findMatchingComponent` →
 *    `componentNameMatch.js` `findComponentByName`). Measured on this checkout against a
 *    5,000-component library, 1,000 items cost 3.3 ms when every item is durably flagged and
 *    220 ms when none is — a 66x difference that a 100%-component benchmark inventory hides
 *    completely.
 *
 *    So the default mix is 70% unmatched / 30% component, and the mix is RECORDED on the
 *    returned fixture so a baseline states what it measured instead of implying it.
 *
 * ## Two ways an item can be "matched"
 *
 * A matched stack is split further, because the two matched paths cost very differently and a
 * profile that only ships the durable kind would under-report:
 *
 * - `durable` — carries `flags.fabricate.roles[systemId].componentId`. Tier 1, one `find`.
 * - `sourceRef` — carries only the component's registered source uuid, as an un-restamped
 *   pre-#555 world's items do. Tiers 1 and 2 miss and tier 3 scans until it intersects.
 */
import { roleItem } from '../componentIdentityFixtures.js';

import { componentSourceUuid } from './scaleComponents.js';
import { intBetween } from './scaleRandom.js';

/**
 * The inventory series issue 1071 requires be reported as a SERIES rather than a single
 * number. One data point cannot show super-linear growth, which is the defect being guarded
 * against.
 * @type {readonly number[]}
 */
export const INVENTORY_SERIES = Object.freeze([100, 500, 1000]);

/**
 * The composition of a real player sheet: most of what a character carries is not a crafting
 * component. Overridable per profile, but a profile that overrides it must say so, because
 * the mix decides which identity branch is measured.
 */
export const DEFAULT_UNMATCHED_RATIO = 0.7;

/**
 * Of the matched minority, how many carry a durable identity flag rather than only a raw
 * source reference. Two thirds durable reflects a world that has been through the #556/#567
 * restamp with a tail of older items.
 */
export const DEFAULT_DURABLE_SHARE = 2 / 3;

/**
 * A `getFlag`-compatible reader for an ACTOR's Fabricate flags.
 *
 * `componentIdentityFixtures.roleItem` supplies the ITEM-side reader; an actor needs a
 * different key set (`learnedRecipes`, `discoveryProgress`), so the two are not the same
 * function and sharing one would mean a reader that answers keys its subject never has.
 *
 * @param {{learnedRecipes?: object, discoveryProgress?: object}} values
 * @returns {(scope: string, key: string) => unknown}
 */
function actorFlagReader(values) {
  return (scope, key) => {
    if (scope !== 'fabricate') return undefined;
    if (key === 'fabricate.learnedRecipes') return values.learnedRecipes;
    if (key === 'fabricate.discoveryProgress') return values.discoveryProgress;
    return undefined;
  };
}

/**
 * One held stack.
 *
 * @param {object} options
 * @param {'unmatched'|'durable'|'sourceRef'|'book'} options.kind
 * @param {number} options.index Global stack index; makes every uuid unique.
 * @param {string} options.systemId
 * @param {object|null} options.component The component this stack IS, for matched kinds.
 * @param {number} options.quantity
 * @returns {object}
 */
function heldStack({ kind, index, systemId, component, quantity }) {
  if (kind === 'durable') {
    return roleItem({
      uuid: `Actor.bench.Item.held-${index}`,
      name: component.name,
      quantity,
      roles: { [systemId]: { componentId: component.id } },
      compendiumSource: component.registeredItemUuid,
    });
  }
  if (kind === 'sourceRef') {
    return roleItem({
      uuid: `Actor.bench.Item.held-${index}`,
      name: component.name,
      quantity,
      compendiumSource: component.registeredItemUuid,
    });
  }
  if (kind === 'book') {
    return roleItem({
      uuid: `Actor.bench.Item.held-${index}`,
      name: `Bench Tome ${index}`,
      quantity: 1,
      compendiumSource: component,
    });
  }
  // `unmatched`: an ordinary owned item. It has a `uuid` — real items always do — which is
  // exactly why it is expensive: a non-empty reference set makes the tier-3 scan run in full
  // instead of returning early, and then the name fallback scans the library again.
  return roleItem({
    uuid: `Actor.bench.Item.held-${index}`,
    name: `Mundane Sundry ${index}`,
    quantity,
  });
}

/**
 * Build the held-inventory axis: `stacks` stacks spread over one crafting actor and
 * `sourceActorCount` additional component-source actors, resolved against `components`.
 *
 * @param {object} options
 * @param {number} options.stacks TOTAL held stacks across every actor.
 * @param {object[]} options.components The library the stacks are resolved against. Passed in
 *   rather than generated so the SAME inventory size can be run against different library
 *   sizes — which is what makes this axis independent of the corpus.
 * @param {string} options.systemId
 * @param {() => number} options.random
 * @param {number} [options.unmatchedRatio]
 * @param {number} [options.durableShare]
 * @param {number} [options.sourceActorCount] Additional actors beyond the crafting actor.
 * @param {string[]} [options.bookUuids] Recipe-item source uuids to grant, for the knowledge
 *   profile. Granted books are held IN ADDITION to `stacks` and are counted separately.
 * @param {string[]} [options.learnedRecipeIds]
 * @returns {{craftingActor: object, sourceActors: object[], actors: object[],
 *   byKind: {unmatched: object[], durable: object[], sourceRef: object[]},
 *   matchedComponentIds: string[], craftingActorComponentIds: string[],
 *   mix: {stacks: number, unmatched: number, durable: number, sourceRef: number,
 *   books: number, unmatchedRatio: number, sourceActorCount: number}}}
 */
export function buildHeldInventory({
  stacks,
  components,
  systemId,
  random,
  unmatchedRatio = DEFAULT_UNMATCHED_RATIO,
  durableShare = DEFAULT_DURABLE_SHARE,
  sourceActorCount = 2,
  bookUuids = [],
  learnedRecipeIds = [],
}) {
  const unmatchedCount = Math.round(stacks * unmatchedRatio);
  const matchedCount = stacks - unmatchedCount;
  const durableCount = Math.round(matchedCount * durableShare);
  const sourceRefCount = matchedCount - durableCount;

  // Interleave the three kinds proportionally rather than shuffling them. A seeded shuffle
  // would be reproducible too, but it can deal ONE actor a run of cheap durable stacks purely
  // by luck of the seed, which makes per-actor cost depend on the seed instead of on the
  // declared mix. The rule below is the standard proportional interleave — repeatedly emit
  // from whichever kind has made the least fractional progress — so every prefix of the
  // sequence, and therefore every actor's round-robin share, holds the declared mix.
  const kinds = ['unmatched', 'durable', 'sourceRef'];
  const weights = [unmatchedCount, durableCount, sourceRefCount];
  const cursors = [0, 0, 0];
  const ordered = [];
  for (let placed = 0; placed < stacks; placed++) {
    let best = -1;
    let bestProgress = Infinity;
    for (let bucket = 0; bucket < kinds.length; bucket++) {
      if (cursors[bucket] >= weights[bucket]) continue;
      const progress = (cursors[bucket] + 0.5) / weights[bucket];
      if (progress < bestProgress) {
        bestProgress = progress;
        best = bucket;
      }
    }
    if (best === -1) break;
    ordered.push(kinds[best]);
    cursors[best] += 1;
  }

  const actorCount = sourceActorCount + 1;
  const perActor = Array.from({ length: actorCount }, () => []);
  // An index of which stacks are which kind. The identity benchmarks MUST measure the miss
  // case separately from the durable-flag hit case — averaging them hides a 66x difference —
  // and this index is how a case selects one branch without stamping a marker field onto the
  // item, which would both change the fixture checksum's meaning and put a field on an item
  // object that no real item carries.
  const byKind = { unmatched: [], durable: [], sourceRef: [] };
  // Matched stacks cover a CONTIGUOUS PREFIX of the library rather than a strided sample.
  // Two reasons, both about the fixture meaning something: a player holds a subset of the
  // library, not every seventh entry; and the recipe corpora consume components from the front
  // of the library, so a strided inventory would leave every recipe uncraftable and every
  // craftability evaluation would exit down the same "missing" branch.
  let matchedOrdinal = 0;
  const matchedComponentIds = [];
  const craftingActorComponentIds = [];
  for (const [index, kind] of ordered.entries()) {
    let component = null;
    if (kind !== 'unmatched') {
      component = components[matchedOrdinal % components.length];
      matchedComponentIds.push(component.id);
      // `CraftingEngine.findComponentItems` searches ONE actor, so a case probing a component
      // held only by a SOURCE actor would report zero matches and quietly measure the
      // never-matched path while claiming to measure the matcher.
      if (index % actorCount === 0) craftingActorComponentIds.push(component.id);
      matchedOrdinal += 1;
    }
    const stack = heldStack({
      kind,
      index,
      systemId,
      component,
      quantity: intBetween(random, 1, 5),
    });
    byKind[kind].push(stack);
    perActor[index % actorCount].push(stack);
  }

  // Books land on the crafting actor: the knowledge gate reads the acting character first.
  for (const [bookIndex, uuid] of bookUuids.entries()) {
    perActor[0].push(
      heldStack({
        kind: 'book',
        index: stacks + bookIndex,
        systemId,
        component: uuid,
        quantity: 1,
      })
    );
  }

  const learnedRecipes = Object.fromEntries(
    learnedRecipeIds.map((id) => [id, { learnedAt: 0, source: 'benchmark' }])
  );

  const actors = perActor.map((items, index) => ({
    id: index === 0 ? 'bench-actor-crafting' : `bench-actor-source-${index}`,
    name: index === 0 ? 'Bench Crafter' : `Bench Source ${index}`,
    type: 'character',
    items,
    flags: { fabricate: { learnedRecipes: index === 0 ? learnedRecipes : {} } },
    getFlag: actorFlagReader({ learnedRecipes: index === 0 ? learnedRecipes : {} }),
    isOwner: true,
  }));

  return {
    craftingActor: actors[0],
    sourceActors: actors.slice(1),
    actors,
    byKind,
    // The component ids some stack actually resolves to. A benchmark that probes a component
    // nobody holds measures only the miss path and reports `matchedItems: 0` forever, which
    // looks identical to a fixture whose inventory silently failed to generate.
    matchedComponentIds,
    craftingActorComponentIds,
    mix: {
      stacks,
      unmatched: unmatchedCount,
      durable: durableCount,
      sourceRef: sourceRefCount,
      books: bookUuids.length,
      unmatchedRatio,
      sourceActorCount,
    },
  };
}
