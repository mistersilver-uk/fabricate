# Fabricate Competitive Analysis

_Last updated: 2026-03-06_

---

## 1. Fabricate today -- capabilities and gaps

### Current capabilities

Fabricate is a system-agnostic crafting module for Foundry VTT with a notably deep feature set:

| Area                     | What Fabricate offers                                                                                                                                                                      |
|:-------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Crafting systems**     | Multiple independent systems per world (e.g. Alchemy, Blacksmithing, Enchanting), each with its own item library, essences, and rules                                                      |
| **Resolution modes**     | Four distinct modes -- simple (A+B=C), mapped (different inputs yield different outputs), tiered (skill check selects named outcome), and progressive (check value "buys" ordered results) |
| **Ingredient semantics** | Three-level hierarchy: ingredient sets (OR), ingredient groups within a set (AND), options within a group (OR). This gives recipe authors fine-grained control over substitutions          |
| **Catalysts**            | Non-consumable tools/workstations with optional degradation tracking, max uses, and auto-destruction on exhaustion                                                                         |
| **Essences**             | Abstract properties on items (e.g. "3 Fire, 1 Arcane") enabling flexible ingredient matching beyond exact items or tags                                                                    |
| **Effect transfer**      | Essence-based pipeline that copies active effects from essence source items to crafted results -- triple-flag opt-in (system essences + system effectTransfer + recipe transferEffects)    |
| **Multi-step recipes**   | Sequential steps with per-step ingredients, results, catalysts, time gates, and currency requirements. Persistent crafting runs tracked on actor flags                                     |
| **Recipe visibility**    | Three list modes: global, player-specific (per-recipe allow-lists), and knowledge-based (item ownership or learn-flow with consumable recipe scrolls)                                      |
| **Salvage**              | Component dismantling with its own resolution mode (simple, tiered, progressive), crafting check, and configurable consumption on failure                                                  |
| **Macro integration**    | Crafting check macros, property calculation macros, success/failure hook macros, and currency macros                                                                                       |
| **GM admin UI**          | Tabbed admin panel with feature cards, drag-and-drop item management, recipe editor with item picker sidebar, import/export                                                                |
| **Player crafting UI**   | Recipe browser with search, category filter, "craftable only" toggle, ingredient/catalyst status badges, active run management, and crafting history                                       |
| **Tag matching**         | Optional tag-based ingredient matching (`any`/`all` modes) alongside exact component matching                                                                                              |
| **Currency & time**      | System-adapter or macro-driven currency handling; world-time-gated steps with automatic completion                                                                                         |

### Known gaps and friction points

Based on analysis of the codebase, docs, and the current changelog:

1. **No pre-built recipe content.** Fabricate ships no example compendiums. Beaver's Crafting ships "beavers-potions" with 50+ DnD5e potion recipes; Mastercrafted has a companion "Potion Crafting & Gathering" pack. A new Fabricate user faces a blank canvas with a steep learning curve.

2. **Heavy macro dependency for skill checks.** Every crafting check requires the GM to write or find a Foundry macro. Beaver's Crafting offers built-in skill/ability/tool check selectors that work out of the box with no code. Mastercrafted avoids the question entirely for its simpler model.

3. **No built-in roll integration.** Fabricate's check macros must construct rolls manually. There is no UI dropdown to say "roll Arcana DC 15" without a macro -- contrast with Beaver's built-in test section UI.

4. **Handlebars-based UI (not yet Svelte).** Despite the repo description mentioning Svelte, the current templates are Handlebars (`.hbs`). The recipe editor, while functional, uses carousel pagination for ingredient sets and result groups rather than a spatial layout. This creates a linear, paginated editing flow that becomes tedious for complex recipes with many sets.

5. **No visual upgrade/crafting tree.** Recipes exist as flat lists. There is no graph or tree view showing progression (e.g. "Iron Ingot -> Steel Ingot -> Fine Steel"), which competitors and video games use heavily for orientation.

6. **Recipe import/export is JSON-level.** The admin panel has import/export buttons, but there is no compendium-native sharing or marketplace for recipe packs.

7. **Rules tab is a stub.** The "Rules" tab in the admin panel explicitly states "Difficulty and advanced system-wide rule editing will live here" but is currently empty.

8. **No chat output for crafting results.** The success/failure macros can create chat messages, but Fabricate itself does not automatically post a crafting summary to chat. Beaver's Crafting posts results automatically.

9. **No gathering/harvesting flow.** Beaver's Crafting supports harvesting, mining, and gathering as first-class recipe types. Fabricate treats ingredient acquisition as out of scope.

10. **Limited onboarding guidance in the UI.** Empty states say "The GM needs to create some recipes first" but do not link to documentation or offer a quickstart wizard.

---

## 2. Competitor analysis

### 2.1 Mastercrafted (TheRipper93)

| Dimension                   | Assessment                                                                                                                                                                               |
|:----------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pricing**                 | Premium (Patreon-gated)                                                                                                                                                                  |
| **Core model**              | Recipe-centric. "Recipe Book" organises recipes into shareable books; a "Cauldron" is the player-facing crafting interface                                                               |
| **Ingredient model**        | Drag-and-drop panels. Multiple items in the same panel create OR choices; multiple panels create AND requirements                                                                        |
| **System agnosticism**      | Advertised for "any system"                                                                                                                                                              |
| **Skill/check integration** | Minimal. No built-in roll integration. Focus is on material-check crafting, not skill-gated outcomes                                                                                     |
| **GM vs player workflow**   | GM creates recipe books, sets per-player permissions, and configures tool requirements. Players open the Cauldron, browse available recipes, and craft                                   |
| **Standout features**       | Resource Items (non-item costs like gold, spell slots); tag-based ingredient matching; recipe book export/import for community sharing; polished UI with drag-and-drop ingredient panels |
| **Notable weaknesses**      | No multi-step recipes; no skill check or tiered outcome support; no essence/abstract-property system; no crafting runs or time gates; premium paywall limits community adoption          |

**Key takeaway for Fabricate:** Mastercrafted's strength is UX simplicity and the "recipe book" as a shareable, organising artefact. Its weakness is depth -- no check integration, no multi-step, no essences. Fabricate already surpasses it technically but could learn from its approachable first-time UX and the recipe book as a distributable content unit.

### 2.2 Beaver's Crafting

| Dimension                   | Assessment                                                                                                                                                                                                                                                                                |
|:----------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pricing**                 | Free and open-source                                                                                                                                                                                                                                                                      |
| **Core model**              | Recipe-centric with built-in progression. Recipes have five sections: Requirements, Costs, Tests, Results, Instructions                                                                                                                                                                   |
| **Ingredient model**        | Requirements (not consumed) + Costs (consumed). AnyOf items with macro-based filtering for flexible matching                                                                                                                                                                              |
| **System agnosticism**      | Cross-system via adaptation layers (beavers-system-interface). Native dnd5e support; community adapters for wfrp4e and others                                                                                                                                                             |
| **Skill/check integration** | First-class. Test sections with configurable skill/ability/tool checks, hit thresholds, and failure limits. No macro authoring required for standard checks                                                                                                                               |
| **GM vs player workflow**   | GM creates recipe items in compendiums. Players access a Crafting tab, filter by availability, and step through tests. Results posted to chat automatically                                                                                                                               |
| **Standout features**       | Multi-purpose beyond crafting (tech trees, quest progress, downtime activities, faction reputation); `isCrafted` item flag for economy tracking; companion content packs (beavers-potions); built-in check UI requiring no macros                                                         |
| **Notable weaknesses**      | UI can feel cluttered for simple recipes; recipe configuration is spread across multiple panels; no essence/abstract-property system; no mapped or progressive resolution modes; relies on custom item types that can cause compatibility issues with sheet modules (e.g. Tidy 5e Sheets) |

**Key takeaway for Fabricate:** Beaver's Crafting is Fabricate's closest free competitor and its biggest threat in the dnd5e space. Its built-in check UI and companion content packs lower the barrier to entry dramatically. Fabricate's advantages are its richer resolution modes (mapped, tiered, progressive), its essence system, and its cleaner data model. The main lesson: reducing macro dependency and shipping starter content would close the adoption gap.

### 2.3 Furukai's Simple Crafting

| Dimension                   | Assessment                                                                                                                                         |
|:----------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pricing**                 | Free                                                                                                                                               |
| **Core model**              | Ingredient-centric. Three recipe types: text (free), items (exact match), tags (tagged ingredients)                                                |
| **Ingredient model**        | JSON-defined recipes. Tag system assigns tags with quantities to items; recipes consume tagged items                                               |
| **System agnosticism**      | System-independent                                                                                                                                 |
| **Skill/check integration** | None                                                                                                                                               |
| **GM vs player workflow**   | GM creates JSON recipe files (or optionally allows players to create their own). Crafting checks inventory automatically                           |
| **Standout features**       | Extreme simplicity; player-created recipes option; file-based recipe storage makes version control trivial                                         |
| **Notable weaknesses**      | No UI for recipe creation (JSON files only); no skill checks; no multi-step; no catalysts; no visibility controls; minimal UX -- purely functional |

**Key takeaway for Fabricate:** Furukai's appeals to the "just let me define recipes in a text file" crowd. It validates that there is a market segment wanting minimal overhead. Fabricate could serve this segment better with a "quick recipe" creation flow or a JSON import that maps to its richer model.

### 2.4 Item Piles (crafting adjacent)

| Dimension              | Assessment                                                                                                                                                                                                       |
|:-----------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pricing**            | Free and open-source                                                                                                                                                                                             |
| **Core model**         | Loot/economy module. Not a crafting module per se, but provides the economic infrastructure that crafting modules build on                                                                                       |
| **Crafting relevance** | Merchant actors can require items as payment (barter/crafting merchant pattern); item-based currencies; hooks for custom crafting workflows; community builds combine Item Piles merchants with crafting modules |
| **System agnosticism** | Cross-system with system-specific companion modules (dnd5e, pf2e, Shadowdark, Pirate Borg, etc.)                                                                                                                 |
| **Standout features**  | Rich merchant UI; item-based currency system; vault/container management; extensive hook/API surface for module integration                                                                                      |
| **Notable weaknesses** | Not a crafting solution on its own; no recipe model; no skill checks; no crafting runs                                                                                                                           |

**Key takeaway for Fabricate:** Item Piles is a complementary module, not a competitor. Fabricate could benefit from explicit Item Piles integration -- using Item Piles merchants as ingredient vendors, Item Piles currencies for crafting costs, or Item Piles containers as workstation inventories. This would position Fabricate as the "crafting layer" in an Item Piles economy ecosystem.

### Competitor summary matrix

| Feature                     | Fabricate  | Mastercrafted |  Beaver's Crafting  | Furukai's SC |  Item Piles  |
|:----------------------------|:----------:|:-------------:|:-------------------:|:------------:|:------------:|
| Free                        |    Yes     |      No       |         Yes         |     Yes      |     Yes      |
| System-agnostic             |    Yes     |      Yes      |    Via adapters     |     Yes      | Via adapters |
| Multiple resolution modes   |     4      |       1       |          1          |      1       |     N/A      |
| Built-in skill checks       | No (macro) |      No       |         Yes         |      No      |     N/A      |
| Multi-step recipes          |    Yes     |      No       |     Yes (tests)     |      No      |     N/A      |
| Essence/abstract matching   |    Yes     |      No       |         No          |  Tags only   |     N/A      |
| Catalysts/tools             |    Yes     |      Yes      | Yes (requirements)  |      No      |     N/A      |
| Effect transfer             |    Yes     |      No       |         No          |      No      |     N/A      |
| Recipe visibility/knowledge |  3 modes   |  Per-player   | Foundry permissions |     None     |     N/A      |
| Salvage/dismantle           |    Yes     |      No       |         No          |      No      |     N/A      |
| Starter content packs       |     No     | Via companion |   beavers-potions   |      No      |     N/A      |
| Crafting tree/graph view    |     No     |      No       |         No          |      No      |     N/A      |
| Auto chat output            | No (macro) |      Yes      |         Yes         |      No      |     N/A      |
| Recipe sharing format       |    JSON    | Recipe books  |     Compendiums     |  JSON files  |     N/A      |

---

## 3. UX lessons from wider games

### 3.1 Minecraft -- Recipe book and discovery

**Reference:** [Minecraft Recipe Book](https://minecraft.wiki/w/Recipe_book)

1. **Discovery-through-interaction unlocks engagement.** Recipes unlock when you pick up a relevant item or meet a trigger (touching water unlocks boats). This creates a natural "I found something, what can I make?" loop. Fabricate's knowledge mode already has the architectural bones for this (recipe items, learn flow), but it requires explicit GM setup per recipe. A lighter-weight "auto-discover recipe when you acquire a tagged ingredient" mode would bring the Minecraft feel without GM overhead.

2. **"Craftable" filter as a first-class toggle.** Minecraft's recipe book prominently toggles between "All" and "Craftable". Fabricate already has this ("Craftable Only" button) -- this is a validated UX pattern worth keeping prominent.

3. **Auto-fill from inventory.** Shift-clicking a Minecraft recipe pulls ingredients from inventory automatically. Fabricate's engine already resolves ingredient selection automatically, which is the right design for a tabletop tool -- manual grid placement would be inappropriate.

4. **Intermediate-step awareness.** The "Smart Recipe Book" community mod shows recipes as craftable even when you only have raw materials that require intermediate crafting steps. This suggests that Fabricate could surface "you could craft this if you first craft X" hints in the UI, connecting multi-step recipes more visibly.

### 3.2 Stardew Valley -- Ingredient surfacing and the Better Crafting mod

**Reference:** [Stardew Valley Crafting Wiki](https://stardewvalleywiki.com/Crafting), [Better Crafting Mod](https://www.nexusmods.com/stardewvalley/mods/11115)

1. **Craft from nearby storage, not just inventory.** The Better Crafting mod's most requested feature was crafting from nearby chests, not just the player's backpack. Fabricate already supports multiple "component source actors" (the checkbox list in the crafting app), which is the TTRPG equivalent. This is a differentiating feature that should be documented and promoted more visibly.

2. **Favourites and recently-crafted.** Better Crafting adds a favourites system (press F to star a recipe) and puts them in a dedicated tab. Fabricate has no favourites or "recently crafted" quick-access. For tables with large recipe sets, this would reduce browsing friction.

3. **Bulk crafting with resource preview.** Better Crafting's right-click bulk craft shows the total resource cost for N items. Fabricate's single-craft model could benefit from a "craft N" option that previews total ingredient cost, especially for consumables like arrows or potions.

4. **Category customisation in the crafting UI.** Better Crafting lets players rearrange categories. Fabricate has GM-defined categories with a filter dropdown. Allowing players to pin or reorder categories would give power users more control without changing the data model.

### 3.3 Monster Hunter World -- Targeted farming and stat deltas

**Reference:** [Monster Hunter World Upgrade Trees](https://monsterhunterworld.wiki.fextralife.com/Augmentations+and+Upgrades)

1. **Show what you will gain before you commit.** MHW displays explicit stat deltas at craft time: "+5 Attack", "+10% Affinity". Fabricate shows what results you will receive but does not preview how the result compares to what you currently have. For equipment crafting systems, showing a diff ("Your current sword: 1d8. This sword: 2d6+1") would make the craft decision meaningful.

2. **Hidden materials create exploration goals.** Unknown materials show as "???" until encountered, turning the upgrade tree into a treasure map. Fabricate's knowledge mode hides entire recipes, but does not partially reveal them. A "teaser" state -- showing a recipe exists but obscuring some ingredients until discovered -- would create more compelling exploration hooks.

3. **Visual upgrade tree for orientation.** MHW's branching weapon trees show the full progression path. Fabricate's flat recipe list gives no sense of "where am I in this system's progression?" A tree or graph visualisation connecting recipes by shared inputs/outputs would be high-impact for immersion.

4. **Per-hunt targeted farming list.** MHW lets you pin materials you need and shows acquisition sources. Fabricate could offer a "shopping list" view: select a recipe, see what you are missing, and (if integrated with a harvesting/loot module) see where to get it.

### 3.4 Valheim -- Workbench-as-hub and upgrade stations

**Reference:** [Valheim Workbench Wiki](https://valheim.fandom.com/wiki/Workbench)

1. **Station level gates recipe availability.** Valheim's workbench upgrades from level 1-5 by placing upgrade structures nearby, which unlocks new recipes at each tier. Fabricate's catalyst system could model this: a "Forge" catalyst with a `timesUsed` or quality level that gates which recipes become available. The data model supports this implicitly (catalysts track usage), but there is no explicit "station level" concept in the recipe visibility rules.

2. **Spatial proximity as a gameplay element.** Valheim requires physical proximity to stations. In a VTT context, this could translate to checking whether a token is near a workstation tile/token. Fabricate does not currently do proximity checks, but this could be a macro-hook feature for GMs who want location-gated crafting.

3. **Upgrade structures as recipe ingredients themselves.** In Valheim, you craft the upgrade structures. This maps cleanly to Fabricate's multi-step model: step 1 = build the Chopping Block, step 2 = upgrade the Workbench, step 3 = craft the item that requires the upgraded bench.

### 3.5 Subnautica -- Blueprint scanning as recipe discovery

**Reference:** [Subnautica Blueprints Wiki](https://subnautica.fandom.com/wiki/Blueprints_(Subnautica))

1. **Partial discovery through fragment scanning.** Subnautica requires scanning 2-3 fragments of an item before its blueprint unlocks. This creates a sense of incremental progress toward a goal. Fabricate could implement partial knowledge: "You have found 2 of 3 fragments of this recipe" -- using the `timesUsed` field on recipe items to track progress toward full recipe knowledge.

2. **Scanner Room focuses exploration.** Subnautica's Scanner Room only searches for fragments you have not yet completed. Fabricate's "craftable only" filter serves a similar role. An inverse filter -- "show only recipes I am close to learning" -- would serve the exploration-focused player.

3. **Fabricator shows what you can make with current materials.** The Fabricator's real-time availability check matches Fabricate's existing behaviour. The lesson is that this is table-stakes UX, and Fabricate is already correct here.

### 3.6 Vintage Story -- Physical effort as skill analogy

**Reference:** [Vintage Story Crafting Wiki](https://wiki.vintagestory.at/Crafting)

1. **Crafting as an active, skill-testing process.** Vintage Story's knapping and smithing require the player to physically shape materials on a voxel grid. The TTRPG analogue is the crafting check -- it should feel like the character is doing something skilled, not just clicking a button. Fabricate's tiered and progressive modes, where the check value materially affects the outcome, already capture this. The lesson is to promote these modes as the "engaged crafting" experience.

2. **Multiple crafting methods for the same goal.** Vintage Story offers knapping (stone), casting (metal molds), and smithing (anvil) as distinct processes. Fabricate's mapped mode with multiple ingredient sets already supports this pattern: different methods, same result, different material costs.

3. **Tool quality matters.** In Vintage Story, tool quality affects crafting results. Fabricate's catalyst system tracks usage but does not currently factor catalyst state into crafting outcomes. A "catalyst quality bonus" passed to the crafting check macro would let GMs model this without engine changes.

### 3.7 Life is Feudal -- Material quality propagation

**Reference:** [Life is Feudal Quality System](https://lifeisfeudal.fandom.com/wiki/Quality)

1. **Input quality affects output quality (0-100 scale).** Every item has a quality score; crafted item quality is a function of ingredient quality, tool quality, and crafter skill. For TTRPGs, this maps to: "the mundane iron you salvaged from goblins produces a worse sword than the dwarven steel from the deep mines." Fabricate's property macros could model this today (a macro that reads ingredient properties and sets result properties), but there is no built-in quality framework.

2. **Building/station bonuses.** Life is Feudal gives quality bonuses for crafting in high-quality buildings. This maps to Fabricate's catalyst concept -- a "Master Forge" catalyst could provide a quality bonus passed to the property macro. The pattern is already expressible but not documented as a recipe.

3. **Skill-gated quality ceiling.** A novice crafter in LiF cannot produce quality-100 items regardless of input quality. Fabricate's tiered mode naturally models this: a low skill check roll cannot reach the "masterwork" outcome tier, capping effective quality.

### 3.8 Pathfinder 2e crafting rules -- Downtime model

**Reference:** [PF2e Crafting/Earn Income](https://2e.aonprd.com/Actions.aspx?ID=2364)

1. **Crafting as downtime activity with a time/money tradeoff.** PF2e lets you pay full price to finish immediately or spend downtime days to reduce cost. Fabricate's time requirements and currency requirements already model this dual path. The lesson is that both options should be equally easy to configure and equally visible to players.

2. **Minimum crafting time prevents trivialisation.** PF2e's 4-day minimum (or 4-hour minimum for consumables) ensures crafting feels weighty. Fabricate's time gates achieve the same effect. The lesson is to offer sensible defaults or templates: "consumable = 4 hours, permanent item = 1 day" as suggested starting values.

3. **Level-appropriate DC scaling.** PF2e sets crafting DCs by item level, making the system self-balancing. Fabricate's difficulty field on managed items exists but is only used by progressive mode. Exposing a system-level "DC = f(item difficulty)" formula that the check macro can reference would make difficulty scaling easier to configure.

### 3.9 EN World community consensus -- What makes TTRPG crafting satisfying

**Reference:** [EN World "Best crafting rules?" thread](https://www.enworld.org/threads/best-crafting-rules.705093/)

1. **Integration with core mechanics is paramount.** The community consensus is that crafting systems fail when they feel like a bolted-on minigame. Systems praised (Ars Magica, FFG Star Wars) integrate crafting with the same mechanics used for everything else. Fabricate's macro-based check system achieves this by delegating to the game system's native roll mechanics -- but this only works if the macro is easy to write. Pre-built check macro templates for popular systems (dnd5e, pf2e) would close this gap.

2. **Crafting must connect to character identity.** The complaint about "master craftsman background as a ribbon feature" highlights that crafting should make the character feel special. Fabricate's skill check integration enables this (a high-Arcana wizard crafts better potions), but the connection is invisible to the player unless the GM writes flavourful success/failure macros. Built-in chat output that references the actor's skills and the check result would surface this connection automatically.

3. **Accounting is the enemy.** The thread notes that "computer games are just way better at all the accounting." Fabricate's automated inventory checking and ingredient resolution are exactly the right approach -- the module handles the bookkeeping so the table can focus on the narrative. This is a core strength worth emphasising in marketing.

4. **Campaign focus determines crafting value.** Crafting shines in exploration and downtime-heavy campaigns, not pure combat games. Fabricate should lean into this by positioning itself for sandbox and West Marches style play, where player agency over equipment and resources is central.

---

## 4. Gap analysis -- what Fabricate could do better

Ranked by estimated impact (to user adoption and satisfaction) versus effort (for a solo developer):

| #  | Gap                                                 | Impact | Effort | Rationale                                                                                                                                                                                                                                                          |
|:--:|:----------------------------------------------------|:------:|:------:|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | **No starter content or check macro templates**     |  High  | Medium | The single biggest barrier to adoption. A new user must create everything from scratch AND write JavaScript macros. Shipping 1-2 example systems with pre-built check macros for dnd5e would dramatically reduce time-to-first-craft.                              |
| 2  | **No built-in roll/check UI**                       |  High  | Medium | Requiring macros for every skill check puts Fabricate behind Beaver's Crafting for non-technical GMs. A "simple check" mode (select ability/skill, set DC, Fabricate handles the roll) would cover 80% of use cases.                                               |
| 3  | **No automatic chat output**                        | Medium |  Low   | Both Mastercrafted and Beaver's post crafting results to chat automatically. Fabricate requires a success macro for this. Adding a default chat message (actor, recipe, ingredients consumed, results created) with an opt-out would align with user expectations. |
| 4  | **No recipe tree/graph visualisation**              | Medium |  High  | Every video game reference (MHW, Valheim, Minecraft) uses visual progression. A tree view connecting recipes by shared components would be unique among FVTT crafting modules and a strong differentiator.                                                         |
| 5  | **No favourites or recently-crafted list**          | Medium |  Low   | Simple UX improvement for tables with many recipes. Store favourite recipe IDs in client settings; show a "Favourites" section at the top of the crafting app.                                                                                                     |
| 6  | **No "shopping list" or missing-materials summary** | Medium |  Low   | Show a consolidated view: "To craft X, you still need: 2x Iron Ingot, 1x Leather Strap." Ingredient badges already show have/need per recipe; aggregating across a wish-list of recipes would be the next step.                                                    |
| 7  | **Recipe editor UX for complex recipes**            | Medium | Medium | The carousel pagination for ingredient sets and result groups becomes tedious for mapped/tiered recipes with many options. A spatial layout (all sets visible, collapsible) would reduce navigation overhead.                                                      |
| 8  | **No partial recipe discovery / teaser mode**       |  Low   | Medium | Subnautica's fragment-scanning model is compelling for exploration campaigns. Implementing "show recipe name but hide some ingredients until N fragments found" would be a unique differentiator, but serves a niche use case.                                     |
| 9  | **No Item Piles integration**                       |  Low   |  Low   | Documenting how to use Item Piles merchants as ingredient vendors and Item Piles currencies for crafting costs would expand Fabricate's ecosystem reach with minimal code.                                                                                         |
| 10 | **No gathering/harvesting flow**                    |  Low   |  High  | Beaver's Crafting supports gathering natively. Building this into Fabricate would be a large scope expansion. A lighter approach: document how to model gathering as a simple-mode recipe with no ingredients and a check macro that simulates foraging.           |

---

## 5. Recommendations

The following five recommendations are prioritised for a solo developer seeking maximum adoption impact per unit of effort.

### R1. Ship a "Quick Start" content pack and check macro templates

**What:** Create a compendium module (or a bundled JSON import) containing one example crafting system ("Alchemy") with 5-10 recipes, pre-configured managed items, and a check macro that works with dnd5e's `actor.rollSkill('arc')` API. Include a second check macro template for generic systems using `new Roll("1d20 + @mod")`.

**Why:** This is the single highest-impact change. Every competitor that gains traction ships usable content. Fabricate's technical superiority is invisible until a user can experience it, and right now the time-to-first-craft is measured in hours, not minutes.

**Effort:** Medium. The recipe data and macros are straightforward; the work is in testing, documenting, and packaging.

### R2. Add a "simple check" mode that requires no macros

**What:** When crafting checks are enabled, offer a built-in check mode alongside the custom macro mode. The built-in mode lets the GM configure: ability score, skill (optional), DC, and advantage/disadvantage. Fabricate resolves the roll internally using the game system's roll API (via a system adapter pattern similar to the currency adapter).

**Why:** This eliminates the biggest UX gap versus Beaver's Crafting. Non-technical GMs -- the majority of the target audience -- should not need to write JavaScript to use skill-gated crafting. The custom macro mode remains available for power users.

**Effort:** Medium. Requires a system adapter interface for roll resolution (dnd5e first, with a generic fallback).

### R3. Add automatic chat output for crafting results

**What:** After a successful craft, automatically post a chat message showing: the actor's name and portrait, the recipe name, ingredients consumed (with quantities), catalysts used, and results created (with item links). After a failed craft, post the failure reason and any consumed ingredients. Make this a system-level setting (on by default, can be disabled).

**Why:** This is low-effort, high-visibility. It makes crafting a social event at the table rather than a silent inventory operation. Both Mastercrafted and Beaver's Crafting do this. Players expect it.

**Effort:** Low. The data is already available in the success/failure macro context; it just needs to be formatted into a ChatMessage.

### R4. Add a "Favourites" section and recently-crafted history to the player UI

**What:** Let players mark recipes as favourites (stored in client settings). Show a "Favourites" section pinned to the top of the recipe list. Also show the 5 most recently crafted recipes (already tracked in run history) as a quick-access row.

**Why:** Low-effort UX improvement that makes the crafting app feel polished and reduces browsing friction for repeat crafters. The Better Crafting mod for Stardew Valley validates this as a highly requested feature pattern.

**Effort:** Low. Client-side setting for favourites; run history data already exists.

### R5. Publish integration guides for Item Piles and popular system modules

**What:** Write documentation (not code) showing how to: (a) use an Item Piles merchant actor as a crafting ingredient vendor, (b) use Item Piles item-based currencies as Fabricate currency requirements via a currency macro, (c) use Simple Calendar for time-gated crafting. Include copy-paste macro examples.

**Why:** Fabricate does not need to build an economy module -- it needs to be the crafting layer that sits on top of the economy modules people already use. Documenting these integrations positions Fabricate as part of a larger toolkit rather than a standalone island.

**Effort:** Low. Documentation and example macros only; no module code changes required.

---

## 6. Documentation analysis

### 6.1 Fabricate v1 documentation review

The v1 documentation site at `https://misterpotts.github.io/fabricate/` uses the **Just the Docs** Jekyll theme and documents Fabricate version 0.10.24.

**Structure.** The site is organised into six top-level sections: About (landing page with project description, known issues, FAQ, and sponsorship information), API (7 sub-pages: Crafting System API, Essence API, Component API, Recipe API, Crafting API, Types, Hooks), Components (with Editing and Salvaging sub-pages), Crafting Systems, Essences, and Recipes (with Editing and Crafting sub-pages). A search bar sits at the top of the sidebar.

**Strengths:**

1. **Animated GIF demonstrations throughout.** The v1 docs make heavy use of animated GIFs to show UI workflows. The Crafting Systems page includes GIFs demonstrating creating, exporting, importing, deleting, overwriting, duplicating, and disabling systems. The Recipes Editing page has GIFs showing drag-and-drop recipe creation, adding requirements, adding results, and configuring multiple options. The Essences page has GIFs for creating essences with the icon picker, managing active effect sources via drag-and-drop, and deleting essences. This is the single most valuable documentation asset Fabricate v1 has -- these GIFs make the module learnable without reading a word of text.

2. **Concept-first organisation with narrative analogies.** Each concept page introduces its topic through a worked scenario before diving into procedures. The Essences page explains the concept through a fantasy-world analogy: an "Adult Blue Dragon Tooth" containing elemental magic qualities, demonstrating how multiple components can share the same essence. The Recipes page uses a shield repair scenario with alternative crafting paths to illustrate multiple ingredient sets. The writing explicitly frames essences as "a quality of a component -- they define something that the component **has**, not something that it is." This approach makes abstract concepts concrete before the reader encounters any configuration tables.

3. **Known Issues section with root-cause explanations.** The About page includes a known issues section that does not just list bugs but explains their status, impact, discovery context, cause, and mitigation steps -- including JavaScript workaround code. This respects the reader's intelligence and reduces the support burden.

4. **FAQ addressing real user questions.** The About page has a FAQ covering compendium compatibility, official module status, release timeline, pricing, and contribution opportunities -- the exact questions a new user evaluating the module would ask.

5. **Embedded crafting systems table.** The About page lists pre-installed/community crafting systems with name, supported game systems, author, and description columns. This shows the user immediately that content exists, even though Fabricate itself ships no starter content.

**Weaknesses:**

1. **API documentation is interface-only, with no usage examples.** The API section shows TypeScript interface signatures (`FabricateAPI`, `FabricateUserInterfaceAPI`, `CraftingSystemData`) with method names, parameter types, and return types, but provides no practical code snippets showing how to call those methods from a Foundry macro. A developer seeing `duplicateCraftingSystem(craftingSystemId: string): Promise<CraftingSystem>` must figure out on their own how to obtain the system ID, where to call this from, and how to handle the returned promise. The API docs note that "the Fabricate API changed significantly in v0.9.0" but offer no migration examples.

2. **No quickstart or getting-started guide.** The site drops the reader into the "About" page with module description, known issues, and sponsorship information. There is no "install the module, create your first system, craft your first item" flow. The user must piece together the workflow by reading the Components, Crafting Systems, Recipes, and Essences pages in the correct order, which is never stated.

3. **No cross-linking between concept pages and API pages.** The Components concept page does not link to the Component API. The Recipes Editing page does not link to the Recipe API. A reader who learns how to do something in the UI has no signposted path to learning how to do it programmatically.

4. **No macro examples.** Despite macros being central to Fabricate's extensibility (crafting checks, property macros, success/failure hooks), the v1 docs include no example macros anywhere.

5. **Sparse text on some concept pages.** The Components overview page is very short -- it lists what components can be (potions, armour, ingredients) and states that the system must have components to operate, then links to Editing and Salvaging sub-pages. There is no explanation of managed item properties, tags, essence assignment, or difficulty ratings.

**Documentation quality summary:** The v1 docs are visually strong (GIFs make the UI learnable at a glance) and conceptually sound (narrative analogies build understanding before procedures) but weak on onboarding, API usability, and programmatic guidance.

### 6.2 Fabricate v2 documentation review

The v2 documentation lives in the `docs/` directory and also uses the **Just the Docs** Jekyll theme with a dark colour scheme and custom callout types (warning, tip, note, gm). It covers the post-rename, post-spec-alignment version of Fabricate.

**Structure.** The site has 22 Markdown files organised into a deeper hierarchy than v1:

- `index.md` (Home, nav_order 1) -- feature overview table, quick macro example, link to quickstart
- `quickstart.md` (Quickstart, nav_order 2) -- 5-step walkthrough: installation, opening the UI, creating a system, adding managed items, creating a recipe, crafting
- `crafting-systems.md` (Crafting Systems, nav_order 3) -- system settings, feature toggles, crafting checks, consumption on failure, effect transfer, recipe visibility (all 3 modes with sub-options), salvage (system-level and component-level), preferences cleanup, managed items, requirements
- `recipes/index.md` (Recipes, nav_order 4, parent) with 5 children: `simple.md`, `mapped.md`, `tiered.md`, `progressive.md`, `multi-step.md`
- `catalysts.md` (Catalysts, nav_order 5)
- `essences.md` (Essences, nav_order 6)
- `visibility.md` (Visibility & Knowledge, nav_order 7)
- `macros/index.md` (Macros & Examples, nav_order 8, parent) with 1 child: `examples.md`
- `api/index.md` (API Reference, nav_order 9, parent) with 7 children: `recipe-manager.md`, `crafting-engine.md`, `system-manager.md`, `run-manager.md`, `visibility-service.md`, `resolution-service.md`, `models.md`

**Strengths:**

1. **Comprehensive quickstart guide.** `quickstart.md` walks through installation, opening the UI, creating a system (with a `{: .gm }` callout), adding managed items via drag-and-drop, creating a recipe in the editor, and crafting from the player UI. It includes both a UI-first path and macro alternatives for each step. It ends with a "What's next?" section linking to four follow-up pages. This is a major improvement over v1's missing onboarding.

2. **Every feature is documented with configuration tables and code.** Unlike v1, every major feature has dedicated documentation. Each of the four resolution modes gets its own page with rules, a worked example (e.g. the "Enchanted Ring" scenario in `mapped.md`, the "Weapon Forging" scenario in `tiered.md`, the "Smelt Ore" scenario in `progressive.md`), and a full API code sample showing recipe creation. Catalysts, essences, visibility/knowledge, salvage, multi-step recipes, effect transfer, and consumption on failure are all covered with specific field tables and code. The `crafting-systems.md` page alone is 469 lines.

3. **Rich API documentation with practical code examples.** Every API service page (`RecipeManager`, `CraftingEngine`, `CraftingSystemManager`, `CraftingRunManager`, `RecipeVisibilityService`, `ResolutionModeService`) includes method signatures with parameter tables AND working JavaScript examples showing how to call them from `Hooks.once('fabricate.ready', ...)`. The `CraftingEngine` page documents the 13-step crafting pipeline in order with cross-links to related docs. The `models.md` page shows constructor shapes and key methods for all six public model classes (`Recipe`, `IngredientSet`, `IngredientGroup`, `Ingredient`, `Catalyst`, `Result`).

4. **Complete macro contracts with input/output tables.** The `macros/index.md` page documents four macro types (crafting check, property, success, failure) with full input context tables listing every property name, type, and description available in `scope`. Return value shapes are documented per resolution mode. The success and failure macro contexts include fields like `consumedIngredients`, `consumedCatalysts`, `createdResults`, and `failureReason` with their types. This is exactly what a macro author needs to work effectively.

5. **Eight ready-to-use example macros.** `macros/examples.md` provides copy-paste macros for: listing all recipes, checking available recipes with missing-item details, getting item UUIDs from inventory, creating a simple recipe, crafting via dialog picker, bulk-tagging inventory items, exporting recipes to clipboard, and importing recipes from JSON. Each includes error handling and user-facing notifications via `ui.notifications`.

6. **Effective use of callouts.** The docs consistently use `{: .gm }` (purple, "GM Only"), `{: .warning }` (yellow), and `{: .note }` (blue) callouts. GM-only content is flagged immediately. Destructive operations (changing resolution mode deletes all recipes; disabling multi-step deletes multi-step recipes) get yellow warnings. Migration notes and legacy field names get blue notes. This is a small but effective information-design pattern that v1 lacked.

7. **Data persistence reference.** The `api/index.md` page includes a table showing exactly where Fabricate stores data: world settings (`fabricate.craftingSystems`, `fabricate.recipes`), client settings (`lastCraftingActor`, `lastComponentSources`, `lastManagedCraftingSystem`, `progressiveResultOrder`), actor flags (`craftingRuns.active`, `craftingRuns.history`, `learnedRecipes`), and item flags (`catalystItemUsage`, `recipeItemUsage`). This is invaluable for debugging and for module integrators building on Fabricate's data.

**Weaknesses:**

1. **No screenshots or GIFs.** This is the most significant regression from v1. The v2 docs are entirely text and code -- not a single screenshot of the GM admin panel, the recipe editor, the crafting app, the feature toggles, or any UI element. A user reading "Click **Manage Crafting Systems**" in `quickstart.md` step 2 has no visual reference for what that button looks like or where in the Items sidebar header it appears. The v1 docs' animated GIFs made the module learnable at a glance; the v2 docs require the reader to have Foundry running alongside the documentation.

2. **`crafting-systems.md` is overloaded.** This single page covers system creation, settings, feature toggles (7 flags), crafting checks (4 settings), consumption on failure (2 settings with 3 worked examples), effect transfer (triple-flag pipeline with 5-step engine explanation, UI instructions, API example, and a full Potion of Fire Resistance worked example), recipe visibility (3 modes with all sub-options and 2 API examples), salvage (3 resolution modes, salvage crafting check with 10 fields, component salvage configuration with 7 fields and a 50-line Dragon Scale example), preferences cleanup, managed items, and requirements. At 469 lines, a reader looking for "how do I configure consumption on failure" must scroll past effect transfer, or know to use their browser's find function. Splitting this into focused sub-pages would reduce cognitive load.

3. **No conceptual introductions for new users.** The v1 docs used narrative analogies to build understanding (the dragon tooth/thunder root essence analogy, the shield repair recipe scenario). The v2 docs jump straight into configuration. `essences.md` opens with a `{: .gm }` callout and then: "Essences are abstract properties that can be assigned to managed items." This is accurate but not inviting. Compare to v1's approach: explaining essences as "a quality of a component -- they define something that the component **has**, not something that it is" with a dragon tooth example before any field table. The v2 docs are written for someone who already understands Fabricate's concepts; the v1 docs were written for someone encountering them for the first time.

4. **Duplicate and overlapping content.** Recipe visibility is documented in two places: a substantial section in `crafting-systems.md` (lines 171-246, covering all three modes, knowledge sub-options, and two API examples) and the full `visibility.md` page (158 lines covering the same three modes plus recipe items, limited uses, deterministic selection, the learn flow, drag-and-drop learning, locked recipes, and crafting guards). The overlap is significant -- both pages explain global, player, and knowledge modes. Some content is in one but not the other: `visibility.md` covers drag-and-drop learning and crafting guards; `crafting-systems.md` covers the API for setting visibility. A reader following the quickstart would not know which page is canonical.

5. **No "What's next?" navigation on concept pages.** The quickstart ends with a helpful "What's next?" section with four links. But most concept pages end abruptly. `catalysts.md` ends with a "Legacy Migration" section about the old `catalystUses` flag format -- useful but not a natural next step. `essences.md` ends with GM admin instructions for the Essences feature card. `visibility.md` ends with the crafting guards section. None of these pages suggest where the reader should go next. Readers must return to the sidebar to find the next logical step.

6. **Home page code example uses placeholder UUIDs.** The `index.md` quick example uses `'Item.healingHerb123'` and `'Item.emptyVial456'` which are not valid Foundry UUIDs. A new user copying this will get errors. The quickstart page does explain how to find real UUIDs (with a console snippet), but the home page code gives no such guidance and is the first code a visitor sees.

7. **No search functionality configured.** The `_config.yml` does not enable the Just the Docs built-in search. The theme supports search out of the box (it indexes all pages at build time), but it must be explicitly enabled. Without it, users can only navigate via the sidebar hierarchy -- a problem when the docs have 22 pages and someone needs to find a specific setting name.

### 6.3 v1 vs v2 comparison

| Dimension | v1 (0.10.24) | v2 (current) | Verdict |
|:----------|:-------------|:-------------|:--------|
| **Quickstart / onboarding** | None -- drops reader into About page | 5-step UI-first quickstart with macro alternative and "What's next?" links | v2 much better |
| **Feature coverage** | Partial -- Components, Essences, Recipes, Crafting Systems, Salvage. No docs for multi-step, visibility modes, effect transfer, consumption on failure, or progressive mode | Complete -- every feature has dedicated documentation with configuration tables and code | v2 much better |
| **API documentation** | TypeScript interface signatures only; no usage examples | Full method docs with parameter tables, return types, and working `Hooks.once('fabricate.ready', ...)` examples for every service | v2 much better |
| **Macro documentation** | None | 4 macro contracts with full context tables + 8 ready-to-use example macros | v2 much better |
| **Visual aids (GIFs/screenshots)** | Animated GIFs on Crafting Systems, Recipes Editing, and Essences pages showing every major UI workflow | Zero visual aids across 22 pages | v1 much better |
| **Conceptual introductions** | Narrative analogies and worked scenarios (dragon tooth essences, shield repair recipes) introduce concepts before procedures | Configuration tables and API calls first; one-line definitions replace narratives | v1 better |
| **Information architecture** | Flat: 6 top-level pages, 2 with children | Deeper hierarchy: 9 top-level pages, 3 with children, 22 total pages | v2 better for scale |
| **Cross-linking** | Poor -- concept pages do not link to API pages | Better -- quickstart links forward; API pages link to concept pages via Jekyll `link` tags; crafting engine page cross-references macros and crafting-systems pages | v2 better |
| **Content duplication** | Minimal | Significant overlap between `crafting-systems.md` and `visibility.md` on recipe visibility | v1 better |
| **Callouts and metadata** | Minimal; occasional blockquotes | Consistent use of 4 callout types (`warning`, `note`, `tip`, `gm`) with colour-coding | v2 better |
| **Search** | Not configured (theme supports it) | Not configured (same theme) | Tie -- both missing |
| **Known issues / troubleshooting** | Detailed known issues section on About page with root-cause explanations | No equivalent section | v1 better |

**Summary:** v2 is comprehensively better in content depth, API documentation, onboarding flow, and programmatic guidance. v1 is meaningfully better in two dimensions: visual aids and conceptual introductions. The GIFs in v1 make the module approachable in a way that no amount of text can replicate. The v2 docs are thorough but visually austere, and they assume the reader already understands the concepts rather than building that understanding through narrative.

### 6.4 Best-in-class FVTT module documentation

**Item Piles** (`fantasycomputer.works/FoundryVTT-ItemPiles/`)

Item Piles uses **Docsify**, a lightweight documentation framework that renders Markdown at runtime with a sidebar loaded from `sidebar.md` and built-in client-side search. The site features a branded green colour scheme and a system of status badges (success, warning, danger, info, primary) rendered as coloured pills for marking content status.

Key patterns worth noting:

- **Built-in search works out of the box.** Docsify's search plugin indexes all pages client-side with no external service. Users can find any content without navigating the sidebar. This is a meaningful advantage over Fabricate v2's unconfigured Just the Docs search.
- **Status badges on content.** Coloured pills indicate whether a feature is stable, experimental, or deprecated. Fabricate's v2 docs have no equivalent -- features like the "Rules" tab stub or the legacy `systemItemId` fallback have no visible status indicator in the docs.
- **Low-friction contribution model.** Docsify renders Markdown directly with no build step. Contributors can edit a single `.md` file and see results immediately. Jekyll (used by Fabricate) requires a Ruby build, which adds friction for documentation contributions.

**Beaver's Crafting** (`github.com/AngryBeaver/beavers-crafting/wiki`)

Beaver's wiki uses GitHub's built-in wiki platform with 7 main sections: Features, HowTo, AnyOf, Examples, Settings, Notes, Troubleshooting. It includes companion resources and links to adaption layers for system compatibility.

Key observations:

- **Screenshots embedded throughout.** Every HowTo section includes screenshots of the recipe configuration UI, crafting flow, and chat results -- images like `potionCrafting.png`, `advancement.png`, `configure.png`. This is the same pattern that made Fabricate v1 docs effective. Users can see the interface before they install the module, and screenshots serve double duty as marketing material on the Foundry package page.
- **Task-oriented organisation.** Sections are named by what the user wants to accomplish ("HowTo", "Troubleshooting"), not by what the software's concepts are. Contrast with Fabricate v2's concept-oriented navigation ("Crafting Systems", "Recipes", "Catalysts", "Essences"). Task-oriented docs serve the "I need to do X right now" user; concept-oriented docs serve the "I want to understand the system" user. Both are needed; Fabricate v2 has only the latter.
- **Dedicated troubleshooting page.** Addresses specific common issues. Fabricate v1 had a "Known Issues" section on the About page; Fabricate v2 has no equivalent. Troubleshooting pages reduce support burden by pre-empting predictable questions.
- **YouTube video link on the Foundry package page.** A full-length video tutorial demonstrates the potion crafting workflow from start to finish. Video content reaches users who do not read written documentation.
- **Progressive disclosure.** Content moves from simple workflows to advanced customisation (macro syntax, conditional logic, AnyOf filtering). Readers can stop reading at the depth that matches their needs.

**What FVTT module documentation does well that Fabricate should learn from:**

1. Screenshots and GIFs are table-stakes for FVTT module documentation. Users expect to see the UI before they install, and visual aids make docs learnable at a glance.
2. Built-in search -- whether Docsify's client-side plugin or Just the Docs' built-in indexing -- removes a navigation barrier, especially once a docs site exceeds 10 pages.
3. Task-oriented pages ("How do I...?") complement concept-oriented pages ("What is...?") and serve different user needs at different moments.
4. A troubleshooting section reduces support burden by addressing known friction points proactively, with the added benefit of being discoverable via search.

### 6.5 Documentation UX patterns from the wider ecosystem

**Vue.js documentation** (`vuejs.org`)

Vue's docs are widely cited as best-in-class open-source documentation. Relevant patterns for Fabricate:

1. **Progressive disclosure by complexity.** Vue organises content as Essentials, then Components In-Depth, then Reusability, then Scaling Up. A reader enters at their skill level and progresses naturally. Fabricate v2 partially achieves this (Quickstart, then concept pages, then API reference) but the concept pages themselves do not progress from simple to advanced. A user reading `crafting-systems.md` encounters simple mode settings, the effect transfer triple-flag pipeline, and salvage progressive mode configuration all on the same page.

2. **Preference toggles remembered across sessions.** Vue lets readers toggle between Options API and Composition API site-wide, with the choice stored in `localStorage`. Fabricate's docs serve two audiences -- GMs configuring via the UI and developers scripting via the API -- but present both inline on every page. A "Show UI instructions" / "Show API code" toggle (achievable via the Just the Docs theme's custom includes) would reduce noise for each audience without duplicating pages.

3. **"On this page" table of contents.** Vue shows a right-sidebar TOC for the current page. Just the Docs supports this natively and enables it by default for pages with multiple headings. For a 469-line page like `crafting-systems.md`, this TOC is essential for orientation. Fabricate's `_config.yml` does not disable it, so it likely already works -- but it is far less useful when one page covers 10+ topics than it would be if each topic had its own page.

4. **Interactive playground links.** Vue embeds "Try it in the Playground" links. Fabricate cannot offer an interactive playground, but the equivalent would be providing a "copy this macro and run it in Foundry" workflow where the macro uses item UUIDs from a bundled content pack rather than placeholder strings.

**Tailwind CSS documentation** (`tailwindcss.com/docs`)

1. **Numbered installation steps with file-labelled code blocks.** Each code block is labelled with its filename (`vite.config.ts`, `style.css`, `index.html`). Fabricate's macro examples could adopt this pattern: label each code block with where to create or paste it ("Create a new Script Macro in Foundry", "Paste into your world's macro directory", "Set this as the crafting check macro UUID").

2. **Tabbed alternatives for the same task.** The installation page offers tabs for Vite, PostCSS, CLI, Framework Guides, and CDN -- the same task accomplished in different ways depending on the reader's setup. Fabricate's quickstart currently shows the UI walkthrough inline with "Or use a macro" sub-sections. Tabs would make the UI-first and API-first paths equally prominent without the visual clutter of interleaving them.

3. **"Are you stuck?" contextual callouts.** When a step is likely to cause confusion, Tailwind inserts a highlighted callout with a link to the relevant troubleshooting guide or framework-specific instructions. Fabricate should adopt this pattern in the quickstart -- for example, after "Click **Manage Crafting Systems** in the Items sidebar header", a callout noting "Can't find the button? Make sure Fabricate is enabled in your world's module settings" would catch the most common failure mode.

**Stripe API documentation** (`docs.stripe.com/api`)

1. **Lead with fundamentals, then surface limitations.** Stripe immediately states that the API is REST-based, uses predictable URLs, and does not support bulk updates. Fabricate's `api/index.md` does this well: it explains the two globals (`game.fabricate` and `globalThis.fabricate`), states the `fabricate.ready` hook requirement, and lists all six service accessors. This pattern should be maintained.

2. **Multi-audience entry points.** Stripe provides separate paths for newcomers ("Just getting started?") and non-developers. Fabricate serves two audiences (GMs configuring via UI and developers scripting via macros) but does not surface this distinction at the docs entry point. The home page's `index.md` shows only an API code example (`fabricate.createSimpleRecipe(...)`), which may alienate non-technical GMs who do not write JavaScript. A second example showing the UI path (even as text: "Or open the GM admin panel and click Create Recipe") would make the landing page inclusive.

3. **Copy-paste ready examples with real values.** Stripe makes every code example runnable by including real endpoints and test API keys. Fabricate's code examples use placeholder IDs (`'alchemy-system-id'`, `'Item.healingHerb123'`). While real IDs cannot be known in advance, the docs could instruct readers to first run the "Get Item UUIDs" macro from `macros/examples.md` to obtain their own values, then substitute them into the example. Alternatively, if a bundled content pack is shipped (see recommendation R1 in section 5), examples could reference the known UUIDs from that pack.

### 6.6 Documentation recommendations

Ranked by estimated impact on user adoption and satisfaction versus effort for a solo developer.

**D1. Add screenshots and GIFs to the v2 docs** -- HIGH impact, MEDIUM effort

This is the single most impactful documentation improvement. The v1 docs had animated GIFs on at least three major pages; the v2 docs have zero visual aids across 22 pages. Every FVTT module with effective documentation uses screenshots. Beaver's Crafting embeds images on every HowTo page. Fabricate v1's own GIFs are arguably the best documentation asset the project has ever produced.

Specific captures needed:
- A GIF of opening the Items sidebar, clicking "Manage Crafting Systems", and creating a new system. Embed in `quickstart.md` at step 2.
- A GIF of dragging items from the Items sidebar or a compendium into the managed items list. Embed in `quickstart.md` at step 3.
- A screenshot of the recipe editor showing ingredient sets, result groups, and the item picker sidebar. Embed in `recipes/index.md`.
- A screenshot of the crafting app showing recipes with status badges (Available in green, Locked, Missing Materials in red). Embed in `recipes/index.md` under "The Crafting App".
- A GIF of switching between global, player, and knowledge visibility modes in the Recipe Visibility card. Embed in `visibility.md`.
- A screenshot of the Essences feature card with the icon picker and source item dropdown. Embed in `essences.md`.
- A screenshot of a multi-step crafting run in progress showing step status. Embed in `recipes/multi-step.md`.

Tool recommendation: ScreenToGif (Windows) or Peek (Linux). Keep GIFs under 2MB by limiting frame rate to 10fps and cropping to the relevant panel. Store in `docs/images/`.

**D2. Split `crafting-systems.md` into focused pages** -- MEDIUM impact, LOW effort

The current page is 469 lines covering 10+ distinct topics. Split it into:

- `crafting-systems.md` -- system creation, settings, feature toggles, managed items, requirements (keep at nav_order 3)
- `crafting-checks.md` -- crafting check configuration, consumption on failure, the three worked examples (new page)
- `effect-transfer.md` -- the triple-flag pipeline, essence source items, the Potion of Fire Resistance worked example (new page)
- `salvage.md` -- salvage resolution modes, `salvageCraftingCheck` configuration, component salvage configuration, the Dragon Scale worked example (new page)

Remove the 75-line recipe visibility section from `crafting-systems.md` entirely. Make `visibility.md` the single canonical source for all visibility documentation. Add a 2-line summary with a link in its place.

This reduces cognitive load per page, makes each topic independently linkable and searchable, and eliminates the content duplication between `crafting-systems.md` and `visibility.md`.

**D3. Add a "How do I...?" task-oriented section** -- MEDIUM impact, LOW effort

Add a `docs/how-to/` section with short, answer-first pages. Candidates based on the features most likely to generate user questions:

- "How do I create a recipe that uses skill checks?" -- links to tiered mode, progressive mode, and the crafting check macro contract
- "How do I let players discover recipes during play?" -- links to knowledge mode in `visibility.md`
- "How do I make a tool that wears out?" -- links to catalyst `degradesOnUse` and `maxUses` in `catalysts.md`
- "How do I transfer magical effects to crafted items?" -- links to effect transfer
- "How do I let players craft from a shared party chest?" -- explains component source actors in the crafting app
- "How do I import/export recipes for sharing?" -- links to the export and import macros in `macros/examples.md`

Each page should be 20-40 lines: problem statement, one-paragraph answer, minimal code or UI steps, and a link to the full documentation page. This serves the "I need to do X right now" user that concept-oriented pages do not address directly.

**D4. Add "What's next?" navigation to every concept page** -- LOW impact, LOW effort

The quickstart ends with a "What's next?" section linking to four follow-up pages. Replicate this pattern on every concept page:

- `catalysts.md` currently ends with "Legacy Migration" -- add links to `recipes/index.md` (where catalysts are used in recipes) and `api/crafting-engine.md` (pipeline step 9: degrade catalysts).
- `essences.md` currently ends with "Managing Essences in the GM Admin" -- add links to effect transfer documentation and the recipe editor (where essence requirements are configured on ingredient sets).
- `visibility.md` currently ends with "Crafting Guards" -- add links to the recipe editor (where linked recipe items and visibility restrictions are configured) and the crafting app section (where knowledge mode affects the player experience).
- Each resolution mode page (`simple.md`, `mapped.md`, `tiered.md`, `progressive.md`) currently ends with "When to Use X Mode" -- add a link to the next mode page and to the macros section for the relevant check macro contract.

This creates a "learning path" through the docs rather than requiring the reader to return to the sidebar after finishing each page.

**D5. Configure Just the Docs search** -- LOW impact, LOW effort

Just the Docs includes a built-in search plugin that indexes all pages at build time with no external service required. Enable it by adding to `_config.yml`:

```yaml
search_enabled: true
search:
  heading_level: 3
  previews: 3
  preview_words_before: 5
  preview_words_after: 10
  tokenizer_separator: /[\s/]+/
```

This adds a search bar to the top of the sidebar with instant results as the user types. For 22 Markdown files the index is negligible in size. This is a 5-minute configuration change that removes a real navigation barrier -- especially valuable given that `crafting-systems.md` currently contains content a reader might search for by setting name (e.g. `consumeIngredientsOnFail`).

**D6. Resolve content duplication between `crafting-systems.md` and `visibility.md`** -- LOW impact, LOW effort

Recipe visibility is currently documented in two places: a 75-line section in `crafting-systems.md` (lines 171-246) and the full 158-line `visibility.md` page. Both explain global, player, and knowledge modes. The `crafting-systems.md` section should be reduced to:

> Recipe visibility controls which players can see and access recipes. See [Visibility & Knowledge](visibility.md) for the full configuration guide, including list modes, knowledge sub-options, recipe items, and the learn flow.

This applies the DRY principle to documentation and prevents the two pages from drifting apart as features evolve.

**D7. Add conceptual introductions before configuration tables** -- LOW impact, LOW effort

For `essences.md`, `catalysts.md`, and `visibility.md`, add a 3-5 sentence narrative introduction before the first configuration table, using the v1 approach of a concrete worked example.

`essences.md` currently opens with:
> Essences are abstract properties that can be assigned to managed items. They provide a flexible way to categorise ingredients beyond simple tags -- an item might contain "2 units of Fire essence and 1 unit of Arcane essence".

This should be preceded by a scenario:
> Imagine your world has both Dragon Teeth and Thunder Roots. Both are different items, but both contain "Lightning" energy. Essences let you define that abstract energy so that a recipe requiring "3 Lightning essence" can be satisfied by either ingredient -- or a combination of both. This means a player does not need the exact item the recipe specifies, only items that collectively provide enough of the right essences.

`catalysts.md` could open with: "A blacksmith needs a forge to work steel, but the forge is not consumed in the process. A scribe needs ink, but the inkwell does not disappear after writing one scroll -- though it does run dry eventually." Then proceed to the configuration table.

This is the pattern v1 used effectively and v2 dropped. It costs one paragraph per page and meaningfully improves accessibility for first-time readers.

**D8. Add a troubleshooting page** -- LOW impact, LOW effort

Create `docs/troubleshooting.md` addressing predictable issues. Content can be derived from the validation error messages already present in `ResolutionModeService.validateRecipe()`, `ResolutionModeService.validateSalvage()`, and `RecipeVisibilityService`, and from the "Known Issues" section of the v1 About page.

Candidate entries:
- "My recipes are not showing up in the crafting app" -- check `recipe.enabled` is `true`, check the system's `listMode` setting, check that the recipe is assigned to the correct crafting system ID, check that the player has knowledge access if in knowledge mode.
- "My crafting check macro is not running" -- check `craftingCheck.enabled` is `true` or that `macroUuid` is set (which auto-enables), check the macro returns the correct shape for the resolution mode (`{ success, outcome }` for tiered, `{ success, value }` for progressive).
- "My catalysts are not being tracked" -- check `degradesOnUse` is `true` on the catalyst definition.
- "My effect transfer is not working" -- all three flags must be `true`: `system.features.essences`, `system.features.effectTransfer`, and `recipe.transferEffects`. Check that the essence definition has a valid `sourceItemUuid` pointing to a managed item with active effects.
- "My salvage configuration is rejected" -- `"mapped"` is not a valid salvage resolution mode; tiered salvage requires `salvageCraftingCheck.enabled` and at least one outcome in the `outcomes` array.

**Summary of documentation recommendations by priority:**

| #  | Recommendation | Impact | Effort | Notes |
|:--:|:---------------|:------:|:------:|:------|
| D1 | Add screenshots and GIFs | High | Medium | Biggest single improvement; restores v1's key advantage |
| D2 | Split `crafting-systems.md` into focused pages | Medium | Low | Reduces 469-line page to 4 focused pages; fixes duplication |
| D3 | Add task-oriented "How do I...?" pages | Medium | Low | 6 short pages serving "I need to do X" users |
| D4 | Add "What's next?" navigation to concept pages | Low | Low | One paragraph per page; creates a learning path |
| D5 | Configure Just the Docs search | Low | Low | 5-minute `_config.yml` change; removes navigation barrier |
| D6 | Resolve content duplication (visibility) | Low | Low | Replace 75 lines with 2-line summary + link |
| D7 | Add conceptual introductions before config tables | Low | Low | One paragraph per page; restores v1's narrative approach |
| D8 | Add a troubleshooting page | Low | Low | Derived from existing validation error messages |

---

_This analysis was prepared for MisterPotts, the solo developer of Fabricate, based on codebase review, documentation review, competitor research, and documentation UX research conducted on 2026-03-06._
