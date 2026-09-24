/**
 * The ordered migration registry a startup pass runs, sealed entries first. A new migration is
 * appended to the current half below in version order.
 */

import { mergeEquivalentWorldEssences } from './mergeEquivalentWorldEssences.js';
import { migrateCharacterLibrariesToWorldScope } from './migrateCharacterLibrariesToWorldScope.js';
import { migrateComponentEssenceSections } from './migrateComponentEssenceSections.js';
import { migrateCurrencyToWorldScope } from './migrateCurrencyToWorldScope.js';
import { migrateDefaultOnTimeRequirements } from './migrateDefaultOnTimeRequirements.js';
import { migrateManualCompositionForces } from './migrateManualCompositionForces.js';
import { migrateMaxModifierPicks } from './migrateMaxModifierPicks.js';
import { migrateRetireCraftingModToken } from './migrateRetireCraftingModToken.js';
import { migrateRetireProgressiveAllowPlayerReorder } from './migrateRetireProgressiveAllowPlayerReorder.js';
import { migrateSeedFailureResultPolicy } from './migrateSeedFailureResultPolicy.js';
import { migrateSubjectModifierMarks } from './migrateSubjectModifierMarks.js';
import { migrateSystemCheckModifierCatalogue } from './migrateSystemCheckModifierCatalogue.js';
import { migrateToolRequirementSections } from './migrateToolRequirementSections.js';
import { migrateTravelToWorldScope } from './migrateTravelToWorldScope.js';
import { migrateUnifyModifierLibraries } from './migrateUnifyModifierLibraries.js';
import { migrateWorldScopeEntities } from './migrateWorldScopeEntities.js';
import { SEALED_MIGRATIONS } from './sealedMigrationRegistry.js';

/** The entries from 1.18.0, every one carrying a `downgradeTo` for GM recovery guidance. */
const CURRENT_MIGRATIONS = [
  {
    version: '1.18.0',
    label:
      'Strip the retired system-level progressive allowPlayerReorder from the crafting, ' +
      'salvage and gathering checks (the reorder permission now lives on the recipe and on salvage)',
    // Lossless: it removes only a key that release ignored.
    downgradeTo: '1.17.0',
    migrate: (data) => migrateRetireProgressiveAllowPlayerReorder(data.systems),
  },
  {
    version: '1.19.0',
    label:
      'Default-on the recipe time requirement for upgraded worlds: delete a persisted ' +
      'requirements.time.enabled === false (the pre-toggle normalizer coercion of an absent ' +
      'flag), so the new default-on reader keeps existing timed recipes running',
    // Lossless: the pre-714 normalizer re-coerces the deleted flag to `false`.
    downgradeTo: '1.18.0',
    migrate: (data) => migrateDefaultOnTimeRequirements(data.systems),
  },
  {
    version: '1.20.0',
    label:
      'Cap the modifier picks of systems already on the playerPicks combination rule at ' +
      'craftingCheck.maxModifierPicks = 1, the single pick that rule always meant, so the ' +
      'new generalized cap does not silently widen them to unlimited',
    // Lossless: the allowlist drops `maxModifierPicks`, and `playerPicks` there means "pick one".
    downgradeTo: '1.19.0',
    migrate: (data) => migrateMaxModifierPicks(data),
  },
  {
    version: '1.21.0',
    label:
      'Retire the check-modifier roll-formula placeholder: strip it from every stored ' +
      'crafting, salvage and gathering check formula, because the resolved modifier ' +
      'scalar is now appended automatically as a flavoured term',
    // Data-lossless but behaviour-lossy: 1.20.0 resolves modifiers only through the stripped
    // placeholder. Reports through the transient `_retiredCraftingModCounts`.
    downgradeTo: '1.20.0',
    migrate: (data) => migrateRetireCraftingModToken(data),
  },
  {
    version: '1.22.0',
    // A lossy downgrade is stated in the label, the only text `migrationRecoveryPrompt` shows a
    // GM beside the Keep and Downgrade buttons.
    label:
      'Lift the check-modifier catalogue out of craftingCheck up to the system, so ' +
      'salvage and gathering can select over the same one, and rewrite the byRecipe ' +
      'combination rule to its activity-independent name bySubject. THE RUNNER ORDER IS ' +
      'LOAD-BEARING: this runs before any manager load, and _normalizeCraftingCheck is an ' +
      'allowlist rebuild that no longer emits checkModifiers, so a save running first ' +
      'would have DELETED the catalogue rather than relocating it. DOWNGRADING IS NOT ' +
      'LOSSLESS, and this is the first migration in this registry of which that is true: ' +
      '1.21.0 never saw a system-level checkModifiers, so it drops the relocated catalogue ' +
      'on the first read and every check modifier stops contributing to every roll until ' +
      'you re-author it. Your formulas and combination rules are unaffected',
    downgradeTo: '1.21.0',
    // A marked entry must name the loss in its label, which `tests/migration-runner.test.js`
    // enforces registry-wide. `1.21.0` is not marked: behaviour-lossy is a different fact.
    downgradeLosesData: true,
    migrate: (data) => migrateSystemCheckModifierCatalogue(data),
  },
  {
    version: '1.23.0',
    label:
      'Merge the two modifier libraries a crafting system authored — the check-modifier ' +
      'catalogue and the gathering character-modifier library — into one system.modifiers, ' +
      'so a named actor expression is defined once and referenced by checks, drop rows, ' +
      'events and stamina costs alike. An id authored in BOTH libraries keeps the check ' +
      "entry's id and the gathering entry is re-keyed with a -gathering suffix, with every " +
      'gathering reference rewritten to match. THE RUNNER ORDER IS LOAD-BEARING: this runs ' +
      'before any manager load, and both normalizers are allowlist rebuilds that no longer ' +
      'emit the old keys, so a save running first would have DELETED both libraries rather ' +
      'than merging them. DOWNGRADING IS NOT LOSSLESS: 1.22.0 never saw system.modifiers, ' +
      'so it drops the merged library on the first read — every check modifier stops ' +
      'contributing to every roll AND every gathering drop row, event and stamina cost ' +
      'loses the modifier it references, until you re-author both libraries',
    downgradeTo: '1.22.0',
    downgradeLosesData: true,
    // Reports through the transient `_unifiedModifierCollisions`.
    migrate: (data) => migrateUnifyModifierLibraries(data),
  },
  {
    version: '1.24.0',
    label:
      'Give the routed check its own DC source, so a routed relative check can compute its ' +
      'base DC from a macro exactly as a simple check can. NO DATA IS REWRITTEN: the ' +
      'routed normalizer defaults an absent dcMode to static, so every existing system ' +
      'loads unchanged and this entry exists to mark the version boundary. DOWNGRADING IS ' +
      'NOT LOSSLESS: 1.23.0 never saw routed.dcMode or routed.macroUuid, and its routed ' +
      'normalizer is an allowlist rebuild that does not emit them, so the first save on ' +
      'that build DELETES both — a routed check set to Dynamic silently reverts to its ' +
      'static DC and loses the macro link, which you must re-author',
    downgradeTo: '1.23.0',
    downgradeLosesData: true,
    // A deliberate no-op: absence already reads as `static`; the entry marks the boundary the
    // recovery prompt warns at.
    migrate: (data) => data,
  },
  {
    version: '1.25.0',
    // No lossy-downgrade clause: this downgrade is clean.
    label:
      'Seed the new per-activity failure-result policy to "never" on every crafting, ' +
      'salvage and gathering check that already exists, so NO EXISTING WORLD CHANGES ' +
      'BEHAVIOUR. A failed check can now produce an authored failure result, and a ' +
      'newly-created system decides that per record — but a system you authored before ' +
      'this release was authored against an engine that could not produce on failure at ' +
      'all. A salvage component may already carry a reserved failure result group that ' +
      'has always awarded nothing; without this seed the upgrade would start awarding it ' +
      'on every failed salvage. Turn the policy on yourself, per activity, per system. ' +
      'Checks that do not exist yet are left alone, and DOWNGRADING IS LOSSLESS: 1.24.0 ' +
      'does not emit this key, drops it on the first save, and has no failure-result ' +
      'capability for it to govern',
    downgradeTo: '1.24.0',
    migrate: (data) => migrateSeedFailureResultPolicy(data),
  },
  {
    version: '1.26.0',
    label:
      'Move the currency configuration from each crafting system to WORLD scope. The coin ' +
      'ladder, spend strategy, provider and macro set now live once per world, because a ' +
      'world runs exactly one game system and so has exactly one way actors store coins; a ' +
      'crafting system keeps only whether it participates. Units from every system are ' +
      'UNIONED by unit id (the first system wins an id collision) because recipe and salvage ' +
      'currency requirements reference units by id, so dropping any unit would orphan them. ' +
      'The strategy, provider and macros cannot be unioned, so they are taken from the first ' +
      'system that had currency ENABLED. If two of your systems configured DIFFERENT ' +
      'strategies or providers, only one survives — check World > Currency afterwards. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.25.0 reads currency only from the crafting system, so it ' +
      'would find no configuration at all and every authored currency cost would stop ' +
      'resolving until you re-authored it per system',
    downgradeTo: '1.25.0',
    downgradeLosesData: true,
    migrate: (data) => migrateCurrencyToWorldScope(data),
  },
  {
    version: '1.27.0',
    label:
      'Move the travel configuration from each crafting system to WORLD scope. Realms, their ' +
      'map region links, the reveal mode and the modifier visibility now live once per world, ' +
      'because realms are geography — the same valley is the same valley whichever crafting ' +
      'system a character is there to serve — and a crafting system keeps only whether it ' +
      'participates. Realms from every system are UNIONED by realm id (the first system wins ' +
      'an id collision) because environments, party overrides and character discovery all ' +
      'reference realms by id, so dropping any realm would orphan them. Two systems that ' +
      'authored a realm of the SAME NAME keep both records; merge them by hand if you want ' +
      'one. The reveal mode and modifier visibility cannot be unioned, so they are taken from ' +
      'the first system that had travel ENABLED — if two of your systems set DIFFERENT reveal ' +
      'modes, only one survives, so check World > Travel afterwards. Each party now has ONE ' +
      'current-realm override rather than one per system, keeping the most recently set. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.26.0 reads realms only from the crafting system, so it ' +
      'would find none, every realm-gated environment would report no current realm, and ' +
      'Travel would go dark until you re-authored it per system',
    downgradeTo: '1.26.0',
    downgradeLosesData: true,
    migrate: (data) => migrateTravelToWorldScope(data),
  },
  {
    version: '1.28.0',
    label:
      'Move the character prerequisite library and the modifier library from each crafting ' +
      'system to WORLD scope. Both describe the acting CHARACTER rather than the crafting ' +
      'system — a proficiency requirement is a fact about a character, and an ability modifier ' +
      'is a number read off a character sheet — so a world running three systems was ' +
      'maintaining three copies of every rule. Unlike currency and travel, NOTHING stays on the ' +
      'crafting system: there is no participation flag, because an unreferenced entry costs ' +
      'nothing. Entries from every system are UNIONED by id, per library, with the first system ' +
      'winning a collision, because books, tools, complications, recipes, components, gathering ' +
      'tasks, drop rows and events all reference entries by id and dropping one would orphan ' +
      'them. COLLISIONS ARE COMMON HERE, unlike the earlier moves: preset ids are stable slugs ' +
      'such as "smithsTools" and "perception", so seeding presets in two systems collides on ' +
      'every seeded entry, and presets are editable afterwards. Where two systems disagreed ' +
      'about what an id MEANS only one survives, so the reference still resolves but to a ' +
      'different rule — every such case is reported by name, and identical copies are not, so ' +
      'the list you see is the list that actually changed something. Check World > Character ' +
      'prerequisites and World > Modifiers afterwards. DOWNGRADING IS NOT LOSSLESS: 1.27.0 ' +
      'reads both libraries only from the crafting system, so it would find none, every ' +
      'learning gate and tool requirement would stop resolving and every check modifier would ' +
      'contribute nothing until you re-authored them per system',
    downgradeTo: '1.27.0',
    downgradeLosesData: true,
    migrate: (data) => migrateCharacterLibrariesToWorldScope(data),
  },
  {
    version: '1.29.0',
    label:
      'Give every gathering environment ONE list that decides what it composes. Force add is ' +
      "now an override of AUTOMATIC mode's biome-and-danger filter, which is the only mode " +
      'that has a filter to override; MANUAL mode composes exactly the records you picked, ' +
      "matching or not. So each manual environment's force-added tasks and events are FOLDED " +
      'into its picked list — appended in order, de-duplicated, with the display order left ' +
      'alone — because force add rendered in manual mode until now, and a manual environment ' +
      'whose picks were all force-added would otherwise compose NOTHING after the upgrade. ' +
      'Force lists are then cleared on every environment, automatic ones included: force add ' +
      'has never rendered in automatic mode in any released version, so an entry there is ' +
      'residue from a manual editing session or from an imported bundle, it composed nothing ' +
      'before and it must compose nothing now — which is what keeps the documented guarantee ' +
      'that switching a manual environment to automatic does not silently make its force-added ' +
      'non-matching records available. NO ENVIRONMENT LOSES OR GAINS A COMPOSED RECORD. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.28.0 filters a manual environment by match and reads an ' +
      'empty force list, so every non-matching record this migration rescued would vanish from ' +
      'the environment again, with no force list left to re-express it',
    downgradeTo: '1.28.0',
    downgradeLosesData: true,
    migrate: (data) => migrateManualCompositionForces(data),
  },
  {
    version: '1.30.0',
    label:
      'Give the world ONE record per component, essence and tool, instead of one per crafting ' +
      'system. The same real item registered in three systems was three unrelated records with ' +
      'three names, three images and three descriptions; it is now one WORLD entity plus one ' +
      'membership record per system. Records are merged by SOURCE ITEM — never by name, so two ' +
      'unlinked entries that merely share a name are left alone — and the OLDEST contributing ' +
      "system's identity wins the whole group, as a unit. Every rename is reported by name with " +
      'the two systems it spans, and every other reference to a re-keyed id is rewritten across ' +
      'your recipes, systems and gathering config in the same pass. NO SYSTEM CHANGES BEHAVIOUR: ' +
      'every membership record is created fully OVERRIDING, so each system keeps exactly the ' +
      'category, tags, effect source, macro, breakage, on-break, prerequisites, check bonus ' +
      'and repair recipe it had, and ' +
      'no world defaults are written at all — a system created later inherits nothing until you ' +
      'author them. Essences are matched by id and are never re-keyed. Where a system could ' +
      'not be re-keyed safely the pass REFUSES that system outright and reports it, rather than ' +
      'making a definition unreachable. Owned items keep resolving throughout: their durable ' +
      'identity flags are remapped by a one-shot pass on the next reload, and until it runs they ' +
      'resolve by source item instead. TWO CAVEATS. Once the world scope is seeded, a reference ' +
      'that already pointed at nothing becomes prunable on the next save — those are listed for ' +
      'you. And DOWNGRADING IS LOSSLESS FOR DATA but pins one setting: 1.29.0 neither reads nor ' +
      'writes the three world scope settings, so they survive untouched and a re-upgrade finds ' +
      'them intact, but 1.29.0 re-mints a concrete "tool specific" breakage authority onto every ' +
      'system, which pins a system out of a world authority that a later release lets you author',
    downgradeTo: '1.29.0',
    // Unmarked after checking (issue 1363): the `toolSpecific` re-minting is data-lossless, so it
    // is a label caveat; `tests/world-scope-migration-runner.test.js` holds both arms.
    downgradeLosesData: false,
    // Reports through the transient `_worldScopeEntityReport`; dangling references are reported,
    // never pruned (requirement 18).
    migrate: (data) => migrateWorldScopeEntities(data),
  },
  {
    version: '1.31.0',
    label:
      "Record each crafting system's own Tool prerequisites and check bonus as its own, now that " +
      'both are world defaults a system can inherit. Every Tool in every system keeps exactly ' +
      'the prerequisites and the check bonus it had, written down as that system’s override so ' +
      'nothing changes; no world default is created, because a Tool that requires nothing and ' +
      'one nobody ever configured are stored identically and guessing between them would put ' +
      'words in your mouth. Author the world defaults yourself on the Tools Catalogue when you ' +
      'want systems to share them. DOWNGRADING IS LOSSLESS: 1.30.0 reads a Tool’s ' +
      'prerequisites and bonus from the crafting system exactly as before and ignores the ' +
      'overrides this pass wrote, which survive untouched for a re-upgrade',
    downgradeTo: '1.30.0',
    // Lossless: the added membership keys are outside 1.30.0's `TOOL_SECTIONS`, so it ignores them.
    downgradeLosesData: false,
    migrate: (data) => migrateToolRequirementSections(data),
  },
  {
    version: '1.32.0',
    label:
      'Give every component ONE set of world essence values, shared by the crafting systems ' +
      'that use it. Each world component now carries the essence values it has in the oldest ' +
      'system holding rules for it, and every system whose own values already match is marked ' +
      'as inheriting them, so an edit on the Component Catalogue reaches those systems at once; ' +
      'a system whose values differ keeps its own as its override and is untouched until you ' +
      'choose otherwise in its rules editor. NO SYSTEM CHANGES BEHAVIOUR: a system marked as ' +
      'inheriting already had exactly the world values, and a system that did not keeps what ' +
      'it had. A component with no essence values anywhere gets no world values until you ' +
      'author them. DOWNGRADING IS NOT LOSSLESS: 1.31.0 reads each system’s own essence values ' +
      'and ignores the world values, so any world values you edit after this migration stop ' +
      'reaching the systems that inherit them, and the world values themselves are dropped from ' +
      'the setting on the first world-scope save there',
    downgradeTo: '1.31.0',
    // A world map a GM edits afterwards is outside 1.31.0's `COMPONENT_SECTIONS`, so the next
    // save drops it: data loss.
    downgradeLosesData: true,
    migrate: (data) => migrateComponentEssenceSections(data),
  },
  {
    version: '1.33.0',
    label:
      'Keep every check modifier your recipes, components and gathering tasks already pick. ' +
      'Under the "each subject picks its own" rule, the check now MARKS which modifiers a ' +
      'subject may choose from — the Selectable switches on the Checks tab — and a pick the ' +
      'check does not mark no longer rolls. A check where nothing was ever marked would ' +
      'therefore have stopped applying every pick in your world at once, so each one is ' +
      'marked with exactly the modifiers its own subjects already pick, and every record ' +
      'that was inheriting that empty mark is given an explicit pick of no modifiers — ' +
      'which is what it was already rolling, because an empty mark was all it had to ' +
      'inherit. NO ROLL CHANGES: every record contributes exactly what it contributed ' +
      'before, and the Checks tab now shows the modifiers your subjects actually use as ' +
      'Selectable rather than showing none of them. The records that gained an explicit ' +
      'pick read "No modifiers" where they read "Inherit system default" before; both add ' +
      'nothing. Checks on the other three rules are untouched, and a check where you HAD ' +
      'marked something is left exactly as you set it. DOWNGRADING IS LOSSLESS: 1.32.0 ' +
      'reads a subject’s own picks whatever the check marks, and reads an explicit pick ' +
      'of no modifiers exactly as this release does, so nothing changes in that direction ' +
      'either',
    downgradeTo: '1.32.0',
    // Only adds ids to a mark and an empty pick; `1.32.0` reads the mark as a default, not a
    // bound, so every subject rolls as before.
    downgradeLosesData: false,
    migrate: (data) => migrateSubjectModifierMarks(data),
  },
  {
    version: '1.34.0',
    label:
      'Give the world ONE record per essence BEHAVIOUR, instead of one per crafting system. ' +
      "Until now the world's essence list held a separate record for every system's copy of the " +
      'same essence — three systems with Iron gave you three Iron essences — because the world ' +
      'scope migration matched essences by id, and an essence id is minted separately inside ' +
      'each system rather than shared between them. World essences whose name, property macro ' +
      'and active-effect source all match are now ONE essence, and every reference to the ones ' +
      'retired is rewritten across your recipes, components, crafting systems and gathering ' +
      'config in the same pass. Every essence that merged is listed for you by name with the ' +
      'systems it came from. NO SYSTEM CHANGES BEHAVIOUR: each system keeps its own effect ' +
      'source, property macro and enabled switch — written down as its own override wherever it ' +
      'was relying on the world record it is leaving — and two component essence values that ' +
      'land on the same essence are ADDED together rather than one replacing the other. Each ' +
      'system also keeps the name, icon, colour and description it gave its own copy, so the ' +
      'catalogue may now report that your systems DISAGREE about how one essence looks; that ' +
      'report is accurate, it is what your systems really say, and it is not an error. Where a ' +
      'merge could not be made safely — two equivalent essences inside ONE system, or an effect ' +
      'source this pass cannot prove names the same component — the whole group is REFUSED and ' +
      'reported rather than merged on a guess: nothing is changed for those essences and you can ' +
      'still merge them yourself. THE MERGE IS IRREVERSIBLE: a retired essence record is deleted ' +
      'with its name, icon, colour and description, its id is never handed out again, and no ' +
      'downgrade brings it back. DOWNGRADING IS LOSSLESS FOR DATA even so: 1.33.0 reads every ' +
      'setting this pass touched with unchanged rules and the new merge record survives ' +
      'untouched for a re-upgrade, so going back costs you nothing further — it simply does not ' +
      'undo the merge',
    downgradeTo: '1.33.0',
    // Unmarked (issue 1654, requirement 15): the loss is at migration time, not on downgrade.
    downgradeLosesData: false,
    // Reports merged, refused, declined and orphaned through `_worldEssenceMergeReport`.
    migrate: (data) => mergeEquivalentWorldEssences(data),
  },
];

/** Every registered migration in version order; the runner is not told the registry is split. */
export const MIGRATIONS = Object.freeze([...SEALED_MIGRATIONS, ...CURRENT_MIGRATIONS]);
