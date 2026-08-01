/**
 * Duck-typed actors, items, and the uuid document index.
 *
 * Fabricate's craftability evaluation is deliberately structural: `RecipeManager` iterates
 * `actor.items` and `Ingredient.matches(item)` compares `item.uuid` against the component's
 * `originItemUuid`. So an "actor" here needs an id, a name, an image, and an iterable `items`
 * collection — nothing resembling a real Foundry Actor document.
 *
 * The inventories are chosen, not random. Three outcomes have to be reachable on the Crafting tab
 * or the frame shows one state and implies the others do not exist:
 *   - fully satisfied (the recipe is craftable now),
 *   - partially satisfied (some ingredients held, some missing),
 *   - unsatisfiable (nothing held).
 */

import { installUpdateSemantics, makeGetFlag, makeSetFlag, seedFabricateFlag } from './labFlags.js';

const PORTRAIT_BASE = '/@foundry-chrome/icons';

/**
 * One owned item. `system.quantity` is where dnd5e keeps stack size, which is what Fabricate reads.
 *
 * @param {string} componentId Component this stack is an instance of.
 * @param {object} component The component definition, for name and image.
 * @param {number} quantity Stack size.
 * @param {number} index Disambiguator for the item id.
 * @returns {object} A duck-typed item.
 */
function ownedItem(componentId, component, quantity, index) {
  const item = {
    // The uuid is what `Ingredient.matches` compares against `originItemUuid`, so it must be the
    // component's OWN declared origin rather than one derived from the id. Almost every component
    // declares `Item.<id>` and this is the same string either way — but a stack that backs a
    // component in two systems is ONE document claimed by both definitions, and
    // `InventoryListingBuilder` collapses rows on `item.uuid` alone. Deriving the uuid from the
    // id would give that one physical stack two uuids, two cards, and a doubled quantity.
    uuid: component?.originItemUuid ?? `Item.${componentId}`,
    id: `item-${componentId}-${index}`,
    name: component?.name ?? componentId,
    img: component?.img ?? null,
    type: 'loot',
    system: { quantity, description: { value: '' } },
    flags: {},
    isOwner: true,
  };
  // Real V13 flag semantics rather than `() => null`. Tool wear, breakage, catalyst usage, item
  // essences and role identity are all owned-item flags read through `getFabricateFlag`, which
  // normalises to the dotted `fabricate.<key>` — a hard null answers every one of them with its
  // default and renders a pristine, unworn, unbroken frame no matter what the fixture seeded.
  item.getFlag = makeGetFlag(item);
  item.setFlag = makeSetFlag(item);
  installUpdateSemantics(item);
  return item;
}

/**
 * One owned copy of a recipe item — a book or scroll in a character's pack.
 *
 * Its `uuid` is the DEFINITION's source ref, because that is the tier
 * `matchRecipeItemDefinition` resolves on; its `id` is what every Knowledge row, arm token and
 * mutation is keyed by, so sibling copies of one book differ only there.
 *
 * @param {{id: string, uuid: string, name: string, icon: string, usage?: object}} copy Fixture spec.
 * @returns {object} A duck-typed owned item.
 */
function recipeItemCopy({ id, uuid, name, icon, usage = null }) {
  const item = {
    uuid,
    id,
    name,
    img: `${PORTRAIT_BASE}/${icon}`,
    type: 'loot',
    system: { quantity: 1, description: { value: '' } },
    flags: {},
    isOwner: true,
  };
  item.getFlag = makeGetFlag(item);
  item.setFlag = makeSetFlag(item);
  // Same doubly-nested depth as every other Fabricate item flag, and the reason a copy can read
  // "2 of 3 remaining", "Spent" or "Inert" at all: with the flag absent the projection sees zero
  // uses on every copy and the whole chip vocabulary collapses to one face.
  if (usage) seedFabricateFlag(item, ['fabricate', 'recipeItemUsage'], { ...usage });
  return item;
}

/**
 * Owned stacks per actor, keyed by component id.
 *
 * Read this as three inventories with intent:
 * - Brenna is the smith: she can complete the sword and shield lines, and is one silver ore short
 *   of refining silver, so a `missingMaterials` row is guaranteed on screen.
 * - Idrin is the herbalist: full potion line, plus the reagents the alchemy workbench needs.
 * - Vosk is the mule: bulk raw materials and nothing finished, which is what makes the
 *   multi-source component picker meaningful rather than decorative.
 */
const INVENTORIES = {
  'lab-actor-brenna': {
    'sm-iron-ore': 12,
    'sm-copper-ore': 6,
    'sm-iron-ingot': 5,
    'sm-steel-ingot': 4,
    'sm-coal': 9,
    'sm-leather': 3,
    'sm-oak-haft': 4,
    'sm-whetstone': 2,
    'sm-ruby': 1,
    'sm-longsword': 1,
    'sm-tool-hammer': 1,
    'sm-tool-anvil': 1,
    'sm-tool-tongs': 1,
    'hb-healing-potion': 2,
    // Routed stock, deliberately ASYMMETRIC. Brenna holds the silver billet but not the gold one,
    // so `jw-r-cast` renders with one route satisfied and one short — which is the whole point of
    // a routedByIngredients frame. The wire is one under the three a circlet needs, for the same
    // reason: a routed recipe where every route is green shows none of the routing.
    'jw-ingot-silver': 2,
    'jw-wire': 2,
    'rw-bar': 2,
    'rw-chalk': 4,
    // ONE stack, registered as a component in TWO systems (see SHARED_AIR_SHARD_UUID). ×1 on
    // purpose: the collapse contract is a single card whose quantity is counted ONCE, and a ×2
    // stack would hide a double-count rather than disprove it.
    'sm-air-shard': 1,
    // Progressive salvage lives on herbalism, so its salvageable component has to be held by
    // the actor the inventory opens on — Brenna — or the panel is unreachable.
    'hb-cracked-alembic': 1,
    // The misconfigured (routed, no formula) salvage config.
    'jw-bent-clasp': 1,
  },
  'lab-actor-idrin': {
    'hb-moonleaf': 8,
    'hb-sunroot': 5,
    'hb-bitterbark': 6,
    'hb-frostcap': 3,
    'hb-emberbloom': 2,
    'hb-spring-water': 7,
    'hb-empty-vial': 10,
    'hb-mortar-dust': 4,
    'hb-healing-potion': 3,
    'hb-salve': 2,
    'hb-tool-mortar': 1,
    'hb-tool-alembic': 1,
    'al-sulphur': 4,
    'al-saltpetre': 3,
    'al-quicksilver': 2,
    'al-flask': 5,
  },
  'lab-actor-vosk': {
    'sm-iron-ore': 20,
    'sm-coal': 15,
    'sm-oak-haft': 8,
    'sm-leather': 6,
    'hb-moonleaf': 4,
    'hb-spring-water': 5,
    'al-sulphur': 2,
    // The gold billet lives on the mule, not the crafter — so the routed recipe's second route is
    // reachable only through the multi-source picker.
    'jw-ingot-gold': 3,
    'rw-bar': 6,
    // The required-tool disclosure needs ONE tool held and one missing, and availability is
    // scoped to the target salvage actor (`rowSources[0]`, crafting-actor-first). Brenna owns the
    // whole smithy, so the toolchest is stocked on the mule instead — who carries the tongs the
    // salvage names and not the anvil it also names.
    'sm-tool-tongs': 1,
    'sm-toolchest': 1,
  },
};

/**
 * Owned RECIPE-ITEM copies — the books and scrolls the GM Knowledge surface audits.
 *
 * Not part of {@link INVENTORIES}, because these are not components: a recipe item is matched to
 * its definition by source uuid (`matchRecipeItemDefinition`), never by the component map, and it
 * carries a `recipeItemUsage` flag no component has. Several copies deliberately share ONE uuid —
 * three copies of the same book is the normal case, and the projection keys each row on the
 * document ID, so a shared uuid is what makes "this copy is spent and that one is not" possible.
 *
 * The distribution is chosen, not incidental:
 * - Brenna carries the FOUR uses-chip states in one list — a partly-used capped book, an uncapped
 *   scroll (whose Expend control must be disabled), an inert copy, and a spent one. She is the
 *   roster's first character, so this is what the Knowledge surface opens on.
 * - Idrin carries knowledge and NO copies at all, which is the only way to reach the Recipe-items
 *   tab's empty state, and her learned entries name a source she no longer holds — the `lostCopy`
 *   rung of the learned-source ladder.
 * - Vosk holds the `total`-scope party codex that is STILL the source of a learned entry, which is
 *   the one arrangement that raises the ordering-hazard band.
 *
 * Deliberately none on the crafting actor's LEARNED side: `lastCraftingActor` is Brenna, and the
 * player's recipe visibility for the knowledge-gated herbalism system is evaluated against her
 * learned set — so teaching her anything would reveal those recipes in the player's crafting
 * listing and re-point every already-captured player crafting and journal frame.
 *
 * A COPY reveals for the same reason, which is why every copy here is a copy of a book carrying no
 * authored membership: `hasMatchedItem` is computed over the crafting actor plus every
 * component-source actor, and the lab's component-source set is the whole roster, so there is no
 * character a member-carrying book can be parked on. See `HERBALISM_RECIPE_ITEMS` in
 * `labContent.js`, which owns that decision.
 */
const RECIPE_ITEM_COPIES = {
  'lab-actor-brenna': [
    {
      id: 'copy-primer-partial',
      uuid: 'Item.hb-primer',
      name: "Warden's Primer",
      icon: 'sundries/books/book-embossed-steel-green.webp',
      usage: { timesUsed: 1 },
    },
    {
      id: 'copy-scroll',
      uuid: 'Item.hb-scroll',
      name: 'Frostcap Scroll',
      icon: 'sundries/scrolls/scroll-bound-leather-tan.webp',
    },
    {
      id: 'copy-primer-inert',
      uuid: 'Item.hb-primer',
      name: "Warden's Primer",
      icon: 'sundries/books/book-embossed-steel-green.webp',
      // `inert` is an INDEPENDENT projected fact, never folded into `spent`: a copy can be inert
      // with charges left, and the row renders both a remaining-uses chip and an Inert chip.
      usage: { timesUsed: 0, inert: true },
    },
    {
      id: 'copy-primer-spent',
      uuid: 'Item.hb-primer',
      name: "Warden's Primer",
      icon: 'sundries/books/book-embossed-steel-green.webp',
      usage: { timesUsed: 3 },
    },
  ],
  'lab-actor-vosk': [
    {
      id: 'copy-codex',
      uuid: 'Item.hb-codex',
      name: 'Warden Party Codex',
      icon: 'sundries/books/book-embossed-gold-red.webp',
      usage: { timesUsed: 1 },
    },
  ],
};

/**
 * Learned recipes per actor, keyed exactly as `flags.fabricate.fabricate.learnedRecipes` is.
 *
 * `sourceItemUuid` is what decides which rung of the source ladder a row renders on: a uuid the
 * actor still owns reads as the owned copy, a uuid it does not reads as the book's DEFINITION name
 * (`lostCopy`), and no uuid at all reads as an auto-learn.
 */
const LEARNED_RECIPES = {
  'lab-actor-idrin': {
    // Both name a book Idrin no longer carries, which is the `lostCopy` rung — and, because the
    // source is not owned, erasing either frees no learn budget, which is the no-refund clause the
    // row states positively rather than leaving the GM to infer.
    'hb-r-healing': { sourceItemUuid: 'Item.hb-book', learnedAt: 1_036_800 },
    'hb-r-salve': { sourceItemUuid: 'Item.hb-book', learnedAt: 1_123_200 },
    // An auto-learn: no source at all, so the ladder falls to its bottom rung.
    'hb-r-grind': { sourceItemUuid: null, learnedAt: 1_209_500 },
  },
  'lab-actor-vosk': {
    // STILL sourced by an owned `total`-scope copy — the ordering hazard.
    'hb-r-oil': { sourceItemUuid: 'Item.hb-codex', learnedAt: 1_180_000 },
  },
};

const ACTOR_DEFINITIONS = [
  {
    id: 'lab-actor-brenna',
    name: 'Brenna Karrunsdottir',
    img: `${PORTRAIT_BASE}/skills/trades/smithing-anvil-silver-red.webp`,
  },
  {
    id: 'lab-actor-idrin',
    name: 'Idrin Ashfall',
    img: `${PORTRAIT_BASE}/tools/laboratory/alembic-glass-ball-blue.webp`,
  },
  {
    id: 'lab-actor-vosk',
    name: 'Vosk',
    img: `${PORTRAIT_BASE}/commodities/leather/fur-brown-gold.webp`,
  },
];

/**
 * Build the lab's actors with their inventories.
 *
 * @param {object} content Output of `buildLabContent()`.
 * @returns {object[]} Duck-typed actors.
 */
export function buildLabActors(content) {
  const componentsById = new Map(content.components.map((component) => [component.id, component]));
  for (const tool of content.tools) componentsById.set(tool.id, tool);

  return ACTOR_DEFINITIONS.map((definition) => {
    const stacks = INVENTORIES[definition.id] ?? {};
    const items = Object.entries(stacks).map(([componentId, quantity], index) =>
      ownedItem(componentId, componentsById.get(componentId), quantity, index)
    );
    for (const copy of RECIPE_ITEM_COPIES[definition.id] ?? []) {
      items.push(recipeItemCopy(copy));
    }
    const actor = {
      ...definition,
      uuid: `Actor.${definition.id}`,
      type: 'character',
      // Iterated with `[...actor.items]` throughout the engine, so a plain array is enough.
      items,
      system: {
        currency: { gp: 45, sp: 12, cp: 30 },
        abilities: { int: { mod: 3 }, str: { mod: 2 } },
      },
      flags: {},
      isOwner: true,
      testUserPermission: () => true,
      // `checkRoll.js` and `craftingModifierResolver.js` resolve `@`-expressions against this. A
      // real dnd5e actor supplies it; without it every `@prof` / `@abilities.*.mod` in a check
      // formula resolves to NaN and the card renders a broken formula.
      getRollData() {
        return { ...this.system, prof: 3 };
      },
      /**
       * The smoke's seed stocks the crafter through this, so an actor has to accept embedded items
       * or every inventory-dependent frame renders empty. Items arrive as plain specs carrying
       * `flags.core.sourceId`, which is how Fabricate matches an owned stack to a managed component.
       */
      async createEmbeddedDocuments(type, specs = []) {
        if (type !== 'Item') return [];
        const created = specs.map((spec, offset) => {
          const item = {
            uuid: spec.flags?.core?.sourceId ?? `Item.${definition.id}-${items.length + offset}`,
            id: `item-${definition.id}-${items.length + offset}`,
            name: spec.name,
            img: spec.img ?? null,
            type: spec.type ?? 'loot',
            system: { quantity: 1, description: { value: '' }, ...(spec.system ?? {}) },
            flags: spec.flags ?? {},
            isOwner: true,
          };
          // The same V13 semantics the statically-built stacks get. An embedded item is where tool
          // wear and breakage flags land, so a literal-key lookup here renders every tool pristine.
          item.getFlag = makeGetFlag(item);
          item.setFlag = makeSetFlag(item);
          installUpdateSemantics(item);
          return item;
        });
        items.push(...created);
        return created;
      },
      async deleteEmbeddedDocuments(type, ids = []) {
        if (type !== 'Item') return [];
        const removed = items.filter((item) => ids.includes(item.id));
        for (const item of removed) items.splice(items.indexOf(item), 1);
        return removed;
      },
    };
    actor.getFlag = makeGetFlag(actor);
    actor.setFlag = makeSetFlag(actor);
    installUpdateSemantics(actor);
    const learned = LEARNED_RECIPES[definition.id];
    // `flags.fabricate.fabricate.learnedRecipes`, which is where production's dotted-top-level-key
    // `update` lands it after V13 expands the path — the same doubly-nested depth every Fabricate
    // read normalises to. Seeded through the shared helper so the lab can never hold one key at
    // two depths and answer a depth bug from whichever copy the reader happens to find.
    if (learned)
      seedFabricateFlag(actor, ['fabricate', 'learnedRecipes'], structuredClone(learned));
    return actor;
  });
}

/**
 * Build the `fromUuid` index.
 *
 * This is not optional decoration. Roughly nine render paths resolve names and images through
 * `fromUuid`/`fromUuidSync` — environment scene links, recipe-item books, tool sources, the manager's
 * source-item panels. Without an index those surfaces render as unresolved, which is precisely the
 * "looks broken" failure a screenshot must not have.
 *
 * @param {object} content Output of `buildLabContent()`.
 * @param {object[]} actors Output of {@link buildLabActors}.
 * @returns {Map<string, object>} Documents keyed by uuid.
 */
export function buildDocumentIndex(content, actors) {
  const documents = new Map();

  for (const component of [...content.components, ...content.tools, ...content.recipeItems]) {
    const uuid = component.originItemUuid ?? `Item.${component.id}`;
    const document = {
      uuid,
      id: component.id,
      name: component.name,
      img: component.img ?? null,
      type: 'loot',
      system: { quantity: 1, description: { value: component.description ?? '' } },
      flags: {},
    };
    // `sourceUuid.js` resolves component and tool identity through `roles` on the ORIGIN item, so
    // an index entry answering `null` sends every lookup to the name-matching fallback tier rather
    // than the flag tier production reaches first.
    document.getFlag = makeGetFlag(document);
    document.setFlag = makeSetFlag(document);
    documents.set(uuid, document);
  }

  for (const actor of actors) documents.set(actor.uuid, actor);

  documents.set('Scene.lab-map', {
    uuid: 'Scene.lab-map',
    id: 'lab-scene',
    name: 'The Verdant Reach',
    img: `${PORTRAIT_BASE}/environment/wilderness/tree-spruce-green.webp`,
  });
  documents.set('Scene.lab-map.Region.grove', {
    uuid: 'Scene.lab-map.Region.grove',
    id: 'grove',
    name: 'Sunlit Grove',
  });

  return documents;
}
