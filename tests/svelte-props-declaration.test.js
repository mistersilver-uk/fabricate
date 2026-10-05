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
