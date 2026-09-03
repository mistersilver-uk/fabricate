/**
 * Source contract: the manager's on/off switch is written in ONE place (issue 1040).
 *
 * `class="manager-status-toggle"` was a CSS convention, and — unlike the `manager-button` one
 * `manager-button-source-contract.test.js` closes — it was a convention over an element TREE
 * rather than over a class string. A site had to remember the host, `aria-pressed`, a
 * `manager-status-toggle-track` span, a `manager-status-toggle-knob` span nested inside it, and
 * optionally a `manager-status-toggle-label` span beside it. 37 sites in 26 components wrote
 * that out by hand, and two of them — `scoped/InheritRow.svelte` and
 * `scoped/MembershipActions.svelte` — carried a paragraph in their own docblocks saying they had
 * to, because no primitive existed to call.
 *
 * A forgotten modifier class renders the wrong colour. A forgotten `-knob` span renders a track
 * with NO KNOB: a switch that cannot show its own state, invisible to `lint`, to `format:check`
 * and to every mounted assertion that resolves the switch by its host class. Only a rendered
 * frame says so. `StatusToggle.svelte` makes the tree the primitive's business, and this file is
 * the END-STATE gate for that: it asserts the three sub-element classes have left `src/`
 * entirely, except where an exemption is recorded AND still earned.
 *
 * ── THE EXEMPTIONS, AND WHY EACH IS ONE ─────────────────────────────────────────────────
 * `StatusToggle.svelte` is the primitive; it writes the tree because writing the tree is what it
 * is for. `CraftingSystemManagerRoot.svelte` is DEFERRED, not exempt: its two character-modifier
 * override switches are the last hand-rolled pair in the tree, held back because that file is
 * mid-convergence and a 12,000-line root is the wrong place to land the tail of a 37-site sweep.
 * Its entry is pinned by COUNT for exactly that reason — a later root pass that removes one of
 * the two reds this gate rather than silently halving a deferral nobody is tracking any more.
 *
 * ── WHY IT READS THE FILES ITSELF ───────────────────────────────────────────────────────
 * Never by shelling to `grep`, for the reason `manager-button-source-contract.test.js` records:
 * GNU grep classifies a file holding a raw NUL byte as BINARY and omits it from a recursive
 * search with no `-a`, silently. `checks/ChecksView.svelte` was one such file and was absent
 * from three rounds of census. `collectSources` reads the working tree directly.
 *
 * Comments are stripped before matching. This repository's guards quote the very markup they
 * police — `StatusToggle.svelte`'s own docblock names all three classes while explaining them —
 * so a gate that counted its own documentation would be answered with a file-level allowlist
 * exempting exactly the file it exists to describe.
 *
 * ── THE FIXTURE HALF ────────────────────────────────────────────────────────────────────
 * A suite that hand-writes the switch and measures it in a browser keeps passing after the
 * component stops emitting that markup. The class strings the primitive emits are byte-identical
 * to the ones the hand-rolled sites emitted, so — unlike the button's `fab-manager-button` — there
 * is no converted/unconverted token to tell a stale fixture from a faithful one. What IS
 * checkable, and is the failure that actually matters here, is a fixture drawing a TRUNCATED
 * switch: a track with no knob measures a control the product has never rendered, and every
 * geometry assertion over it passes.
 */
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
 *
 * Counted rather than merely listed, and keyed on the class rather than on a line number, which
 * rots on the first edit above it. A count is what makes the deferral below self-closing: remove
 * one of the root's two switches and this reds, so the remaining one cannot quietly become
 * permanent debt with a stale note beside it.
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
  // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check over
  // an empty corpus passes forever and reports itself satisfied. A wrong root, a bad extension
  // filter or a walk that stopped recursing all read as zero here.
  //
  // The floor is stated over `<StatusToggle` CALL SITES rather than over the literal this test
  // asserts the absence of, because a floor over that string would be self-contradictory. 25
  // components render the primitive as this lands; 20 is a real floor with headroom, deliberately
  // below the measured number so that deleting a screen does not red this.
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
  // The house pattern is `aria-pressed` on a plain control. `ToggleCard.svelte` has stated that
  // rule since issue 651 and `StatusToggle.svelte` inherits it, and until this clause existed
  // nothing checked it — the claim "the repo uses no `role=\"switch\"` anywhere" was true and
  // unenforced, which is the state every convention in this file's history was in before it
  // drifted.
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
      'repository expects:\n  ' +
      offenders.join('\n  ')
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
