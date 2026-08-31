/**
 * designSystemPrimitives.js
 *
 * The machine-readable half of the `design-system` capability: one row per shared UI primitive,
 * keyed on the implementation path a diff names.
 *
 * `openspec/specs/design-system/spec.md` says the shared primitive set "MUST be the set enumerated
 * in this capability" and that a primitive enters it by "adding its entry to this capability". The
 * prose states the rule; it enumerates nothing. The vocabulary lives only in `library.html`, as
 * names inside its `div.spec-head > h4` blocks, which no gate and no script can consult. This
 * module is the enumeration those sentences point at.
 *
 * WHY THIS IS A MODULE IN `scripts/lib/` AND NOT A LIST IN `tests/`
 * -----------------------------------------------------------------
 * The dependency direction is fixed: tests already import from `scripts/lib/`, and nothing in
 * `scripts/` imports from `tests/`. `svelteComponentFiles.js` beside this file is the exact
 * precedent, and its docblock states the same rationale — two independent consumers must agree on
 * a set and are meaningless if they disagree. Here the consumers are `viewLabCases.js`, which
 * derives its broad-signal routing from the `evidence: 'broad'` rows, and the integrity properties
 * in `tests/design-system-primitives.test.js`.
 *
 * ── WHERE THE ROWS LIVE, AND WHY THEY ARE NOT WRITTEN OUT HERE ─────────────────────────────────
 *
 * The rows are in `designSystemPrimitives.json` beside this file. Everything ELSE is here: the
 * taxonomy, the membership bar, what each column means, and the two derivations. Prose that belongs
 * to a ROW travels with it, in its `why` string — a field, not a comment — so no reasoning was lost
 * by the move, and none of it should migrate back into a comment here where it would sit away from
 * the row it judges.
 *
 * This is not a filing preference, and INLINING THESE ROWS BACK INTO THIS FILE REINTRODUCES A
 * FAILING QUALITY GATE. Written out as frozen object literals, the manifest failed SonarCloud on
 * its own: 23.0% new-code duplicated lines against a threshold of 3, from 17 copy-paste groups
 * EVERY ONE of which matched this file against itself, in blocks of 26 to 47 lines. The detector
 * normalises string literals, so two rows whose prose could not be more different reduce to the
 * same token sequence, and a run of them is one long repetition. Compacting the row shape does not
 * help — a positional one-line form is still about eleven identical normalised tokens per row
 * against a ~100-token minimum block, so ten consecutive rows still match. Any uniform table
 * expressed as code trips this; the fix is for the table to stop being code.
 *
 * Neither escape hatch was available. `sonar-project.properties` already lists `scripts/**` in
 * `sonar.cpd.exclusions` and records at length that the property is INERT under Automatic Analysis,
 * and `AGENTS.md` records that the only durable path-level exemption is a Duplication Exclusion a
 * MAINTAINER sets in the SonarCloud UI, which an agent must not assume. What made the data file the
 * answer rather than a dodge is measured against this project: SonarCloud does not index `.json`
 * here at all — `lang/en.json`, which is large and far more repetitive than this, is not a known
 * component to either the duplications or the measures API. `benchmarks/baselines/*.json`, read by
 * `scripts/lib/benchmarkBaselines.js`, is the repository's precedent for committed data beside a
 * `scripts/lib/` loader.
 *
 * The load is a synchronous read at import time resolved from `import.meta.url`, so it does not
 * depend on a working directory. This module still imports NO repository module — only Node
 * builtins — so it remains the leaf `scripts/ui-pr-screenshot-evidence.mjs` relies on to close no
 * import cycle, and it is still safe to import from `node --test` and from any script. An
 * `import ... with { type: 'json' }` attribute would be terser and is deliberately not used: the
 * `readFileSync` form is already proven against this repository's ESLint, Prettier and Node by the
 * sibling loaders in this directory, and a manifest is not the place to find out about the other.
 *
 * ── ROW SHAPE ──────────────────────────────────────────────────────────────────────────────────
 *
 *   { path, library, evidence, why }
 *
 * `path`    Repository-relative POSIX path of the shipped implementation, exactly as a diff names
 *           it. Asserted to exist on disk.
 * `library` The name of this primitive's entry in `openspec/specs/design-system/library.html`,
 *           written as it appears there (`'<Stepper>'`), or JSON `null`.
 * `evidence` `'broad'` or `'targeted'`. See below — this is the field with consequences, and the
 *           integrity test asserts that EVERY row carries one of the two, so no row can be exempt
 *           from both clauses by a typo.
 * `why`     The judgement, in prose. For a `null` library, why the correspondence is not made; for
 *           a non-member, its callers named, or the fact that it has none.
 *
 * There is deliberately no `status` field. Membership is which TABLE holds the row —
 * {@link DESIGN_SYSTEM_PRIMITIVES} or {@link NOT_A_PRIMITIVE} — and a field restating that is
 * hand-typed data no consumer reads, so it can only ever be wrong. This module exists because
 * configuration nothing consults looks identical to configuration something does; a redundant
 * column would be one more instance of exactly that.
 *
 * The two halves of the conformance question are the two ways a row can be incomplete:
 *
 *   |                | `library` set          | `library: null`           |
 *   |----------------|------------------------|---------------------------|
 *   | `path` set     | conformant             | shipped but undocumented  |
 *   | `path: null`   | specified, not built   | rejected by the gate      |
 *
 * No row carries `path: null` today: this module enumerates what SHIPS. The specified-but-unbuilt
 * quadrant belongs to the conformance gate that reads `library.html`, which is deliberately a
 * later change in this programme (issue 1378) — this one builds the machine-readable half it will
 * read.
 *
 * ── HOW `library` IS ASSIGNED, AND WHEN IT IS NULL ─────────────────────────────────────────────
 *
 * A name is recorded only when the library entry names the primitive AND the shipped file IS that
 * primitive today. A shipped file the library records as COLLAPSING INTO a primitive it is not yet
 * — the catalogue pickers at `library.html:764` are the live example — takes `null`, with the
 * target named in `why`. Guessing there would fill the "conformant" quadrant with work that has
 * not been done, which is the one thing a conformance manifest must never do.
 *
 * `tests/design-system-primitives.test.js` asserts only that a recorded name is SPELLED as
 * `library.html` spells it. That is a mirror guard against inventing a name, not the conformance
 * gate; the gate is the next change.
 *
 * ── `evidence`, AND WHY IT IS A JUDGEMENT RATHER THAN A LOCATION ───────────────────────────────
 *
 * `evidence` answers: can a change to this file be attributed to particular View Lab frames?
 *
 *   `'broad'`     No. It has enough consumers that any frame is arbitrary, so a change to it
 *                 publishes the representative pair (plus any `BROAD_SIGNAL_CASE_OVERRIDES` entry
 *                 naming a frame that renders its deliberate state).
 *   `'targeted'`  Yes. Its consumers are few and named, and the cases that render it claim it by
 *                 `sourceMatches`.
 *
 * It is NOT a synonym for location, and the ten `'targeted'` rows under `apps/manager/` are the
 * proof. `viewLabCases.js` records that the four bulk-edit chrome files are DELIBERATELY excluded
 * from the broad-signal set because they have exactly two consumers each, so targeted attribution
 * is "both possible and honest"; `BulkDeleteCard` is excluded separately, because
 * `scripts/ui-pr-screenshot-evidence.mjs` routes it to the four `*-bulk-delete-*` frames that
 * actually photograph it. Making either broad here would have the two registries disagree about
 * what evidence a change to one of them requires.
 *
 * The consequence runs the other way too, and it is the defect issue 1378 names. A `'targeted'`
 * row placed under `src/ui/svelte/components/` is swallowed by that directory leg of
 * `BROAD_SIGNAL_PATTERN` whatever judgement is recorded beside it — a directory cannot tell a
 * primitive from a component that merely lives there. Property (c) of the integrity test is what
 * reports that, by asserting each row's `evidence` against what the pattern actually matches.
 *
 * ── THE MEMBERSHIP BAR ─────────────────────────────────────────────────────────────────────────
 *
 * `spec.md:29` — two or more INDEPENDENT callers. An importer is any other file under `src/` that
 * imports the component by path. Six ADJUDICATED candidates fall below the bar and are recorded in
 * {@link NOT_A_PRIMITIVE} rather than omitted, because `spec.md:30` requires a candidate with fewer
 * to be "recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that it has none — so the
 * absence is a decision rather than an oversight".
 *
 * ADJUDICATED is the bound, and it is load-bearing: 48 top-level files under `apps/manager/` sit
 * below the two-caller bar, and {@link NOT_A_PRIMITIVE} is emphatically not a list of all of them.
 * See its own docblock for the rule.
 *
 * ── WHAT THIS MODULE IS DELIBERATELY NOT ───────────────────────────────────────────────────────
 *
 * `SHARED_PRIMITIVES` in `tests/components/mounted-harness-primitive-allowlist.test.js` is NOT
 * derived from this manifest and must not become so. It answers a different question — can
 * omitting this file HANG a mounted tree — and three of its entries are on it at one caller, or
 * from a nested directory, for recorded reasons the two-caller predicate structurally cannot
 * express (`EssenceQuantityCard`, `InspectorActionButton`, `RowDisclosure`). Deriving it here
 * would silently drop those three, and a missing entry there does not fail a suite: it hangs it
 * and reports `# cancelled`.
 */
import { readFileSync } from 'node:fs';

/**
 * The manager's own primitive directory, as a diff names it. Primitives sit DIRECTLY under it,
 * mixed in with feature views, which is why the manager's set has to be named rather than globbed.
 *
 * Module-private: the paths themselves are the manifest's interface, and a second exported way to
 * ask where a primitive lives is a way for two callers to disagree.
 */
const MANAGER_PRIMITIVE_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * The three tables, read from the sibling data file. See the docblock above for why they are not
 * written out in this module.
 *
 * Resolved against `import.meta.url` rather than `process.cwd()`: this module is imported by
 * `node --test` from the repository root, by `scripts/*.mjs` run from anywhere, and by the
 * screenshot evidence gate under `gh`, and only one of those three has a predictable cwd. A
 * missing or malformed file throws here, at import, naming the path — which is the loud direction.
 */
const MANIFEST = JSON.parse(
  readFileSync(new URL('designSystemPrimitives.json', import.meta.url), 'utf8')
);

/**
 * Freeze a table read from JSON, rows and all.
 *
 * `JSON.parse` hands back fresh MUTABLE objects, where the literals this replaced were frozen at
 * both levels. That is not decoration: these tables are module-level singletons shared by every
 * importer in one process — `viewLabCases.js` derives routing from them at ITS import time, and a
 * test that mutated a row in place would change what a later suite in the same run routes. Freezing
 * both levels makes such a write throw in strict mode instead of silently succeeding.
 *
 * @template {object} Row
 * @param {Row[]} rows
 * @returns {readonly Row[]}
 */
function frozenTable(rows) {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/**
 * Order two strings by code point, ascending.
 *
 * The reason is DETERMINISM, and the hazard is `localeCompare`, not the default comparator. A bare
 * `.sort()` on an array of strings reaches this exact order — nothing is stringified, and this
 * repository uses bare `.sort()` on string arrays elsewhere, including in this manifest's own test.
 * But `.sort()` is not available here: `npm run lint` covers this file at `--max-warnings=0` and
 * `unicorn/require-array-sort-compare` errors on a bare sort, so SOME comparator must be passed,
 * and the obvious reach is `localeCompare`. That one is locale-dependent: two machines could order
 * `EmptyState` and `EditorValidationSurface` differently and emit two different
 * `BROAD_SIGNAL_PATTERN` sources for the same manifest — passing the pinned source locally and
 * failing it on the runner. This is the comparator that satisfies the rule without introducing
 * that, and it mirrors `svelteComponentFiles.js`, which sorts the same way for the same reason.
 *
 * The sort itself is load-bearing, not decorative: removing it while moving a row reds the pinned
 * pattern source in `tests/design-system-primitives.test.js`.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * The shipped shared primitive set: every file that meets the capability's two-caller bar and sits
 * in one of the two primitive directories.
 *
 * Authored alphabetically for reading. Nothing may DEPEND on that order — every derivation below
 * sorts explicitly, because an authoring order that happens to be sorted is a coincidence and the
 * first hand-added row appended in the wrong place would silently change what the derivation emits.
 *
 * @type {readonly {path: string, library: string|null, evidence: string, why: string}[]}
 */
export const DESIGN_SYSTEM_PRIMITIVES = frozenTable(MANIFEST.designSystemPrimitives);

/**
 * ADJUDICATED candidates that sit in a primitive directory and are NOT members of the set.
 *
 * Recorded rather than omitted because `spec.md:30` requires it: a candidate below the two-caller
 * bar is "recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that it has none — so
 * the absence is a decision rather than an oversight, and so a later reader can re-test the count
 * rather than re-derive it".
 *
 * ── WHAT BELONGS HERE, AND WHY IT IS NOT EVERY NON-MEMBER IN THE DIRECTORY ─────────────────────
 *
 * A row here records a candidate THE PROJECT HAS ALREADY ADJUDICATED — one some other artefact in
 * the repository has taken a written position on: a docblock that says why it is excluded from the
 * broad-signal set, a `library.html` entry it does or does not implement, an entry on the
 * mounted-harness hang guard. It is NOT a census of the directory. 48 of the 72 top-level files
 * under `apps/manager/` sit below the two-caller bar, and `components/` holds screen regions and
 * dead code besides; listing all of them would bury the six judgements that were actually made in
 * dozens that were not, and `spec.md:30` asks for recorded DECISIONS, not for an inventory.
 *
 * So the next reader has two wrong moves available and neither is what this list wants: adding the
 * other 47 manager files, and deleting `InspectorActionButton` as inconsistent with them. The
 * distinguishing fact is written down beside each row.
 *
 * ── THE `evidence` COLUMN HERE ─────────────────────────────────────────────────────────────────
 *
 * These rows carry `evidence` truthfully rather than aspirationally — it records what
 * `BROAD_SIGNAL_PATTERN` DOES with the path, not what anyone thinks the file deserves. The five
 * under `src/ui/svelte/components/` are `'broad'` because that directory leg matches them today
 * whatever anyone thinks of them, which is the point issue 1378 makes: a directory cannot tell a
 * primitive from a component that merely lives there. `InspectorActionButton` is `'targeted'`
 * because it sits under `apps/manager/`, where membership is by name and it is on no name list, so
 * the four essence frames that claim it by `sourceMatches` are reached.
 *
 * That is why the integrity test runs its per-row clauses over THESE rows too. The disk clause in
 * particular is live here: two of the six name files nothing imports.
 *
 * @type {readonly {path: string, library: string|null, evidence: string, why: string}[]}
 */
export const NOT_A_PRIMITIVE = frozenTable(MANIFEST.notAPrimitive);

/**
 * The ruled-out register, mirroring `spec.md:586-597` and `library.html:1802-1818`.
 *
 * Part of the specification, not commentary: `spec.md:588` requires declined candidates to be
 * recorded with the reasoning that declined them "so that the absence of a primitive is legible as
 * a decision", and `spec.md:599` says a re-proposal must address the recorded reasoning and,
 * absent new evidence, use the composition instead.
 *
 * GUARDED, because a hand-typed mirror shipped inside a change whose thesis is that unguarded
 * mirrors rot would be self-refuting. `tests/design-system-primitives.test.js` checks every `name`
 * against `library.html`, the same spelling guard the `library` column gets. `library.html` is the
 * only anchor: `spec.md:586-597` states the same ten judgements in PROSE ("a member row", "an actor
 * picker") and contains none of these names as a token, so a guard pointed there would be a guard
 * that could only be satisfied by rewriting the specification. What is asserted is spelling, not
 * that the verdict recorded here is the verdict recorded there — the conformance gate that reads
 * `library.html` structurally is the next change in this programme.
 *
 * `verdict` is `'composition'` (it decomposes entirely into members already in the set),
 * `'out-of-scope'` (declined for a product reason rather than a structural one) or `'foundry-owns'`
 * (Foundry already provides the surface). `replacement` is the composition or the API to use.
 *
 * The library's two aggregate wells are deliberately NOT rows here. "Five more" (`:1815`) names
 * five candidates in a sentence without individual reasoning, and "Graph canvas" (`:1816`) is a
 * zero-caller placeholder behind an experimental flag that "re-enters the set with the work that
 * ships it" — neither is a declined candidate with its own recorded judgement, and inventing rows
 * for them would put words in the register that the specification does not contain.
 *
 * @type {readonly {name: string, verdict: string, replacement: string|null, why: string}[]}
 */
export const RULED_OUT = frozenTable(MANIFEST.ruledOut);

/**
 * The shipped primitive paths carrying a given evidence judgement, in code-point order.
 *
 * SORTED EXPLICITLY. Callers derive regular expression sources from this, and a derivation whose
 * output depends on the manifest's authoring order is a derivation that changes the day someone
 * appends a row instead of inserting it alphabetically.
 *
 * Covers {@link DESIGN_SYSTEM_PRIMITIVES} only, never {@link NOT_A_PRIMITIVE}: a non-member must
 * not be able to widen the broad-signal set by being listed. The integrity test asserts the
 * evidence judgement of the non-member rows separately.
 *
 * @param {string} evidence `'broad'` or `'targeted'`
 * @returns {string[]} repository-relative POSIX paths
 */
export function primitivePathsByEvidence(evidence) {
  return DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.evidence === evidence)
    .map((row) => row.path)
    .sort(byCodePoint);
}

/**
 * The basenames, extension stripped, of the manager's own primitives carrying a given evidence
 * judgement — in code-point order.
 *
 * The manager's primitives sit DIRECTLY under `apps/manager/`, mixed in with feature views, so
 * they cannot be selected by a directory glob the way `components/` can: a glob there would
 * swallow `RecipesBrowserView.svelte` too. Consumers therefore need the names, and this is where
 * they come from.
 *
 * @param {string} evidence `'broad'` or `'targeted'`
 * @returns {string[]} component basenames without the `.svelte` extension
 */
export function managerPrimitiveNamesByEvidence(evidence) {
  return primitivePathsByEvidence(evidence)
    .filter((path) => path.startsWith(MANAGER_PRIMITIVE_DIRECTORY) && path.endsWith('.svelte'))
    .map((path) => path.slice(MANAGER_PRIMITIVE_DIRECTORY.length, -'.svelte'.length));
}
