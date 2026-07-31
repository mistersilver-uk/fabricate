/**
 * The live smoke's execution-fixture seed, ported verbatim.
 *
 * COPIED, NOT WRITTEN. Every line below between the markers is lifted unchanged from
 * `scripts/foundry-test-run.mjs` — the block that seeds the smoke world's crafting systems,
 * components, recipes, tools and inventories through the real Fabricate API. Running it against the
 * View Lab's real facade reproduces the smoke's DATA exactly, which is what makes a frame-for-frame
 * comparison meaningful rather than approximate: the same systems, the same recipes, the same
 * quantities, the same names.
 *
 * It is a copy because `foundry-test-run.mjs` is a browser-context script that Node cannot import,
 * and this is the only part of it the lab needs. `tests/view-lab-smoke-seed-drift.test.js` pins the
 * copy to the original by digest, so the two cannot diverge silently.
 *
 * Source: scripts/foundry-test-run.mjs lines 2877-3861
 * Digest: 99434e6299035ad90aa835c819ca4df39c6c8dbd609892f1fb2942ac3b764fd0
 */

/** sha256 of the copied body, asserted against the harness by the drift test. */
export const SMOKE_SEED_DIGEST = '99434e6299035ad90aa835c819ca4df39c6c8dbd609892f1fb2942ac3b764fd0';

/**
 * Seed the smoke's crafting fixtures into the lab's live Fabricate facade.
 *
 * @param {{arcaneSystemId: string, mysticHerbComponentId: string, crafterId: string}} context
 *   The ids the smoke passes in from its earlier phases.
 * @returns {Promise<object>} Whatever the harness's seed returns (system and component ids).
 */
export async function seedSmokeExecutionFixtures({ arcaneSystemId, mysticHerbComponentId, crafterId }) {
  // ── BEGIN VERBATIM COPY ─────────────────────────────────────────────────────
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Execution fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // ── 1. World items ──────────────────────────────────────────────────────
    const worldSpecs = [
      // simple system
      { name: 'Smoke Plank', img: 'icons/commodities/wood/lumber-stack.webp' },
      { name: 'Smoke Crate', img: 'icons/containers/boxes/box-gift-white.webp' },
      { name: 'Smoke Mallet', img: 'icons/tools/hand/hammer-cobbler-steel.webp' },
      { name: 'Smoke Toy', img: 'icons/commodities/wood/blocks-cut-brown.webp' },
      { name: 'Smoke Chisel', img: 'icons/tools/hand/chisel-steel-brown.webp' },
      { name: 'Smoke Dowel', img: 'icons/commodities/wood/lumber-plank-brown.webp' },
      { name: 'Smoke Anvil', img: 'icons/tools/smithing/anvil.webp' },
      { name: 'Smoke Bracket', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Relic', img: 'icons/commodities/treasure/crown-gold-laurel-wreath.webp' },
      { name: 'Smoke Shard', img: 'icons/commodities/gems/gem-fragments-red.webp' },
      // Issue 777: the required-tools salvage subject (see the salvage config below).
      { name: 'Smoke Toolchest', img: 'icons/containers/chest/chest-wooden-tied-white.webp' },
      // simple system — multi-option ingredient recipe (issue #552): two
      // interchangeable coil components the crafter holds + the woven result.
      { name: 'Smoke Copper Coil', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Bronze Coil', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Filigree', img: 'icons/commodities/metal/ingot-gold.webp' },
      // simple system — the requirement-rail / shared essence pool fixtures (issue 917).
      // Before this the world seeded ZERO essence-carrying components, so every essence
      // frame photographed `have: 0` and a shared pool could not be shot at all.
      //
      // Two DUAL-essence carriers plus one single-essence contrast carrier fund the pool.
      // Their per-unit yields (set below, after the essence library exists) are chosen so
      // the two-requirement recipe is CONTENDED: `Smoke Tide Essence` can only be met by
      // spending BOTH duals, which under the old per-group disjoint draw would leave the
      // Star requirement short — so the frame proves D-ESS joint crediting rather than
      // showing two trivially-met bars.
      { name: 'Smoke Duskcrystal', img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp' },
      { name: 'Smoke Tidebloom', img: 'icons/commodities/flowers/lotus-white.webp' },
      { name: 'Smoke Starmote', img: 'icons/commodities/materials/bowl-powder-teal.webp' },
      // The FIXED (non-selectable) requirement every new rail recipe opens with, so each
      // rail frame shows a met fixed tile beside the states actually under test. It is a
      // dedicated component rather than a reused plank so the plank budget the execution
      // asserts spend down (5 planks, exactly consumed) is not disturbed.
      { name: 'Smoke Runeplate', img: 'icons/commodities/metal/ingot-stack-steel.webp' },
      // routedByIngredients system
      { name: 'Smoke Ingot A', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Ingot B', img: 'icons/commodities/metal/ingot-gold.webp' },
      { name: 'Smoke Ring', img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp' },
      { name: 'Smoke Amulet', img: 'icons/equipment/neck/amulet-round-engraved-gold.webp' },
      // routedByCheck system
      { name: 'Smoke Bar', img: 'icons/commodities/metal/ingot-plain-steel.webp' },
      { name: 'Smoke Masterwork Blade', img: 'icons/weapons/swords/sword-guard-blue.webp' },
      { name: 'Smoke Standard Blade', img: 'icons/weapons/swords/greatsword-blue.webp' },
      // progressive system — THREE result stages with DISTINCT difficulties (issue 651).
      // Distinct is the point: the player stage list shows a cumulative "Reached at >=N"
      // per row, and equal difficulties would make a carried/stale threshold invisible.
      // The long name is deliberate — it is the stacked frame's ellipsis subject.
      { name: 'Smoke Clay', img: 'icons/commodities/stone/clay-grey.webp' },
      // Issue 675: the progressive-salvage subject. Breaking it down spends ONE roll
      // down the same three stages the progressive craft awards, so its reorderable
      // stage list is the player salvage surface's headline frame.
      { name: 'Smoke Cracked Amphora', img: 'icons/containers/kitchenware/vase-clay-painted-blue-gold.webp' },
      { name: 'Smoke Brick', img: 'icons/commodities/stone/masonry-bricks-brown.webp' },
      { name: 'Smoke Kiln-Fired Ceramic Roofing Tile', img: 'icons/commodities/stone/paver-tile-blue.webp' },
      { name: 'Smoke Glazed Amphora', img: 'icons/containers/kitchenware/jug-clay-brown.webp' },
      // Issue 766: ONE physical world item registered as a salvageable component in TWO
      // crafting systems (the simple forge and the progressive forge). A single crafter
      // copy of it must collapse to ONE inventory card carrying a system selector — the
      // reported "same item shows twice, once per system" defect and its fix.
      { name: 'Smoke Air Shard', img: 'icons/commodities/gems/pearl-turquoise.webp' }
    ];
    const createdItems = await Item.createDocuments(
      worldSpecs.map((s) => ({ name: s.name, type: itemType, img: s.img }))
    );
    const world = {};
    for (const item of createdItems) world[item.name] = item;
    const executionItemIds = createdItems.map((i) => i.id);

    // Register a set of world items as managed components on a system, giving
    // each the supplied difficulty (progressive result awarding needs difficulty
    // >= 1; it is inert for the other modes).
    const registerComponents = async (systemId, names, difficulty = 1) => {
      const map = {};
      for (const name of names) {
        const result = await csm.addItemFromUuid(systemId, world[name].uuid);
        map[name] = result.item.id;
        await csm.updateItem(systemId, map[name], { difficulty });
      }
      return map;
    };

    // Inventory copies matched to the managed component by `flags.core.sourceId`.
    const invCopies = (name, qty, extraFabricateFlags = null) =>
      Array.from({ length: qty }, () => ({
        name: world[name].name,
        type: world[name].type,
        img: world[name].img,
        flags: {
          core: { sourceId: world[name].uuid },
          ...(extraFabricateFlags ? { fabricate: extraFabricateFlags } : {})
        }
      }));

    // ── 2. SIMPLE system (+ breakage / limitedUses / negative-gating / salvage) ─
    const simpleSystem = await csm.createSystem({
      name: 'Smoke Simple Forge',
      description: 'Issue #489: simple-mode crafts, tool breakage, and salvage execution coverage.'
    });
    const simpleSystemId = simpleSystem.id;
    const simpleMap = await registerComponents(simpleSystemId, [
      'Smoke Plank', 'Smoke Crate', 'Smoke Mallet', 'Smoke Toy',
      'Smoke Chisel', 'Smoke Dowel', 'Smoke Anvil', 'Smoke Bracket',
      'Smoke Relic', 'Smoke Shard',
      // Issue 777: the required-tools salvage subject — salvaging it needs the Mallet
      // (which the crafter holds) and the Anvil (which it does not), so the player-salvage-
      // tools frame shows one available and one unavailable required-tool row.
      'Smoke Toolchest',
      // Multi-option ingredient recipe (issue #552) components.
      'Smoke Copper Coil', 'Smoke Bronze Coil', 'Smoke Filigree',
      // Issue 917: the shared essence pool's carriers + the fixed rail requirement.
      'Smoke Duskcrystal', 'Smoke Tidebloom', 'Smoke Starmote', 'Smoke Runeplate',
      // Issue 766: also registered in the progressive forge below — one physical stack,
      // two systems, one collapsed card.
      'Smoke Air Shard'
    ]);
    // Issue 766: Smoke Air Shard salvage in the SIMPLE forge (simple mode, yields Smoke
    // Shard). Its progressive-forge participation (below) salvages differently, so the
    // collapsed card's two participations carry genuinely distinct salvage surfaces.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-simple-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-simple-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
          }
        ]
      }
    });
    const malletToolId = 'smoke-mallet-tool';
    const chiselToolId = 'smoke-chisel-tool';
    const anvilToolId = 'smoke-anvil-tool';
    const chiselMaxUses = 2;
    await csm.updateSystem(simpleSystemId, {
      resolutionMode: 'simple',
      salvageResolutionMode: 'simple',
      // Issue 765: unlock explicit multi-step authoring so the simple system can host
      // a stepped recipe (the player-crafting-multistep screenshot subject).
      features: { multiStepRecipes: true, essences: true },
      // Issue 917: authored tag vocabulary for 'Smoke Sigil Etching' (acceptance
      // criterion 5). `_validateTagPlaceholders` rejects a recipe whose tag match
      // names anything outside `system.itemTags`, so the tag must be registered here
      // for the recipe to persist at all. No component registered in this system is
      // ever given this tag, so the requirement stays authored-but-unmatched — the
      // whole point of the fixture.
      itemTags: ['smoke-voidbound'],
      // Three authored essences (issue 917). `colorToken` is a BARE `--fab-tag-*` key —
      // never a hex and never the `--fab-tag-` prefix — because the normalizer strips the
      // prefix and every tinted surface composes `var(--fab-tag-<token>)` itself. Two
      // distinct tokens are what make the shared-pool frame legible: each meter, glyph and
      // contribution chip carries its own tint, so a reader can tell which carrier unit
      // funded which requirement.
      essenceDefinitions: [
        {
          id: 'smoke-star-essence',
          name: 'Smoke Star Essence',
          description: 'Distinctive authored essence icon fixture for player Crafting evidence.',
          icon: 'fas fa-star-of-life',
          colorToken: 'butter'
        },
        {
          id: 'smoke-tide-essence',
          name: 'Smoke Tide Essence',
          description: 'Second authored essence: the shared-pool frame needs two tints to read.',
          icon: 'fas fa-water',
          colorToken: 'lavender'
        },
        {
          // Deliberately carried by NOTHING in the world. It is the only way to shoot a
          // zero-delivered (danger) essence tile at rest: a carried essence always ends up
          // partly delivered, because the resolver's suggestion allocates every carrier it
          // can, and clearing the whole allocation makes the store fall back to that same
          // suggestion (an empty map re-reads the baked craftability).
          id: 'smoke-ember-essence',
          name: 'Smoke Ember Essence',
          description: 'Authored essence with no carrier in the world — the short-tile fixture.',
          icon: 'fas fa-fire',
          colorToken: 'rose'
        }
      ],
      tools: [
        {
          // Always breaks (rng()*100 ∈ [0,100) < 100) → deterministic breakageChance break.
          id: malletToolId,
          label: 'Smoke Mallet',
          enabled: true,
          componentId: simpleMap['Smoke Mallet'],
          breakage: { mode: 'breakageChance', breakageChance: 100 },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // limitedUses: applyUsage increments FIRST, then evaluateBreakage compares
          // post-increment `timesUsed >= maxUses`. The assertion crafts this recipe
          // `maxUses` (2) times — the first craft (timesUsed 1 < 2) does NOT break,
          // the second (timesUsed 2 >= 2) crosses the threshold and breaks. This
          // "craft maxUses times" variant avoids pre-seeding the double-nested
          // `flags.fabricate.fabricate.toolUsage` accessor from item-creation data.
          id: chiselToolId,
          label: 'Smoke Chisel',
          enabled: true,
          componentId: simpleMap['Smoke Chisel'],
          breakage: { mode: 'limitedUses', maxUses: chiselMaxUses },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // Required by the negative-gating recipe; the crafter never holds it.
          id: anvilToolId,
          label: 'Smoke Anvil',
          enabled: true,
          componentId: simpleMap['Smoke Anvil'],
          breakage: { mode: 'immune' },
          onBreak: { mode: 'flagBroken' }
        }
      ]
    });
    // Issue 917: per-unit essence yields on the pool's carriers. This MUST run after the
    // `essenceDefinitions` write above — `_normalizeComponent` filters the map against the
    // system's `validEssenceIds`, so an id authored before its definition exists is
    // silently dropped. `essences` on the managed COMPONENT is the field the resolver
    // reads (`resolveItemEssences` falls back to it for every inventory copy matched by
    // `flags.core.sourceId`), so no per-item essence flag is seeded: the flag path is read
    // through `getFabricateFlag(item, 'essences')`, which resolves the DOUBLE-nested
    // `flags.fabricate.fabricate.essences`, and a single-nested seed would be a silent
    // no-op.
    //
    // The numbers are the fixture's whole point. Against `Smoke Tidecore Tempering`
    // (Star 2 + Tide 3 in ONE set) the only Tide sources are the two duals, totalling
    // exactly 3 — so a disjoint per-group draw spends both on Tide and leaves Star with
    // just the Starmote's 1 of the 2 it needs (infeasible), while the block's joint
    // crediting funds both from the same two units (feasible). The contended pool is what
    // the `-essence-pool-shared` frame photographs.
    const simpleCarrierEssences = {
      'Smoke Duskcrystal': { 'smoke-star-essence': 2, 'smoke-tide-essence': 2 },
      'Smoke Tidebloom': { 'smoke-star-essence': 1, 'smoke-tide-essence': 1 },
      // The single-essence contrast row: one tinted contribution chip beside the duals' two.
      'Smoke Starmote': { 'smoke-star-essence': 1 }
    };
    for (const [name, essences] of Object.entries(simpleCarrierEssences)) {
      await csm.updateItem(simpleSystemId, simpleMap[name], { essences });
    }

    // Salvage config on Smoke Relic: simple mode (deterministic success, no
    // timeRequirement, no tools) → exactly one result group per validateSalvage.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Relic'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{
          id: 'smoke-relic-parts',
          name: 'Salvaged Parts',
          results: [{ id: 'smoke-shard-result', componentId: simpleMap['Smoke Shard'], quantity: 2 }]
        }]
      }
    });
    // Issue 777: required-tools salvage subject. Simple no-check salvage (same shape as
    // Smoke Relic) with `toolIds` naming two library tools — the Mallet the crafter holds
    // (available) and the Anvil it does not (unavailable) — so the player-salvage-tools
    // frame shows both availability states and the disabled pre-roll action in one panel.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Toolchest'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        toolIds: [malletToolId, anvilToolId],
        resultGroups: [{
          id: 'smoke-toolchest-parts',
          name: 'Reclaimed Parts',
          results: [{ id: 'smoke-toolchest-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
        }]
      }
    });

    const simpleRecipe = await rm.createRecipe({
      name: 'Smoke Assemble Crate',
      description: 'Simple-mode craft: one ingredient set, one result group.',
      craftingSystemId: simpleSystemId,
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Crate',
        results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }]
      }]
    });
    const breakageRecipe = await rm.createRecipe({
      name: 'Smoke Carve Toy',
      description: 'Simple-mode craft whose breakageChance tool always breaks.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/blocks-cut-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Toy', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });
    await rm.updateRecipe(breakageRecipe.id, { toolIds: [malletToolId] });
    const limitedUsesRecipe = await rm.createRecipe({
      name: 'Smoke Turn Dowel',
      description: 'Simple-mode craft whose limitedUses tool breaks at its maxUses threshold.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/lumber-plank-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
    });
    await rm.updateRecipe(limitedUsesRecipe.id, { toolIds: [chiselToolId] });
    const negativeToolRecipe = await rm.createRecipe({
      name: 'Smoke Bend Bracket',
      description: 'Simple-mode craft requiring a tool the crafter does not hold (negative gating).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/fragments-steel-barbed.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Bracket', results: [{ componentId: simpleMap['Smoke Bracket'], quantity: 1 }] }]
    });
    await rm.updateRecipe(negativeToolRecipe.id, { toolIds: [anvilToolId] });

    // Multi-option ingredient recipe (issue #552): a component OR authored essence
    // choice. The held component keeps the recipe selectable while the essence option
    // deterministically exercises its distinctive authored glyph.
    const multiOptionRecipe = await rm.createRecipe({
      name: 'Smoke Weave Filigree',
      description: 'Simple-mode craft with one component-or-essence ingredient choice (issue #552).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/ingot-gold.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-coil-choice',
          name: 'Coil',
          options: [
            { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Copper Coil'] } },
            { quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }
          ]
        }]
      }],
      resultGroups: [{
        name: 'Filigree',
        results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }]
      }]
    });

    await rm.createRecipe({
      name: 'Smoke Legacy Essence Seal',
      description: 'Legacy set-level essence requirement with an authored icon.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }],
        essences: { 'smoke-star-essence': 2 }
      }],
      resultGroups: [{ name: 'Seal', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    await rm.createRecipe({
      name: 'Smoke First-Class Essence Draught',
      description: 'First-class essence ingredient and shopping-list shortage fixture.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-star-essence-group',
          name: 'Star Essence',
          // 6, not the pre-917 3: the world now HOLDS 4 Star (2 + 1 + 1 across the three
          // carriers), and a need of 3 would clear the shopping-list shortage this recipe
          // is also the fixture for — `player-crafting-essence-shopping` waits on an
          // acquire row that would then never render. 6 keeps the shortage AND makes this
          // the single-requirement pool frame: a partly-funded meter with real numbers
          // instead of the 0/3 every essence frame photographed before.
          options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 6 } }]
        }]
      }],
      resultGroups: [{ name: 'Draught', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });

    // ── Issue 917 requirement-rail fixtures ─────────────────────────────────
    // Three recipes, each authored for ONE rendered state the redesign has to prove and
    // that no existing fixture can reach. All are display-only: no execution assert
    // crafts them, and none is craftable, so they add no consumption anywhere.
    //
    // THE NAMES ARE LOAD-BEARING. The player recipe browser sorts A→Z and pages at 12,
    // and the walk's mode-based selection (`selectCraftingRecipeByMode`) only iterates the
    // rows currently in the DOM — i.e. page one. Page one presently ends at 'Smoke Carve
    // Toy', so a fixture named 'Smoke Bind…' or 'Smoke Etch…' would displace it and
    // silently re-point `player-crafting-ingredient-routed`, `-routed-by-check` and the
    // craft that produces `-run-summary`/`-roll-result` at an UNCRAFTABLE display fixture.
    // These three names sort at positions ~20-22, so page one is unchanged. Every capture
    // below reaches its recipe through the browser SEARCH, which collapses the list to one
    // row, so their own page position never matters.

    // (1) The rail's three states in one frame. Author order is load-bearing — the rail
    // auto-advances to the FIRST unsatisfied openable slot, so the choice group must
    // precede the essence group for the alternatives chooser (rather than the pool) to be
    // the one open chooser in the shot.
    await rm.createRecipe({
      name: 'Smoke Runestaff Binding',
      description: 'Requirement rail: a met fixed slot, an unchosen choice slot, and a short essence slot.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
      ingredientSets: [{
        id: 'smoke-rail-set',
        ingredientGroups: [
          {
            id: 'smoke-rail-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            // Two alternatives the crafter holds NEITHER of. An untouched choice whose
            // group already resolves satisfied renders MET, so an unaffordable pair is the
            // only way to shoot the "unchosen → accent, never danger" state.
            id: 'smoke-rail-binding',
            name: 'Binding',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          },
          {
            id: 'smoke-rail-ember',
            name: 'Ember Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-ember-essence', amount: 4 } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Runestaff', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (2) The shared pool. TWO essence requirements in ONE set (sibling groups, each a
    // single essence option) beside a fixed group, so the same selection also supplies the
    // consumption-plan frame: a fixed row, an essence-carrier row and a "still to choose"
    // line, all at once.
    //
    // Issue 917 review: `player-crafting-consumption-plan` and `player-crafting-essence-
    // pool-shared` were captured on this SAME recipe at the SAME store state, differing
    // only by `scrollIntoViewIfNeeded` — a no-op frame if the plan panel is already in
    // view at the capture size. `smoke-shared-fitting` is an unaffordable pair (neither
    // option held, same pattern as `smoke-rail-binding` above), so it stays PARTIAL —
    // "unchosen" — for the life of both captures. It never contributes a plan row (an
    // untouched choice contributes only to `pending`), so it does not disturb the
    // existing `rows`/`carrierRows` assertions below, but it DOES put a non-essence
    // requirement on the consumption plan's "still to choose" line — evidence the
    // essence-pool panel (which shows only essence carriers) never renders at all. (The
    // tile reports its CHOSEN OPTION's name there, not the authored group label, so the
    // pending line names 'Smoke Anvil' rather than 'Fitting' — verified against a live
    // run.) That is what makes the two frames prove different things instead of the same
    // state twice.
    await rm.createRecipe({
      name: 'Smoke Tidecore Tempering',
      description: 'Shared essence pool: two requirements in one set funded jointly from dual carriers.',
      craftingSystemId: simpleSystemId,
      img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
      ingredientSets: [{
        id: 'smoke-shared-pool-set',
        ingredientGroups: [
          {
            id: 'smoke-shared-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-shared-star',
            name: 'Star Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }]
          },
          {
            id: 'smoke-shared-tide',
            name: 'Tide Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-tide-essence', amount: 3 } }]
          },
          {
            id: 'smoke-shared-fitting',
            name: 'Fitting',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          }
        ]
      }],
      resultGroups: [{ name: 'Tidecore', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (3) The item-bag defect (acceptance criterion 5). The tag names nothing any seeded
    // component carries, so the tile has no inventory item to borrow an image from and
    // must render its glyph. Both of this set's groups are single-option and
    // non-essence, so the rail offers NO openable slot at all — which is also the only
    // fixture in the world that photographs the rail with every chooser closed.
    await rm.createRecipe({
      name: 'Smoke Sigil Etching',
      description: 'Tag requirement with nothing matching in inventory: the tile must render a glyph, not the item bag.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
      ingredientSets: [{
        id: 'smoke-tag-unmatched-set',
        ingredientGroups: [
          {
            id: 'smoke-tag-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-tag-voidbound',
            name: 'Voidbound Reagent',
            options: [{ quantity: 1, match: { type: 'tags', tags: ['smoke-voidbound'], tagMatch: 'any' } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Sigil', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // Explicit multi-step simple recipe (issue 765): the reported defect. Its sets
    // live on steps[] with empty top-level arrays, so the step-aware listing
    // projection must surface each step's materials, evaluate the first step's
    // craftability, and resolve PRODUCES from the TERMINAL step. Checks stay off
    // (the simple system has no authored formula), so no check card renders — the
    // player-crafting-multistep screenshot subject. Additive: no execution assert
    // consumes it. Step 1 consumes held planks (craftable/available); step 2's
    // dowel is the intermediate, and the final product is the crate.
    const multiStepRecipe = await rm.createRecipe({
      name: 'Smoke Raise Tent',
      description:
        'Simple-mode multi-step craft (issue #765): step 1 cuts planks, step 2 raises the frame.',
      craftingSystemId: simpleSystemId,
      // A Foundry core raster already exercised by this fixture (the crate world item)
      // so the recipe thumbnail never 404s in the capture.
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [],
      resultGroups: [],
      steps: [
        {
          name: 'Cut Planks',
          timeRequirement: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Plank',
              options: [{ quantity: 2, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
            }]
          }],
          resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
        },
        {
          name: 'Raise Frame',
          timeRequirement: { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Dowel',
              options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Dowel'] } }]
            }]
          }],
          resultGroups: [{ name: 'Crate', results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }] }]
        }
      ]
    });

    // ── 3. ROUTED-BY-INGREDIENTS system (multi-set → differing groups) ──────
    const ingredientRouterSystem = await csm.createSystem({
      name: 'Smoke Ingredient Router',
      description: 'Issue #489: routedByIngredients multi-set routing coverage.'
    });
    const ingredientRouterSystemId = ingredientRouterSystem.id;
    const routerMap = await registerComponents(ingredientRouterSystemId, [
      'Smoke Ingot A', 'Smoke Ingot B', 'Smoke Ring', 'Smoke Amulet'
    ]);
    await csm.updateSystem(ingredientRouterSystemId, { resolutionMode: 'routedByIngredients' });
    const setAId = 'smoke-set-a';
    const setBId = 'smoke-set-b';
    const ringGroupId = 'smoke-group-ring';
    const amuletGroupId = 'smoke-group-amulet';
    const ingredientRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Cast Jewelry',
      description: 'routedByIngredients: each ingredient set maps to a different result group.',
      craftingSystemId: ingredientRouterSystemId,
      img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp',
      complex: true,
      ingredientSets: [
        {
          id: setAId,
          name: 'Silver route',
          resultGroupId: ringGroupId,
          ingredientGroups: [{
            name: 'Ingot A',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot A'] } }]
          }]
        },
        {
          id: setBId,
          name: 'Gold route',
          resultGroupId: amuletGroupId,
          ingredientGroups: [{
            name: 'Ingot B',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot B'] } }]
          }]
        }
      ],
      resultGroups: [
        { id: ringGroupId, name: 'Ring', results: [{ componentId: routerMap['Smoke Ring'], quantity: 1 }] },
        { id: amuletGroupId, name: 'Amulet', results: [{ componentId: routerMap['Smoke Amulet'], quantity: 1 }] }
      ]
    });

    // ── 4. ROUTED-BY-CHECK system (multi-group → different tiers) ───────────
    const checkRouterSystem = await csm.createSystem({
      name: 'Smoke Check Router',
      description: 'Issue #489: routedByCheck multi-group tier routing coverage.'
    });
    const checkRouterSystemId = checkRouterSystem.id;
    const checkMap = await registerComponents(checkRouterSystemId, [
      'Smoke Bar', 'Smoke Masterwork Blade', 'Smoke Standard Blade'
    ]);
    await csm.updateSystem(checkRouterSystemId, {
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          // 1d20 + 20 (21-40) vs dc 12 always meets Masterwork (dc 5) → deterministic tier.
          rollFormula: '1d20 + 20',
          dc: 12,
          thresholdMode: 'meet',
          relativeOutcomes: [
            { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
            { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
            { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
          ]
        }
      }
    });
    const masterGroupId = 'smoke-group-master';
    const standardGroupId = 'smoke-group-standard';
    const checkRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Forge Blade',
      description: 'routedByCheck: two result groups mapped to different outcome tiers.',
      craftingSystemId: checkRouterSystemId,
      img: 'icons/weapons/swords/sword-guard-blue.webp',
      complex: true,
      ingredientSets: [{
        name: 'Stock',
        ingredientGroups: [{
          name: 'Bar',
          options: [{ quantity: 1, match: { type: 'component', componentId: checkMap['Smoke Bar'] } }]
        }]
      }],
      resultGroups: [
        {
          id: masterGroupId,
          name: 'Masterwork Blade',
          checkOutcomeIds: ['craft-masterwork'],
          results: [{ componentId: checkMap['Smoke Masterwork Blade'], quantity: 1 }]
        },
        {
          id: standardGroupId,
          name: 'Standard Blade',
          checkOutcomeIds: ['craft-standard'],
          results: [{ componentId: checkMap['Smoke Standard Blade'], quantity: 1 }]
        }
      ]
    });

    // ── 5. PROGRESSIVE system (single deterministic advance) ────────────────
    const progressiveSystem = await csm.createSystem({
      name: 'Smoke Progressive Forge',
      description: 'Issue #489: progressive budget-vs-difficulty completion coverage.'
    });
    const progressiveSystemId = progressiveSystem.id;
    const progressiveMap = await registerComponents(
      progressiveSystemId,
      [
        'Smoke Clay',
        'Smoke Brick',
        'Smoke Kiln-Fired Ceramic Roofing Tile',
        'Smoke Glazed Amphora',
        // Issue 675: the ONLY progressive-salvage fixture in the repo. Before it there
        // was none anywhere — `Smoke Relic` is a SIMPLE-mode salvage with no check
        // formula (so it renders the no-check body) and `Iron Ore` is seeded for the
        // component EDITOR, not player inventory — so the player salvage surface's
        // headline feature, the reorderable stage list, had no capturable frame.
        'Smoke Cracked Amphora',
        // Issue 766: the SAME world item already registered in the simple forge — so one
        // owned copy resolves to a component in both systems and collapses to one card.
        'Smoke Air Shard'
      ],
      1
    );
    // `registerComponents` applies ONE difficulty to every name, so re-stamp the three
    // result stages individually. Difficulties 1/4/9 give ascending `equal`-mode
    // thresholds of >=1, >=5, >=14 — far enough apart that a wrong (e.g. carried) value
    // is obvious in a screenshot without knowing the fixture.
    const progressiveStageDifficulty = {
      'Smoke Brick': 1,
      'Smoke Kiln-Fired Ceramic Roofing Tile': 4,
      'Smoke Glazed Amphora': 9
    };
    for (const [name, difficulty] of Object.entries(progressiveStageDifficulty)) {
      await csm.updateItem(progressiveSystemId, progressiveMap[name], { difficulty });
    }
    const progressiveStageResults = [
      { id: 'smoke-brick-result', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
      { id: 'smoke-tile-result', componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'], quantity: 1 },
      { id: 'smoke-amphora-result', componentId: progressiveMap['Smoke Glazed Amphora'], quantity: 1 }
    ];
    await csm.updateSystem(progressiveSystemId, {
      resolutionMode: 'progressive',
      features: { craftingChecks: true },
      craftingCheck: {
        enabled: true,
        // 1d20 + 20 budget (21-40) far exceeds the Smoke Brick difficulty (1) so a
        // single advance awards it (progressive is budget-vs-difficulty, not tiered).
        progressive: { rollFormula: '1d20 + 20', awardMode: 'equal' }
      },
      // Issue 675 — SALVAGE'S OWN mode and check block, authored independently of the
      // recipe's above. This is exactly the pair a projection that read `craftingCheck`
      // instead of `salvageCraftingCheck` would confuse: the award modes differ
      // (`partial` vs `equal`), so a wrong read renders visibly wrong thresholds.
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: {
        enabled: true,
        progressive: { rollFormula: '1d20 + 6', awardMode: 'partial' }
      }
    });
    // Progressive salvage on Smoke Cracked Amphora: one roll spent down the SAME three
    // stages (difficulties 1 / 4 / 9), authored in ascending order so a player reorder
    // visibly changes the "Reached at >=N" badges.
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Cracked Amphora'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        // Left at its default TRUE so the player CAN reorder: this fixture exists to
        // capture the reorder affordances, which `false` would (correctly) remove.
        allowPlayerResultReorder: true,
        resultGroups: [
          {
            id: 'smoke-amphora-salvage',
            name: 'Amphora Fragments',
            results: [
              { id: 'smoke-salvage-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
              {
                id: 'smoke-salvage-tile',
                componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'],
                quantity: 1
              },
              {
                id: 'smoke-salvage-amphora',
                componentId: progressiveMap['Smoke Glazed Amphora'],
                quantity: 1
              }
            ]
          }
        ]
      }
    });
    // Issue 766: Smoke Air Shard salvage in the PROGRESSIVE forge (simple mode here for a
    // deterministic capture, yielding Smoke Brick). Its simple-forge participation yields
    // Smoke Shard — so the collapsed card's System selector switches between two genuinely
    // different salvage surfaces, proving the whole body re-scopes to the chosen system.
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-prog-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-prog-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 }]
          }
        ]
      }
    });
    const progressiveRecipe = await rm.createRecipe({
      name: 'Smoke Mold Brick',
      description: 'progressive: one low-difficulty result awarded in a single advance.',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/masonry-bricks-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brick',
        results: progressiveStageResults
      }]
    });

    // Flag-OFF sibling (issue 651): the same three stages with the GM's reorder
    // permission withheld, so the player stage list renders its fixed state (no grips,
    // no move buttons, ordinals + difficulty retained, "Order set by the GM" line).
    // Default-true means the ONLY way to shoot that state is to author an explicit false.
    await rm.createRecipe({
      name: 'Smoke Kiln Firing',
      description: 'progressive: stage order fixed by the GM (allowPlayerResultReorder: false).',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/paver-tile-blue.webp',
      allowPlayerResultReorder: false,
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Fired ware',
        results: progressiveStageResults
      }]
    });

    // ── 6. Crafter inventory top-up ─────────────────────────────────────────
    await crafter.createEmbeddedDocuments('Item', [
      ...invCopies('Smoke Plank', 5),                 // simple(1) + breakage(1) + limitedUses(2) crafts; negative consumes none
      ...invCopies('Smoke Mallet', 1),                // breakageChance tool
      ...invCopies('Smoke Chisel', 1),                // limitedUses tool (broken by crafting maxUses times)
      // TWO copies (issue 675), not one. The always-run `exec-salvage-run` step calls
      // engine.salvage() on this and CONSUMES a copy, and it runs in a different
      // Playwright phase from the player-app capture — so ordering the capture ahead of
      // it is not viable. With one copy the Inventory tab has no salvageable row left to
      // photograph. That step asserts only `result.success`, `results != null` and
      // `shardAfter > shardBefore`, and nothing repo-wide counts Smoke Relic, so a second
      // copy is inert. The player-salvage capture below does NOT commit a salvage; if it
      // ever does, this must become 3.
      ...invCopies('Smoke Relic', 2),                 // salvageable component
      ...invCopies('Smoke Toolchest', 1),             // issue 777: required-tools salvage subject
      ...invCopies('Smoke Copper Coil', 1),           // multi-option recipe alternative A (#552)
      ...invCopies('Smoke Bronze Coil', 1),           // multi-option recipe alternative B (#552)
      // Issue 917 — the shared essence pool's ledger, in DELIBERATE quantities. One unit
      // of each carrier: `_initialRemaining` keys the ledger by item and reads
      // `system.quantity`, so N copies would render N identically-named carrier rows
      // rather than one row of N. With Star 2/Tide 2 + Star 1/Tide 1 + Star 1 the world
      // holds Star 4 and Tide 3 — exactly the Tide the two-requirement recipe needs, which
      // is what makes its pool contended rather than comfortably over-funded.
      ...invCopies('Smoke Duskcrystal', 1),           // dual carrier (Star 2, Tide 2)
      ...invCopies('Smoke Tidebloom', 1),             // dual carrier (Star 1, Tide 1)
      ...invCopies('Smoke Starmote', 1),              // single-essence contrast carrier (Star 1)
      // TWO, so the fixed rail tile reads "owned 2, spends 1" in the consumption plan
      // rather than a degenerate 1-of-1.
      ...invCopies('Smoke Runeplate', 2),             // the fixed requirement of every rail fixture
      ...invCopies('Smoke Ingot A', 1),               // routedByIngredients set A
      ...invCopies('Smoke Ingot B', 1),               // routedByIngredients set B (asserted NOT produced)
      ...invCopies('Smoke Bar', 1),                   // routedByCheck stock
      ...invCopies('Smoke Clay', 1),                  // progressive stock
      ...invCopies('Smoke Cracked Amphora', 1),       // progressive-salvage subject (#675)
      // Issue 766: ONE physical copy registered in BOTH forges. It must collapse to a
      // SINGLE card (quantity ×1, counted once — never ×2) with a system selector.
      ...invCopies('Smoke Air Shard', 1)              // multi-system collapse subject (#766)
    ]);

    // ── 7. Always-run guaranteed-success gather (Arcane Forge, scene-less) ──
    // A dropRate:100 d100 task under a scene-less manual environment so the
    // rc/ci gather-inventory-delta assertion via startGatheringAttempt is
    // deterministic (no scene gate, no tool gate, no roll prompt).
    const rcGatherTaskId = 'smoke-rc-forage';
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.systems = config.systems || {};
    const arcaneConfig = config.systems[arcaneSystemId] || {};
    const existingTasks = Array.isArray(arcaneConfig.tasks) ? arcaneConfig.tasks : [];
    config.systems[arcaneSystemId] = {
      ...arcaneConfig,
      tasks: [
        ...existingTasks.filter((task) => task?.id !== rcGatherTaskId),
        {
          id: rcGatherTaskId,
          name: 'Smoke RC Forage',
          description: 'Guaranteed-drop forage for the rc/ci gather-delta assertion.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
          enabled: true,
          // No weather/timeOfDay constraints (like the meadowlands library tasks):
          // the direct start path does not apply CONDITIONS_BLOCKED, and leaving them
          // off keeps this "guaranteed-success" task honestly unconditional.
          region: 'northreach',
          biomes: ['forest'],
          itemSelectionMode: 'highestRankedDrop',
          dropRows: [{
            id: 'smoke-rc-drop',
            componentId: mysticHerbComponentId,
            quantity: 1,
            dropRate: 100,
            enabled: true
          }]
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    // rc/ci gather env: MANUAL composition force-includes ONLY the guaranteed task
    // and NO events, so the always-run inventory-delta assertion cannot be
    // perturbed by a hazardous event flipping the outcome.
    const rcGatherEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke RC Meadow',
      description: 'Scene-less guaranteed-success environment for the rc/ci gather-delta assertion.',
      img: 'icons/consumables/plants/grass-leaves-green.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      compositionMode: 'manual',
      region: 'northreach',
      biomes: ['forest'],
      forcedTaskIds: [rcGatherTaskId]
    });
    // Full-profile hazard env: AUTOMATIC composition + matching region/biome, so it
    // composes BOTH the guaranteed task and the seeded hazardous smoke-bramble-event.
    // The env MUST carry a hazardous danger level: automatic event composition only
    // includes events up to the env's danger rank (evaluateDangerField:
    // eventRank <= dangerRank(envLevel)), so a default 'safe' env would never compose
    // the hazardous (rank 2) event — mirroring the Azure Grove fixture's dangerTags.
    // Scene-less so a headless GM can attempt it (Azure Grove's sceneUuid gate blocks
    // every viewer). The hazard assertion forces the event dropRate to 100 to fire.
    const hazardEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke Hazard Grove',
      description: 'Scene-less environment that composes the hazardous Bramble Snare event for #489.',
      img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      region: 'northreach',
      biomes: ['forest'],
      dangerTags: ['hazardous'],
      eventPolicy: 'successWithEvent',
      eventSelectionMode: 'highestRankedDrop'
    });

    return {
      executionItemIds,
      executionSystemIds: [
        simpleSystemId, ingredientRouterSystemId, checkRouterSystemId, progressiveSystemId
      ],
      executionRecipeIds: [
        simpleRecipe.id, breakageRecipe.id, limitedUsesRecipe.id, negativeToolRecipe.id,
        multiOptionRecipe.id,
        ingredientRoutedRecipe.id, checkRoutedRecipe.id, progressiveRecipe.id
      ],
      simple: {
        systemId: simpleSystemId,
        simpleRecipeId: simpleRecipe.id,
        breakageRecipeId: breakageRecipe.id,
        limitedUsesRecipeId: limitedUsesRecipe.id,
        negativeToolRecipeId: negativeToolRecipe.id,
        malletComponentId: simpleMap['Smoke Mallet'],
        chiselComponentId: simpleMap['Smoke Chisel'],
        relicComponentId: simpleMap['Smoke Relic']
      },
      ingredientRouted: {
        recipeId: ingredientRoutedRecipe.id,
        // Deliberately the SECOND set → the Amulet group (resultGroups[1], NOT the
        // first group), so the assertion proves the router selects a non-index-0
        // group by set assignment rather than always emitting resultGroups[0].
        chosenSetId: setBId
      },
      checkRouted: { recipeId: checkRoutedRecipe.id },
      progressive: { recipeId: progressiveRecipe.id, systemId: progressiveSystemId, recipeName: 'Smoke Mold Brick' },
      gather: { environmentId: rcGatherEnvironment.id, taskId: rcGatherTaskId },
      hazard: { environmentId: hazardEnvironment.id, taskId: rcGatherTaskId }
    };
  // ── END VERBATIM COPY ───────────────────────────────────────────────────────
}
