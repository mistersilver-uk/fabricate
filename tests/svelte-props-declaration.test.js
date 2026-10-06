/**
 * The regression proof for `tests/helpers/sveltePropsDeclaration.js` (issue 1487), owned by no
 * consumer. The fixture carries each hazard that broke the old two-pass reader: a JSDoc block
 * glued to the next prop, a template-literal default whose backtick opened a depth nothing closed,
 * a comma inside a string, and `//` inside a string.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { declaredPropNames, PROP_NAME } from './helpers/sveltePropsDeclaration.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PARSER_FIXTURE = [
  '<script>',
  '  let {',
  '    binding = "relative",',
  '    /** The previewed record. Only `relative` reads it, to convert absolute, offset. */',
  '    documented = 0,',
  '    label = (a, b) => `${a?.name || ""} / ${b?.name || ""}`,',
  '    separated = "one, two, three",',
  '    slashes = "https://example.test/a",',
  '    // a line comment naming scope, actions and systemId',
  '    onChange = () => {},',
  '    ...rest',
  '  } = $props();',
  '</script>',
].join('\n');

test('the $props() reader survives comments, template literals and commas in strings', () => {
  // Sorted by `localeCompare`, which puts `...rest` first.
  assert.deepEqual(declaredPropNames(PARSER_FIXTURE), [
    '...rest',
    'binding',
    'documented',
    'label',
    'onChange',
    'separated',
    'slashes',
  ]);
});

/** Wrap destructure lines in a component's `<script>`. */
function destructure(...lines) {
  return [
    '<script>',
    '  let {',
    ...lines.map((line) => `    ${line}`),
    '  } = $props();',
    '</script>',
  ].join('\n');
}

test('the $props() reader keeps every scanner hazard inside its own prop', () => {
  const cases = [
    [
      'a template literal nested in a hole',
      ['label = `${`${x}, y`}`,', 'after = 1'],
      ['after', 'label'],
    ],
    ['a quoted brace inside a hole', ['brace = `${"{"}`,', 'after = 1'], ['after', 'brace']],
    ['an escaped quote', [String.raw`quoted = "a\", b",`, 'after = 1'], ['after', 'quoted']],
    ['an unterminated block comment', ['alpha = 1, /* never closed'], ['alpha']],
    ['a trailing comma', ['alpha = 1,', 'beta = 2,'], ['alpha', 'beta']],
  ];
  for (const [hazard, lines, expected] of cases) {
    assert.deepEqual(declaredPropNames(destructure(...lines)), expected, hazard);
  }
});

test('the $props() reader never lets a stray closer swallow the commas after it', () => {
  assert.ok(declaredPropNames(destructure(') first = 1,', 'second = 2')).includes('second'));
});

test('the $props() reader throws on a source with no `let { … } = $props()` destructure', () => {
  assert.throws(
    () => declaredPropNames('<script>let x = 1;</script>'),
    /no `let \{ … \} = \$props\(\)`/
  );
  assert.throws(() => declaredPropNames('<script>x } = $props();</script>'), /no `let/);
});

test('the $props() reader reports a name for every prop of the components that broke it', () => {
  // The components the old reader mis-parsed that still ship, with the count each one declares.
  const measured = [
    ['src/ui/svelte/components/ThresholdBandStrip.svelte', 17],
    ['src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte', 1],
    ['src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte', 2],
    ['src/ui/svelte/apps/manager/environment/GatheringRuleLimitStepper.svelte', 3],
  ];
  for (const [componentPath, count] of measured) {
    const declared = declaredPropNames(readFileSync(path.join(REPO_ROOT, componentPath), 'utf8'));
    assert.equal(declared.length, count, `${componentPath} prop count`);
    for (const name of declared) assert.ok(PROP_NAME.test(name), `${componentPath}: ${name}`);
  }
});
