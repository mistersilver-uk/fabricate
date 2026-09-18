/** Source contract: the manager's on/off switch is written in ONE place (issue 1040). */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { withoutComments } from './helpers/stepperSourceContract.js';

/** The three sub-element classes only the primitive may write. */
const TREE_CLASSES = Object.freeze([
  'manager-status-toggle-track',
  'manager-status-toggle-knob',
  'manager-status-toggle-label',
]);

const PRIMITIVE = 'src/ui/svelte/components/StatusToggle.svelte';

/**
 * The `.svelte` files under `src/` that may still write the tree, each with its reason and the
 * exact number of times it writes each class.
 */
const TREE_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    counts: Object.freeze({
      'manager-status-toggle-track': 1,
      'manager-status-toggle-knob': 1,
      'manager-status-toggle-label': 1,
    }),
    why:
      'the primitive itself, which writes the tree once so that no call site has to remember ' +
      'it; its docblock names all three classes in prose, which the comment stripping removes',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    counts: Object.freeze({
      'manager-status-toggle-track': 2,
      'manager-status-toggle-knob': 2,
      'manager-status-toggle-label': 2,
    }),
    why:
      'deferred: root convergence pending. The drop-scope and event-scope character-modifier ' +
      'override switches are the last hand-rolled pair, held out of the sweep because the ' +
      'converging 12k-line root is the wrong place to land its tail. Pinned by count so a ' +
      'later root pass that removes one of the two fails here instead of leaving half a ' +
      'deferral nobody is tracking.',
  }),
]);

/** `{ path: text }` for every `.svelte` under `src/`, comments blanked. */
const COMPONENTS = Object.fromEntries(
  Object.entries(collectSources(path.join(repoRoot, 'src'), { extensions: ['.svelte'] })).map(
    ([file, source]) => [file, withoutComments(source)]
  )
);

/** Every component that renders the primitive. The floor below is stated over these. */
const CALL_SITE_FILES = Object.keys(COMPONENTS).filter((file) =>
  COMPONENTS[file].includes('<StatusToggle')
);

test('the switch element tree is written only by the primitive', () => {
  // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check over an
  // empty corpus passes forever and reports itself satisfied.
  assert.ok(
    CALL_SITE_FILES.length >= 20,
    `expected the manager's switch call sites to be here, found ${CALL_SITE_FILES.length} ` +
      `files rendering <StatusToggle across ${Object.keys(COMPONENTS).length} components`
  );

  const exempt = new Set(TREE_EXCEPTIONS.map((entry) => entry.file));
  const offenders = Object.keys(COMPONENTS)
    .filter((file) => !exempt.has(file))
    .filter((file) => TREE_CLASSES.some((token) => COMPONENTS[file].includes(token)));

  assert.deepEqual(
    offenders,
    [],
    'a manager switch is a `<StatusToggle>`, never a hand-written track/knob/label tree. The ' +
      'host set is closed (`as="button" | "indicator" | "checkbox"`), a per-site visual tweak ' +
      'travels as a pass-through on the `class` prop, and a per-site `data-*` hook and ' +
      '`aria-label` ride the rest spread — see `StatusToggle.svelte`:\n  ' +
      offenders.join('\n  ')
  );
});

test('every recorded exemption is still earned, at the count it was recorded with', () => {
  // An exemption for a file that no longer writes the tree is a permission nobody is using, and
  // the next file added to this list gets to lean on the precedent of an unchecked one.
  for (const entry of TREE_EXCEPTIONS) {
    const source = COMPONENTS[entry.file];
    assert.ok(source, `${entry.file} is exempted (${entry.why}) but is not in the corpus`);
    assert.ok(entry.why.length > 40, `${entry.file} is exempted with no stated reason`);
    for (const [token, expected] of Object.entries(entry.counts)) {
      const found = source.split(token).length - 1;
      assert.equal(
        found,
        expected,
        `${entry.file} is exempted for ${expected}x \`${token}\` and writes it ${found}x. ` +
          `Reason on record: ${entry.why}`
      );
    }
  }
});

test('no component announces a switch as role="switch"', () => {
  // The house pattern is `aria-pressed` on a plain control (issue 651).
  const positiveControl = COMPONENTS[PRIMITIVE] ?? '';
  assert.ok(
    positiveControl.includes('aria-pressed'),
    'the primitive no longer emits `aria-pressed`, so this clause is measuring the wrong thing'
  );

  const offenders = Object.keys(COMPONENTS).filter((file) =>
    /role="switch"/.test(COMPONENTS[file])
  );
  assert.deepEqual(
    offenders,
    [],
    '`aria-pressed` on a plain control is the house switch pattern; `role="switch"` is a second ' +
      'announcement of the same state that no assistive-technology assertion in this ' +
      'repository expects:\n  ' + offenders.join('\n  ')
  );
});

test('no test fixture draws a switch track without its knob', () => {
  const suites = collectSources(path.join(repoRoot, 'tests'), { extensions: ['.js'] });
  const attributeMatcher = (token) => new RegExp(String.raw`class="[^"]*\b${token}\b[^"]*"`, 'g');

  let tracksScanned = 0;
  const offenders = [];
  for (const [file, source] of Object.entries(suites)) {
    const code = withoutComments(source);
    const tracks = code.match(attributeMatcher('manager-status-toggle-track')) ?? [];
    const knobs = code.match(attributeMatcher('manager-status-toggle-knob')) ?? [];
    tracksScanned += tracks.length;
    if (tracks.length !== knobs.length) {
      offenders.push(`${file}: ${tracks.length} track(s), ${knobs.length} knob(s)`);
    }
  }

  // Non-vacuity: the scan has to be reaching real fixture markup. Four suites hand-write the
  // switch today, and a matcher, a walk or an extension filter that stopped working reads zero.
  assert.ok(
    tracksScanned >= 4,
    `only ${tracksScanned} switch-track fixture elements found under tests/, so this clause is ` +
      'no longer measuring the fixtures it was written for'
  );

  assert.deepEqual(
    offenders,
    [],
    'a fixture draws a switch track with no knob inside it, which is a control the product has ' +
      'never rendered — the primitive always emits both. Every geometry and contrast assertion ' +
      'over such a fixture passes while measuring markup that does not exist:\n  ' +
      offenders.join('\n  ')
  );
});
