/**
 * Direct proof for the template scanner in `tests/helpers/svelteTemplateScan.js` (issue 1497).
 *
 * Its three consumers — the native-`<select>` ratchet, the required-names gate and the
 * keyboard-focus gate — can each assert only a TOTAL over the real corpus, and a total cannot
 * tell a subtly blind walk from a correct one on the days the two happen to agree. Worse, every
 * one of those gates fails in the SAFE-LOOKING direction when the walk goes blind: fewer
 * `<select>` elements, fewer unnamed controls, fewer undeclared focus targets. A walk that stops
 * descending into `{#each}` reports a tidier product.
 *
 * So the properties live here, and each one is a defect this repository has actually shipped or
 * come within one edit of shipping:
 *
 *   - an element-only walk lost three focus targets in ONE change, when three manager landmarks
 *     became component tags carrying a rest spread (issue 1039).
 *   - a regex walk ended the tag at the first `>` in the source, which inside
 *     `use:portal={() => host()}` is the arrow's, and could not see `ThresholdBandStrip`.
 *   - a hand-listed child walk skips whichever AST branch it forgot, and `{#if}`, `{#each}`,
 *     `{#snippet}` and a component's default slot are four differently-named branches.
 *   - `parse` without `modern: true` returns a legacy AST with no `RegularElement` in it, so a
 *     caller that forgot the flag walks a real tree and reports nothing, without erroring.
 *
 * ── WHY THE FIXTURES ARE STRINGS, AND WHY ONE OF THEM IS A REAL FILE ────────────────────
 * `UI_PATH_PATTERN` in `scripts/lib/viewLabCases.js` is `/^(src\/ui\/|styles\/)|\.(svelte|css)$/`,
 * and its second alternation is NOT anchored to a directory — so `isUiFile` returns true for
 * `tests/fixtures/anything.svelte`. A COMMITTED `.svelte` fixture would arm the screenshot-
 * evidence gate on every change that touches it while rendering nothing at all. Templates are
 * therefore parsed from strings.
 *
 * `svelteFiles` cannot be: it is a filesystem walk, and proving it against strings would prove
 * nothing about recursion, extension filtering or ordering. It is exercised over REAL FILES in a
 * tmpdir, which `isUiFile` never reaches and which is never committed — the arrangement
 * `style-block-scan.test.js` arrived at for the same conflict.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parse } from 'svelte/compiler';

import {
  UI_TEMPLATE_ROOT,
  attributeNamed,
  attributeText,
  lineOf,
  parsedTemplates,
  svelteFiles,
  walkElements,
} from './helpers/svelteTemplateScan.js';

/** Parse one template string and collect what `walkElements` visits, in visit order. */
function visited(source) {
  const seen = [];
  walkElements(parse(source, { modern: true }).fragment, (element, inForm) => {
    seen.push({ type: element.type, name: element.name, inForm });
  });
  return seen;
}

/** Every visited node of one template string, so a test can assert on the element itself. */
function elementsOf(source) {
  const found = [];
  walkElements(parse(source, { modern: true }).fragment, (element) => found.push(element));
  return found;
}

/** Run `body` against a throwaway directory tree, and remove it afterwards whatever happens. */
function withTempTree(body) {
  const root = mkdtempSync(join(tmpdir(), 'fabricate-template-scan-'));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the walk descends into every block form, not a hand-listed set of child keys', () => {
  // FOUR DIFFERENTLY-NAMED BRANCHES, one per block form, plus a component's default slot. A walk
  // written against `node.children` sees the first and misses the rest, and misses them SILENTLY:
  // the assertion it feeds reports a tidier tree.
  const seen = visited(
    [
      '{#if open}<span id="in-if"></span>{/if}',
      '{#each rows as row}<em id="in-each"></em>{/each}',
      '{#snippet body()}<i id="in-snippet"></i>{/snippet}',
      '{#await promise then value}<b id="in-await"></b>{/await}',
      '{#key id}<u id="in-key"></u>{/key}',
      '<Panel><strong id="in-slot"></strong></Panel>',
    ].join('\n')
  );

  assert.deepEqual(
    seen.map((element) => element.name).sort(),
    ['Panel', 'b', 'em', 'i', 'span', 'strong', 'u'],
    'an element inside a block form was not visited. Each block hangs off its own AST branch, so ' +
      'a walk over a hand-listed set of child keys skips whichever one it forgot — and reports ' +
      'fewer findings, which every consuming gate reads as a cleaner tree.'
  );
});

test('a Component tag is visited, because a rest spread makes it the rendered element', () => {
  // The issue 1039 defect, as a property. `<ManagerToolbar tabindex="-1">` forwards the attribute
  // onto whatever element the primitive writes, so the RENDERED node is a focus target while the
  // AST node is a `Component`. Three landmarks converted in one change; an element-only walk
  // would have dropped all three and taken the gate's non-vacuity floor down with them.
  const seen = visited('<ManagerToolbar tabindex="-1" data-keyboard-focus="true" />');

  assert.deepEqual(
    seen.map((element) => `${element.type} ${element.name}`),
    ['Component ManagerToolbar'],
    'a component tag was not visited, so any attribute it forwards through a rest spread is ' +
      'invisible to every gate built on this walk'
  );
});

test('`inForm` is true only under a real <form> element, and a component is not one', () => {
  // Foundry's `hasFocus` returns `!!focused.form` for a BUTTON, so this flag is the difference
  // between a recognised control and a bare div. A component NAMED `Form` is not a `<form>`: it
  // renders whatever it renders, and treating it as one would exempt every button inside it.
  const seen = visited(
    [
      '<button id="outside"></button>',
      '<form><button id="inside"></button></form>',
      '<Form><button id="under-component"></button></Form>',
    ].join('\n')
  );
  const buttons = seen.filter((element) => element.name === 'button');

  assert.deepEqual(
    buttons.map((element) => element.inForm),
    [false, true, false],
    'the inForm flag does not follow real <form> ancestry. Threading it wrong in EITHER ' +
      'direction is a silent widening: true everywhere exempts every button in the corpus, and ' +
      'false everywhere reports every form control as debt.'
  );
});

test('the flag is scoped to the subtree, so a sibling after a form is outside it', () => {
  // The mutable-accumulator mistake: thread `inForm` as a shared variable rather than a
  // parameter, and every element AFTER the first `<form>` in the file inherits it. That exempts
  // the whole rest of the template and there is no assertion over element identity that notices.
  const seen = visited('<form><button id="a"></button></form>\n<button id="b"></button>');

  assert.deepEqual(
    seen.filter((element) => element.name === 'button').map((element) => element.inForm),
    [true, false],
    'a button following a closed <form> is being reported as inside it, so the flag is leaking ' +
      'across siblings rather than descending a subtree'
  );
});

test('an attribute written after a directive holding `>` is still found', () => {
  // THE REGEX DEFECT, PINNED. `/<(\w+)\b([^>]*?)>/` ends the tag at the `>` inside the arrow
  // function, so `tabindex` — written after it — does not exist as far as that matcher is
  // concerned. Two files were corrupted by a patch built on it before anyone noticed the walk was
  // also under-reporting.
  const source = '<div use:portal={() => getPopoverHost()} tabindex="-1" role="button"></div>';
  const [element] = elementsOf(source);

  assert.equal(attributeText(source, element, 'tabindex'), 'tabindex="-1"');
  assert.equal(attributeText(source, element, 'role'), 'role="button"');
  assert.equal(
    attributeText(source, element, 'data-keyboard-focus'),
    null,
    'an absent attribute must read as null rather than as the empty string, which a caller ' +
      'testing truthiness would treat as "declared"'
  );
});

test('a spread and a directive are not attributes, however they are spelled', () => {
  // `attributeNamed` filters on `type === 'Attribute'`, and both halves of that matter. A
  // `SpreadAttribute` may well carry the key at runtime, and no template scanner can decide that
  // — reporting it as declared would be a permission granted by a guess.
  const source = '<div {...rest} bind:this={node} onclick={run} tabindex="-1"></div>';
  const [element] = elementsOf(source);

  assert.ok(attributeNamed(element, 'tabindex'), 'the written attribute is found');
  assert.equal(
    attributeNamed(element, 'rest'),
    undefined,
    'a rest spread must not be reported as an attribute named after the variable it spreads'
  );
  assert.equal(
    attributeNamed(element, 'this'),
    undefined,
    'a `bind:` directive must not be reported as an attribute'
  );
});

test('lineOf counts the lines before an index, so a finding cites where it is', () => {
  const source = ['<div>', '  <span></span>', '</div>'].join('\n');
  const spans = [];
  walkElements(parse(source, { modern: true }).fragment, (element) => {
    if (element.name === 'span') spans.push(lineOf(source, element.start));
  });

  assert.deepEqual(spans, [2], 'a gate that cannot cite a line sends its reader to search by hand');
});

test('svelteFiles recurses, filters by extension, and returns a stable order', () => {
  withTempTree((root) => {
    mkdirSync(join(root, 'nested', 'deeper'), { recursive: true });
    // Written out of order on purpose: `readdirSync` is not required to sort, and two of these
    // gates pin per-file counts. An order that differed between a dev machine and the runner
    // would produce a diff nobody authored.
    writeFileSync(join(root, 'nested', 'deeper', 'Zulu.svelte'), '<i></i>\n');
    writeFileSync(join(root, 'nested', 'deeper', 'Alpha.svelte'), '<i></i>\n');
    writeFileSync(join(root, 'nested', 'Mike.svelte'), '<i></i>\n');
    writeFileSync(join(root, 'Bravo.svelte'), '<i></i>\n');
    writeFileSync(join(root, 'notes.md'), 'a `.svelte` named in prose is not a template\n');
    writeFileSync(join(root, 'helper.js'), 'export const x = 1;\n');

    const found = svelteFiles(root).map((full) =>
      full.slice(root.length + 1).replaceAll('\\', '/')
    );

    assert.deepEqual(found, [
      'Bravo.svelte',
      'nested/Mike.svelte',
      'nested/deeper/Alpha.svelte',
      'nested/deeper/Zulu.svelte',
    ]);
  });
});

test('parsedTemplates reaches the real corpus and reports POSIX-separated paths', () => {
  // The non-vacuity control for the helper itself, over the tree its consumers scan. A walk that
  // returned nothing would leave all three gates green with empty findings, which is the exact
  // failure this file exists to make audible.
  const templates = parsedTemplates();

  assert.ok(
    templates.length > 250,
    `the walk reached ${templates.length} templates under ${UI_TEMPLATE_ROOT}. Every gate built ` +
      'on it is then green over an empty corpus.'
  );

  const windowsSeparated = templates.filter((template) => template.file.includes('\\'));
  assert.deepEqual(
    windowsSeparated.map((template) => template.file),
    [],
    'a path came back with a Windows separator. Every baseline row citing a file is written ' +
      'forward-slash, so this would make the pins disagree with themselves across platforms.'
  );
  assert.ok(
    templates.every((template) => template.file.startsWith(`${UI_TEMPLATE_ROOT}/`)),
    'a template outside the UI root reached the walk'
  );

  // `modern: true` is proved by the tree rather than by reading the call: a legacy AST carries no
  // `RegularElement` at all, so this count would be zero while every consuming gate reported a
  // clean corpus.
  let elements = 0;
  for (const template of templates) walkElements(template.ast.fragment, () => (elements += 1));
  assert.ok(
    elements > 1000,
    `the walk visited ${elements} elements across the whole corpus, which is far too few to be ` +
      'this repository. The likeliest cause is a parse that is no longer `modern: true`, which ' +
      'returns a legacy AST holding no `RegularElement` node and errors on nothing.'
  );
});
