/**
 * A case's `sourceMatches` selects it from ANY changed file (issue 2153), while every render-file
 * heuristic — broad signals, surface coverage, the fallback frame — stays render-file-only; and
 * every pattern names a tracked file, alternative by alternative.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FALLBACK_CASE_ID,
  VIEW_LAB_CASES,
  hasLabInputChanges,
  hasUiChanges,
  isUiFile,
  mapChangedFilesToCases,
  normalizePath,
  publishableCases,
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

/** A tracked file that is neither a render file nor a lab input. */
const isProductNonRenderFile = (file) => !isUiFile(file) && !hasLabInputChanges([file]);

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

test('the evidence gate still arms on render files alone', () => {
  assert.equal(hasUiChanges([COMPLICATION_RUNTIME, OUTCOME_BANDS]), false);
  assert.equal(hasLabInputChanges([COMPLICATION_RUNTIME]), false);
  assert.equal(hasLabInputChanges(['tests/view-lab/world/labActors.js']), true);
  assert.equal(
    hasLabInputChanges([String.raw`.\scripts\lib\view-lab-cases\playerInventory.js`]),
    true
  );
});

test('the capture workflow renders a named non-render file only beside a render file or lab input', () => {
  // Unarmed and with no lab input there is nothing to render and no harvest to verify.
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pr-screenshots.yml'), 'utf8');
  assert.match(
    workflow,
    /const ids = hasUi \|\| hasLabInputChanges\(files\)\s*\?\s*mapChangedFilesToCases\(files, \{ patches \}\)/
  );
  assert.match(workflow, /process\.stdout\.write\(`\$\{hasUi\}\\n/);
});

/** Unescaped `(…|…)` groups holding no nested group. */
const ALTERNATION_GROUP = /(?<!\\)\((?:\?:)?((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*)\)/g;

/** One regex per alternative of each innermost alternation group, the rest of the pattern kept. */
function alternativesOf(pattern) {
  const { source, flags } = pattern;
  return [...source.matchAll(ALTERNATION_GROUP)].flatMap((group) =>
    group[1].split(/(?<!\\)\|/).map((alternative) => ({
      alternative,
      regex: new RegExp(
        `${source.slice(0, group.index)}(?:${alternative})${source.slice(group.index + group[0].length)}`,
        flags
      ),
    }))
  );
}

/** Each pattern, and each of its alternatives, that matches no tracked file. */
function strandedPatterns(cases) {
  const stranded = new Set();
  for (const viewCase of cases) {
    for (const pattern of viewCase.sourceMatches) {
      if (tracked.every((file) => !pattern.test(file))) stranded.add(`${viewCase.id}: ${pattern}`);
      for (const { alternative, regex } of alternativesOf(pattern)) {
        if (tracked.every((file) => !regex.test(file))) {
          stranded.add(`${viewCase.id}: ${pattern} (alternative "${alternative}")`);
        }
      }
    }
  }
  return [...stranded];
}

test('the stranded-pattern guard can fail, on a whole pattern and on one alternative', () => {
  const probe = {
    id: 'probe',
    sourceMatches: [
      /^src\/systems\/noSuchModule\.js$/,
      /^src\/systems\/(?:complicationRuntime|noSuchModule)\.js$/,
    ],
  };
  assert.deepEqual(strandedPatterns([probe]), [
    String.raw`probe: /^src\/systems\/noSuchModule\.js$/`,
    String.raw`probe: /^src\/systems\/(?:complicationRuntime|noSuchModule)\.js$/ (alternative "noSuchModule")`,
  ]);
});

test('every sourceMatches pattern, and each of its alternatives, names a tracked file', () => {
  // A renamed or deleted file strands its pattern silently: now that a pattern selects from any
  // changed file, a stranded one is a frame that stops being captured with nothing to say so.
  assert.ok(tracked.length > 1000, `git ls-files listed only ${tracked.length} files`);
  const expanded = VIEW_LAB_CASES.flatMap((viewCase) =>
    viewCase.sourceMatches.flatMap(alternativesOf)
  );
  assert.ok(expanded.length > 100, 'the alternation expansion found almost nothing to check');
  assert.deepEqual(
    strandedPatterns(VIEW_LAB_CASES),
    [],
    'point each at the current path of its file, or remove it'
  );
});
