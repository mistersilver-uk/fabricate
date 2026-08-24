# Resolution Modes

## Purpose

Define semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix resolution modes inside one crafting system.
- Mode changes are **migration-first** and governed by
  `destructive-changes-and-migrations/spec.md`:
  recipes are migrated to fit the new mode wherever possible and a recipe is
  deleted only when a per-recipe *structural* constraint of the target mode cannot
  be satisfied by clearing the result selection or collapsing a multi-set recipe.
  System-level gaps (a target mode that needs a check the system has not
  configured, an alchemy signature collision, ...) never delete a recipe; they are
  surfaced as system-validation issues that gate visibility, not deletion.
- **Migratability matrix (normative).**
  The columns are the *target* mode and the rows the *source* mode.
  RI = `routedByIngredients`, RC = `routedByCheck`.
  Migrating *into* alchemy no longer seeds a per-recipe provider (retired, issue 554):
  it clears any stale `resultSelection` and collapses a multi-INGREDIENT-SET recipe
  to its first set (best-effort, single `console.warn`); the system-level
  `alchemy.checkMode` is seeded separately (defaults to `none`, or via the
  `hasCheckProvider`/`hasTieredShape` reduction on the startup migration).
  "clear" sets `resultSelection` to `null`;
  "carry" keeps the recipe verbatim;
  "reconcile" means the recipe survives but its stale routing is surfaced as a
  re-authoring validation issue, never silently mis-routed;
  "1×1" means the recipe has exactly one ingredient set and one result group.

  | From \ To             | `simple`                     | `routedByIngredients`        | `routedByCheck`                          | `progressive`                | `alchemy`                                                           |
  |-----------------------|------------------------------|------------------------------|------------------------------------------|------------------------------|--------------------------------------------------------------------|
  | `simple`              | —                            | clear                        | clear; reconcile                         | clear                        | clear; collapse multi-set                                          |
  | `routedByIngredients` | clear if 1×1 else **delete** | —                            | carry; reconcile                         | clear if 1×1 else **delete** | clear; collapse multi-set; single-step else **delete**            |
  | `routedByCheck`       | clear if 1×1 else **delete** | carry; reconcile             | —                                        | clear if 1×1 else **delete** | clear; collapse multi-set; single-step else **delete**            |
  | `progressive`         | clear                        | clear                        | clear; reconcile                         | —                            | clear; collapse multi-set                                          |
  | `alchemy`             | clear if 1×1 else **delete** | carry                        | carry; reconcile                         | clear if 1×1 else **delete** | —                                                                  |

  The only structural delete causes are: narrowing into `simple`/`progressive`
  (which require 1×1) from a recipe with more than one ingredient set or result
  group, and moving a multi-STEP recipe into `alchemy` (which has no multi-step
  support).
Moving a multi-INGREDIENT-SET recipe into `alchemy` is a best-effort
  collapse to the first set, NOT a delete.
  `RI↔RC` never deletes (`carry`); it reconciles stale routing.
  Re-running a `carry` migration with no reconcile pending is a no-op (idempotent).
- Mode *cardinality* checks (e.g. "must have exactly/at least N ingredient set/result group", progressive "requires ordered results") are *completeness* and are waived under structural-only validation (`ResolutionModeService.validateRecipe(recipe, { requireComplete: false })`, used when persisting an authoring incomplete shell); mode *reference-integrity* checks always apply, per mode: `routedByIngredients` checks the invalid `resultGroupId` integrity, and `routedByCheck` checks the reserved/duplicate `ResultGroup.name`. (The routed modes carry no `resultSelection.provider`, so there is no provider value to validate.) (Legacy `mapped`/`tiered` are not live modes; they are accepted only as one-time migration inputs per `destructive-changes-and-migrations/spec.md §Resolution-Model Migration`, which hard-migrates `mapped → routedByIngredients` and `tiered → routedByCheck`.)

## Mode Matrix

| Mode                  | Ingredient Sets | Result Groups               | Check Requirement  | Routing Basis                       |
|-----------------------|-----------------|-----------------------------|--------------------|-------------------------------------|
| `simple`              | exactly 1       | 1 success (+ optional reserved failure group) | optional | single result group                 |
| `routedByIngredients` | one or more     | one or more                 | optional           | `IngredientSet.resultGroupId`       |
| `routedByCheck`       | one or more     | one or more                 | required           | system routed-check outcome         |
| `progressive`         | exactly 1       | exactly 1 (ordered results) | required           | numeric value spending              |
| `alchemy`             | exactly 1       | per `checkMode` (see below) | none / required-when-simple / required-when-tiered | system `alchemy.checkMode`          |

## Check Source

- Every mode's check has a single supported source: a GM-authored roll formula (`craftingCheck.simple` / `routed` / `progressive.rollFormula`) that the engine rolls and evaluates natively.
This built-in dice-expression check is the low-complexity path for GMs who do not need dnd5e/pf2e-specific stat integration — no macro and no game-system adapter is required or supported.
- A **Standalone Check Roll** published to a companion (`companion-api/spec.md`) consults **none** of this section: no modifier catalogue, no `defaultModifierPolicy`, no `bySubject` pick, no `maxModifierPicks`, no tool bonus, no authored trigger, no tier stepping and no `failureResultPolicy`.
It has no subject and no crafting system to draw them from, so it is the check-roll mechanics **without** the system-derived terms.
A companion that wants a system's modifiers applied routes a real craft or salvage instead.
- The published member applies the **post-shim** usability test below **before** dispatching to a runner, so a formula the retirement shim empties is refused as `noFormula` rather than reaching `runFormulaPassFail`'s non-blocking `engine: false` branch and passing with the DC ignored.
The same branch remains reachable from a **direct** runner caller and is tracked as `fabricate#1296`; the published member refuses in front of it rather than repairing it.
- A check is **usable** IFF its mode's `rollFormula` is authored.
The historical macro-as-check-source and the `checkSource: "builtIn"` game-system adapter (`builtIn: { ability, skill, dc, advantage }`) were removed in 1.8.0 and are not part of the model; see `data-models` requirement 30 and its *Crafting Check Macro Contract* section.
- Each of the three activity checks carries a **failure-result policy**, `failureResultPolicy` (`'never' | 'perRecord' | 'always'`), answering whether a FAILED check may produce a result at all.
It SELECTS an authored failure output and never fabricates one, so `always` on a record authoring none produces nothing; `perRecord` and `always` therefore share ONE runtime predicate and differ as GM-facing declarations of intent.
A newly-created system defaults to `perRecord`; an absent or unrecognized value normalizes to `perRecord` on read; and the `1.25.0` seed migration writes `never` onto every check block already on disk, so no upgraded world changes behaviour.
Its reach is bounded by what each mode's model can express: real on crafting `simple` and alchemy `simple` and on salvage `simple` (the reserved `role: 'failure'` group, selected BY ROLE and never by index); real on crafting `routedByCheck` and salvage `routed`, where — and only where — the policy permits, failure-marked outcome tiers become assignable in the recipe result-authoring UI, route with a `disposition: 'failure'`, and are PRODUCED by the crafting failure branch (see `recipes-and-steps` §Check and Resolution item 3, including the disposition allowlist that stops a single-group routed recipe awarding its SUCCESS output on a failed check); inert on `routedByIngredients` and `progressive`, which have no tier to mark; and on gathering the whole path ships DORMANT pending issue 683.
**The policy therefore gates AUTHORING as well as resolution** — the tier picker, the readiness validator and the routing all read the same policy-conditional set, so the editor can never offer a tier the validator calls unroutable or the engine refuses to resolve.
- The legacy `craftingCheck.mode` discriminator has the single valid value `passFail` and drives nothing; the active check sub-object is selected by `resolutionMode` (see `data-models` requirement 29).
- A crafting system carries **ONE named modifier library at the SYSTEM level**, `CraftingSystem.modifiers`, of `{id, label, expression, isRollExpression, icon?, min?, max?}` (issue 1117: it absorbed the gathering character-modifier library, so a system authors modifiers in exactly one place).
- **A roll-shaped expression is legal EVERYWHERE, a check included** (issue 1118).
  `isRollExpression` is derived and is a DISPLAY classification only: a check appends a rolling entry to its formula AS DICE, so the authored variance survives to the roll, appears in `roll.dice`, animates and shows on the chat card.
  This reverses the rule issue 1117 shipped, which modelled a check modifier on a tool bonus (a scalar) and raised a blocking `modifierRollExpression`; that issue id is RETIRED, not reworded, because there is nothing left to report about an entry that rolls.
Each of the three activity checks — `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` — carries its OWN selection over that one catalogue: a **COMBINATION RULE** (`defaultModifierPolicy`), a default eligible id set (`defaultModifierIds`) and an optional pick cap (`maxModifierPicks`).
The catalogue is defined once; each activity decides which entries apply and how they combine.
A check roll formula ALWAYS carries the resulting **check-modifier contribution**; the GM authors no placeholder and cannot forget one, so a catalogue that reaches a rolled check always contributes.
The rule states BOTH how the eligible entries combine AND **who selects them**, and it has four values: `addAll` (take the activity's own default set; nobody selects), `highest` (the single highest-AVERAGING entry of that same set; nobody selects), **`bySubject`** (the record being resolved selects, at authoring time), and `playerPicks` (the PLAYER selects, at roll time).
**The two RANKING rules — `highest`, and `playerPicks` on every non-interactive path — order entries by the DETERMINISTIC AVERAGE of their expressions** (`reduceRollExpression`, `src/utils/rollExpressionAverage.js`), so `1d4` (2.5) beats a flat `+2`, the winner is the same on every attempt, and no hidden roll is spent to find it.
The winner is then appended AS DICE, so ranking deterministically never flattens what it selects.
The average RANKS and never PAYS: it decides which entries apply and nothing about what they contribute.
It is exact for arithmetic, plain dice and keep/drop dice (order statistics — `2d20kh1` averages 13.825, where its plain sum of 21 would win `highest` against anything), and an explicit approximation for a `min`/`max` around a die (Jensen's inequality), for a pool's non-identically-distributed members, and for the remaining die modifiers (`x`, `r`, `min`, `cs`).
`bySubject` replaces the pre-1095 `byRecipe` because the rule's MEANING is activity-independent while its LABEL is not — it renders "By recipe", "By component" or "By gathering task" from the activity.
`byRecipe` is accepted as a **legacy read alias and is never re-emitted**, exactly as `breakToolsOnFail` reads `consumeCatalystsOnFail`; the `1.22.0` migration rewrites it at the system level.
The **SYSTEM owns both axes outright**: a subject never overrides the rule, and never substitutes its own eligible set except where the rule itself says so.
`bySubject` is therefore a first-class rule, not a delegation of authority — a subject chooses WHICH modifiers apply, never HOW they combine.
- Under `bySubject` the pick lives on the SUBJECT, and there are three of them: **`Recipe.craftingModifier.modifierIds`** (crafting), **`Component.salvage.checkModifierIds`** (salvage) and **`GatheringTask.checkModifierIds`** (gathering).
Each is consulted **only** under `bySubject`.
Under `addAll`, `highest` and `playerPicks` a stored pick is ignored outright and the activity's `defaultModifierIds` is the source.
This is a **behaviour change** from the pre-1055 resolver, which preferred a recipe's stored set under every rule; a system on a non-selecting rule now rolls its own default set for every recipe, whatever any recipe stored.
An older recipe may still carry a `craftingModifier.policy` key: it is never consulted (`resolveModifierPolicy` reads only `craftingCheck.defaultModifierPolicy`), it stays on disk until the recipe is re-saved through `Recipe._normalizeCraftingModifier`, which drops it, and the invariant lives at the resolver rather than at the authoring control so no hand-built context can smuggle a rule override back in.
An **authored empty** pick (`[]`) is a real pick under `bySubject` — zero eligible modifiers, so the contribution is nothing and no term is appended for that record — distinct from an absent value, which inherits the activity's default set; the two are told apart by `Array.isArray` at the point the pick is authored, not by the filtered array's length, so a malformed entry (e.g. a stray non-string id) does not silently flip an authored empty set back to inherit.
This rule is identical on all three subjects and is enforced by one shared attach (`src/utils/checkModifierPicks.js`), because `GatheringTask` alone is rebuilt THREE times — the two mirrored LIBRARY normalizers plus the engine-facing `_libraryTaskToRuntimeTask` — and a hand-written copy in any of them would drift (`data-models` requirement 34 names each and its distinct failure mode).
- An entry's **`min`** / **`max`** clamp that entry's CONTRIBUTION, and a bound means the same thing under every rule.
For a flat entry it clamps the resolved number before combination.
**For a ROLLING entry it clamps the ROLLED RESULT, expressed IN THE FORMULA as `min(max((1d8), -1), 6)`** — one roll, the dice stay visible on the card, and "never more than +6" means what it says: a roll of 7 contributes 6 and a roll of 3 contributes 3.
A half-bounded entry emits exactly one function (`max((…), min)` or `min((…), max)`) rather than a clamp with an invented other side.
That this holds is VERIFIED against the shipped 14.365 dice stack rather than assumed: `CONFIG.Dice.functions` is `{}` so `min`/`max` fall through to `Math.min`/`Math.max`, `FunctionTerm` EVALUATES a dice argument rather than stringifying it, and `FunctionTerm#dice` bubbles the inner die up into `Roll#dice` — recorded in `tests/helpers/recordedModifierRollShapes.js`.
`Roll.validate` alone is not a sufficient oracle here, for the reason the placeholder rule below states.
Both are **absence-preserving in the same way `maxModifierPicks` is**: only a FINITE number is attached, so `null`, `undefined`, `''` and junk all normalize to key-absent, and absence means unbounded on that side.
A bound of `0` is a real bound, which is why the guard cannot be truthiness: `Number(null)`, `Number('')` and `Number([])` are all `0`, so an unguarded read would mint a bound of `0` every time the editor cleared one.
**An authored `min > max` is a BLOCKING readiness issue (`modifierBoundsInverted`, `critical`) and that entry contributes 0 until it is repaired**, matching the refuse posture `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering drop modifiers; the pair is PRESERVED verbatim rather than silently reordered, because swapping it would roll a number nobody authored.
**A bound that is finite but NOT expressible as a dice-grammar `Constant` — `1e21`, `1e-7` — is the second blocking fault (`modifierBoundsUnsafe`, `critical`), and that entry likewise contributes 0.**
It is a SEPARATE issue id rather than a second cause folded into the first, because the two repairs are different and `1e21` is not an inversion.
Containing it to the offending entry is the point: the clamp would otherwise carry that value into the COMBINED flat sum — or, on a rolling entry, into a `min(…)`/`max(…)` the grammar cannot parse — and the appended flat term is refused whole for exponent notation — so one entry's bound deleted every other eligible modifier's contribution from the roll — including the contribution of well-formed entries selected by a DIFFERENT activity, since all three select over the one shared catalogue.
The expressibility test is the same `isDecimalSafeTermValue` the term emit asks, not a second derivation, so the clamp and the emit cannot disagree about which numbers a formula can carry.
A STRING bound is TRIMMED before the finite test, for the same reason `''` is guarded explicitly: `Number('   ')` is `0` and `0` is a real bound, so an untrimmed whitespace-only field would mint a floor of zero the GM never authored.
These bounds are a NEW **entry-level** clamp, deliberately system-global rather than per-reference, because a check modifier has no per-subject reference record to hang bounds on; `GatheringCharacterModifierReference`'s reference-level bounds are a sibling concept, not a source.
- **`maxModifierPicks`** bounds how many modifiers a **selecting** rule may pick, on each activity check independently.
It is a positive integer, or ABSENT — and absence means **unlimited**, reported as `Infinity` by `resolveMaxModifierPicks` (`checkModifierResolver.js`), the single point that decides what every unbounded form (absent, `null`, `0`, non-integer) means.
Absence is meaningful rather than a defaulting accident: a check never asked the question must not silently acquire a bound that truncates subject picks already on disk.
It applies to `bySubject` and `playerPicks` only (`policyDefersSelection` is the membership test both authoring surfaces ask rather than re-deriving it) and is meaningless under `addAll`/`highest`, but is stored regardless of the current rule so flipping between the two selecting rules does not destroy it.
**Both selecting rules SUM what was picked**, so a cap of `1` reproduces the historical single-pick behaviour exactly.
Under `bySubject` the cap TRUNCATES the resolved eligible list, keeping the first N in authored order — enforced at `resolveEligibleModifierIds`, not only at the picker, so a GM who lowers the cap below what a subject already picked does not leave that record rolling more modifiers than the system now permits, and its stored picks are not destroyed either.
Under `playerPicks` the eligible list is the full set of OPTIONS OFFERED and is deliberately not truncated; the cap bounds the player's selection from it.
- Each eligible entry's `expression` is a roll-data fragment (e.g. `@abilities.med.mod`) resolved against the crafter's roll data (a missing/failed expression contributes nothing, never NaN).
**The reduction is STRICTER than it was before issue 1118, and that is a live behaviour change for existing worlds**: the retired evaluator returned its partial parse with no end-of-input assertion, so `3 nonsense` contributed **3** and `1d4` contributed **1**; the walk now refuses anything it cannot read whole, so both contribute nothing and readiness reports them.
Safer in both cases, and not silent: `modifierExpressionInvalid` names the entry.
Resolution is **deterministic** for `addAll`, `highest` and `bySubject` (by the time the engine rolls, a `bySubject` selection is already made and stored, so the contribution is simply that already-narrowed, already-capped, already-clamped list), and for `playerPicks` whenever the deferred control below is not offered.
- **The resolved contribution is APPENDED, not substituted**, by the same operation that applies tool bonuses, **before** the string reaches Foundry's `Roll` and feeding **both** evaluation (`checkRoll.js` `evaluateCheckRoll`) and display (`resolveCheckFormulaDisplay`) so the shown formula equals what evaluates.
The FLAT entries collapse into ONE `+ N[Modifiers]` term and each ROLLING entry gets its OWN `+ (…)[Modifiers]` term, in eligible order, with the flat term leading — so a catalogue carrying no dice emits the byte-identical formula it always did.
One term per rolling entry rather than one combined term, because a rolling contribution is a distribution rather than a number: folding two of them together would hide which entry each die came from on the card and in `roll.dice`, and it would let one refused fragment take another entry's contribution with it.
A rolling fragment is ALWAYS parenthesised before its flavour is attached, which is a correctness requirement and not tidiness: an authored expression may carry its own flavour, and `1d4[fire][Modifiers]` is a SYNTAX ERROR on 14.365 where `(1d4[fire])[Modifiers]` parses and rolls.
Each assembled fragment is proven ROLLABLE, by rolling it MAXIMIZED (`new Roll(fragment).evaluateSync({maximize: true})`, then requiring a finite total), and a refusal blocks THAT ENTRY ALONE — appending an unrollable fragment would throw inside `new Roll(...)` as a rolled, therefore CONSUMING, failure where before it merely contributed a number.
**`Roll.validate` is NOT that test and must never be substituted for it.**
It is `evaluateSync({strict: false})`, and `_evaluateASTSync` SKIPS every non-deterministic node — so on a fragment that rolls, which is every fragment reaching this guard, the dice-bearing subtree is never evaluated and no evaluate-time error class is exercised at all.
Measured against the shipped 14.365 stack over 355 emitted formulas, 25 validated `true` and then threw: `MAX(1d4, 2)` (`FunctionTerm#function` resolves `Math[fn]` CASE-SENSITIVELY), `1000d6` (`You may not evaluate a DiceTerm with more than 999 requested results`) and `1d4 + .5` (`Constant` requires a leading digit, so `.5` parses as an unresolved `StringTerm`).
`maximize: true` renders every term deterministic so nothing is skipped, and the finite test is load-bearing rather than decorative: `Roll#total` is `Number(this._total) || 0`, which passes `-Infinity` through, so this predicate also closes the `max(, 2)` empty-head trap BY CONSTRUCTION.
The check fails OPEN with no dice engine (headless, tests), where nothing evaluates the formula anyway.
The FLAT term is **sign-aware** — `Constant` is unsigned in the dice grammar, which is why `appendToolBonusTerms`' `sign` + `Math.abs` split is required and correct (`+ -3[Modifiers]` would not parse; `- 3[Modifiers]` does) — **label-sanitized**, **SKIPPED when the value is `0`**, and **formatted through a decimal-safe formatter that refuses exponent notation and non-finite values**, because `Constant = _ [0-9]+ ("." [0-9]+)?` has no exponent production and `+ 1e-7[Modifiers]` would parse as a `StringTerm` and throw at evaluate.
Ordering: tool bonuses append first, then the modifier term, then the advantage transform, then the situational bonus.
- **A rolling modifier's dice enter `roll.dice`, and therefore the `diceGroup` trigger DSL's index space.**
Modifier terms are APPENDED, so every die the authored formula declares keeps its existing `groupId` and no working trigger changes meaning.
A trigger whose `groupId` already DANGLED — authored against a formula that has since lost a die — used to match nothing and can now resolve against a modifier's die.
That is accepted rather than guarded: the only available guard is a group count re-parsed from the authored formula, and `parseDiceGroups` does not agree term-for-term with `roll.dice` on every formula, so a slice would sometimes drop an AUTHORED group from trigger matching, which is a worse failure than the one it fixes.
The trigger editor offers only the authored formula's groups, so the state is reachable only by editing a formula after authoring a trigger against it.
- **Advantage is a question about the AUTHORED check, never about what its modifiers appended.**
`parsePlainDiceGroups` splits on parentheses and flavour brackets alike, so `(1d20)[Modifiers]` tokenizes as a plain `1d20`; without scoping, a `2d10` check carrying a `1d20` modifier would offer Advantage it does not have and the transform would rewrite the MODIFIER's die.
Both `hasPlainD20` and `applyD20Advantage` are therefore applied to the post-shim authored formula, and the appended terms are re-attached afterwards.
The `[Modifiers]` label is a **fixed ASCII literal and deliberately not localized**, because `parsePlainDiceGroups` tokenizes on flavour brackets and a localized label containing a `\d*d\d+` token would be read as a phantom crit-eligible die group by the same tokenizer that backs `hasPlainD20` and `applyD20Advantage`.
Both paths build the modifier context through the one shared `buildCheckModifierContext(system, activity, subject)`, so a displayed formula cannot disagree with the rolled one on any axis the context carries.
The `activity` argument is load-bearing: the catalogue is shared but the SELECTION is not, so a two-argument call would resolve one activity's formula against another's rule.
- **The `@craftingmod` placeholder is RETIRED.** The `1.21.0` migration strips it from every stored roll formula and the runtime shim `stripRetiredModifierPlaceholder` (`src/utils/craftingCheckExpression.js`) removes any that survives — hand-edited, imported, or seeded by a fixture — so it can never double-count against the appended term.
The shim's rule is TOTAL, and it is stated as five steps because each one is load-bearing:
(1) a formula carrying no token is returned **untouched, without calling `Roll.validate` at all**, so the majority path takes on no Foundry dependency;
(2) a **NON-ADDITIVE** placement is **neither stripped nor validated**, and the shim answers `''`.
A placement is **ADDITIVE** — and therefore liftable out of the formula and re-appended as a trailing term — IFF all FOUR hold: it sits at **bracket depth 0**; the run of additive operators immediately before it is **at most one**; that run is **empty only when the placeholder is LEADING**, so the nearest non-whitespace character BEFORE it is **absent or a single `+`/`-`**; and the nearest non-whitespace character AFTER it is **absent or `+`/`-`**.
The predecessor clause is not a restatement of the run-length one and omitting it made this predicate FALSE: `1d20 * @craftingmod` has an EMPTY additive run before the placeholder (`*` is not an additive operator), so a three-clause reading calls it ADDITIVE — two lines from where its dangling residue is named as refused.
An empty run after a preceding term means that term binds the placeholder multiplicatively or opens a group.
**Every other placement is REFUSED**, including an additive placement NESTED inside a parenthetical, a function argument, a pool or a dice count.
The reason is ARITHMETIC, not syntax, and stating it as syntax was wrong: the appended `+ N[Modifiers]` term lands at the END of the WHOLE formula, so lifting the placeholder out is sound only where the two positions are interchangeable.
Some refused residues do fail to parse (a dangling `1d20 *`, an empty `()`), but others parse perfectly and are simply WRONG — `(1d20 + @craftingmod) * 2` strips to `(1d20 ) * 2`, halving a modifier that was being scaled, and `(2 + @craftingmod + 4) * 3` goes from 27 to 21 at a scalar of 3 with no notice at all.
The interior cases are why the test is a depth scan rather than an inspection of the two adjacent characters: an interior placement has `+` on both sides and no adjacent bracket to notice.
The decision is POSITIONAL and never delegated to `Roll.validate`: `Roll.validate('max(, 2)')` returns **true** (`FunctionTerm`'s head is `Expression?`, so it parses with zero argument terms, `Math.max()` yields `-Infinity` and `Roll#total`'s `Number(this._total) || 0` lets that through), so a validate-driven rule would roll `-Infinity` against the DC on every craft, forever, silently;
(3) otherwise the token is stripped together with its PRECEDING additive operator, and for a LEADING token the token ALONE — the operator that FOLLOWS it is KEPT, because `Expression` admits a leading `Additive` that carries its sign (`grammar.pegjs:17`, `:89`), so `@craftingmod - 2` must reduce to `- 2` and append to `-2 + 3[Modifiers]` = 1, exactly what `(3) - 2` totalled, where reducing to `2` would append to 5 and silently double the modifier; the word-boundary match leaves a hypothetical `@craftingmodifier` alone, and a residue reducing to empty answers `''`;
(4) the residue is checked STRUCTURALLY — one ending in any binary operator answers `''` — **before any dice engine is consulted**, because the one caller that WRITES TO DISK (the `1.21.0` migration) passes no engine and would otherwise have no residue check at all, and persisting a dangling `1d20 -` makes every later craft throw inside `new Roll(...)` as a rolled, therefore CONSUMING, permanent failure that the shim can no longer notice because no placeholder remains; a LEADING `+`/`-` is deliberately accepted, since `Expression` admits one.
A residue OPENING with `*`, `/` or `%` is refused too, but that half is BELT AND BRACES rather than described behaviour: clause 4 of the additive predicate has already refused every placement that could produce one, so nothing reaches it, and the code labels it as such rather than claiming live protection;
(5) that residue is then validated with `Roll.validate` **called as a METHOD**, never detached — a detached `Roll.validate` returns `false` for every formula — and a rejected residue answers `''`;
(6) with `Roll.validate` unavailable (headless, tests) step 5 **fails OPEN** and the residue is kept, because answering `''` there would report `noFormula` and silently disable an authored check.
Fail-open relaxes VALIDATION only: steps 2 and 4 are positional and structural invariants, identical with or without a dice engine.
- **`planRetiredPlaceholderStrip` is THE decider, and every surface asks it.** It runs the six steps above once and answers `absent` / `stripped` / `refused`; `stripRetiredModifierPlaceholder` is that answer collapsed to a string (`''` for `refused`), the `1.21.0` migration is the one caller that needs the two `''` answers told apart, and the Checks Validation tab splits its issue severity on the same outcome.
The placement classifier `describeRetiredModifierPlaceholder` answers only step 2 and is NOT a substitute for it: `1d20 - @craftingmod -`, `@craftingmod +` and `1d20 * -@craftingmod` are ADDITIVE placements that the decider REFUSES at step 4, so a surface asking the classifier where usability is decided by the decider gives the GM the OPPOSITE instruction on exactly those formulas.
- **All THREE active-check derivations apply the shim BEFORE their emptiness test** — `resolveActiveCraftingCheckFormula`, `resolveActiveSalvageCheckFormula` (which delegates to `resolveSalvageCheck`, the single salvage `(mode, checkUsable)` derivation) and `resolveActiveGatheringCheckFormula` — so readiness and the roll path can never disagree on any activity: a stored `'@craftingmod'` alone reports `noFormula` rather than reporting usable, reaching `evaluateCheckRoll`, stripping to `''` and throwing inside `new Roll('')` as a rolled — and therefore consuming — failure.
All three return the same shape, which is what lets the per-activity inert cause (`noCheck` / `noFormula`) be one derivation rather than three, with gathering `d100` the single documented exception that overrides it to `noModifierSupport`.
`resolveActiveGatheringCheckFormula` takes the gathering resolution MODE as an argument rather than reading it off the system, because gathering's mode lives on the per-system gathering economy config and not on the crafting system.
- **Salvage and gathering gain a modifier seam they never had.**
Salvage's is live: `salvageCraftingCheck` selects over the system catalogue with the COMPONENT as its `bySubject` subject, tool bonuses append first and the modifier term after them, and all three salvage modes carry it.
Gathering's seam is on the **FORMULA-ROLLED modes only** (`progressive`, `routed`); the `d100` mode rolls no authored formula and reports the check-modifier selection inert with cause `noModifierSupport`.
It MUST NOT report `noCheck`: the d100 rolled against each drop's chance IS that mode's check, so a notice denying that the mode rolls one is false, and its remedy ("change to a mode that rolls a check") names the two gathering modes a GM cannot select today.
Gathering's d100 **character modifier** is a DIFFERENT APPLICATION of the same entry — a percentage-point / multiplicative shift on a drop's chance rather than an additive term on a roll — and the two applications never substitute for one another.
It is no longer a separate LIBRARY.
`migrateUnifyModifierLibraries` merges `gatheringConfig.systems[].characterModifiers` into `CraftingSystem.modifiers`, rewrites every reference on drop rows, stamina-cost modifiers and events, and deletes BOTH legacy keys — the gathering one and `CraftingSystem.checkModifiers`, where the check library had lived since `1.22.0` — so one library now serves both applications.
**The partition is stated in both directions, and it partitions APPLICATIONS rather than entries:** the character-modifier application does not participate in `progressive` or `routed`, exactly as the check-modifier application does not participate in `d100`.
One entry may be reached by both, and it is the SELECTION or the REFERENCE that decides which arithmetic applies, never the entry itself.
**Gathering's seam ships DORMANT**: `_libraryTaskToRuntimeTask` hardcodes `resolutionMode: 'd100'` and both other modes render `disabled` pending issue 683, so the whole check-modifier surface is inert in every configuration a GM can select today; the section renders the same inert notice `d100` gets, naming that reason, and the capability activates when 683 lands.
- **`playerPicks` is the one rule deferred to ROLL time.** CRAFTING and SALVAGE supply a `modifierChoice`, built through one shared derivation (`CraftingEngine._buildInteractiveModifierChoice`), and their dialogs render the modifier fieldset on the same terms.
GATHERING does NOT, and the gap is deliberate rather than an omission: it threads the modifier CONTEXT through both formula-rolled runners and resolves a `playerPicks` selection through the deterministic best-legal-selection, but builds no roll-time prompt, and that prompt is deferred to issue 683 with the rest of the seam.
That is not the dormancy the seam claims elsewhere: dormancy means unreachable-but-complete, and a prompt for a path no GM-selectable configuration can reach would be speculative rather than dormant.
The contribution is still always resolved, so a gathering `playerPicks` roll appends the best legal selection rather than nothing.
It is the one rule where the eligible set becomes a selection control inside the interactive roll prompt, and the modifier term is appended only once the player has answered.
`bySubject` also defers the selection, but to the subject author at authoring time, so prompting for it would re-ask a question the record already answered; the engine's gate therefore tests for `playerPicks` specifically rather than for "some rule defers selection".
- The deferred control is offered ONLY when all four of these hold — the call is **interactive** (`interactive === true`), the active mode carries an **authored (post-shim) roll formula**, the system's combination rule is `playerPicks`, and **at least two** modifiers are eligible after catalogue validation.
`CraftingEngine._buildInteractiveModifierChoice` enforces the first three and `buildCheckModifierChoice` the fourth.
The token condition retired with the token; the formula-usability condition replaces it because a check that rolls nothing has nothing to modify, and the two-modifier condition survives because a control over zero or one option presents no choice at all.
When any one of the four fails, no choice descriptor is built, the roll prompt renders no modifier fieldset, and the contribution resolves through the deterministic path above.
- When the control IS offered, it renders the eligible modifiers as options with a `maxPicks` bound (the resolved cap, clamped to the number of options), and the appended terms carry the flat SUM plus one term per rolling modifier the player selects.
Each option carries BOTH halves of its resolution — the flat `value` (null when it rolls), the clamped roll `formula` (null when it does not), the `average` the pre-selection ranks by, and a `display` chip — because `evaluateCheckRoll` re-derives the legal selection from the descriptor and never trusts what the prompt returns.
**A ROLLING option's chip shows what it will ROLL (`+1d4`, `+min(max((1d8), -1), 6)`), never its average**: the average is a ranking key and `+2.5` beside a `1d4` would be a number the roll can never produce.
The **best legal selection** is pre-selected — the highest-AVERAGING `maxPicks` modifiers, tie-broken by eligible-set order (first-listed among equal averages wins) — so a player who simply confirms the roll gets exactly what a non-interactive craft would have rolled.
At `maxPicks === 1` that pre-selection is the single highest-averaging modifier, which is the historical behaviour generalized.
- The prompt's cap is a UI affordance, never the invariant: `evaluateCheckRoll` re-derives the legal selection from the descriptor, discarding an id the descriptor never offered, taking the survivors in ELIGIBLE-SET order and truncating them to `maxPicks` (truncating rather than taking the best N, so an over-large selection never pays MORE than a legal one).
Ordering by the descriptor rather than by the returned array makes the outcome independent of the order the prompt happened to report.
A returned answer is read in this precedence: the multi-pick `chosenModifierIds` array, then the historical single `chosenModifierId`, then the descriptor's own pre-selection.
An **empty `chosenModifierIds` array is an answer** ("I picked nothing"), not an absence, so it wins over the pre-selection and contributes 0, appending no term at all; only a `null`/`undefined` single id falls through to the next source.
A descriptor carrying no usable `maxPicks` is reduced as a SINGLE pick rather than as unlimited — the one place absence does not mean unlimited, deliberately, so a descriptor built before the field existed cannot silently widen a roll.
- On any craft where the control is not offered — including every **non-interactive** call (API / macro / headless) — `playerPicks` resolves deterministically to the **best legal selection**: the highest-AVERAGING `maxModifierPicks` entries.
At a cap of 1 that is exactly `highest` (the historical behaviour), and unbounded it is everything, because picking everything is then legal and optimal.
The contribution is therefore always resolved and API results stay deterministic.
A prompt that confirms without returning a selection (a headless dialog stand-in) falls back to the descriptor's pre-selection, which is that same best legal selection.
- **eval == display holds for the posted roll, with one deliberate pre-roll exception.**
The selection's flat sum and its roll fragments are appended to the working formula **before** the advantage transform, before the situational-bonus append, and before `Roll`, and the displayed formula is recomputed from that same appended string — so the posted roll message and the run journal show exactly what evaluated.
The **pre-roll dialog** is the exception: it renders the deferred slot as a **trailing `+ (modifier)[Modifiers]` term** — the position the resolved term takes — rather than a number, because the value is not knowable until the player picks and Foundry's `cleanHTML` strips the inline handlers a live-updating preview would need.
Showing the pre-selection's number there would misrepresent every non-default pick, so the slot stays neutral; every OTHER `@` placeholder in the dialog formula still resolves to a number, and each option carries its own signed value chip.
- The posted roll's chat flavor is suffixed with the chosen modifiers' labels (`<flavor> · <label>[, <label>…]`) so the chat log records which modifiers were picked.
It is ONE bullet-joined segment however many were picked, so the flavor does not grow a separator per modifier; label-less modifiers contribute nothing, an all-label-less selection leaves the flavor unchanged, and an empty base flavor yields the bare labels with no orphan separator.
- A cancelled prompt aborts with zero mutation and appends nothing.
- A **pre-resolved roll decision** is a **transport** for the player's confirm / bonus / roll-mode / advantage answer and changes nothing about how any mode resolves.
Each item in a batch still evaluates its **own** formula, its own DC or tiers or stages, and its own triggers, in its own crafting system, so a bulk decision never shares a rolled **total** across items.
That is also why a batch spanning crafting systems needs no single check: nothing is shared but the answer to the prompt.
The modifier choice a batch may carry is decided per ACTIVITY, in three readings (issue 1095): CRAFTING and SALVAGE each build one, through the one shared `CraftingEngine._buildInteractiveModifierChoice`, so a salvage batch under `playerPicks` carries a modifier choice exactly as a crafting batch does; GATHERING builds none, its roll-time prompt being deferred to issue 683 with the rest of its seam.
The pre-1095 reading — "`playerPicks` remains crafting-only, so a salvage batch never carries a modifier choice" — retired with the crafting-only catalogue and is contradicted by `CraftingEngine._salvageRollOptions`, which builds one.
- **For salvage**, a check is usable IFF its mode's roll formula is authored **and non-blank**.
A whitespace-only formula is not a check: handing it to `Roll` throws inside the runner and surfaces as a rolled — and therefore consuming — failure, which is the opposite of the "no formula, no check" answer every reader intends.
Trimming brings salvage **into line with** the alchemy check-mode guards and the player salvage projection, which already test the formula trimmed; it is not a new global constraint.
One resolved mode governs salvage check dispatch, breakage-block selection and award-group resolution alike, replacing the independent derivations those readers each carried.
A salvage mode outside the supported set (`simple` / `routed` / `progressive`) is a **misconfiguration with zero mutation**, matching what salvage validation already reports for the same configuration.
Coercing it to `simple` instead would award the first result group for a configuration validation calls invalid — a silent *wrong award*.
This is a defensive guard rather than a fix: legacy salvage tokens are normalized long before they reach these readers, and salvage validation guards the case anyway, which is the precedent being followed.

  *Stated residual:* the three mainline crafting readers (`useSimpleCheck`, `useProgressiveCheck`, `useRoutedCheck`) still test their roll formula with raw truthiness, so the non-blank rule is deliberately **not** asserted globally here.
  Asserting it globally would make this spec claim behaviour the crafting path does not have — the exact divergence class the salvage unification is closing.
  Unifying them is a follow-up.

## Player-Facing Mode Labels

The `resolutionMode` token is system-internal and must never surface raw in player UI.
The player-facing Journal screen (see `ui-integration/spec.md` *Journal App*) maps each mode to a localized display label through a frozen label-key map (`RunJournalBuilder.MODE_LABEL_KEYS`), resolved against the `FABRICATE.App.Journal.Mode.*` localization keys.

| Mode                  | Localization key                                 | Player label          |
|-----------------------|--------------------------------------------------|-----------------------|
| `simple`              | `FABRICATE.App.Journal.Mode.Standard`            | Standard (DC)         |
| `routedByIngredients` | `FABRICATE.App.Journal.Mode.RoutedByIngredients` | Routed by Ingredients |
| `routedByCheck`       | `FABRICATE.App.Journal.Mode.RoutedByCheck`       | Routed by Check       |
| `progressive`         | `FABRICATE.App.Journal.Mode.Progressive`         | Progressive           |
| `alchemy`             | `FABRICATE.App.Journal.Mode.Alchemy`             | Alchemy               |

- There is no canonical "Standard" resolution mode.
`simple` (a DC pass/fail check) renders as "Standard (DC)" for players, even though its internal token stays `simple`.
- A run whose recipe resolves to an unknown or absent mode falls back to the `simple` ("Standard (DC)") label rather than emitting a raw token.

## Simple Mode

### Semantics

- One ingredient set and one success result group, plus an **optional reserved `role: 'failure'` result group** (mirroring alchemy's none/simple path).
- Optional pass/fail crafting check.
- On success, produce the single success result group.
- On a failed (enabled) check, produce the reserved `role: 'failure'` group when one is authored; otherwise nothing is produced.

### Validation

- Exactly one `IngredientSet`.
- Exactly one success `ResultGroup` (validation counts only non-`failure` groups); an optional reserved `role: 'failure'` group is tolerated, and a simple recipe carrying one still validates.
- The crafting check is optional: it runs only when `craftingCheck.simple.rollFormula` is authored **AND crafting checks are enabled** (`features.craftingChecks === true` or `craftingCheck.enabled === true`; both default false).
With no authored formula, or with checks disabled, the attempt proceeds with no check; there is no macro-return contract.

## Routed by Ingredients Mode (`routedByIngredients`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): routing uses `IngredientSet.resultGroupId`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the chosen ingredient set.
No other result groups are awarded.**
- The crafting check uses the SAME shared **`craftingCheck.simple`** config slot as `simple`/`alchemy` mode (which backs `simple`, `alchemy`, and `routedByIngredients` — it is not a simple-mode-only slot), but its **run condition differs from simple mode**: routedByIngredients (like alchemy-Simple) rolls on an authored `craftingCheck.simple.rollFormula` alone, **ungated by the crafting-checks toggle**, whereas simple mode additionally requires crafting checks to be enabled (see §Simple Mode Validation).
It runs only when `craftingCheck.simple.rollFormula` is authored; with no formula the attempt proceeds with no check.
It is a pass/fail gate comparing the roll total against the DC (meet/exceed per `thresholdMode`), honouring per-recipe DC tiers (`checkTierId` → `craftingCheck.simple.tiers`), a dynamic-DC macro (`dcMode: 'dynamic'`), and the check's `checkBreakage` triggers.
It never reads outcome tiers and never changes which result group is produced (routing stays `IngredientSet.resultGroupId`).

### Routing

- Routing uses `IngredientSet.resultGroupId`.
- If there is only one result group, explicit mapping may be omitted.
- If there are multiple result groups, every satisfiable ingredient set must resolve to exactly one group.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- Reference integrity (always applies): each `IngredientSet.resultGroupId` must point at a real `ResultGroup` in scope.
- This mode never raises `routedCheckNoFormula`: a missing `craftingCheck.simple.rollFormula` simply means no check runs.
It shares the `craftingCheck.simple` config slot with its `simple`/`alchemy` peers, but its run condition matches alchemy-Simple (an authored formula rolls on its own), not simple mode (which also requires the crafting-checks toggle enabled).

## Routed by Check Mode (`routedByCheck`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): the system-level routed crafting-check outcome routes to a `ResultGroup`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the check outcome.
No other result groups are awarded.**
- The crafting check is **required**.
The outcome is produced by the system's configured routed crafting check, whose required field is an authored `craftingCheck.routed.rollFormula`.
- `outcome` is trim-normalized and case-insensitive.
- **Relative tier clamp:** when the routed check uses **relative** outcome tiers and the rolled total meets no tier's effective threshold (`baseDc + outcome.dc`), the outcome is the lowest (closest) tier rather than an empty/null outcome, so a recipe tier or dynamic DC that raises the base difficulty never yields a rolled-but-unrouted craft.
The clamp is relative-only; **fixed** tiers keep the "outside every range → no outcome" behaviour (their ranges are authored explicitly).
- **Fixed tiers carry no DC.**
Fixed outcome tiers own explicit, non-overlapping `[start, end]` value ranges and the roll total is matched by range, so the check DC and the meet/exceed `thresholdMode` comparison are unused in fixed mode — DC and the comparison are relative-only.
**A fixed tier set MUST leave no GAP inside its own span**, and a set that does is the BLOCKING readiness issue `rangeGap` (`critical`), alongside the `rangeInvalid` and `rangeOverlap` its two siblings raise.
A gap is a value BETWEEN two authored tiers that no tier claims — Slag 1–9, Rough 11–17, with 10 claimed by nobody — and it is reachable by ordinary authoring: edit one boundary and stop.
It is `critical` rather than a warning because fixed mode has no `clampToNearest` rescue: a roll landing in the hole matches no tier at all, so the attempt is rolled but UNROUTED, which fails it rather than degrading it.
The measurement is SPAN-INTERIOR ONLY: a set that simply does not cover every value the die can roll is not a gap, because `2d20` rolls 2–40 and a GM who authors 7–34 has authored a deliberate window.
Invalid and overlapping ranges are excluded from the measurement first, since both already raise their own `critical` and a `start > end` range would otherwise manufacture a phantom gap.
The DC still governs `routedByIngredients` (whose pass/fail gate compares the roll against it — that DC now lives on its simple check, `craftingCheck.simple.dc`) and relative-type routed checks (which read `craftingCheck.routed.dc`); only `routedByCheck` with `type: "fixed"` drops it.
- **Per-recipe minimum success tier (fixed only).**
A `routedByCheck` recipe MAY carry an optional `minSuccessOutcomeId` referencing a fixed success outcome tier id; fixed tiers rank by their `start` value.
When set, a craft whose **final (post-step) tier** ranks below the required tier — or whose total lands outside every fixed range, so no tier matched at all — fails outright: `success: false`, no outcome routes, and the recipe takes its normal failure/consumption path with no success result.
The gate judges the final tier because tier stepping is applied before it (see *Routed Tier Stepping* below), so a `down` step can drop a craft below the recipe minimum and an `up` step can lift it over.
Because no tier routes on this failure, the blocked tier's own `breakTools` flag is dropped (the per-tier breakage bridge fires only for a routed tier); independent dice-group / roll-total breakage triggers are unaffected.
The default (null/unset) imposes no override, so the outcome is the final tier.
A forced-outcome trigger (a natural crit) bypasses the gate — a natural crit is never downgraded by a recipe minimum.
A stale or unknown `minSuccessOutcomeId` no-ops.
The gate is fixed-type only; relative-type routed checks ignore it.
It is enforced in the shared routed-check runner (`runFormulaRouted`) through an optional minimum-tier parameter that is no-op by default, so salvage and gathering routed checks are unaffected.
Runtime scope: the minimum-success-tier gate is `routedByCheck`-only.
The crafting dispatch threads `minOutcomeId: recipe.minSuccessOutcomeId` on the `routedByCheck` path alone; although **alchemy `checkMode: tiered`** is dispatched to the same `_runRoutedCheck` caller, that dispatch forces `minOutcomeId: null` (`applyMinSuccessOutcome: false`), so a `minSuccessOutcomeId` carried on an alchemy tiered brew — authored before a mode switch, or imported — has NO runtime effect.
Alchemy tiered brews already gate success through each outcome tier's own `success` flag, so they need no per-recipe minimum.
This matches the authoring control, which auto-hides outside `routedByCheck` (`resolveRecipeFixedOutcomeTierOptions`): the value the GM cannot see or clear is also the value the runtime ignores.
A persisted alchemy `minSuccessOutcomeId` is left inert by the dispatch guard rather than migrated away.
- **Single-result-group exemption (mirrors `routedByIngredients`):** when a step (or an implicit recipe) has exactly one result group, no outcome/tier mapping is required.
A non-failure outcome produces that single group (`disposition: success`); a failure/miss keyword produces nothing (failure path).
Resolution never aborts with a misconfiguration for an unmatched success outcome when there is exactly one result group.
- **Routing is success-disposition-gated.**
A check result whose final tier has `success: false` takes the failure/consumption path regardless of the tier's name — the engine short-circuits on `!checkResult.success` before routing runs.
**Invariant:** `data.success` and the final tier's own `success` can never disagree.
Without a forced outcome `data.success` simply IS the final tier's flag; under a forced outcome the disposition is authoritative and tier stepping is confined to that disposition's tier subset (see *Routed Tier Stepping* below), so a forced success can never surface a failing tier's name and a forced failure can never surface a succeeding tier's name.
Routing via `checkOutcomeIds` resolves only `success === true` tiers (a `success: false` tier must never produce a `disposition: 'success'` result), and validation/authoring offer success tiers only for assignment.
So a relative check's non-keyword-named failure tier (e.g. "Botch") whose id a GM or import placed in a group's `checkOutcomeIds` never routes and never produces a success result.
- Resolution rules (applied per step/scope; "exactly one result group" is evaluated per step for multi-step recipes):
  1. Explicit tier assignment wins: when a **success** outcome resolves to a routed-check success outcome tier id, the result group listing that tier id in `checkOutcomeIds` is selected.
  2. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes the failure path.
  3. If the scope has exactly one result group, that single group is produced for any non-failure outcome (no mapping required).
  4. Otherwise, with multiple result groups, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  5. If multiple result groups are present and no result-group name matches, execution aborts with a crafting-system misconfiguration error (not a player failure outcome).
     For an instant (non-timed) step this is a zero-mutation abort: it happens BEFORE any consumption, so no ingredients, currency, or tools are consumed or broken, and the craft reports failure (never a player success with zero items).
     A resolved-but-unassigned outcome tier (`unrouted-tier`) is treated identically.
     Timed exception: a time-gated `routedByCheck` step consumes its inputs at START (the check outcome is unknowable until the gate matures), so a routing misconfiguration detected at FINISH cannot un-consume — it records a step FAILURE with no refund and still reports failure (never a false success with zero items), rather than a true zero-mutation abort.

#### Routed Tier Stepping

**Tier stepping** is a per-trigger EFFECT on the unified `checkBreakage.triggers[]` list (`tierStep`), not a check-wide policy.
It is available on every routed check — crafting, salvage AND gathering — in both the `relative` and `fixed` tier types, and it is not gated on the tool-breakage authority (unlike a trigger's `breakTools` effect).
It supersedes the retired `natStepping` boolean, which hard-coded the die (d20), the faces (1 and 20), the magnitude (±1) and the scope (relative crafting and salvage only); a persisted `natStepping: true` converts to an equivalent trigger pair on read (see `data-models`).

**One classifier.**
The whole post-roll resolution of a routed check — forced reroute, then tier stepping, then the recipe minimum-success-tier gate, in that order — is a SINGLE exported function (`classifyCheckTotal`), and `runFormulaRouted` calls it rather than restating it.
That is what makes the Checks Studio's per-outcome odds histogram incapable of disagreeing with a real roll: the histogram buckets each enumerated die face through the same function the engine resolves through, so "they cannot drift" is a property of the code rather than a promise (see `ui-integration` §Per-outcome odds histogram).
Any other consumer of routed classification consumes it the same way.

**One rolled formula.**
The same rule governs the INPUT to that classifier.
Two transforms stand between an authored formula and the one Foundry evaluates — the retired check-modifier placeholder is stripped, and the resolved check-modifier scalar is appended as one term — and both are a SINGLE exported derivation (`resolveRolledFormula`) rather than a composition each caller assembles.
The roll path, the display resolver and the Checks Studio's odds enumerator all ask it for the formula, so a change to what the engine rolls moves the histogram with it.
The tool bonus is NOT part of that derivation: it is appended above the runner, by the engine on a real craft and by the preview arg-builder on a preview, and the runner appends none of its own.

**Two named tiers.**
The **rolled tier** is what relative-margin or fixed-range matching produced, after any forced reroute; it is what step CONDITIONS read.
The **final tier** is what remains after stepping; it is what routes to a result group, what the per-recipe minimum-success-tier gate judges, what tool-breakage conditions read, and whose `success` and `breakTools` apply.
A step condition asks about the tier the dice landed on, never about the tier the step produces, so the pass is a pure function of (rolled tier, triggers, roll) with no feedback edge — an `outcomeTier`-conditioned step cannot iterate and no evaluation order can leak into the result.
**Acknowledged limit:** stepping reads the rolled tier while tool breakage reads the final tier, so a single trigger carrying an `outcomeTier` condition, `breakTools: true` and a `tierStep` may step without breaking.

**The three modes.**
`target` names the tier id to land on; `up` and `down` move by `steps` tiers (an integer `>= 1`); `none` is inert.
Composition runs over every trigger whose condition matched and whose mode is not `none`.
Relative steps sum as signed integers (`Σ up.steps − Σ down.steps`), summation being the only commutative composition: two `up 1` triggers make `up 2`, and `up 1` plus `down 1` is a deliberate no-op rather than an order-dependent coin flip.
A `target` trigger is ELIGIBLE only when its `tierId` names a tier present in the ranked array in play; an ineligible target — a dangling id, or one naming the opposite disposition under a forced outcome — is discarded BEFORE the comparison rather than winning and then no-opping, and is not a runtime misconfiguration.
Among the eligible targets the one naming the LOWEST-ranked tier wins, which is order-independent and pessimistic (trigger array order is deliberately not load-bearing).
The winning target sets the base index and the net relative offset applies from there.

**Placement.**
Stepping is applied AFTER any forced reroute and BEFORE the fixed-only minimum-success-tier gate.
Forcing picks an extreme tier while a step is relative, so stepping first would be silently discarded; the gate asks whether the craft reached the recipe's minimum, so it must judge the final tier.
There is no forced-outcome bypass — the retired boolean was a check-wide policy the GM could not scope, whereas a `tierStep` is something the GM opted into on one trigger.

**Stepping is disposition-preserving.**
When a forced outcome is in play, the array in play is the ranked SUBSET of tiers whose `success` matches the forced disposition — the same subset the forced reroute selects from — and every index, "lowest-ranked" and the clamp are computed over that subset.
The forced disposition therefore stays authoritative and `data.success` can never disagree with the final tier's own `success`.
With NO forced outcome the array in play is the whole ranked tier list, and both `success` and `breakTools` follow the final tier across it — including a step that crosses from a succeeding tier onto a failing one, which is the retired boolean's pre-existing behaviour.

**Clamping.**
An out-of-range step clamps to the extremes of the array in play rather than no-opping, so `up 3` from the second-highest tier lands on the highest.
This clamp is explicitly unrelated to the **Relative tier clamp** above: `clampToNearest` decides WHETHER a tier matched at all, whereas the step clamp decides WHERE an out-of-range step lands, and the evidence field is named `stepClamped` so the two never read as one concept.

**Evidence.**
Only a REAL tier change records `data.tierStepApplied` evidence and produces the localized crafting or salvage chat note.
A fully clamped move and a cancelling `up 1` plus `down 1` both leave the rolled tier standing and emit nothing.
Gathering emits the same evidence from the shared runner but threads it to no chat surface.

**No match, no step.**
When no tier matched at all, nothing steps — `target` included — because a routed check that matched nothing is the deliberate "no route" path and a trigger must not conjure a tier there.
On a fixed check whose total falls outside every authored range this is the ordinary outcome; a GM wanting a floor for un-ranged totals authors a covering range, not a step.

**One ranking.**
Tier order is derived in exactly one place (`rankedRoutedOutcomes`), shared by the forced reroute, the minimum-success-tier gate and the step pass: ascending by `dc` (relative) or `start` (fixed), dropping any tier whose rank is not a finite number, and keeping the FIRST authored tier among equal ranks in both directions.
The minimum-success-tier gate consumes that ranking only to LOCATE the required tier and continues to compare threshold VALUES, so two fixed tiers sharing a `start` compare equal and the craft passes.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- **One result group → no mapping required:** a step with exactly one result group needs no outcome/tier mapping; it is produced on any non-failure outcome and yields nothing on a failure keyword.
Outcome/tier mapping is required only when a step has multiple result groups (each success outcome must route to a group), and the `recipe-visibility` readiness warnings (`unroutedResultGroup`, `unproducedOutcomeTier`) do not fire for single-result-group steps.
- Reference integrity (always applies): `ResultGroup.name` values must be unique under trim-normalized, case-insensitive comparison, and may not be any reserved failure keyword.
- A missing routed crafting check (`craftingCheck.routed.rollFormula` unauthored) is an **unconditional system-level blocker** (`routedCheckNoFormula`), independent of any recipe — every recipe in this mode routes by the check, so no craft can resolve without it (see `recipe-visibility`).
A `routedByCheck` recipe is otherwise structurally valid regardless of the check configuration; the formula requirement is a system-level concern, not a per-recipe validation error.

## Progressive Mode

### Semantics

- Exactly one ingredient set and one result group.
- The result order is meaningful.
- Result entries carry no quantity: awarding spends the budget against each entry once, so the same `Component` may appear multiple times and repetition is how a recipe or a salvage config asks for more of a result.
Each awarded entry grants a single item (any legacy authored quantity is normalized to 1).
This governs **every** progressive award surface, crafting and salvage alike — the rule follows from the award loop, which charges one entry's `difficulty` and awards that one entry, so honouring a count would grant N items for the price of one.
The normalization is enforced at award time on both paths (`ResolutionModeService._resolveProgressive` for recipes, `CraftingEngine._resolveSalvageResultGroups` for salvage), never by a migration: `quantity` remains a stored, normalizer-clamped field and is simply inert in this mode.
The salvage scope is stated explicitly because it was read as recipe-only once and the salvage path shipped honouring the authored count.
- Each result references a `Component` with `difficulty >= 1`.
This `difficulty` IS the component's **progressive DC** — the field the GM component editor labels verbatim "This component's Progressive DC" — and it is stable, per-component authored data.
It is distinct from the progressive **check**, which has **no DC** of its own: the check produces the numeric budget (`value`), and each stage spends that budget against its component's progressive DC.
Player-facing progressive surfaces therefore show both per stage — the component's progressive DC (`DC N`) and the cumulative budget that reaches the stage (`Reach ≥N`).
- Check is mandatory and returns numeric `value`.
- Awarding evaluates ordered results using `awardMode`.
- **All result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group.
This is the key distinction from the routed modes, which select exactly one result group.**

### Award Modes

Let `remaining = check.value` and `cost = result.component.difficulty`.

- `equal`: award result when `remaining >= cost`; then `remaining -= cost`.
- `exceed`: award result when `remaining > cost`; then `remaining -= cost`.
- `partial`:
  - if `remaining >= cost`, award and decrement.
  - else if `remaining > 0`, award the current result (with only partial credit), set `remaining = 0`, stop.
  - else stop.

### Player Reorder

Progressive awarding spends the roll down an ordered list, so the order decides what the player actually receives.
Two distinct concepts govern it and MUST NOT be collapsed: the GM-authored **Result Order Permission** (on the aggregate, exported) and the per-user **Player Result Order** (runtime preference, never exported).

#### Result Order Permission (GM-authored)

- The permission lives on the entity whose results are being ordered, and nowhere else: `Recipe.allowPlayerResultReorder` for crafting, `Component.salvage.allowPlayerResultReorder` for salvage.
- Both default to `true`.
- An absent key reads as `true`, so no migration seeds the field; only an explicit `false` pins the authored order.
- The retired system-level `craftingCheck.progressive.allowPlayerReorder` is gone from all three progressive check blocks (crafting, salvage, gathering).
- Gathering has no reorder feature: it exposes no ordered result-stage surface, so the retired flag was removed without replacement.
- When the permission is `false` the authored order is authoritative and any stored player order is ignored.
- `Component.salvage.allowPlayerResultReorder` has its **first UI consumer**: the player Inventory tab's salvage panel (`ui-integration` §Player Salvage Surface).
It was previously modelled, normalized, GM-authorable, captured onto every salvage run, and read at award time — with no surface that let a player exercise it, so the permission a GM set had no observable effect.

#### Player Result Order (per-user runtime state)

- The order is stored as a list of **result ids**, not indices, so it survives a GM editing the recipe.
- Keys are namespaced by scope: `recipe:<recipeId>` and `salvage:<componentId>`.
- One key per recipe, not per step.
- The order is a **standing preference**: it applies to every craft of that recipe until the player changes it, and is NOT a per-attempt gesture.
- It is stored per-user **within a world**, not per-account globally: the same player in a second world starts from the authored order.

#### Reconciliation contract

Reconciling a stored order against the authored list MUST satisfy all of the following.

- The result count is preserved exactly: reconciliation never drops a result, because the award loop spends budget down the list and a dropped result silently denies the player an award they were entitled to.
- Ids in the stored order that match no authored result are skipped.
- Authored results the stored order does not name are **tail-appended in authored order**, so an unranked stage can never displace a ranked one: a GM adding a stage cannot silently demote a player's ranked stage, and the new stage is awarded only if budget remains.
- A result with **no id** is never reorderable and always retains its authored position (it matches nothing and tail-appends).
- **Duplicate ids: first match wins.** The second copy tail-appends rather than vanishing or doubling.
- An absent or empty stored order yields the authored list unchanged.

#### Cross-step id uniqueness (assumption)

- One flat id list reconciles every step of a multi-step progressive recipe.
- This is correct only while result ids are **unique across a recipe's steps**, which nothing enforces — copy-mode import preserves result ids by design.
- A result id colliding across two steps therefore ranks independently in each.
- This is a recorded assumption, not a guarantee.

#### Which user's order is read

- **Crafting reads the order live, at resolve time, and it is the EXECUTING user's** — not the actor owner's.
A GM invoking `craft` through the API resolves down the *GM's* order.
This is deliberate: the recipe path resolves on the acting client.
- **Salvage reads the order captured on its run record at start**, never from settings.
- This asymmetry is deliberate and load-bearing, not drift.
A world-time-resumed salvage is driven by the synced `updateWorldTime` hook, which fires on every client with no ownership filter, so whichever client wins the race executes the resume.
Capturing the order at start makes the executing user irrelevant, which makes that class of defect structurally unreachable on the salvage path rather than merely documented.
- A salvage with **no run record uses the authored order**, and there is deliberately **no settings fallback**; adding one would reintroduce the executing-user read the capture exists to prevent.
- Salvage gates on the permission at **read time, not capture time**, so a GM toggling the permission off mid-run takes effect on that run's award.
The captured order is retained but ignored.
- The player-facing salvage surface writes only the **standing preference** under `salvage:<componentId>` and relies on the existing run-record capture; it MUST NOT thread an order into the salvage call.
The "no settings fallback" rule above is unaffected by that surface existing and MUST NOT be relaxed.
- A pending debounced order write MUST be **flushed before a salvage run starts**: the capture happens once, at start, so a run begun inside the debounce window captures the **stale** order.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- The result group contains ordered results.
- Every referenced `Component` has `difficulty >= 1`.
- `CraftingSystem.craftingCheck.progressive.rollFormula` must be authored: the progressive check is required, and the engine rolls that formula to produce the numeric `value` the awarding spends against result difficulties.
- With no authored progressive roll formula the attempt fails loudly (the required-check guard aborts with zero mutation); this surfaces as a system-level blocker, not a per-recipe validation error.

## Alchemy Mode

### Semantics

- Player submits ingredient combinations directly instead of selecting a visible recipe.
- Recipe visibility is **reveal-not-gate** (see `recipe-visibility/spec.md`): the system's `visibilityMode` selects which source REVEALS a recipe in a non-GM's Known list (`item` = a held book/scroll, `knowledge` = learned, Manual/`restricted` = a per-recipe access grant, `global` = brew-discovery), with brew-discovery unioned across all modes; brewing is NEVER gated by visibility (a matched ingredient signature is the sole brew gate, so a non-GM alchemy recipe is always `craftable`). `learnOnCraft` governs only whether a matched brew records the brew-discovery reveal, never craftability.
- An alchemy recipe always has EXACTLY ONE ingredient set and is never routed by ingredients.
- Result-group selection and check-ness are driven by the SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`), NOT a per-recipe `resultSelection.provider` (retired, issue 554; this supersedes the earlier "alchemy check optional" behaviour):
  - **None** — one ingredient set + one result group, no check; a matched brew always succeeds and produces that group.
  - **Simple** — the mandatory shared `craftingCheck.simple` pass/fail check (cannot be disabled).
Pass → the success result group; fail → the reserved `role: 'failure'` result group (produced only when non-empty; a matched fail is a genuine outcome, not a fizzle).
The failure group's absence is tolerated (a settings-only None→Simple flip runs no recipe migration).
This reserved failure-group mechanism is **shared** with plain `simple` resolution mode (see §Simple Mode), which mirrors the same none/simple path; `role: 'failure'` is not alchemy-only.
  - **Tiered** — behaves EXACTLY like `routedByCheck`: the mandatory `craftingCheck.routed` check (cannot be disabled) routes each success outcome to its assigned `ResultGroup` via `checkOutcomeIds`; a failed routed check fizzles before result creation.
Tiered has NO `role: 'failure'` group.
- Multi-step recipes are not supported.
- `consumeOnFail` defaults to true; a matched Simple fail consumes via `alchemy.consumeOnFail`, consistent with a no-match fizzle (NOT the crafting-check consumption policy).
- An alchemy recipe MAY carry a time requirement, in which case the brew is TWO-PHASE: START consumes the submission and arms the world-time gate; FINISH runs the check and produces.
A matured FINISH resolves through the SAME alchemy tail as an immediate brew — brew-discovery (`learnRecipeOnCraft`) and the reserved `role: 'failure'` group on a matched Simple failure — and both are keyed on the RECIPE'S OWN SYSTEM, never on a per-call submission flag (issue 966).
The brew resumes through `advanceCraftingRun`, which knows only the run, so an `isAlchemyAttempt`-style option cannot reach it; gating on one silently dropped every matured brew's discovery and degraded its Simple failure to a generic fizzle.

### Signature Resolution

- Matching is based on satisfiable signatures from the single ingredient set's groups/options (the multi-group loop degenerates to one set).
- A submitted item's component identity is resolved **exactly once**, scoped by the crafting system's id (`systemId`), durable-flag-first, through the shared list-aware Component Item Matching resolver defined in the `data-models` spec.
Every SIGNATURE/BUCKETING surface that attributes a submitted item to a component — the workbench owned-components palette, the submission collector, signature matching, and the fizzle dead-end multiset — MUST **consume that single attribution**; none may independently re-derive a submission's component from raw source references after it has been bucketed.
The downstream CRAFTABILITY surfaces (the craftability ingredient and essence checks, ingredient selection for consumption, and the essence context built for result effect transfer and property macros) re-derive a submission's component from raw items, but MUST do so through the IDENTICAL tier-4-aware resolver the bucketing surfaces used, so they land on the same component by construction — this is consistent with, not in conflict with, the consume-once rule above (which governs only the bucketing surfaces).
This preserves the existing exclusivity rule (a `roles[systemId].componentId = B` item carrying `_stats.duplicateSource = A.uuid` resolves to B, never A) and the raw source-reference fall-through (load-bearing for unstamped items, MUST NOT be weakened).
- A submitted item is attributed to exactly one component: when its `roles[systemId].componentId` (or the legacy scalar `componentId`) names a component in the system, it resolves exclusively to that component even if it carries a transitive `_stats.duplicateSource` pointing at a different component's source; when no claimed id names a known component, it resolves by the resolver's raw source-reference fall-through.
- A single submission contributes at most one unit to a group even when it matches two or more of that group's components.
- The raw source-reference fall-through remains load-bearing for unstamped (pre-durable-identity) items and MUST NOT be weakened.
- Alchemy craftability and essence attribution MUST resolve a submitted item to the same component the submission collector bucketed it to, including a submission resolvable solely by the bare top-level `registeredItemUuid` tier.
This parity spans the entire alchemy craft path — signature matching, the craftability ingredient and essence checks, ingredient selection for consumption, the essence context built for result effect transfer and property macros, and the timed (time-gated) START/FINISH twin — so a purely-tier-4 submission that matches a signature also passes craftability, is consumed, and contributes its component's essences to both success and reserved-failure crafted results.
An item's own `flags.fabricate.essences` still take precedence over any component-defined essences.
This alchemy-scoped resolution MUST NOT be pushed into the shared `findMatchingComponent`, `resolveComponentForItem`, or `getItemSourceReferences`; gathering, inventory, and standard crafting keep the narrower ladder unchanged, so the same tier-4-only item remains unrecognized in a standard (non-alchemy) craft.
- Alchemy essence attribution and standard-craft essence resolution **agree on one axis and still differ on another**, and the agreement must not be overstated as "the two matchers agree".
They agree that essence requirements share units **with each other**: alchemy credits every submitted unit's essences to every essence requirement, and standard craft resolves an ingredient set's essence options as one joint block over a shared draw (`data-models` §Essence-Alternative Consumption).
They still differ on whether a unit already claimed by a component/tag requirement contributes its essences: alchemy credits it (the whole submission is pooled with no draw-down, and extras are consumed as essence contributors), while standard craft does not, because that unit has already been spent through the set's `remaining`/`_commitItemPlan` ledger.
The same Duskcrystal therefore satisfies `Radiant 2 + Shadow 1` in both paths, but a Duskcrystal consumed by a component/tag requirement contributes its essences only in alchemy.
- A group is satisfied only when one of its options has its required `Ingredient.quantity` met by the available submitted quantity matching that option's components; submitting fewer than the required quantity does NOT satisfy the group and yields a no-signature-match failure.
- Submitted quantity is counted per submission (one submission = one unit), not by reading an item's stack count at the configured stack-quantity path; the workbench is responsible for expanding a stack into one submission per unit, consistent with occurrence-based essence accumulation and submitted-ingredient consumption.
- The runtime matcher resolves a submission to the **most-specific matching set**, not the first authored match.
It collects EVERY enabled set whose every group is satisfied by the submission (superset-tolerant, `>= required`, extras consumed as essence contributors) and picks the unique maximum under a specificity partial order: set A is MORE SPECIFIC than B when a natural transversal of A also satisfies every group of B (A's required-group structure is a proper superset of B's — required-group containment, NOT units consumed) while no transversal of B satisfies A.
When no unique maximum exists — two incomparable co-matching sets (e.g. an over-submission satisfying both siblings `{S,V,E}` and `{S,V,R}`) — the runtime FAILS SAFE to a no-signature-match fizzle; it MUST NOT pick one by iteration order.
This is the runtime counterpart of the enable-time guard below and consumes the SAME domination predicate, so the two can never disagree about which set is more specific.
- Signature INSEPARABILITY is invalid across all recipes in the system.
Two ingredient sets are inseparable only when they are ambiguous in a way no added or different ingredient can ever resolve: a plausible submission of EACH set also satisfies the OTHER — the **symmetric** transversal condition.
A pair conflicts iff some **transversal** of one set — the natural "the ingredients each requirement calls for" craft, choosing one satisfying option per group and supplying exactly its required quantity of units — satisfies every group of the other set AND vice versa (BOTH directions).
The transversal is quantity-aware: a `quantity: N` option can supply up to `N` DISTINCT components.
Symmetric-transversal inseparability covers exactly: identical signatures; two single-group sets sharing a component that satisfies both (e.g. a `mithril` tagged both `rare` and `metal` for `{rare}` vs `{metal}`); and an OR-option set that fully shadows a narrower one.
A strict subset/superset pair (e.g. `{Water}` vs `{Water},{Herb}`, or a `{metal x2}` group vs its distinct `{iron},{gold}` components) is ONE-directional and is now ALLOWED — the runtime's most-specific pick brews the superset when the extra ingredient is present and the base when it is not.
Incomparable siblings (`{S,V,E}` vs `{S,V,R}`) satisfy neither direction and are ALLOWED; an ambiguous over-submission of both fizzles safely rather than brewing the wrong one.
Merely sharing a common base component (water, reagent, flask) is NOT inseparability when the sets are otherwise distinguishable (e.g. `{Water},{Herb}` vs `{Water},{Mineral}`).
- No-signature-match (a fizzle) is treated as a failed attempt: the player sees a specific failure message and the submitted ingredients are consumed (per `alchemy.consumeOnFail`).
Learning is never granted by a fizzle.
- The matched-but-unroutable **misconfiguration** path applies to **Tiered only** (None/Simple do not route by name): the craft aborts with ZERO mutation BEFORE any consumption (no ingredients, currency, or tools consumed or broken), reports failure (never a player success with zero items), and returns actionable GM diagnostics.
The reserved-keyword "nothing" rule must not collide with Simple's producing failure group.

### Alchemy UI Interaction Model

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- Shows: image, name, available quantity (inventory minus workbench count).
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench (decrement palette quantity).
- Right-click: remove one from workbench (increment palette quantity), only if component is in workbench.
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3").
- Each unique component appears once; adding increments the badge count.
- Supports: add from palette, remove (right-click or direct action), clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules.
- On submit, a quantity badge of N contributes N unit submissions (one per unit), so occurrence-based signature matching and consumption observe the displayed quantity.

#### Workbench Status Model (five modes)

- The bench drives a five-mode status model that governs the status pill, the Produces panel, and the Brew affordance: `empty`; `assembling` (the bench is a strict subset of a selected known recipe's signature); `ready` (the bench matches a known signature — superset-tolerant and resolved to the same MOST-SPECIFIC pick as the engine, so a bench that CONTAINS one known concrete while being a superset of another does not read a false `ready` for the smaller, and a non-unique maximum reads no confident `ready`); `untried` (the bench matches no known recipe AND is not a remembered fizzle); `no-reaction` (the bench matches no known recipe AND IS a remembered fizzle).
- The projected revealed-recipe **signature summary** must be rich enough to display alternatives, per-option quantities, and set-level essence requirements (an alchemy recipe now carries exactly one ingredient set, so multi-set richness no longer applies — issue 554).
- **Client mode is advisory; the engine is authoritative on brew.** The client resolves TWO signature shapes: a concrete plain-component multiset AND an essence-only requirement (via a projected `essenceRequirement`, using `>=` matching that mirrors the engine's `_matchAlchemySignature`).
It fails safe to `untried` for everything else — alternatives (multi-option groups), tag-based requirements, and mixed group+essence sets (`AlchemyListingBuilder._essenceRequirement` deliberately returns null for those) — and NEVER emits a false `ready`/`assembling`.
- **Brew-result banner status enum.** A brew reports one of five banner states, styled distinctly: `success` (a passed brew produced its success result set); `tiered-tier` (a passed Tiered brew produced its outcome-tier result set); `produced-on-failure` (a matched Simple brew FAILED its check and produced the reserved failure result set — styled with the warning tone, NEVER success-green, and composing with a discovery); `brewing` (a TIME-GATED brew that STARTED — the signature matched, the inputs are consumed, and the run is live in the Journal awaiting world time; styled informationally, never as a failure, and composing with a discovery); `no-match-fizzle` (no reaction, a Tiered fail, or a misconfiguration).
A started time-gated brew is identified by the engine's `disposition: 'timed-start'`, NOT by `success` — which is `false` for it, because nothing has been produced yet (issue 966).
Without that disposition the workbench read a successfully started brew as a no-signature fizzle and told the player it had failed while their ingredients were being consumed.
A `simple`/`tiered` learned recipe carries a "check gates this outcome" hint; the reserved failure-group result is NEVER surfaced to the player Produces panel (leak invariant).
The same caveat applies to select-to-load auto-fill.
- **Hidden dead-end rule.** Non-revealed recipes and never-tried dead-ends BOTH present as `untried`.
The player projection exposes only revealed recipes plus the **count** of non-revealed recipes; no status text, Produces panel, or styling leaks the existence, result, or signature of a non-revealed recipe.
- **Per-character x system tried-dead-end memory.** `Actor.flags.fabricate.alchemyDeadEnds` is an append-only, deduped array of canonical `componentId:qty|...` keys per system, written on a fizzled brew only when `alchemy.showAttemptHistoryToPlayers === true`.
It is the ONLY thing that flips `untried` -> `no-reaction`; it grants no visibility (a fizzle matches no enabled recipe) and is consumed solely by the client status model.

#### Alchemy System Selection

- Required when multiple alchemy-mode (crafting) systems exist: a chooser presents one card per system (icon, name, `N known . M total`, blurb, Enter).
- A "Switch" affordance returns to the chooser and resets the per-selection workbench state (bench, selection, last-brew, search); it is shown only when more than one alchemy system exists.
- Selector shows only `resolutionMode === "alchemy"` systems and determines which components appear in the palette.
- Auto-enters when exactly one alchemy system exists.
- Persisted in the `fabricate.lastAlchemySystem` client setting (like `lastCraftingActor` and `lastComponentSources`).
Canonical text uses "alchemy (crafting) system"; "discipline" is reserved for player-facing copy only.

#### Discovered Recipes Panel

- Panel is always visible, even when no recipes have been revealed yet.
- Shows an encouraging empty state message (e.g., "No recipes revealed yet — learn or brew recipes to reveal them here").
- Once recipes are revealed, the empty state is replaced by the searchable list.
- Selecting a known recipe **auto-loads** its signature onto the bench (auto-fill is a selection side effect, not a separate per-recipe button), scoped to recipes reducible to a concrete plain-component multiset.
- The "Craftable only" filter is DEFERRED this iteration.

#### Tab Feature Scope

- Includes: component inventory, workbench, and the known-recipes list.
- Recorded run/attempt **history stays a Journal concern** — the tab has NO history panel and NO active-runs surface.
Its only local memory is the internal fizzle dead-end set (which is not run history).
- Excludes: shopping list, recipe browsing, favourites.
- This is a deliberate narrowing from the earlier "active runs, history" scope.

### Validation

- `features.multiStepRecipes` must be false; an alchemy recipe must have no explicit steps.
- Exactly one `IngredientSet` (alchemy is never routed by ingredients).
- Result-group cardinality is per `alchemy.checkMode`:
  - **None / Simple** — exactly one SUCCESS group (`role !== 'failure'`).
Simple additionally tolerates the reserved `role: 'failure'` group, whose ABSENCE is permitted (a settings-only None→Simple flip runs no recipe migration).
  - **Tiered** — at least one result group; reserved/duplicate `ResultGroup.name` integrity is enforced at the service level (`ResolutionModeService._validateRoutedGroupNames`, Tiered only), exactly like `routedByCheck`.
- A Simple- or Tiered-check-mode system requires an authored crafting-check roll formula (`craftingCheck.simple` for Simple, `craftingCheck.routed` for Tiered): a missing formula is an unconditional system-level blocker (`alchemyCheckNoFormula`) surfaced by `systemValidation`, not a per-recipe error.
The retired provider required/enum rules no longer apply (issue 554).
- All recipes must satisfy alchemy-wide signature separability invariants; a signature collision — now narrowed to an INSEPARABLE (symmetric-transversal) pair, no longer a mere subset/superset — blocks save/import operations system-wide until resolved.
The gate evaluates a candidate as though its activation had already landed, whether or not the recipe is stored yet, so a create or an import that would introduce a collision is refused at that moment rather than at the next reconciliation (see `data-models/spec.md` §Alchemy Signature Uniqueness).

## Testing Requirements

- Unit tests per mode for cardinality and routing validation.
- Unit tests for mode-specific routed behavior (`routedByIngredients`, `routedByCheck`) and the alchemy check-mode matrix (`none`, `simple` pass/fail incl. the reserved failure-group path, `tiered`).
- Unit tests for reserved failure keyword handling and result-group name matching normalization.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behavior in full crafting flow.
- Integration tests for alchemy no-signature failure behavior (failure message + ingredient consumption).
- Integration tests for alchemy routing-mismatch misconfiguration behavior (error + no player-failure consumption).
- Integration tests for alchemy uniqueness blocking semantics in save/import workflows.
- A regression test asserts durable-flag-first, exclusive, bucket-once attribution by driving the **real end-to-end path** — the owned-components palette (`AlchemyListingBuilder`) → `submitAlchemyAttempt` → the collector (`resolveAlchemySubmissions`) → `craftAlchemy` (`_matchAlchemySignature` / dead-end multiset), NOT hand-built submissions or a hand-supplied `systemId`.
It asserts the palette's attribution, the collector's attribution, and the signature matcher all **agree** on component B (and the item is brewable, not dropped as `No ingredients`) for an item stamped `roles[systemId].componentId = B` carrying `_stats.duplicateSource = A.uuid` with no legacy scalar (A a distinct component in the recipe's set whose source ref genuinely overlaps the item's raw refs).
It MUST be RED against any systemId-blind or second-bucketing implementation and green after.
- A regression test asserts one-unit-per-group counting: a single submission that matches two or more of a group's components contributes exactly one unit to that group, not one per matched component.
