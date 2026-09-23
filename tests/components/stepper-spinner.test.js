/** Numeric steppers show no native spinner arrows (maintainer round, issue 1036). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BARE_NUMBER_FIELD_REGISTER,
  BARE_NUMBER_INPUT,
  MINIMUM_SCANNED_SVELTE_FILES,
  STEPPER_PATH,
  collectSvelteSources,
  withoutComments,
} from '../helpers/stepperSourceContract.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(repoRoot, relative), 'utf8');

const stepperSource = read(STEPPER_PATH);
const globalCss = read('styles/fabricate.css');

/** The `{ … }` body of the first RULE whose selector list matches `selectorPattern`. */
function ruleBody(source, selectorPattern) {
  const match = new RegExp(`^\\s*${selectorPattern}[^{]*\\{([^}]*)\\}`, 'ms').exec(source);
  return match ? match[1] : '';
}

/** The class tokens of every selector in the global sheet that suppresses a native spinner. */
function spinnerSuppressionSelectors(css) {
  return [...withoutComments(css).matchAll(/([^{},]*)::-webkit-(?:inner|outer)-spin-button/g)].map(
    ([, selector]) => selector.trim()
  );
}

/** The area roots. A selector whose only classes are these names NO specific control. */
const AREA_ROOTS = new Set([
  'fabricate-manager',
  'fabricate-app',
  'fabricate-interactable-config',
  'fabricate-component-editor',
]);

/** Whether a suppression selector names a specific control rather than a whole area. */
function namesASpecificControl(selector) {
  return (selector.match(/\.[A-Za-z][\w-]*/g) ?? []).some(
    (token) => !AREA_ROOTS.has(token.slice(1))
  );
}

describe('numeric steppers suppress the native spinner (issue 1036)', () => {
  it('suppresses the spinner on the shared Stepper primitive', () => {
    const spinner = ruleBody(
      stepperSource,
      String.raw`\.fab-stepper-input::-webkit-inner-spin-button`
    );
    assert.match(spinner, /appearance: none;/, 'the drawn spinner buttons are removed');
    assert.match(
      spinner,
      /-webkit-appearance: none;/,
      'including the prefixed property, which is the one Chromium actually honours here'
    );
    // `margin: 0` alone is the half-fix that shipped elsewhere in this repo.
    assert.ok(
      !/^\s*margin:\s*0;\s*$/.test(spinner),
      'and not merely zeroed margins, which leaves the buttons drawn'
    );
    assert.match(
      ruleBody(stepperSource, String.raw`\.fab-stepper-input`),
      /appearance: textfield;/,
      'Firefox and the standard property take the textfield rendering'
    );
  });

  it('keeps the Stepper input a real number input so Up/Down still step it', () => {
    // Comments stripped: this file's own prose explains why the type matters.
    const markup = withoutComments(stepperSource);
    // ONE field, declared as a `{#snippet}` and rendered into both orientation branches. The
    // count is still EXACT and still the drift guard it was when each branch wrote its own
    // `<input>`: a branch that grew a second, hand-written field — the way this duplication
    // arose in the first place — pushes it back to 2 and fails here.
    const numberInputs = markup.match(/type="number"/g) ?? [];
    assert.equal(
      numberInputs.length,
      1,
      'the one shared numericField snippet is the component\'s only number input'
    );
    assert.ok(
      !/type="text"/.test(markup),
      'it does not drift to a text input, which would remove native keyboard stepping'
    );
    // …and both orientations really do reach it.
    assert.equal(
      (markup.match(/\{@render numericField\(\)\}/g) ?? []).length,
      2,
      'the vertical and horizontal branches both render it'
    );
    // The component still owns no keydown handler.
    assert.ok(
      !/onkeydown|on:keydown/.test(markup),
      'stepping is still native, so the input type is what guarantees it'
    );
  });

  // The component editor's essence quantity field and the two gathering rule limit fields
  // each had their own copy of this suppression, because each hand-rolled its own −/+ pair
  // around a bare `type="number"`. Issue 1050 folded all three onto the shared `Stepper`,
  // so the declarations they pinned are GONE — the primitive's own rule above is the single
  // remaining one, and a per-surface assertion here would now only re-pin dead CSS.

  // ── THE REPO-WIDE SCAN (issue 1050) ────────────────────────────────────────────────
  const sources = collectSvelteSources();
  const scannedPaths = Object.keys(sources);
  const bareFieldCounts = new Map(
    scannedPaths
      .filter((path) => path !== STEPPER_PATH)
      .map((path) => [path, (withoutComments(sources[path]).match(BARE_NUMBER_INPUT) ?? []).length])
      .filter(([, count]) => count > 0)
  );

  it('walks a non-trivial number of components, so the scan cannot pass vacuously', () => {
    // Fail CLOSED. A glob typo, a moved directory or a renamed extension returns an empty corpus,
    // and every assertion below would then hold over nothing at all. The floor is far under the
    // ~265 files present so an added component never has to update it.
    assert.ok(
      scannedPaths.length >= MINIMUM_SCANNED_SVELTE_FILES,
      `scanned only ${scannedPaths.length} .svelte files under src/ui/svelte; expected at least `
        + `${MINIMUM_SCANNED_SVELTE_FILES}, so the enumeration is broken rather than the tree`
    );
    assert.ok(
      scannedPaths.includes(STEPPER_PATH),
      'the corpus reaches the shared primitive, so excluding it below excludes something real'
    );
  });

  it('leaves exactly the registered bare number fields, and no others', () => {
    // The register is drift-guarded in BOTH directions. A third bare field appearing anywhere
    // fails as an unmigrated field; a register entry whose file no longer holds a bare field fails
    // as a stale allowlist, so migrating either one later cannot leave dead permission behind.
    assert.deepEqual(
      [...bareFieldCounts.keys()].sort(),
      BARE_NUMBER_FIELD_REGISTER.map((entry) => entry.path).sort(),
      'every bare `type="number"` outside the primitive must carry a written reason in the '
        + 'non-reuse register:\n  '
        + BARE_NUMBER_FIELD_REGISTER.map((entry) => `${entry.register} ${entry.path}: ${entry.reason}`).join('\n  ')
    );
    // Derived from the register's own length rather than hard-coded.
    assert.equal(
      [...bareFieldCounts.values()].reduce((total, count) => total + count, 0),
      BARE_NUMBER_FIELD_REGISTER.length,
      'each register entry holds exactly one bare field, so the total is the register length'
    );
  });

  it('suppresses a spinner only where the selector names a specific control', () => {
    // The narrowed form of the assertion this replaces.
    const selectors = spinnerSuppressionSelectors(globalCss);
    assert.ok(
      selectors.length > 0,
      'the global sheet suppresses at least one spinner, so this assertion is not vacuous'
    );
    assert.deepEqual(
      selectors.filter((selector) => !namesASpecificControl(selector)),
      [],
      'a spinner suppression whose selector names only an area root reaches every bare field in '
        + 'that area, including the ones whose spinner is their only pointer affordance'
    );
    assert.ok(
      !selectors.some((selector) => selector.includes('manager-currency-subunit-amount')),
      'R2 (the currency sub-unit amount) keeps its native spinner: it is a bare field in a chip '
        + 'with no other pointer-driven stepping affordance'
    );
  });

  it('suppresses the ChanceSlider spinner, which is R1 earning the iff a different way', () => {
    // R1 is the one field allowed to keep a bare input AND lose its arrows.
    const rule = ruleBody(
      globalCss,
      String.raw`\.fabricate-slider \.manager-drop-rate-percent input\[type="number"\]::-webkit-outer-spin-button`
    );
    assert.match(rule, /appearance: none;/);
    assert.match(rule, /-webkit-appearance: none;/);
    assert.match(
      readFileSync(resolve(repoRoot, 'src/ui/svelte/components/ChanceSlider.svelte'), 'utf8'),
      /onkeydown=\{handleNumberKeydown\}/,
      'and keeps its own keydown handler, which is what stops the suppression removing keyboard '
        + 'stepping — the difference between R1 and the regression #1037 refused to ship'
    );
  });
});
