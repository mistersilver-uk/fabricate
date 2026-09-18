/** Duck-typed actors, items, and the uuid document index. */

import { installUpdateSemantics, makeGetFlag, makeSetFlag, seedFabricateFlag } from './labFlags.js';

const PORTRAIT_BASE = '/@foundry-chrome/icons';

/**
 * Foundry's `Document#toObject()`: a deep clone of the document's own source data.
 *
 * @param {object} document The lab document to equip.
 * @returns {object} The same document.
 */
function installToObject(document) {
  document.toObject = () => ({
    _id: document.id,
    name: document.name,
    img: document.img ?? null,
    type: document.type ?? 'loot',
    system: structuredClone(document.system ?? {}),
    flags: structuredClone(document.flags ?? {}),
  });
  return document;
}

/**
 * Foundry's `Document#delete()`: the document removes itself from its parent's collection.
 * Load-bearing, and the reason no bulk salvage run could complete in the lab before this.
 *
 * @param {object} item The item to equip.
 * @param {object} actor The actor whose collection holds it.
 * @returns {object} The same item.
 */
function installDeleteSemantics(item, actor) {
  item.delete = async () => {
    const [removed] = await actor.deleteEmbeddedDocuments('Item', [item.id]);
    return removed ?? item;
  };
  return item;
}

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
    // component's OWN declared origin rather than one derived from the id.
    uuid: component?.originItemUuid ?? `Item.${componentId}`,
    id: `item-${componentId}-${index}`,
    name: component?.name ?? componentId,
    img: component?.img ?? null,
    type: 'loot',
    system: { quantity, description: { value: '' } },
    flags: {},
    isOwner: true,
  };
  // Real V13 flag semantics rather than `() => null`.
  item.getFlag = makeGetFlag(item);
  item.setFlag = makeSetFlag(item);
  installUpdateSemantics(item);
  installToObject(item);
  return item;
}

/**
 * One owned copy of a recipe item — a book or scroll in a character's pack.
 *
 * @param {{id: string, uuid: string, name: string, icon: string, usage?: object}} copy Fixture
 * spec.
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
  installToObject(item);
  return item;
}

/** Owned stacks per actor, keyed by component id. */
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
    // The world's one BROKEN stack, and still salvageable — see {@link BROKEN_STACKS}.
    'sm-longsword': 1,
    'sm-tool-hammer': 1,
    'sm-tool-anvil': 1,
    'sm-tool-tongs': 1,
    'hb-healing-potion': 2,
    // Routed stock, deliberately ASYMMETRIC.
    'jw-ingot-silver': 2,
    'jw-wire': 2,
    'rw-bar': 2,
    'rw-chalk': 4,
    // The world's only WORKING routed salvage (`rw-slag` — Jewelry's routed config is the
    // misconfigured fixture) (issue 859).
    'rw-slag': 2,
    // Its required tool. Without this the row is BLOCKED on `toolsUnavailable` rather than
    // queued, which is a different frame entirely — the tools-blocked case already owns that
    // one, and routed mode would have stayed unphotographable.
    'rw-tool-mallet': 1,
    // ONE stack, registered as a component in TWO systems (see SHARED_AIR_SHARD_UUID).
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
    // The required-tool disclosure needs ONE tool held and one missing, and availability is scoped
    // to the target salvage actor (`rowSources[0]`, crafting-actor-first).
    'sm-tool-tongs': 1,
    'sm-toolchest': 1,
  },
};

/**
 * Stacks seeded BROKEN, per actor and by component id. IT IS REACHABLE IN PRODUCTION, which is the
 * bar a fixture has to clear.
 */
const BROKEN_STACKS = Object.freeze({
  'lab-actor-brenna': ['sm-longsword'],
});

/** Owned RECIPE-ITEM copies — the books and scrolls the GM Knowledge surface audits. */
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
 * Learned recipes per actor, keyed exactly as `flags.fabricate.fabricate.learnedRecipes` is (issue
 * 1289).
 */
const LEARNED_RECIPES = {
  // The crafting actor learns EXACTLY the two progressive recipes and nothing else. This reverses
  // an earlier blanket "never teach Brenna anything" rule, and the reason it was written still
  // holds — it was just too coarse.
  'lab-actor-brenna': {
    'hb-r-stillroom': { sourceItemUuid: null, learnedAt: 1_190_000 },
    'hb-r-kiln': { sourceItemUuid: null, learnedAt: 1_195_000 },
  },
  'lab-actor-idrin': {
    // Both name a book Idrin no longer carries, which is the `lostCopy` rung — and, because the
    // source is not owned, erasing either frees no learn budget, which is the no-refund clause the
    // row states positively rather than leaving the GM to infer.
    'hb-r-healing': { sourceItemUuid: 'Item.hb-book', learnedAt: 1_036_800 },
    'hb-r-salve': { sourceItemUuid: 'Item.hb-book', learnedAt: 1_123_200 },
    // An auto-learn: no source at all, so the ladder falls to its bottom rung.
    'hb-r-grind': { sourceItemUuid: null, learnedAt: 1_209_500 },
    // The two GM-grant rungs (issue 1289).
    'hb-r-tincture': {
      sourceItemUuid: null,
      learnedAt: 1_214_000,
      granted: true,
      grantedBy: 'Greenwarden Milestones',
    },
    'hb-r-antitoxin': { sourceItemUuid: null, learnedAt: 1_216_400, granted: true },
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
  // The one NON-player-character actor in the lab world, and it is APPENDED rather than inserted:
  // `labWorld.js` picks `lab-party`'s travel actor by position out of the character subset, and the
  // manager's "Preview as" and knowledge rosters read this list in order.
  {
    id: 'lab-actor-wagon',
    name: 'The Ashfall Wagon',
    type: 'vehicle',
    img: `${PORTRAIT_BASE}/environment/settlement/wagon.webp`,
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
    const broken = new Set(BROKEN_STACKS[definition.id] ?? []);
    const items = Object.entries(stacks).map(([componentId, quantity], index) => {
      const item = ownedItem(componentId, componentsById.get(componentId), quantity, index);
      if (broken.has(componentId)) seedFabricateFlag(item, ['fabricate', 'toolBroken'], true);
      return item;
    });
    for (const copy of RECIPE_ITEM_COPIES[definition.id] ?? []) {
      items.push(recipeItemCopy(copy));
    }
    const actor = {
      ...definition,
      uuid: `Actor.${definition.id}`,
      // Read from the definition, and it MUST be: this line sits after the `...definition`
      // spread, so a hardcoded `'character'` silently overwrote any type a definition
      // declared — a `type: 'vehicle'` actor would have become a player character with no
      // error, falsifying every claim made for it.
      type: definition.type ?? 'character',
      // Iterated with `[...actor.items]` throughout the engine, so a plain array is enough.
      items,
      system: {
        currency: { gp: 45, sp: 12, cp: 30 },
        abilities: { int: { mod: 3 }, str: { mod: 2 } },
        // `.mod` ONLY, and only these two keys.
        skills: { med: { mod: 4 }, nat: { mod: 2 } },
      },
      flags: {},
      isOwner: true,
      testUserPermission: () => true,
      // `checkRoll.js` and `checkModifierResolver.js` resolve `@`-expressions against this.
      getRollData() {
        return { ...this.system, prof: 3 };
      },
      /**
       * The smoke's seed stocks the crafter through this, so an actor has to accept embedded items
       * or every inventory-dependent frame renders empty.
       */
      async createEmbeddedDocuments(type, specs = [], options = {}) {
        if (type !== 'Item') return [];
        const created = specs.map((spec, offset) => {
          // Foundry mints a fresh id and IGNORES a payload's `_id` unless the caller asks to keep
          // it, which is what `keepId` is for.
          const id =
            (options?.keepId === true && spec._id) || `item-${definition.id}-${items.length + offset}`;
          const item = {
            uuid: `${actor.uuid}.Item.${id}`,
            id,
            name: spec.name,
            img: spec.img ?? null,
            type: spec.type ?? 'loot',
            system: { quantity: 1, description: { value: '' }, ...(spec.system ?? {}) },
            flags: spec.flags ?? {},
            isOwner: true,
            parent: actor,
          };
          // The same V13 semantics the statically-built stacks get. An embedded item is where tool
          // wear and breakage flags land, so a literal-key lookup here renders every tool pristine.
          item.getFlag = makeGetFlag(item);
          item.setFlag = makeSetFlag(item);
          installUpdateSemantics(item);
          installToObject(item);
          // A crafted or awarded stack is consumed by exactly the same engine branch as a seeded
          // one, so it needs the same self-removal. See {@link installDeleteSemantics}.
          installDeleteSemantics(item, actor);
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
    // Installed HERE rather than in `ownedItem`/`recipeItemCopy`, because an item can only remove
    // itself from a collection that exists — and the actor holding it is built after its items.
    for (const item of items) {
      item.parent = actor;
      installDeleteSemantics(item, actor);
    }
    const learned = LEARNED_RECIPES[definition.id];
    // `flags.fabricate.fabricate.learnedRecipes`, which is where production's dotted-top-level-key
    // `update` lands it after V13 expands the path — the same doubly-nested depth every Fabricate
    // read normalises to.
    if (learned)
      seedFabricateFlag(actor, ['fabricate', 'learnedRecipes'], structuredClone(learned));
    return actor;
  });
}

/**
 * Build the `fromUuid` index. This is not optional decoration.
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
    // A crafted output is a CLONE of the registered source item, taken through
    // `sourceItem.toObject()`. See {@link installToObject}.
    installToObject(document);
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
