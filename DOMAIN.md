# Fabricate — Domain Model

## Ubiquitous Language

### Core Entities

| Term                 | Definition                                                                                                                                                                  | Aliases (flag for elimination)                                                                                                              | Code Mapping                                                                                                                 | Spec Reference     |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|--------------------|
| **Crafting System**  | A self-contained configuration defining resolution mode, feature toggles, components, and rules. All recipes belong to exactly one crafting system.                         | —                                                                                                                                           | `CraftingSystemManager.systems` (Map), normalized object                                                                     | spec/001, spec/002 |
| **Recipe**           | A specification for transforming inputs (ingredients, catalysts) into outputs (results). Belongs to exactly one crafting system.                                            | —                                                                                                                                           | `Recipe` class (`src/models/Recipe.js`), `RecipeManager`                                                                     | spec/002, spec/005 |
| **Component**        | A curated item entry in a crafting system's library. References a Foundry Item via `sourceItemUuid`. Used as the unit of reference for ingredients, catalysts, and results. | `managed item` (UI legacy), `system item` (UI legacy, mostly eliminated by T-096), `item` (ambiguous — Foundry Item vs Fabricate Component) | `_normalizeComponent()` in `CraftingSystemManager`; triple-aliased on system object as `items`, `components`, `managedItems` | spec/002           |
| **Ingredient**       | A consumable input requirement within an ingredient group. Matched by component ID or tags.                                                                                 | —                                                                                                                                           | `Ingredient` class (`src/models/Ingredient.js`)                                                                              | spec/002           |
| **Ingredient Group** | A set of OR-alternative ingredient options. All groups in an ingredient set must be satisfied (AND).                                                                        | —                                                                                                                                           | `IngredientGroup` class (`src/models/IngredientGroup.js`)                                                                    | spec/002           |
| **Ingredient Set**   | A complete bundle of ingredient groups, essence requirements, and catalysts. Sets are OR-alternatives at the recipe/step level.                                             | —                                                                                                                                           | `IngredientSet` class (`src/models/IngredientSet.js`)                                                                        | spec/002           |
| **Catalyst**         | A non-consumable tool/reagent required for crafting. May degrade with use.                                                                                                  | —                                                                                                                                           | `Catalyst` class (`src/models/Catalyst.js`)                                                                                  | spec/002           |
| **Result**           | A single produced item output. References a component.                                                                                                                      | —                                                                                                                                           | `Result` class (`src/models/Result.js`)                                                                                      | spec/002           |
| **Result Group**     | A named collection of results. In routed/alchemy modes, the routing target.                                                                                                 | —                                                                                                                                           | Plain object `{ id, name, results[] }`                                                                                       | spec/002           |
| **Step**             | One phase of a multi-step recipe, with its own ingredients, results, and optional time/currency requirements.                                                               | —                                                                                                                                           | Plain object in recipe `steps[]`                                                                                             | spec/002, spec/005 |
| **Crafting Run**     | An actor-scoped execution instance tracking a recipe craft in progress or completed.                                                                                        | `run`                                                                                                                                       | `CraftingRunManager`                                                                                                         | spec/002, spec/005 |
| **Salvage Run**      | An actor-scoped execution instance for decomposing a component into results.                                                                                                | —                                                                                                                                           | Referenced in `CraftingEngine`, `CraftingSystemManager`                                                                      | spec/005           |

### Resolution Modes

| Term            | Definition                                                                                                                  | Code Mapping                    | Spec Reference |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------|---------------------------------|----------------|
| **Simple**      | One ingredient set, one result group, optional pass/fail check.                                                             | `resolutionMode: 'simple'`      | spec/004       |
| **Routed**      | Multiple sets/groups with recipe-level result selection provider (`ingredientSet`, `macroOutcome`, `rollTableOutcome`). **Single-selection semantics: exactly one result group is selected per craft attempt based on the check outcome or provider.**     | `resolutionMode: 'routed'`      | spec/004       |
| **Progressive** | One set, one ordered result group. Mandatory numeric check distributes results by difficulty cost. **Cumulative semantics: all result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group — contrast with `routed` which selects exactly one group.**                          | `resolutionMode: 'progressive'` | spec/004       |
| **Alchemy**     | Discovery-based mode where players submit ingredients blindly. Hidden recipes, signature matching, optional learn-on-craft. | `resolutionMode: 'alchemy'`     | spec/004       |

### Visibility and Knowledge

| Term               | Definition                                                                                                               | Code Mapping                                          | Spec Reference              |
|--------------------|--------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|-----------------------------|
| **List Mode**      | System-wide visibility strategy: `global`, `player`, or `knowledge`. `teaser` is a removed value — replaced by `discoveryMode` (a separate feature). | `recipeVisibility.listMode`                           | spec/002, spec/006          |
| **Knowledge Mode** | Sub-strategy within `knowledge` list mode: `item`, `learned`, `itemOrLearned`.                                           | `recipeVisibility.knowledge.mode`                     | spec/002, spec/006          |
| **Learned Recipe** | A recipe an actor has learned, stored in actor flags.                                                                    | `Actor.flags.fabricate.learnedRecipes`                | spec/006                    |
| **Recipe Item**    | A Foundry Item linked to a recipe via `linkedRecipeItemUuid`. Ownership grants knowledge access.                         | `Recipe.linkedRecipeItemUuid`                         | spec/002, spec/006          |
| **Source UUID**    | The compendium origin of an owned item. Resolved via `_stats.compendiumSource` (v12+) or `flags.core.sourceId` (legacy). | `getSourceUuid()` in `src/utils/sourceUuid.js`        | spec/006                    |
| ~~**Teaser**~~     | Removed term. Replaced by `discoveryMode` (feature) and `RecipeFragment` (entity). Legacy code references: `listMode: 'teaser'`, `teaserConfig`, `Recipe.teaser`. | Eliminate all references. | (was missing from spec — T-173) |

### Supplementary Concepts

| Term                          | Definition                                                                                                                                       | Code Mapping                                                  | Spec Reference              |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|-----------------------------|
| **Essence**                   | An abstract quality (e.g., "Fire", "Water") attached to components. Optional feature.                                                            | `EssenceDefinition`, `essences` on components/sets            | spec/002                    |
| **Signature**                 | The satisfiable ingredient pattern of an ingredient set, used for alchemy matching and uniqueness validation.                                    | `SignatureValidator`                                          | spec/002, spec/004          |
| **Result Selection Provider** | The mechanism by which a routed/alchemy recipe determines which result group to produce: `ingredientSet`, `macroOutcome`, or `rollTableOutcome`. | `Recipe.resultSelection.provider`                             | spec/002, spec/004          |
| **Shopping List**             | A session-scoped aggregation of materials needed for queued recipes. Not persisted.                                                              | `shoppingListAggregator.js`, `craftingStore` shopping actions | (missing from spec — T-175) |
| **RecipeFragment**            | A Foundry Item designated as a piece of recipe knowledge. When an actor acquires a RecipeFragment, their discovery progress toward the linked recipe advances. Collecting enough fragments unlocks the recipe under `discoveryMode`. Replaces legacy name `TeaserFragment`. | `RecipeFragmentHook` (rename from `FragmentDiscoveryHook`), `TeaserFragment` (legacy — eliminate) | spec/006 (to be written) |
| **Discovery Mode**            | A recipe visibility feature (separate from `listMode`) where recipes are hidden until an actor accumulates sufficient RecipeFragments. Replaces `listMode: "teaser"` and `teaserConfig`. Canonical field: `discoveryMode` on the crafting system. | `discoveryMode`, `discoveryProgress` on actor flags (rename from `teaserConfig`, `Recipe.teaser`) | spec/006 (to be written) |

## Concept Taxonomy

```
Crafting System
├── Resolution Mode (simple | routed | progressive | alchemy)
├── Feature Toggles
│   ├── recipeCategories
│   ├── itemTags
│   ├── essences
│   ├── propertyMacros
│   ├── effectTransfer
│   ├── multiStepRecipes
│   ├── salvage
│   ├── chatOutput (not in spec)
│   ├── craftingChecks (not in spec as feature toggle)
│   ├── outcomeRouting (not in spec as feature toggle)
│   ├── complexRecipes (not in spec — UI-only gate)
│   └── itemPiles (spec/008 integration)
├── Components (library of managed items)
│   ├── Tags
│   ├── Essences (quantities)
│   ├── Difficulty (progressive mode)
│   └── Salvage definition
├── Essence Definitions
├── Recipe Visibility Configuration
│   ├── List Mode (global | player | knowledge)
│   └── Knowledge Mode
├── Discovery Mode Configuration (separate from listMode — spec/006 to be written)
│   ├── enabled flag
│   ├── per-recipe fragment threshold
│   └── RecipeFragment item UUID mappings
├── Crafting Check Configuration
├── Salvage Check Configuration
├── Requirements (time, currency)
└── Alchemy Configuration

Recipe
├── Identity (id, name, description, category)
├── Lifecycle flags (enabled, locked)
├── Ingredient Sets → Ingredient Groups → Ingredients (OR options)
├── Result Groups → Results (multiple result groups always permitted)
├── Catalysts (recipe-level, step-level, set-level)
├── Steps (multi-step mode)
├── Result Selection (provider + config)
├── Visibility (restricted, allowedUserIds)
├── Linked Recipe Item UUID
└── Metadata

Crafting Run
├── Status (inProgress | waitingTime | succeeded | failed | cancelled)
├── Step States
└── History (capped at 50)

Actor Flags
├── learnedRecipes
├── craftingRuns (active + history)
├── salvageRuns (active + history)
└── discoveryProgress (per-recipe fragment accumulation — spec/006 to be written)
```

## Aggregate Map

```mermaid
graph TD
    subgraph "Crafting System Aggregate"
        CS[CraftingSystem]
        CS -->|contains| COMP[Component]
        CS -->|contains| ESS[EssenceDefinition]
        CS -->|configures| VIS[RecipeVisibility]
        CS -->|configures| CHECK[CraftingCheck]
        CS -->|configures| SALV_CHECK[SalvageCraftingCheck]
        CS -->|configures| REQ[Requirements]
        CS -->|configures| ALC[AlchemyConfig]
    end

    subgraph "Recipe Aggregate"
        R[Recipe]
        R -->|references by ID| CS
        R -->|contains| STEP[Step]
        R -->|contains| ISET[IngredientSet]
        ISET -->|contains| IG[IngredientGroup]
        IG -->|contains| ING[Ingredient]
        ING -->|references by ID| COMP
        R -->|contains| RG[ResultGroup]
        RG -->|contains| RES[Result]
        RES -->|references by ID| COMP
        R -->|contains| CAT[Catalyst]
        CAT -->|references by ID| COMP
        R -->|configures| RS[ResultSelection]
    end

    subgraph "Actor State (Flags)"
        RUN[CraftingRun]
        RUN -->|references by ID| R
        LEARNED[LearnedRecipe]
        LEARNED -->|references by ID| R
        DISC[DiscoveryProgress]
        DISC -->|references by ID| R
    end
```

## Domain Events & Lifecycle

### Crafting Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Validating: Player initiates craft
    Validating --> GuardCheck: Recipe validated
    Validating --> Rejected: Validation fails
    GuardCheck --> PreResolution: Guards pass
    GuardCheck --> Rejected: Visibility/knowledge/lock blocks
    PreResolution --> CheckExecution: Ingredients available
    PreResolution --> Rejected: Missing materials
    CheckExecution --> ResultResolution: Check passes (or no check)
    CheckExecution --> Failed: Check fails
    ResultResolution --> Consuming: Result group resolved
    ResultResolution --> MisconfigError: Unresolvable outcome
    Consuming --> Creating: Ingredients consumed
    Creating --> StepComplete: Results created
    StepComplete --> [*]: Last step (run succeeds)
    StepComplete --> WaitingTime: Time gate active
    WaitingTime --> PreResolution: Time elapsed
    StepComplete --> PreResolution: Next step
    Failed --> [*]: Run fails
    Rejected --> [*]
    MisconfigError --> [*]: Abort, no consumption
```

### Alchemy Attempt Lifecycle

```mermaid
stateDiagram-v2
    [*] --> SubmitIngredients: Player submits combination
    SubmitIngredients --> SignatureMatch: Match signatures
    SignatureMatch --> NoMatch: No recipe matches
    NoMatch --> ConsumeOnFail: consumeOnFail=true
    ConsumeOnFail --> FailedAttempt
    SignatureMatch --> RecipeFound: Signature matches
    RecipeFound --> ProviderRouting: Resolve result group
    ProviderRouting --> Success: Valid result group
    ProviderRouting --> MisconfigError: Unresolvable outcome
    Success --> LearnCheck: learnOnCraft?
    LearnCheck --> Learned: First success + learnOnCraft=true
    LearnCheck --> Done: Already learned or disabled
    MisconfigError --> [*]: Abort, no consumption
    FailedAttempt --> [*]
    Learned --> [*]
    Done --> [*]
```

## Bounded Contexts

### 1. Crafting Configuration (GM Domain)
- Crafting System definition
- Component library management
- Recipe authoring and validation
- Feature toggle management
- Resolution mode and check configuration
- Recipe visibility configuration

### 2. Crafting Execution (Player Domain)
- Recipe listing and filtering
- Ingredient satisfaction evaluation
- Craft execution (including alchemy attempts)
- Run management (start, resume, complete, cancel)
- Result creation and item mutation
- Shopping list aggregation

### 3. Knowledge & Visibility (Cross-cutting)
- List mode evaluation (global/player/knowledge/teaser)
- Knowledge access (item/learned/itemOrLearned)
- Recipe item matching (UUID + source UUID resolution)
- Learn operations (drag-drop and manual)
- Discovery progress (teaser fragments)

### 4. Data Migration (Infrastructure)
- Migration runner with checkpoint/rollback
- Legacy field normalization
- Canonical-write / legacy-read compatibility

### 5. Module Integration (Infrastructure)
- Item Piles integration
- Simple Calendar integration (planned)
- Foundry document hooks

## Open Questions

### ~~OQ-1: `Component` vs `Item` — triple-alias on system object~~ CLOSED

**Decision (2026-03-10):** `components` is the canonical field name on the system data object. `items` and `managedItems` become legacy read-only aliases and must not be used in new code. Tracked in Issue #101.

### ~~OQ-2: `complexRecipes` feature flag — not in spec~~ CLOSED

**Decision (2026-03-10):** Remove `features.complexRecipes` entirely. Replace it with two explicit, mode-derived rules:

1. **Multiple result groups** — permitted for all recipes regardless of resolution mode, to support "pick one reward" and similar patterns. The UI always shows result group controls.
2. **Multiple ingredient sets (groups)** — permitted only when resolution mode is `routed` or `alchemy`. The UI shows ingredient set controls only when those modes are active.

There is no persistent flag. Control visibility is derived from resolution mode at render time. The spec and UI must make the distinction between these two rules explicit. Tracked in Issue #102.

### ~~OQ-3: `chatOutput`, `craftingChecks`, `outcomeRouting` feature flags — not in spec~~ CLOSED

**Decision (2026-03-10):**

- **`chatOutput`** — Remove from per-crafting-system `features`. Promote to a module-level setting (registered in Foundry module settings), defaulting to `true`. It is not part of the crafting system data model and must not appear in spec/002. A new section in the spec (or spec/001) should document module-level settings.
- **`craftingChecks`** — Remove entirely. `craftingCheck.enabled` on the check configuration object is the sole source of truth for whether checks are active.
- **`outcomeRouting`** — Remove entirely. Derive from `resolutionMode`: outcome routing is only meaningful when mode is `routed` or `alchemy`.

Tracked in Issue #106.

### ~~OQ-4: `tier` field on Component — orphaned~~ CLOSED

**Decision (2026-03-10):** Remove `tier` from `_normalizeComponent` entirely. It is dead data — the legacy outcome-routing predecessor was removed in T-166 and `difficulty` already serves the progressive mode purpose. Tracked in Issue #103.

### ~~OQ-5: `difficulty` object on CraftingSystem — orphaned~~ CLOSED

**Decision (2026-03-10):** Remove the system-level `difficulty` object (`{ base, tierWeight, tagWeights, essenceWeights }`) from `_normalizeSystem` entirely. Code audit confirms it is written once (line 62, `CraftingSystemManager.js`) and never read — `CraftingCheckAdapter`, `CraftingEngine`, and `ResolutionModeService` all read `difficulty` from component/item objects only. Tracked in Issue #104.

### ~~OQ-6: `mapped` and `tiered` still accepted at runtime normalization~~ CLOSED

**Decision (2026-03-10):**

- **Migration:** Both `"tiered"` and `"mapped"` must be migrated to `"routed"` via a formal data migration that rewrites the stored `resolutionMode` value. Runtime normalization must not silently shim them. Rationale: `tiered` selected exactly one result group based on a check outcome (single selection semantics), which matches `routed` — not `progressive`, which awards all results *up to and including* the outcome level (cumulative semantics). `mapped` was the direct predecessor to `routed` and shares identical semantics.
- **Normalization:** After migration, `_normalizeResolutionMode` must throw an error on any unrecognised mode string. There is no silent fallback. The four valid values are `"simple"`, `"routed"`, `"progressive"`, and `"alchemy"`.

Tracked as T-259.

### ~~OQ-7: Salvage — spec-complete but partially implemented~~ CLOSED

**Decision (2026-03-10):** Implement salvage fully to match the spec. Deliverables:

1. `SalvageRunManager` — a full execution lifecycle manager parallel to `CraftingRunManager`.
2. Complete salvage execution paths in `CraftingEngine`.
3. `salvageResolutionMode` references updated — valid salvage modes are exactly `"simple"`, `"routed"`, and `"progressive"`. `"alchemy"` is invalid for salvage because salvage always decomposes one known component rather than discovering results from blind input submission.
4. Actor flags for `salvageRuns` (active + history) wired end-to-end.

The spec (spec/005) remains authoritative for the salvage lifecycle. Tracked in Issue #110.

### ~~OQ-8: Teaser mode — fully implemented but unspecced~~ CLOSED

**Decision (2026-03-10):**

- **Spec placement:** Document in spec/006 (recipe visibility). No new spec file.
- **Architecture:** `discoveryMode` is promoted out of `listMode`. It becomes its own top-level feature with its own configuration block on the crafting system. `listMode: "teaser"` is a removed value; the four valid `listMode` values remain `global`, `player`, `knowledge`, and the fourth (TBD — teaser was the fourth; this may reduce listMode to three values if discovery mode is fully separate).
- **Rename — feature:** `teaser` → `discoveryMode`. All references to `teaserConfig`, `Recipe.teaser`, and `listMode: "teaser"` must be updated.
- **Rename — entity:** `TeaserFragment` → `RecipeFragment`. A `RecipeFragment` is a Foundry Item that, when acquired by an actor, advances that actor's discovery progress toward a specific recipe. `RecipeFragment` emphasises that the fragment is a piece of a recipe's knowledge, not merely a teaser. `FragmentDiscoveryHook` should be renamed to `RecipeFragmentHook` or similar.
- **Domain entity:** `RecipeFragment` is a first-class entry in the Ubiquitous Language (see table update below).

Tracked via T-171 through T-174, T-182, T-186, T-187, T-270.

## Research Notes

### D&D 5e 2024 Crafting
- **Key concepts:** Tool proficiency as gate, gold cost = 50% item value, 10 GP/day progress, magic items require specific tool proficiency.
- **Fabricate relevance:** Fabricate's catalyst concept maps well to tool proficiency requirements. Fabricate lacks a "crafting time as gold progress" model — the time requirement is duration-based, not progress-based. A "daily progress" crafting model could be a future resolution mode or time requirement variant.

### Pathfinder 2e Crafting
- **Key concepts:** Formula (recipe knowledge gate), Craft check (skill check with critical success/failure), batch crafting (up to 4 consumables at once), reduced time with formulas.
- **Fabricate relevance:** PF2e's "formula" concept maps directly to Fabricate's `linkedRecipeItemUuid` + knowledge mode. Batch crafting (quantity multiplier on a single craft action) is not supported by Fabricate but would be useful — the shopping list aggregates quantities but crafting is still per-recipe. Critical success/failure maps to routed mode with `macroOutcome`.

### FFXIV Crafting
- **Key concepts:** Crafting Log (recipe browser), Quality/Progress dual resource, Durability limit, CP resource, HQ ingredients boost quality, multi-step rotation, Condition randomness.
- **Fabricate relevance:** FFXIV's Crafting Log is the closest analog to Fabricate's CraftingApp. FFXIV's quality dimension (probability of HQ) has no Fabricate equivalent — progressive mode awards by threshold, not probability. FFXIV's "use HQ ingredients for better output" maps to Fabricate's essence/effect transfer concept.

### Game Design Taxonomy (DHQ 2017)
- **Key concepts:** Seven features of crafting systems: Recipe Definition, Fidelity of Action, Completion Constraints, Variable Outcome, System Recognition, Player Expressiveness, Progression.
- **Fabricate relevance:** Fabricate is strong on Recipe Definition and Variable Outcome. It is weak on Player Expressiveness (no free-form crafting outside alchemy) and Progression (no character-level crafting skill advancement). The taxonomy confirms Fabricate's resolution modes cover the core design space: simple (fixed outcome), routed (variable outcome), progressive (skill-based), alchemy (discovery).

### Other VTT Modules
- **Furukai's Simple Crafting:** Three recipe types (text, items, tags). Simpler than Fabricate but validates that item-tag matching is a common need.
- **Fabricate v1:** The predecessor. Key learning: the v1 "Essence" system was unique but underused. v2's progressive complexity principle (start simple, add features) was a response to v1's all-or-nothing complexity.

### Naming Patterns Across Systems
| Fabricate Term  | D&D 5e    | PF2e       | FFXIV            | Common Alternative           |
|-----------------|-----------|------------|------------------|------------------------------|
| Component       | Material  | Material   | Material/Crystal | Material, Resource           |
| Recipe          | —         | Formula    | Recipe           | Recipe, Blueprint, Schematic |
| Ingredient      | Component | Ingredient | Material         | Ingredient, Input            |
| Catalyst        | Tool      | Tool       | —                | Tool, Equipment              |
| Result          | Product   | Output     | Item             | Product, Output              |
| Crafting System | —         | —          | Crafting Class   | —                            |
| Essence         | —         | —          | Aspect/Crystal   | Property, Aspect             |
| Alchemy         | —         | —          | —                | Discovery, Experimentation   |

**Observation:** Fabricate's "Component" (curated item library entry) and "Ingredient" (recipe input requirement) are well-differentiated in the spec but frequently confused in code comments and UI, where "component" sometimes means "Foundry component source actor" (as in `componentSourceActors`). The term "Component" collides with Svelte components and Foundry's own component terminology.
