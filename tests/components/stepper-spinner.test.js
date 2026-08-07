/**
 * Numeric steppers show no native spinner arrows (maintainer round, issue 1036).
 *
 * A control that already carries −/+ adjuncts AND native Up/Down keyboard stepping does not
 * also need the browser's drawn arrows: they are a third affordance duplicating both, and on
 * the 48px shared stepper they eat ~13-17px of the field and shunt the centred mono value
 * off-centre.
 *
 * ── WHY THIS IS A SOURCE TEST ──────────────────────────────────────────────────────
 * happy-dom computes no cascade and implements no `::-webkit-*` pseudo-element, so a mounted
 * assertion could not see this either way. The rendered proof is the View Lab capture; this
 * pins the declarations that capture depends on, so deleting one fails here with the reason
 * attached rather than silently changing a screenshot nobody re-reads.
 *
 * ── THE `type="number"` ASSERTION IS THE POINT ─────────────────────────────────────
 * `Stepper.svelte` has NO keydown handler. Up/Down work purely because it is a native number
 * input, whose native step fires `input` → `onInput` → `commit`. Suppressing the pseudo-
 * elements removes only the drawn buttons and leaves that intact. Switching the element to
 * `type="text"` would ALSO remove the arrows — and would silently delete keyboard stepping,
 * which is the regression the component's own header says it exists to prevent. So the
 * spinner assertions are paired with a type assertion: a future "fix" that reaches for
 * `type="text"` fails here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(repoRoot, relative), 'utf8');

const stepperSource = read('src/ui/svelte/components/Stepper.svelte');
const componentEditorSource = read('src/ui/svelte/apps/ComponentEditorRoot.svelte');
const globalCss = read('styles/fabricate.css');

/**
 * The `{ … }` body of the first RULE whose selector list matches `selectorPattern`.
 *
 * Anchored to the start of a line so a class NAME occurring in markup (`class="fab-stepper-
 * input"`) cannot be mistaken for a selector and swallow everything up to the next `{`.
 */
function ruleBody(source, selectorPattern) {
  const match = new RegExp(`^\\s*${selectorPattern}[^{]*\\{([^}]*)\\}`, 'ms').exec(source);
  return match ? match[1] : '';
}

/** Source with HTML and CSS comments removed — prose about markup is not markup. */
function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
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
    // `margin: 0` alone is the half-fix that shipped elsewhere in this repo: it closes the
    // gap around the buttons without removing them. Pin that it is not the whole rule.
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
    // Comments stripped: this file's own prose explains why the type matters, and that
    // explanation must not be counted as if it were markup.
    const markup = withoutComments(stepperSource);
    // Both orientation branches render their own input; neither may drift to `type="text"`.
    const numberInputs = markup.match(/type="number"/g) ?? [];
    assert.equal(
      numberInputs.length,
      2,
      'the vertical and horizontal branches both keep type="number"'
    );
    assert.ok(
      !/type="text"/.test(markup),
      'no branch swaps to a text input, which would remove native keyboard stepping'
    );
    // The component still owns no keydown handler, which is WHY the type matters. If one is
    // ever added, this assertion should be replaced by a mounted key-press test rather than
    // deleted — the guarantee is "Up/Down step the value", however it is implemented.
    assert.ok(
      !/onkeydown|on:keydown/.test(markup),
      'stepping is still native, so the input type is what guarantees it'
    );
  });

  it('completes the half-finished suppression on the component editor quantity field', () => {
    const spinner = ruleBody(
      componentEditorSource,
      String.raw`\.essence-quantity-input::-webkit-inner-spin-button`
    );
    assert.match(spinner, /appearance: none;/);
    assert.match(spinner, /-webkit-appearance: none;/);
    assert.match(
      ruleBody(componentEditorSource, String.raw`\.essence-quantity-input`),
      /appearance: textfield;/
    );
  });

  it('suppresses the spinner on the gathering rule steppers', () => {
    const spinner = ruleBody(
      globalCss,
      String.raw`\.fabricate-manager \.manager-rule-stepper input::-webkit-inner-spin-button`
    );
    assert.match(spinner, /appearance: none;/);
    assert.match(spinner, /-webkit-appearance: none;/);
  });

  it('does not blanket-suppress spinners on bare number fields', () => {
    // The ~20 bare `type="number"` fields across the checks, gathering and economy editors
    // carry NO −/+ adjuncts, so their spinner is the only pointer-driven stepping they have.
    // Hiding it there would be a regression, not a fix; they are migrated onto `Stepper`
    // separately. A blanket `input[type="number"]` suppression would do exactly that damage,
    // so its absence is the assertion.
    assert.ok(
      !/input\[type=["']number["']\][^{]*::-webkit-(?:inner|outer)-spin-button/.test(globalCss),
      'no blanket number-input spinner rule exists in the global sheet'
    );
  });
});
