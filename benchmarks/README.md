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

## The two axes

Five profiles scale the **corpus** and hold inventory at a token 20 stacks.
`held-inventory` does the exact opposite: it pins the corpus at 6 recipes and
varies held stacks across 100 / 500 / 1,000 against the full 5,000-component
library.

That separation is the point.
The failure that started this programme was an **inventory**-axis failure — a
user with 1,080 components reported a 7.5 s crafting-menu open and traced it to
one character carrying hundreds of salvageable materials — while the epic's
target scale was written almost entirely in corpus terms.
A profile that grew both together could not attribute a regression to either.

`CraftingListingBuilder.buildListing` is therefore measured along **both**
series:

<!-- markdownlint-disable MD013 -->

| Series | 1st point | 2nd point | 3rd point |
|---|---|---|---|
| Corpus axis (rows, 20 held stacks) | 25 rows → 249 ms | 50 rows → 497 ms | 100 rows → 998 ms |
| Inventory axis (held stacks, 6 rows) | 100 stacks → 299 ms | 500 stacks → 1,476 ms | 1,000 stacks → 2,961 ms |

<!-- markdownlint-enable MD013 -->

Both are linear in their own axis, which is exactly the
`recipes × items × components` product `evaluateCraftability` pays: it
re-flattens `sourceActors.flatMap((actor) => [...actor.items])` once per recipe
and resolves identity per item against the whole library.
The class-1 counters make that visible without a clock — the inventory series
records 8.7 M / 48.4 M / 99.0 M `componentCandidatesExamined` and a flat 30
`craftingActorItemsReads` for 6 rows, i.e. five re-reads per row.

### Most held items resolve to NO component, and that is deliberate

Each inventory profile declares a **70% unmatched / 30% component** mix, and the
mix is recorded in the baseline.

An inventory made entirely of registered components exercises the *cheap*
identity tier: a durable `flags.fabricate.roles[systemId].componentId` hits on
tier 1 and stops.
An ordinary item — mundane gear, ammo, loot, most of a real character sheet —
carries no Fabricate flags, falls through both durable tiers, fails the
source-reference intersection after scanning the whole library, and then pays a
*second* full scan in the name fallback before returning `null`.

Measured here against a 5,000-component library at 1,000 held stacks:

<!-- markdownlint-disable MD013 -->

| Case | Median | `componentCandidatesExamined` |
|---|---|---|
| `identity.resolveComponentForItem.hit@1000` (200 durable items) | 0.52 ms | 30,100 |
| `identity.resolveComponentForItem.miss@1000` (700 unmatched items) | 121.8 ms | 3,500,000 |
| `identity.findMatchingComponent.miss@1000` (same, plus name fallback) | 259.3 ms | 7,000,000 |

<!-- markdownlint-enable MD013 -->

A 100%-component benchmark inventory hides that entirely.
`tests/benchmark-harness.test.js` asserts the majority-unmatched property so a
future edit cannot quietly turn it into the misleading case.

## Declared measurement ceilings

Four scales are deliberately below the epic's target, each for a stated reason.
**Do not spend a day trying to run them at full scale.**

### `alchemy-signatures` is capped at 2,000 signatures, not 5,000

`SignatureValidator.validateSystem` is cleanly quadratic.
At N = 2,000 it performs 1,999,000 pairwise comparisons and 4,400,000 candidate
examinations, and measures 681 ms here.
At N = 5,000 one audit extrapolates to roughly 6.1 s, and the **pre-fix**
N-audits-per-N-rows behaviour issue 1074 targets extrapolates to roughly
**8.5 hours** for one GM manager open.
The "before" number at full scale cannot be obtained and does not need to be —
prove the fix with the `signatureComparisons` counter, never with a clock.

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

At 1,000 held stacks against 5,000 components, `evaluateCraftability` costs
~137 ms per recipe, so a 20-row open measures ~11 s and a 10,000-row open would
take roughly 23 minutes.
Six rows still produce nine-figure counters and a clean series, and keep the
drift test's re-derivation inside `npm test`.

### `ingredientSet.resolveIngredientSelection` is bounded at 12 recipes

Each rich recipe carries 3 sets × 3 groups × 3 options and every matcher
invocation costs a full 5,000-component candidate scan.
Two hundred recipes measured 38 s and 1.03 **billion** candidate examinations.
Twelve keeps the same shape and the same per-node signal at a cost the drift test
can re-derive.

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
