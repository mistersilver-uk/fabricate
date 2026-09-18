/** The HELD-INVENTORY axis (issues 1070, 1071). */
import { roleItem } from '../componentIdentityFixtures.js';

import { intBetween } from './scaleRandom.js';

/**
 * The inventory series issue 1071 requires be reported as a SERIES rather than a single number. One
 * data point cannot show super-linear growth, which is the defect being guarded against.
 */
export const INVENTORY_SERIES = Object.freeze([100, 500, 1000]);

/**
 * The composition of a real player sheet: most of what a character carries is not a crafting
 * component.
 */
export const DEFAULT_UNMATCHED_RATIO = 0.7;

/**
 * Of the matched minority, how many carry a durable identity flag rather than only a raw source
 * reference.
 */
export const DEFAULT_DURABLE_SHARE = 2 / 3;

/** A `getFlag`-compatible reader for an ACTOR's Fabricate flags. */
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
 * @param {number} options.index Global stack index; makes every uuid unique.
 * @param {object|null} options.component The component this stack IS, for matched kinds.
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
  // `unmatched`: an ordinary owned item.
  return roleItem({
    uuid: `Actor.bench.Item.held-${index}`,
    name: `Mundane Sundry ${index}`,
    quantity,
  });
}

/** Order the three stack kinds so every PREFIX of the sequence holds the declared mix. */
function interleaveKinds(weights, total) {
  const kinds = Object.keys(weights);
  const cursors = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const ordered = [];
  for (let placed = 0; placed < total; placed++) {
    let best = null;
    let bestProgress = Infinity;
    for (const kind of kinds) {
      if (cursors[kind] >= weights[kind]) continue;
      const progress = (cursors[kind] + 0.5) / weights[kind];
      if (progress < bestProgress) {
        bestProgress = progress;
        best = kind;
      }
    }
    if (best === null) break;
    ordered.push(best);
    cursors[best] += 1;
  }
  return ordered;
}

/**
 * Turn an ordered kind sequence into per-actor item lists, plus the indexes the benchmark cases
 * select branches with.
 */
function dealStacks({ ordered, components, systemId, random, actorCount }) {
  const perActor = Array.from({ length: actorCount }, () => []);
  const byKind = { unmatched: [], durable: [], sourceRef: [] };
  const matchedComponentIds = [];
  const craftingActorComponentIds = [];
  let matchedOrdinal = 0;

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

  return { perActor, byKind, matchedComponentIds, craftingActorComponentIds };
}

/**
 * Build the held-inventory axis: `stacks` stacks spread over one crafting actor and
 * `sourceActorCount` additional component-source actors, resolved against `components`.
 *
 * @param {number} options.stacks TOTAL held stacks across every actor.
 * @param {object[]} options.components The library the stacks are resolved against. Passed in
 * rather than generated so the SAME inventory size can be run against different library sizes —
 * which is what makes this axis independent of the corpus.
 * @param {number} [options.sourceActorCount] Additional actors beyond the crafting actor.
 * @param {string[]} [options.bookUuids] Recipe-item source uuids to grant, for the knowledge
 * profile. Granted books are held IN ADDITION to `stacks` and are counted separately.
 * @returns {{craftingActor: object, sourceActors: object[], actors: object[], byKind: {unmatched:
 * object[], durable: object[], sourceRef: object[]}, matchedComponentIds: string[],
 * craftingActorComponentIds: string[], mix: {stacks: number, unmatched: number, durable: number,
 * sourceRef: number, books: number, unmatchedRatio: number, sourceActorCount: number}}}
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

  const ordered = interleaveKinds(
    { unmatched: unmatchedCount, durable: durableCount, sourceRef: sourceRefCount },
    stacks
  );

  const actorCount = sourceActorCount + 1;
  const { perActor, byKind, matchedComponentIds, craftingActorComponentIds } = dealStacks({
    ordered,
    components,
    systemId,
    random,
    actorCount,
  });

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
    // The component ids some stack actually resolves to.
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
