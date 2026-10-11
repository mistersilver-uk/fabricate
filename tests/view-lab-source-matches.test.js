/**
 * A case's `sourceMatches` selects it from ANY changed file (issue 2153), while every render-file
 * heuristic — broad signals, surface coverage, the fallback frame — stays render-file-only; and
 * every pattern names a tracked file, alternative by alternative.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FALLBACK_CASE_ID,
  LAB_SURFACE_CASE_IDS,
  VIEW_LAB_CASES,
  hasUiChanges,
  isLabInput,
  isPrimitiveLabPath as labIsPrimitiveLabPath,
  isUiFile,
  mapChangedFilesToCases,
  normalizePath,
  publishableCases,
  rendersCapture,
} from '../scripts/lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map(normalizePath);

const selectedIds = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);

/** The rule restated independently: the publishable cases naming `file`, with their palettes. */
function casesNaming(file) {
  const named = new Set(
    VIEW_LAB_CASES.filter((viewCase) =>
      viewCase.sourceMatches.some((pattern) => pattern.test(file))
    ).map((viewCase) => viewCase.id)
  );
  return publishableCases()
    .filter((viewCase) => named.has(viewCase.id) || named.has(viewCase.baseCaseId))
    .map((viewCase) => viewCase.id);
}

/** A tracked product file that is not a render file: lab inputs live under `tests/` and `scripts/`. */
const isProductNonRenderFile = (file) => !isUiFile(file) && !/^(?:tests|scripts)\//.test(file);

const COMPLICATION_RUNTIME = 'src/systems/complicationRuntime.js';
const OUTCOME_BANDS = 'src/systems/runJournalOutcomeBands.js';
const UNNAMED_ENGINE_FILE = 'src/systems/normalize/craftingCheck.js';

test('a non-render file a case names selects exactly the cases naming it', () => {
  for (const [file, id] of [
    [COMPLICATION_RUNTIME, 'player-crafting-chat-card-gm-complication-fault'],
    ['src/bootstrap/socketRouter.js', 'player-crafting-chat-card-gm-complication-fault'],
    [OUTCOME_BANDS, 'player-salvage-fixed-routed'],
    ['src/systems/knowledgeSnapshot.js', 'manager-knowledge-learned-lost-copy'],
  ]) {
    assert.ok(tracked.includes(file), `${file} is not tracked, so this probe is inert`);
    assert.ok(isProductNonRenderFile(file), `${file} must be a non-render file for this probe`);
    const selected = selectedIds([file]);
    assert.ok(selected.includes(id), `${file} no longer selects "${id}", which names it`);
    assert.deepEqual(selected, casesNaming(file));
  }
});

test('a non-render file no case names selects nothing, not the fallback frame', () => {
  assert.ok(tracked.includes(UNNAMED_ENGINE_FILE));
  assert.deepEqual(
    casesNaming(UNNAMED_ENGINE_FILE),
    [],
    'a case now names this probe; pick another'
  );
  assert.deepEqual(selectedIds([UNNAMED_ENGINE_FILE]), []);
  assert.deepEqual(selectedIds(['lang/en.json']), []);
});

test('no tracked non-render file reaches a broad signal, surface coverage or the fallback', () => {
  // Equality with the restated rule over the whole tree leaves no room for any heuristic.
  const nonRender = tracked.filter(isProductNonRenderFile);
  const named = nonRender.filter((file) => casesNaming(file).length > 0);
  assert.ok(
    named.length >= 20,
    `only ${named.length} non-render files are named; the sweep is thin`
  );

  const divergent = nonRender
    .map((file) => [file, selectedIds([file]), casesNaming(file)])
    .filter(([, selected, expected]) => JSON.stringify(selected) !== JSON.stringify(expected))
    .map(([file, selected]) => `${file} → ${selected.length} case(s)`);
  assert.deepEqual(divergent, [], 'these non-render files select more than the cases naming them');
});

test('a named non-render file is unioned with a render file, leaving its answer intact', () => {
  const unmatchedRender = 'src/ui/svelte/apps/SomeBrandNewRoot.svelte';
  assert.deepEqual(selectedIds([unmatchedRender]), [FALLBACK_CASE_ID]);

  for (const renderFile of [unmatchedRender, 'styles/fabricate.css']) {
    const together = new Set(selectedIds([renderFile, COMPLICATION_RUNTIME]));
    const apart = new Set([...selectedIds([renderFile]), ...selectedIds([COMPLICATION_RUNTIME])]);
    assert.deepEqual(together, apart, `${renderFile} with an engine file is not the union`);
  }
});

test('a named engine file renders its frames while the evidence gate stays unarmed', () => {
  assert.equal(hasUiChanges([COMPLICATION_RUNTIME, OUTCOME_BANDS]), false);
  assert.equal(rendersCapture([COMPLICATION_RUNTIME]), true);
  assert.equal(rendersCapture([String.raw`.\src\systems\complicationRuntime.js`]), true);
  assert.equal(rendersCapture([UNNAMED_ENGINE_FILE, 'lang/en.json']), false);
  assert.equal(rendersCapture(['src/ui/svelte/apps/SomeBrandNewRoot.svelte']), true);

  // A lab input alone selects coverage to verify, not to render; beside a named file it renders.
  const labInput = 'tests/view-lab/world/labActors.js';
  assert.ok(selectedIds([labInput]).length > 0);
  assert.equal(rendersCapture([labInput]), false);
  assert.equal(rendersCapture([labInput, COMPLICATION_RUNTIME]), true);
});

test('the capture workflow selects for every PR and renders on rendersCapture, not the gate', () => {
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pr-screenshots.yml'), 'utf8');
  assert.match(
    workflow,
    /\n\s+const ids = mapChangedFilesToCases\(files, \{ patches \}\)\.map\(\(c\) => c\.id\);\n/
  );
  assert.match(workflow, /process\.stdout\.write\(`\$\{rendersCapture\(files\)\}\\n/);
  assert.doesNotMatch(workflow, /hasUiChanges/, 'the capture must not key rendering on the gate');
});

/**
 * The first unescaped group holding no nested group, with the quantifier after it. A lookaround
 * is never one: its branches are not paths.
 */
const INNERMOST_GROUP = /(?<!\\)\((?:\?:)?(?!\?)((?:[^()\\]|\\.)*)\)([?*+]?)/;

/** Every group-free path through a pattern; an optional group also takes its empty branch. */
function alternativesOf(pattern, source = pattern.source) {
  const group = INNERMOST_GROUP.exec(source);
  if (!group) return source === pattern.source ? [] : [new RegExp(source, pattern.flags)];
  const branches = group[1].split(/(?<!\\)\|/);
  if (group[2] === '?' || group[2] === '*') branches.push('');
  const head = source.slice(0, group.index);
  const tail = source.slice(group.index + group[0].length);
  return branches.flatMap((branch) => alternativesOf(pattern, `${head}${branch}${tail}`));
}

/** One result per distinct pattern source, since cases share most of their patterns. */
function memoizedBySource(compute) {
  const cache = new Map();
  return (pattern) => {
    const key = String(pattern);
    if (!cache.has(key)) cache.set(key, compute(pattern));
    return cache.get(key);
  };
}

/**
 * Deleted files a pattern still names (issue 2381), so the deleting change maps to the frames the
 * file drew. An entry leaves once no expansion strands without it, which the last test enforces.
 */
const RETIRED_FILES = ['src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte'];

/** What one pattern strands: itself when it matches no tracked file, then each stranded path. */
const strandedIn = memoizedBySource((pattern) => [
  ...(tracked.some((file) => pattern.test(file)) ? [] : ['']),
  ...alternativesOf(pattern)
    .filter((regex) => [...tracked, ...RETIRED_FILES].every((file) => !regex.test(file)))
    .map((regex) => ` (expansion ${regex})`),
]);

/** Each pattern, and each path through it, that matches no tracked file. */
function strandedPatterns(cases) {
  return cases.flatMap((viewCase) =>
    viewCase.sourceMatches.flatMap((pattern) =>
      strandedIn(pattern).map((suffix) => `${viewCase.id}: ${pattern}${suffix}`)
    )
  );
}

test('the stranded-pattern guard can fail, on a pattern and on a path a sibling or ? hides', () => {
  const behindSibling =
    /^src\/(?:systems\/(?:complicationRuntime|noSuchModule)|bootstrap\/socketRouter)\.js$/;
  const behindOptional = /^src\/systems\/complicationRuntime(?:NoSuchA|NoSuchB)?\.js$/;
  const optionalInsideSibling =
    /^src\/(?:systems\/complicationRuntime(?:NoSuchC)?|bootstrap\/socketRouter)\.js$/;
  const probe = {
    id: 'probe',
    sourceMatches: [
      /^src\/systems\/noSuchModule\.js$/,
      behindSibling,
      behindOptional,
      optionalInsideSibling,
    ],
  };
  assert.deepEqual(strandedPatterns([probe]), [
    String.raw`probe: /^src\/systems\/noSuchModule\.js$/`,
    String.raw`probe: ${behindSibling} (expansion /^src\/systems\/noSuchModule\.js$/)`,
    String.raw`probe: ${behindOptional} (expansion /^src\/systems\/complicationRuntimeNoSuchA\.js$/)`,
    String.raw`probe: ${behindOptional} (expansion /^src\/systems\/complicationRuntimeNoSuchB\.js$/)`,
    String.raw`probe: ${optionalInsideSibling} (expansion /^src\/systems\/complicationRuntimeNoSuchC\.js$/)`,
  ]);
});

test('every sourceMatches pattern, and each of its alternatives, names a tracked file', () => {
  // A renamed or deleted file strands its pattern silently: now that a pattern selects from any
  // changed file, a stranded one is a frame that stops being captured with nothing to say so.
  assert.ok(tracked.length > 1000, `git ls-files listed only ${tracked.length} files`);
  const distinct = new Map(
    VIEW_LAB_CASES.flatMap(({ sourceMatches }) => sourceMatches).map((p) => [String(p), p])
  );
  const expanded = [...distinct.values()].flatMap((pattern) => alternativesOf(pattern));
  assert.ok(expanded.length > 100, 'the alternation expansion found almost nothing to check');
  assert.ok(expanded.length < 2000, `${expanded.length} expansions: some pattern has blown up`);
  assert.deepEqual(
    strandedPatterns(VIEW_LAB_CASES),
    [],
    'point each at the current path of its file, or remove it'
  );
});

/** The Primitive Lab's page and directory, which `npm run lab:check` verifies (issue 2377). */
const PRIMITIVE_LAB_PAGE = 'tests/view-lab/primitives.html';
const isPrimitiveLabPath = (file) =>
  file === PRIMITIVE_LAB_PAGE || file.startsWith('tests/view-lab/primitives/');

const PAGE_CSS = 'tests/view-lab/primitives/page.css';
const RENDER_FILE = 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte';
const NEAR_MISSES = [
  'tests/view-lab/primitives.css',
  'tests/view-lab/primitivesNobodyMadeYet.css',
  'tests/view-lab/primitives-extra/a.css',
  'tests/view-lab/cascade.css',
];

/** Every way a changed set can reach a frame or the evidence gate, for a set that reaches none. */
const reachedBy = (files) =>
  [
    files.some(isUiFile) && 'isUiFile',
    hasUiChanges(files) && 'hasUiChanges',
    selectedIds(files).length > 0 && `${selectedIds(files).length} case(s)`,
    rendersCapture(files) && 'rendersCapture',
  ].filter(Boolean);

test('the exported Primitive Lab boundary agrees with the restated one', () => {
  const disagreeing = [...tracked, ...NEAR_MISSES].filter(
    (file) => labIsPrimitiveLabPath(file) !== isPrimitiveLabPath(file)
  );
  assert.deepEqual(disagreeing, []);
});

test('a Primitive Lab file selects no app frame and never arms the gate', () => {
  const primitiveLab = tracked.filter(isPrimitiveLabPath);
  assert.ok(
    primitiveLab.length >= 10,
    `only ${primitiveLab.length} Primitive Lab paths are tracked`
  );
  assert.ok(primitiveLab.includes(PRIMITIVE_LAB_PAGE), `${PRIMITIVE_LAB_PAGE} is not tracked`);
  assert.ok(
    primitiveLab.some((file) => /\.(?:svelte|css)$/.test(file)),
    'no Primitive Lab .svelte or .css file is tracked'
  );

  const reaching = primitiveLab
    .map((file) => [file, reachedBy([file])])
    .filter(([, reached]) => reached.length > 0)
    .map(([file, reached]) => `${file} → ${reached.join(', ')}`);
  assert.deepEqual(reaching, []);

  for (const form of [`./${PAGE_CSS}`, String.raw`tests\view-lab\primitives\page.css`]) {
    assert.deepEqual(reachedBy([form]), [], form);
  }
});

test('a deleted Primitive Lab fixture selects nothing from its patch', () => {
  const gone = 'tests/view-lab/primitives/fixtures/RetiredSpecimen.svelte';
  const patches = { [gone]: '@@ -1,2 +0,0 @@\n-<script></script>\n-<div></div>' };
  assert.deepEqual(mapChangedFilesToCases([gone], { patches }), []);
  assert.equal(hasUiChanges([gone]), false);
  assert.equal(rendersCapture([gone]), false);
});

test('a Primitive Lab file beside a real render file leaves the gate armed by that file', () => {
  const fixture = tracked.find((file) => isPrimitiveLabPath(file) && file.endsWith('.svelte'));
  assert.ok(fixture, 'no Primitive Lab .svelte file is tracked');
  assert.ok(tracked.includes(PAGE_CSS) && tracked.includes(RENDER_FILE));

  const mixed = [fixture, PAGE_CSS, RENDER_FILE];
  assert.equal(hasUiChanges(mixed), true);
  assert.equal(rendersCapture(mixed), true);
  assert.deepEqual(selectedIds(mixed), selectedIds([RENDER_FILE]));
});

test('a Primitive Lab file beside only lang/ or a lab input adds nothing', () => {
  assert.deepEqual(reachedBy([PAGE_CSS, 'lang/en.json']), []);
  assert.deepEqual(selectedIds([PAGE_CSS, 'tests/view-lab/world/labContent.js']), [
    ...LAB_SURFACE_CASE_IDS,
  ]);
});

test('a path only near the Primitive Lab still arms the gate', () => {
  for (const file of NEAR_MISSES) {
    assert.equal(isUiFile(file), true, file);
    assert.equal(hasUiChanges([file]), true, file);
  }
});

test('a Primitive Lab file leaves a real lab input its coverage, and a near miss keeps it', () => {
  const catalogue = 'tests/view-lab/primitives/catalogue/controls.json';
  assert.ok(tracked.includes(catalogue), `${catalogue} is not tracked, so this probe is inert`);
  assert.deepEqual(selectedIds([catalogue, 'tests/view-lab/world/labContent.js']), [
    ...LAB_SURFACE_CASE_IDS,
  ]);
  assert.deepEqual(selectedIds(['tests/view-lab/primitivesNobodyMadeYet.js']), [
    ...LAB_SURFACE_CASE_IDS,
  ]);
});

/** The lab server's mount prefixes, as `tests/view-lab/vite.config.js` serves them. */
const LAB_MOUNTS = [
  ['/@view-lab/', 'tests/view-lab/'],
  ['/@fabricate-styles/', 'styles/'],
  ['/@design-library/', 'openspec/specs/design-system/'],
];

/** An import, dynamic import, re-export, `src=` or `href=` specifier, quoted. */
const SPECIFIER =
  /\b(?<keyword>from|import|src|href)\s*(?:=|\()?\s*(["'`])(?<specifier>[^"'`]+)\2/g;

/**
 * The repository paths one specifier in `file` can name. A bare attribute value is relative to
 * the page or, under a `<base href="/">`, to the root, so it is resolved both ways.
 */
function specifierTargets(file, keyword, specifier) {
  const bare = specifier.split(/[?#]/, 1)[0];
  const mount = LAB_MOUNTS.find(([prefix]) => bare.startsWith(prefix));
  if (mount) return [posix.join(mount[1], bare.slice(mount[0].length))];
  if (bare.startsWith('/')) return [posix.normalize(bare.slice(1))];
  if (bare.startsWith('.')) return [posix.join(posix.dirname(file), bare)];
  const isAttribute = keyword === 'src' || keyword === 'href';
  return isAttribute && !/^[a-z][\w+.-]*:/i.test(bare)
    ? [posix.join(posix.dirname(file), bare), posix.normalize(bare)]
    : [];
}

/** The specifiers in one file's text that reach the Primitive Lab. */
const primitiveLabSpecifiers = (file, text) =>
  [...text.matchAll(SPECIFIER)]
    .map((match) => match.groups)
    .filter(({ keyword, specifier }) =>
      specifierTargets(file, keyword, specifier).some(isPrimitiveLabPath)
    )
    .map(({ specifier }) => specifier);

test('the Primitive Lab specifier scan sees every form, and not a bare path string', () => {
  const probe = [
    "import { readLibrary } from './primitives/library.js';",
    "await import('/@view-lab/primitives/mount.js');",
    '<script type="module" src="/tests/view-lab/primitives/mount.js"></script>',
    '<link rel="stylesheet" href="primitives/page.css" />',
    "<a href='./primitives.html'>lab</a>",
    "export { CATALOGUE } from '../view-lab/primitives/catalogue.js';",
  ].join('\n');
  assert.equal(primitiveLabSpecifiers('tests/view-lab/probe.js', probe).length, 6);
  const entries = "optimizeDeps: { entries: ['tests/view-lab/primitives/mount.js'] },";
  assert.deepEqual(primitiveLabSpecifiers('tests/view-lab/vite.config.js', entries), []);
});

test('no file the app View Lab is built from loads anything of the Primitive Lab', () => {
  // The premise that lets a Primitive Lab file select no app frame: no app frame can render it.
  const appLabInputs = tracked.filter((file) => isLabInput(file) && !isPrimitiveLabPath(file));
  assert.ok(appLabInputs.length >= 50, `only ${appLabInputs.length} app lab inputs are tracked`);
  const reaching = appLabInputs.flatMap((file) =>
    primitiveLabSpecifiers(file, readFileSync(resolve(ROOT, file), 'utf8')).map(
      (specifier) => `${file} → ${specifier}`
    )
  );
  assert.deepEqual(reaching, [], 'these app lab inputs load the Primitive Lab');
});

test('a retired file stays untracked and leaves the allowance once no expansion needs it', () => {
  // Otherwise a stale entry would excuse a later pattern that strands on the same path.
  const expansions = VIEW_LAB_CASES.flatMap(({ sourceMatches }) => sourceMatches).flatMap(
    (pattern) => alternativesOf(pattern)
  );
  const needed = (file) =>
    expansions.some((regex) => regex.test(file) && tracked.every((t) => !regex.test(t)));
  assert.deepEqual(
    RETIRED_FILES.filter((file) => tracked.includes(file) || !needed(file)),
    [],
    'delete these from RETIRED_FILES: each is tracked again or no expansion strands without it'
  );
});
