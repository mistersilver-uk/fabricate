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
 * Foundry's `Document#toObject()`: a deep clone of the document's own source data.
 *
 * Load-bearing, not decoration. `CraftingEngine._createResultItem` and
 * `_restoreComponentItem` build a crafted output by cloning the component's REGISTERED
 * source item — `itemData = sourceItem.toObject()` — and `fromUuid` hands them a lab index
 * document. Without this the craft threw `sourceItem.toObject is not a function`, which the
 * engine swallowed into a generic "Something went wrong while crafting" notification: the
 * Craft button appeared to work, the right column never swapped to the run summary, and the
 * frame documented a UI that does nothing.
 *
 * The clone is what makes it safe as well as present. The engine mutates the returned data
 * (`itemData.system.quantity`, then `stampCraftedComponentIdentity`'s role flags), so handing
 * back the live index entry would let one craft rewrite the world's canonical item.
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
 *
 * Load-bearing, and the reason no bulk salvage run could complete in the lab before this.
 * `CraftingEngine._consumeComponentItems` BRANCHES on stack size — it reduces `system.quantity`
 * when it takes part of a stack and calls `item.delete()` when it takes all of one. Every
 * salvageable stack in this world is a single unit, so salvage always takes the delete branch,
 * and a duck-typed item without the method threw `item.delete is not a function` into the engine's
 * catch: every subject came back `outcome: 'error'` and the console errors failed the capture
 * gate. Crafting never surfaced it because Brenna holds her ingredients in quantity, so the update
 * branch covered her.
 *
 * The ALTERNATIVE was to raise one salvageable stack above a single unit, which dodges the branch
 * rather than implementing it — and the delete branch is the one a real ×1 salvage takes, so a lab
 * that cannot execute it cannot photograph the commonest case.
 *
 * It DELEGATES to the actor's own `deleteEmbeddedDocuments` rather than splicing itself out, so
 * the lab keeps ONE removal path. A stub that merely did not throw would be worse than the crash
 * it replaced: the run would report a salvage the still-populated listing contradicts, and the
 * frame would document a UI that consumed nothing.
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
  installToObject(item);
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
  installToObject(item);
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
    // The world's one BROKEN stack, and still salvageable — see {@link BROKEN_STACKS}.
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
    // The world's only WORKING routed salvage (`rw-slag` — Jewelry's routed config is the
    // misconfigured fixture). It was deliberately unstocked because a salvage config grows
    // a salvage panel in the inventory detail; it is stocked now because the bulk panel's
    // routed mode is otherwise unreachable and therefore unphotographable (issue 859).
    // Kept at ×2 so it reads as a real holding without disturbing any quantity assertion.
    'rw-slag': 2,
    // Its required tool. Without this the row is BLOCKED on `toolsUnavailable` rather than
    // queued, which is a different frame entirely — the tools-blocked case already owns that
    // one, and routed mode would have stayed unphotographable.
    'rw-tool-mallet': 1,
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
 * Stacks seeded BROKEN, per actor and by component id.
 *
 * ONE entry, and it exists because "broken AND salvageable" was unreachable in this world while
 * being the state the bulk panel argues hardest about: brokenness is about USABILITY and does not
 * gate salvage, so a broken row belongs in the queue beside its certainty chip and not in the
 * blocked list (`bulkBlockedReasonFor` omits `broken` deliberately). Nothing here was broken at
 * all — `ownedItem` builds every stack with `flags: {}`, and the only other source
 * (`InventoryListingBuilder._isToolBroken`'s `limitedUses` exhaustion) needs a `toolUsage` flag no
 * fixture seeded — so the card's whole broken presentation was unphotographed too.
 *
 * WHY THE FLAG AND NOT NEW SALVAGE CONFIG. The four tool-backed components (`sm-iron-ingot`,
 * `sm-steel-ingot`, `hb-mortar-dust`, `hb-empty-vial`) carry no salvage config, so seeding a flag
 * on a tool alone reaches a BLOCKED row, not a queued one; authoring salvage onto one of them
 * would change what those components are for on the four frames that use them as tools. Seeding
 * the flag on a stack that is already salvageable moves one fixture and nothing else.
 *
 * WHY THE LONGSWORD. Of the salvageable stacks Brenna holds it is the one named by the FEWEST
 * cases — one (`player-salvage-no-check`), against five for the Cracked Alembic and six for the
 * Air Shard, both of which are in the existing bulk selections and would have put a danger pill on
 * frames that are not about brokenness. Its salvage is also the clearer evidence: smithing authors
 * no salvage check, so the queue row carries a GUARANTEED chip beside the danger one and the frame
 * shows the two are independent. And a broken sword stripped for "Reclaimed stock" is what the
 * state is for.
 *
 * IT IS REACHABLE IN PRODUCTION, which is the bar a fixture has to clear. `Tool#applyUsage`'s
 * `flagBroken` action writes this flag on the ITEM it matched, and a tool may be registered by
 * item reference with no component at all (`componentId: null`, as all five Runework tools are) —
 * so a tool registered on the same item that backs a salvageable component breaks exactly this
 * way. The flag is seeded at production's own depth (`flags.fabricate.fabricate.toolBroken`, what
 * `setFabricateFlag`'s dotted update expands to), never at the shallower spelling, so the lab
 * cannot answer a depth bug from a copy production never writes.
 */
const BROKEN_STACKS = Object.freeze({
  'lab-actor-brenna': ['sm-longsword'],
});

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
 * The crafting actor's LEARNED side is deliberately narrow rather than empty: `lastCraftingActor`
 * is Brenna, and the player's recipe visibility for the knowledge-gated herbalism system is
 * evaluated against her learned set, so anything she learns appears in the player's crafting
 * listing. She learns exactly the two progressive recipes and nothing else — see
 * {@link LEARNED_RECIPES} for why the general prohibition was too coarse and what keeps the
 * already-captured crafting and journal frames unmoved.
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
  // The crafting actor learns EXACTLY the two progressive recipes and nothing else.
  //
  // This reverses an earlier blanket "never teach Brenna anything" rule, and the reason it was
  // written still holds — it was just too coarse. Herbalism is the world's only progressive system
  // and it is knowledge-gated, so the four progressive player frames are unreachable while the
  // crafting actor knows nothing; and `progressive` is a per-SYSTEM resolution mode, so no
  // globally-visible system can carry a progressive recipe without being a sixth system.
  //
  // What the old rule was protecting against was REFLOW: the player recipe browser sorts A→Z and
  // pages at twelve, so revealing a recipe named earlier than "Inscribe a Runeblade" pushes a row
  // off page one and breaks the eight cases that select a row by id with no search filter. Both
  // recipes named here sort after it, so page one is byte-identical and each is reached by its own
  // case's search step.
  //
  // `sourceItemUuid: null` is an AUTO-LEARN — the bottom rung of the source ladder, and the only
  // rung that adds no book. A learned entry sourced from a definition would also have to be
  // reachable from a held copy, which would add a row to the Books & Scrolls library and a second
  // one to Brenna's Knowledge recipe-items tab. This moves one thing: the learned-recipes tab
  // badge on the three frames that open the Knowledge surface on Brenna.
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
      type: 'character',
      // Iterated with `[...actor.items]` throughout the engine, so a plain array is enough.
      items,
      system: {
        currency: { gp: 45, sp: 12, cp: 30 },
        abilities: { int: { mod: 3 }, str: { mod: 2 } },
        // `.mod` ONLY, and only these two keys. Herbalism's check-modifier catalogue resolves
        // `@skills.med.mod` and `@skills.nat.mod`, and without them both fall to 0 — so the
        // `playerPicks` fieldset would photograph three interchangeable "+0" chips and prove
        // nothing about picking. Deliberately NOT `.value` and NOT `.total`: `skills.nat.value` is
        // what `hb-prereq-nature` gates on and `@skills.nat.total` / `@skills.sur.total` are the
        // gathering character modifiers, so adding either would flip a prerequisite chip or a
        // gathering modifier row on frames that have nothing to do with this.
        skills: { med: { mod: 4 }, nat: { mod: 2 } },
      },
      flags: {},
      isOwner: true,
      testUserPermission: () => true,
      // `checkRoll.js` and `checkModifierResolver.js` resolve `@`-expressions against this. A
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
    for (const item of items) installDeleteSemantics(item, actor);
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
