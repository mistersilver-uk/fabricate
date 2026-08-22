# Fabricate performance benchmark harness

The deterministic, Foundry-free measurement baseline for the performance
programme (issue 1070, built by issue 1071).

No Foundry installation, licence, container or browser is involved.
Every profile runs under plain Node against synthetic fixtures generated from
`{profile, seed}` alone.

```sh
npm run benchmark:performance                              # all profiles, 5 reps
npm run benchmark:performance -- --profile=held-inventory  # one profile
npm run benchmark:performance -- --list                    # what exists
npm run benchmark:performance -- --check                   # fail on class-1 drift
npm run benchmark:performance -- --update-baselines        # re-record class 1
npm run benchmark:compare -- <baseline-run.json> <candidate-run.json>
```

## The two measurement classes, kept strictly apart

This is the load-bearing convention of the whole harness.

<!-- markdownlint-disable MD013 markdownlint-sentences-per-line -->

| | Class 1 | Class 2 |
|---|---|---|
| What | Operation counts, hydrated-model counts, candidate examinations, signature comparisons, graph nodes/edges, serialized payload bytes, fixture checksums | Wall clock, heap delta |
| Where | `benchmarks/baselines/<profile>.json` — **committed** | `.benchmarks/runs/<iso8601>-<shortsha>.json` — **gitignored** |
| Asserted | Yes, by `tests/benchmark-baseline-drift.test.js`. This is the actual regression guard | **Never** |
| Portable | Identical on every machine and every Node build | Meaningless off the machine that produced it |

<!-- markdownlint-enable MD013 markdownlint-sentences-per-line -->

A single JSON of milliseconds checked into the repository is the obvious design
and the broken one: it gets re-measured on a different machine and read as a
regression.
This repository has already lived that failure once —
`scripts/lib/foundryRunBudget.js` records the Foundry `rc` walk budget being
re-estimated three times because hosted-runner timing did not match local.

**Report ratios, never absolute milliseconds, in issue and PR comments.**
A ratio is the only form that survives being pasted by a different maintainer.

## Reference hardware and runtime

The committed class-1 baselines are machine-invariant, so they need no hardware
note to be valid.
The class-2 medians quoted below do, and were measured on:

<!-- markdownlint-disable MD013 -->

| Field | Value |
|---|---|
| Node | 22.22.2 (V8 12.4.254.21-node.39) |
| OS | win32 10.0.26200 |
| Arch | x64 |
| CPU | AMD Ryzen 9 9900X3D 12-Core (6 logical CPUs visible to the process) |
| Memory | 63,092 MB |
| Containerized | no |
| Reps | 5 |

<!-- markdownlint-enable MD013 -->

## The three axes

Five profiles scale the **corpus** and hold inventory at a token 20 stacks.
`held-inventory` does the exact opposite: it pins the corpus at 6 recipes and
varies held stacks across 100 / 500 / 1,000 against the full 5,000-component
library.
`component-library` (issue 1204) pins both: the corpus at 6 recipes and the
inventory at 1,000 held stacks, and instead varies the **library** itself
across 1,000 / 5,000 / 10,000 components.
`alchemy-knowledge` (issue 1228) is the one profile that varies neither, and
says so: it bounds both axes at once because the term it records is their
**product**, and a profile that pinned either could not contain one.

That separation is the point.
The failure that started this programme was an **inventory**-axis failure — a
user with 1,080 components reported a 7.5 s crafting-menu open and traced it to
one character carrying hundreds of salvageable materials — while the epic's
target scale was written almost entirely in corpus terms.
A profile that grew two axes together could not attribute a regression to
either.

`CraftingListingBuilder.buildListing` is therefore measured along **all
three** series.
The corpus and inventory rows below are class-2 wall-clock medians from the
reference hardware above.
The library row has no committed wall-clock baseline, so it is quoted instead
in class-1 `identityCandidatesExamined` counts from
`craftingListing.buildListing.library@<n>` in
`benchmarks/baselines/component-library.json`:

<!-- markdownlint-disable MD013 -->

| Series | 1st point | 2nd point | 3rd point |
|---|---|---|---|
| Corpus axis (rows, 20 held stacks) | 25 rows → 17.8 ms | 50 rows → 36.0 ms | 100 rows → 81.0 ms |
| Inventory axis (held stacks, 6 rows) | 100 stacks → 5.8 ms | 500 stacks → 11.3 ms | 1,000 stacks → 18.9 ms |
| Library axis (components, 6 rows, 1,000 held stacks) | 1,000 → 1,300 examined | 5,000 → 5,300 examined | 10,000 → 10,300 examined |

<!-- markdownlint-enable MD013 -->

**A stray `identityIndexBuilds: 2` is a fixture artifact, not a regression.**
`component-library` and `held-inventory` each build ONE fixture object and
reuse it across every case in the profile.
`system.essenceDefinitions` and `system.recipeItemDefinitions` are both empty
arrays, and both are the same array instance for every case.
`getDefinitionIndex` caches per array identity, so whichever case reaches it
first pays one index build over that shared, zero-element array, and every
later case in the profile is a cache hit.
That build walks nothing, so `identityCandidatesExamined` is unaffected:
`craftingListing.buildListing.library@1000` records `identityIndexBuilds: 2`
against an unchanged `identityCandidatesExamined: 1300`, and the same pattern
recurs at `craftingListing.buildListing@100` in
`benchmarks/baselines/held-inventory.json`.
Read the extra `1` as "this case executed first", not as a signal about the
series point.
Reordering a profile's cases, or inserting a new one ahead of the first,
moves which case shows it.

All three are still linear in their own axis, and the inventory axis is the one
issue 1076 changed: it measured 299 / 1,476 / 2,961 ms before identity
resolution became index-backed, against 5.8 / 11.3 / 18.9 ms after.
What survives is the `recipes × items` half `evaluateCraftability` pays — it
re-flattens `sourceActors.flatMap((actor) => [...actor.items])` once per
recipe — and what went is the `× components` factor.
The class-1 counters make that visible without a clock: the inventory series
recorded 8.7 M / 48.4 M / 99.0 M `componentCandidatesExamined` before and
74 k / 111 k / 156 k combined `componentCandidatesExamined` +
`identityCandidatesExamined` after, with the same flat 30
`craftingActorItemsReads` for 6 rows — i.e. five re-reads per row, untouched,
because that is #1077's term rather than this one's.

### Most held items resolve to NO component, and that is deliberate

Each inventory profile declares a **70% unmatched / 30% component** mix, and the
mix is recorded in the baseline.

An inventory made entirely of registered components exercises the *cheap*
identity tier: a durable `flags.fabricate.roles[systemId].componentId` hits on
tier 1 and stops.
An ordinary item — mundane gear, ammo, loot, most of a real character sheet —
carries no Fabricate flags, and before issue 1076 it fell through both durable
tiers, failed the source-reference intersection after scanning the whole library,
and then paid a *second* full scan in the name fallback before returning `null`.

Measured here against a 5,000-component library at 1,000 held stacks, before and
after that issue made every tier a `Map` lookup:

<!-- markdownlint-disable MD013 -->

| Case | Median before → after | Examinations before → after |
|---|---|---|
| `identity.resolveComponentForItem.hit@1000` (200 durable items) | 0.52 → 0.02 ms | 30,100 → 5,200 |
| `identity.resolveComponentForItem.miss@1000` (700 unmatched items) | 121.8 → 0.21 ms | 3,500,000 → 5,000 |
| `identity.findMatchingComponent.miss@1000` (same, plus name fallback) | 259.3 → 0.34 ms | 7,000,000 → 5,000 |

<!-- markdownlint-enable MD013 -->

The residual 5,000 is one index build over the 5,000-component library, paid once
and then warm; the per-item cost after it is zero examinations for a miss and one
for a hit.
The "after" column reads `identityCandidatesExamined`, which
`definitionIndex` reports itself.
That counter exists because the fixture-side `countingCandidates` array can only
see a scan expressed as `find`/`filter`/`some`, so an index-backed resolver would
otherwise report a triumphant zero for work that is genuinely still O(library)
once per build.

A 100%-component benchmark inventory hides the miss path entirely.
`tests/benchmark-harness.test.js` asserts the majority-unmatched property so a
future edit cannot quietly turn it into the misleading case.

### `component-library` slices ONE generated library, not three independent draws

Each series point is a nested **prefix** of a single 10,000-component library,
not three separately generated libraries.
An independent draw at each size would give `c-5` a different essence and tag
pick at 1,000 components than at 10,000, so a count that moved across the
series could be misread as a change in component *content* rather than in
component *count*.
A prefix makes the 1,000-component world literally a sub-library of the
10,000-component one, the same discipline `held-inventory` applies to its own
inventory series.

The pinned recipe corpus and the pinned inventory are both built against the
smallest (1,000-component) prefix, so every authored ingredient and every
matched stack exists identically at every point of the series.
Anyone extending this axis with a fourth point must keep drawing from the same
prefix chain, not a fresh library, or the series stops isolating library size.

That pinning has a consequence the bulk-run case has to work around.
Every component the actor holds sits at a fixed low position at every series
point, because the inventory is drawn against the smallest prefix.
A per-row scan over one of those terminates after the same handful of
comparisons at 1,000 as at 10,000, so it reports a flat series and proves
nothing.
`bulkDestroy.resolveRows.library@<n>` (issue 1202) therefore takes its rows
from the **end** of each point's own library, so a surviving scan pays its full
length and a reintroduced product shows up as a slope.
The actor holds none of those components, so every row is correctly classified
`depleted` — but `_destroyOne` resolves the component and runs the full matcher
pass over the pinned 1,000 stacks before it can say so, which is the term being
bounded.
`depletedRows` is the count that proves it: a row whose id failed to resolve is
classified `unknownComponent` instead and never reaches the matcher.
The matched-row half of the same run is measured on the other axis, by
`craftingEngine.findComponentItems.bulk@<n>` in `held-inventory`.

That case is also the one place a benchmark carries **both** counting layers.
`createBenchWorld` wraps every profile's library in `countingCandidates`, which
sees a scan written as `components.find(...)` and is blind to
`for (const c of components)`.
Widening the shared wrapper would move every committed count that walks a
component array, so the enumeration layer is applied to this one case's array
instead, under its own `componentEnumerationsWalked` and
`componentEntriesWalked` keys.
`componentEntriesWalked` reads exactly the library size at each point: that is
`buildIndex` walking `definitions.entries()` for its one cold build.
A surplus over the library size is the signal.

## Declared measurement ceilings

Five scales are deliberately below the epic's target, each for a stated reason.
**Do not spend a day trying to run them at full scale.**
A sixth profile, `component-library`, is also deliberately bounded, but above
rather than below the target, because its top point exists to fix a slope
rather than to stay under a cost budget.
See [The three axes](#the-three-axes) above.

### `alchemy-signatures` is capped at 2,000 signatures, not 5,000

`SignatureValidator.validateSystem` is cleanly quadratic.
At N = 2,000 it performs 1,999,000 pairwise comparisons and 4,400,000 candidate
examinations, and measures 681 ms here.
At N = 5,000 one audit extrapolates to roughly 6.1 s, and the **pre-fix**
N-audits-per-N-rows behaviour issue 1074 targets extrapolates to roughly
**8.5 hours** for one GM manager open.
The "before" number at full scale cannot be obtained and does not need to be —
prove the fix with the `signatureComparisons` counter, never with a clock.

### `alchemy-knowledge` bounds BOTH its corpus and its inventory

500 book-gated alchemy signatures against 200 held stacks, and neither number
may grow.
The alchemy workbench evaluates reveal **twice per recipe** — once for the
chooser summary and once for the active panel — so before issue 1228 it walked
the whole inventory `2N` times.
At these bounds that is already **204,000** documents offered to the per-recipe
recipe-item matcher for one workbench open, against **4,000** after the fix.
Raising either axis buys no extra signal and costs the drift test, which
re-derives every count inside `npm test`.

Two committed counts on this profile are the criterion, and they are counted on
the OFFER rather than on an inventory read for a reason that is measured rather
than argued:

- `candidateItemOffers` — how many held documents the per-recipe matcher was
  handed across the pass, and the number that moves.
- `candidateWalks` — how many recipes were asked, which distinguishes a real
  optimisation from a corpus filter that silently dropped rows.

An inventory-**read** counter cannot serve here.
With the pass snapshot missing its recipe-item matcher,
`craftingActorItemsScanned` reads exactly the same 213 it reads for correct code
— the unfiltered offer is served from one memoised walk — while
`candidateItemOffers` reads 204,000 instead of 4,000.

`knownRecipes` and `redactedRuns` sit beside them as non-vacuity guards.
Issue 1217 records that `alchemy-signatures` projects **zero** revealed rows,
so its alchemy case reports a fast number for a listing that answered nothing;
this profile therefore holds half the books AND brew-discovers 100 recipes, and
draws the journal's runs from past the learned slice so redaction answers both
ways.

### `recipe-graph` bounds both depth and fan-out

`buildRecipeGraph` emits one edge per (producer, consumer) pair per shared
component, so an unbounded dense corpus makes the benchmark the pathology it is
measuring.
`layoutGraph`'s cycle-detection DFS is recursive and unguarded, so an unbounded
*chain* stack-overflows before layout ever gets slow.
The fixture therefore fixes depth at 12 layers and expresses width as a `fanOut`
knob: 1,000 recipes at fan-out 1 yields 968 edges; 500 recipes at fan-out 8
yields 3,568.

### `held-inventory` pins its recipe corpus at 6 rows

The ceiling was set when `evaluateCraftability` cost ~137 ms per recipe at 1,000
held stacks against 5,000 components, so a 20-row open measured ~11 s and a
10,000-row open would have taken roughly 23 minutes.
Issue 1076 took the `× components` factor out of that, and six rows now measure
18.9 ms in total — but the bound stays, because the surviving `recipes × items`
re-flattening (#1077's term) is still a product and the series has to keep
varying exactly one axis.
Six rows still produce six-figure counters and a clean series, and keep the drift
test's re-derivation inside `npm test`.

### `ingredientSet.resolveIngredientSelection` is bounded at 12 recipes

Each rich recipe carries 3 sets × 3 groups × 3 options and every matcher
invocation used to cost a full 5,000-component candidate scan.
Two hundred recipes measured 38 s and 1.03 **billion** candidate examinations
before issue 1076 made identity resolution index-backed.
Twelve keeps the same shape and the same per-node signal at a cost the drift test
can re-derive, and the bound stays because the solver's own per-node
`O(inventory)` ledger copy (#1083) is untouched by that work.

## Fixture construction: literals versus real models

Stated per profile in `benchmarks/baselines/<profile>.json` under
`construction`, because mixing the two silently makes numbers incomparable.

- Profiles measuring **algorithmic** behaviour (filtering, browser models, graph
  construction, signature validation, visibility) consume plain recipe
  **payloads** — the wire shape that comes out of the `recipes` world setting.
  They are roughly an order of magnitude cheaper to build and exercise no
  normalisation, which is the point: the number should be the algorithm's, not
  the constructor's.
- Profiles measuring **serialization or reconstruction**
  (`recipe.hydrateCorpus`, `recipeManager.save`, `craftingSystemManager.save`,
  `craftingSystemManager.normalizeImport`) and the listing/solver cases that call
  model methods hydrate through real `Recipe.fromJSON`.

## Dependencies

Every profile currently registered is pure Node plus this repository's own
`src/` and `tests/helpers/`, so `npm run benchmark:performance` needs a checkout
and nothing beyond what `npm ci` provides for `node:test`.
"No Foundry runtime" is not "no dependencies": a future store-level profile
(`journalStore`, `craftingSourcesStore`, `createAdminStore`) would need
`node_modules` for `svelte/store` and the runes compiler.
Each profile records `requiresNodeModules` in its baseline so this stays a fact
rather than a memory.

## Comparing a candidate branch to `main`

Same machine, interleaved, at least 5 reps a side.
The compare tool **refuses** to diff two runs whose `nodeVersion`, `cpuModel` or
`arch` differ, and says which — a cross-machine ratio is not a weak number, it is
a wrong one.

```sh
git worktree add ../fabricate-base origin/main
(cd ../fabricate-base && npm ci)

# Interleave, so a background process or a thermal ramp cannot land on one side.
for i in 1 2 3; do
  (cd ../fabricate-base && npm run benchmark:performance -- --reps=5)
  npm run benchmark:performance -- --reps=5
done

npm run benchmark:compare -- \
  ../fabricate-base/.benchmarks/runs/<base>.json \
  .benchmarks/runs/<candidate>.json
```

The output is a **median ratio with an IQR band** per case.
`> 1.00` is slower.
A band straddling 1.0 means the two runs did not separate, and the tool says so
in those words rather than leaving a 3% ratio to be over-read.

## Refreshing the baselines

Issue 1070 requires baselines to be refreshed **as part of each optimisation
merge**, not left to drift.

1. `npm run benchmark:performance -- --check` — see which counts moved.
2. `npm run benchmark:performance -- --update-baselines` — re-record, in the
   SAME pull request.
3. Say in the PR description *what* moved and *why*.
   A count changing is the guard doing its job; a count changing without an
   explanation is the guard being switched off.

The drift test names the same instruction on failure, so nobody has to find this
file first.

## Adding a case

1. Add it to `tests/helpers/scale/benchmarkCases.js` with `setup` (never timed),
   `run` (the only timed and counted region) and `counts`.
2. Keep generation in `setup`.
   The contract is structural — the runner only ever wraps `run` — but a case
   that hides real work in `run`'s first statement defeats it by hand.
3. Bound anything whose cost is a product, and record the bound on the profile's
   `ceiling`.
4. `npm run benchmark:performance -- --update-baselines`, then confirm
   `tests/benchmark-baseline-drift.test.js` is green.
