/**
 * componentImporters.js
 *
 * WHO IMPORTS THIS FILE — measured against the tree, so a claim about it can be checked.
 *
 * `openspec/specs/design-system/spec.md` requirement "The primitive set is a closed, versioned
 * vocabulary" puts a candidate into the shared set at TWO OR MORE INDEPENDENT CALLERS, and obliges
 * a candidate below that bar to be "recorded as ruled out WITH ITS CALLERS NAMED — or with the fact
 * that it has none — so the absence is a decision rather than an oversight, and so a later reader
 * can re-test the count rather than re-derive it". `scripts/lib/designSystemPrimitives.json` holds
 * those records. This module is the re-test.
 *
 * It exists because the records were prose and prose is not checked. Measured at the commit that
 * introduced this module, TWO rows had drifted in the direction that hides a converged primitive —
 * `InspectorActionButton` had said in its own text for two issues that it was OWED A MOVE it had
 * never been given, and `environment/CompositionList` claimed ONE caller, named
 * `environment/EnvironmentCompositionTab.svelte` for it, and had TWO — while no file of that name
 * has ever existed anywhere in the repository. A third, `recipe-item/RecipeItemLimitsTab`, had the
 * right COUNT beside the wrong FILE: it names `recipe-item/RecipeItemEditorTabs.svelte`, which is a
 * real sibling component that imports `EditorTabs` and not the tab it was credited with. Every gate
 * passed on all three, because nothing anywhere resolved a caller claim against an import.
 *
 * ── WHY THE MATCHER RESOLVES PATHS AND NEVER COMPARES A BASENAME ───────────────────────────────
 *
 * The register itself records the trap, on the `DropZone` row: a basename search that does not
 * anchor on the path separator conflates `components/DropZone.svelte` with
 * `apps/manager/ItemDropZone.svelte` and reports seven callers for a component nothing imports.
 * A basename is not an identity here — nothing stops two directories holding the same name, and
 * `Chip`/`StatusPill`, `ManagerColorPicker`/`ManagerColorPopover` are the near misses that already
 * ship.
 *
 * So no basename is compared at any point. Each relative specifier is resolved against the
 * DIRECTORY OF THE FILE THAT WROTE IT and the result is compared as a whole repository-relative
 * path. Substring and suffix matching are structurally unavailable, which is stronger than
 * anchoring a pattern correctly and remembering to keep it anchored.
 *
 * ── WHAT THE MATCHER READS, AND THE TWO WAYS A NAIVE ONE IS WRONG HERE ─────────────────────────
 *
 * The specifier is taken from the tail of the statement — `from '<spec>'`, or the `import '<spec>'`
 * and `import('<spec>')` forms that have no `from` — rather than from a pattern that must first
 * find the `import` keyword. Both mistakes below were made and measured against this repository
 * before this shape was settled on:
 *
 *  1. A LINE-AT-A-TIME matcher anchored on the `import` keyword misses every multi-line import,
 *     because the line carrying the specifier does not contain the keyword. This repository writes
 *     257 of its 2367 relative imports across more than one line — 11% of the graph, invisible.
 *     That is not a rounding error: `src/main.js` alone loses eleven edges.
 *  2. A WHOLE-FILE matcher that allows the gap between the keyword and the specifier to contain
 *     anything spans NEWLINES, so a docblock ending in a quoted phrase joins to the next `export`
 *     and yields a garbage specifier hundreds of characters long. Measured: it produced one on
 *     `src/systems/craftingBrowseStatus.js`.
 *
 * Comment-only lines are dropped before matching, which is what keeps a JSDoc `@param
 * {import('./X.js').Y}` TYPE annotation out of the graph — a type reference is not a caller, and 14
 * of them ship. Only lines whose first non-space characters open or continue a comment are dropped
 * (`*`, `//`, `/*`, `<!--`, `-->`), so no statement line can be eaten: an import never begins that
 * way, and neither does any continuation line of a multi-line one.
 *
 * ── WHY IT IS A MODULE IN `scripts/lib/` ───────────────────────────────────────────────────────
 *
 * The dependency direction is the one `svelteComponentFiles.js` beside it records: tests import
 * from `scripts/lib/`, nothing in `scripts/` imports from `tests/`. Keeping it here also puts it
 * inside the `eslint scripts/lib/*.js` and Prettier corpora, which `tests/**` is outside — and a
 * matcher whose failure mode is SILENCE is exactly the code that should be linted. It imports no
 * repository module and touches nothing but `node:fs` and `node:path`, so it is safe to import from
 * `node --test`.
 *
 * It is deliberately NOT called at import time by `designSystemPrimitives.js`. That module is the
 * leaf `scripts/ui-pr-screenshot-evidence.mjs` relies on to close no import cycle and is loaded
 * under `gh` with no predictable working directory; making it walk 700 files to answer a question
 * about routing would be a cost every consumer pays for one consumer's guard.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The extensions whose contents are read for imports.
 *
 * A `.css` or `.json` file imports nothing, and reading it would only widen the surface a false
 * positive can arrive from.
 */
const CODE_FILE_PATTERN = /\.(?:js|mjs|svelte)$/;

/** A line whose first non-space characters open or continue a comment. */
const COMMENT_ONLY_LINE = /^\s*(?:\*|\/\/|\/\*|<!--|-->)/;

/**
 * The tail of an import statement: the quoted specifier that follows `from`, or the one that
 * follows a side-effect `import` or a dynamic `import(`.
 *
 * Only RELATIVE specifiers are of interest — the leading `.` is in the pattern rather than checked
 * afterwards, so a bare-package specifier never enters the graph at all.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.[^'"]*)\1/g;

/**
 * Order two strings by code point, ascending.
 *
 * Deliberately not `localeCompare`, which is locale-dependent and would let two machines disagree
 * about the order of a reported caller list; and not a bare `.sort()`, which SonarCloud flags as
 * `javascript:S2871`. `svelteComponentFiles.js` and `designSystemPrimitives.js` sort the same way
 * for the same reason.
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
 * Every file beneath `root`, as repository-relative POSIX paths.
 *
 * POSIX-normalised because `readdirSync` yields `ui\theme.js` on a Windows dev machine and
 * `ui/theme.js` on the `ubuntu-latest` runner, while every path in the manifest is written
 * forward-slash. Without this the comparison disagrees with itself across platforms.
 *
 * @param {string} absoluteRoot
 * @param {string} relativeRoot
 * @returns {string[]}
 */
function listFiles(absoluteRoot, relativeRoot) {
  const found = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const childAbsolute = path.join(absoluteRoot, entry.name);
    const childRelative = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(childAbsolute, childRelative));
    else found.push(childRelative);
  }
  return found;
}

/**
 * The specifiers one file imports, resolved to repository-relative POSIX paths.
 *
 * @param {string} repoRoot absolute path to the repository root
 * @param {string} file repository-relative POSIX path of the importing file
 * @returns {string[]} resolved targets, which may name files outside the walked root
 */
function resolvedTargets(repoRoot, file) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !COMMENT_ONLY_LINE.test(line))
    .join('\n');
  const directory = path.posix.dirname(file);
  const targets = [];
  IMPORT_SPECIFIER.lastIndex = 0;
  let match = IMPORT_SPECIFIER.exec(source);
  while (match !== null) {
    targets.push(path.posix.normalize(path.posix.join(directory, match[2])));
    match = IMPORT_SPECIFIER.exec(source);
  }
  return targets;
}

/**
 * Measure the import graph under `sourceRoot` and answer who imports a given file.
 *
 * An importer is any OTHER file under the walked root that imports the target by path, which is the
 * definition `designSystemPrimitives.js` states for the membership bar. A file that imports itself
 * is not its own caller and is excluded; a specifier that resolves outside the walked root — the
 * one live case is `src/main.js` reaching `styles/fabricate.css` — is not a node of this graph and
 * is dropped.
 *
 * @param {string} repoRoot absolute path to the repository root
 * @param {string} [sourceRoot] repository-relative POSIX root to walk
 * @returns {{importersOf: (file: string) => string[], importEdgeCount: number, fileCount: number}}
 */
export function measureImporters(repoRoot, sourceRoot = 'src') {
  const files = listFiles(path.join(repoRoot, sourceRoot), sourceRoot);
  const known = new Set(files);
  const importers = new Map();
  let importEdgeCount = 0;

  const codeFiles = files.filter((candidate) => CODE_FILE_PATTERN.test(candidate));
  for (const file of codeFiles) {
    for (const target of resolvedTargets(repoRoot, file)) {
      if (target === file || !known.has(target)) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
      importEdgeCount += 1;
    }
  }

  return {
    /**
     * The files that import `file`, in code-point order.
     *
     * Returns an EMPTY ARRAY rather than `undefined` for a file nothing imports, and for a file
     * that is not in the tree at all. The two are different facts and a caller that needs to tell
     * them apart must ask the tree; what this must never do is hand back a value whose falsiness
     * reads as "no callers" when the truth is "no such file", which is the shape of the phantom
     * caller this module was written to catch.
     *
     * @param {string} file repository-relative POSIX path
     * @returns {string[]}
     */
    importersOf: (file) => [...(importers.get(file) ?? [])].sort(byCodePoint),

    /**
     * Every resolved import edge in the walked root.
     *
     * Exposed as the non-vacuity signal for consumers: a matcher that has stopped matching reports
     * zero importers for every file, which reads exactly like a clean tree. A guard that asserts
     * this is populated cannot mistake a broken scan for a correct one.
     */
    importEdgeCount,

    /** Files walked, so a consumer can prove the walk reached the tree at all. */
    fileCount: files.length,
  };
}
