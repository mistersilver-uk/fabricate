/**
 * `Stepper`'s unset-value state (`allowUnset`) and its `fill` variant — issue 1050, Phase 0.
 *
 * ── WHY THE `0` CASE IS THE POINT ──────────────────────────────────────────────────
 * `Number(null)`, `Number('')` and the `: 0` fallback for `undefined` all produce the SAME
 * `0`, so `numericValue` reads `0` for every one of the three unset representations. The
 * commit path's dedupe guard (`next !== numericValue`) therefore swallows a deliberate `0`
 * typed into an unset field: nothing commits, `onBlur` then also sees `next === numericValue`
 * and stays silent, and the model keeps `null` while the input displays `0`. That is a real
 * data-loss path on the unbounded modifier bounds, where `0` is a legitimate persisted value.
 * The same guard makes `−` a live-but-inert button on an unset field with `min = 0`.
 * Both are pinned below; deleting the `isUnset ||` half of the guard fails them.
 *
 * ── WHY THE `fill` CASES ARE SOURCE ASSERTIONS ─────────────────────────────────────
 * happy-dom computes no cascade and no layout, so a mounted assertion could not tell
 * `height: 100%` from `height: 24px` either way. What actually decides the rendered result
 * is selector SPECIFICITY, which is a property of the stylesheet text — so it is asserted as
 * arithmetic over the real selectors rather than mimed through a DOM that cannot resolve it.
 * The rendered proof is the View Lab capture.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STEPPER = 'src/ui/svelte/components/Stepper.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-stepper-unset-',
  // Import-free leaf by design, so it needs no `rawModules` and nothing else compiled.
  compiledModules: [STEPPER],
  componentPath: STEPPER
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Mount a Stepper and return its parts plus the recorded `onChange` arguments. */
async function mountStepper(props) {
  const calls = [];
  const root = await harness.mount({ ...props, onChange: (next) => calls.push(next) });
  return {
    calls,
    input: root.querySelector('[data-stepper-input]'),
    decrement: root.querySelector('[data-stepper-decrement]'),
    increment: root.querySelector('[data-stepper-increment]')
  };
}

/** Type `raw` into the field the way a user would, firing the real `input` event. */
function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

describe('Stepper unset-value state (issue 1050)', () => {
  it('renders an unset value as an empty field, not as 0', async () => {
    for (const value of [null, undefined, '']) {
      const { input } = await mountStepper({ allowUnset: true, value });
      assert.equal(input.value, '', `value=${String(value)} renders blank under allowUnset`);
      harness.remount();
    }
  });

  it('commits a typed 0 on an unset field exactly once', async () => {
    const { input, calls } = await mountStepper({ allowUnset: true, value: null });
    type(input, '0');
    assert.deepEqual(
      calls,
      [0],
      'blank -> 0 is a real edit, even though numericValue already coerces the unset value to 0'
    );
  });

  it('commits null when an allowUnset field is cleared', async () => {
    const { input, calls } = await mountStepper({ allowUnset: true, value: 7 });
    type(input, '');
    assert.deepEqual(calls, [null], 'clearing persists absence rather than being swallowed');
  });

  it('leaves a blurred unset field empty and reports nothing', async () => {
    const { input, calls } = await mountStepper({ allowUnset: true, value: null });
    input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
    assert.equal(input.value, '', 'blur does not re-assert a value the user removed');
    assert.deepEqual(calls, [], 'and reports no change');
  });

  // ── The adjuncts of an UNSET field, as a table ────────────────────────────────────
  //
  // Four cases with one shape: mount an unset field under some bounds, check which adjuncts are
  // live, click a sequence, read the commits. Written out they were the same five lines four
  // times over, so the shape is written once below and the cases carry only what differs — plus
  // the reason each case exists, which is the part that is NOT interchangeable.
  const UNSET_ADJUNCT_CASES = [
    {
      title: 'steps an unset field from its lower bound, with both adjuncts live',
      props: { min: 5, max: 20 },
      live: ['increment', 'decrement'],
      clicks: ['increment'],
      commits: [6],
      why: '+ steps from min, not from the coerced 0'
    },
    {
      title: 'steps an unset field with no lower bound from 0, in both directions',
      // The `min = null` half of the baseline rule, which the `min = 5` case above cannot state:
      // with no bound, `min ?? 0` and `numericValue` agree, so only the pairing of the two cases
      // pins the branch. The mutation this catches is DELETION of the `isUnset ? (min ?? 0) : …`
      // baseline — not a `??` -> `||` typo, which is indistinguishable for every value `min` takes
      // (the fallback IS 0), so a test written for that rationale would pass under either operator
      // and be recorded as covering something it does not.
      props: {},
      live: [],
      clicks: ['increment', 'decrement'],
      commits: [1, -1],
      why: 'an unbounded unset field steps from 0 and is not clamped'
    },
    {
      title: 'keeps − effective on an unset field whose min is 0',
      props: { min: 0 },
      live: ['decrement'],
      clicks: ['decrement'],
      commits: [0],
      why: 'clamp(0 - 1) is 0, which is still a change from blank'
    },
    {
      title: 'keeps + effective on an unset field whose max is 0',
      // The MIRROR of the case above, and it is load-bearing rather than symmetrical tidiness.
      // "steps an unset field from its lower bound" claims BOTH adjuncts stay live while unset,
      // but it sets `max: 20`, where the coerced `numericValue` of `0` is nowhere near the upper
      // bound — `0 >= 20` is false with or without the `!isUnset &&` guard on `atMax`, so
      // deleting that half of the guard survived the entire suite while deleting the `atMin` half
      // was caught. `max: 0` is the shape that makes the upper guard decide the outcome, exactly
      // as `min: 0` does for the lower one.
      props: { max: 0 },
      live: ['increment'],
      clicks: ['increment'],
      commits: [0],
      why: 'clamp(0 + 1) is 0, which is still a change from blank'
    }
  ];

  for (const testCase of UNSET_ADJUNCT_CASES) {
    it(testCase.title, async () => {
      const parts = await mountStepper({ allowUnset: true, value: null, ...testCase.props });
      for (const name of testCase.live) {
        assert.ok(
          !parts[name].disabled,
          `${name} stays live while there is no value to be at the bound of, so it must not be `
            + 'a no-op'
        );
      }
      for (const name of testCase.clicks) parts[name].click();
      assert.deepEqual(parts.calls, testCase.commits, testCase.why);
    });
  }

  it('is unchanged under the default allowUnset={false}, including for value={null}', async () => {
    const { input, calls } = await mountStepper({ value: null, min: 0 });
    assert.equal(input.value, '0', 'the value default moving from 0 to null changes nothing here');
    type(input, '');
    assert.deepEqual(calls, [], 'a blank entry still no-ops rather than committing null');
    input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
    assert.equal(input.value, '0', 'and blur still re-asserts the model value over it');
    assert.deepEqual(calls, [], 'without reporting a change');
  });

  it('lets the explicit placeholder prop win over an inputProps placeholder', async () => {
    // `{...inputProps}` has to stay last in the markup so a caller's attributes win over
    // the primitive's defaults, which is exactly why this precedence is resolved in the
    // script rather than left to attribute order.
    const { input } = await mountStepper({
      placeholder: 'explicit',
      inputProps: { placeholder: 'spread' }
    });
    assert.equal(input.getAttribute('placeholder'), 'explicit');
  });

  it('still lets a placeholder passed through inputProps reach the input', async () => {
    const { input } = await mountStepper({ inputProps: { placeholder: 'spread' } });
    assert.equal(input.getAttribute('placeholder'), 'spread');
  });
});

// ── `fill` variant: specificity, asserted as arithmetic over the real selectors ──────

const stepperSource = readFileSync(resolve(repoRoot, STEPPER), 'utf8');

/** Every `selector { body }` pair in the component's `<style>`, comments stripped. */
function styleRules(source) {
  const style = /<style>([\s\S]*)<\/style>/.exec(source)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, ' '),
    body: match[2]
  }));
}

const RULES = styleRules(stepperSource);

function bodyOf(selector) {
  const matches = RULES.filter((rule) => rule.selector === selector);
  assert.equal(matches.length, 1, `expected exactly one \`${selector}\` rule, found ${matches.length}`);
  return matches[0].body;
}

// Only `.class`, `:not(.class)` and descendant whitespace — no ids, no type selectors.
const CLASS_ONLY = /^(?:\s*(?:\.[A-Za-z][\w-]*|:not\(\.[A-Za-z][\w-]*\)))+$/;

/**
 * The class column of a class-only selector's specificity.
 *
 * `:not()` contributes its ARGUMENT's specificity rather than zero, which is the whole
 * arithmetic this collision turns on: read as if `:not()` were free,
 * `.fab-stepper.is-fill.is-comfortable .fab-stepper-input` looks like (0,4,0) against a
 * (0,3,0) rival, when in fact both sides are (0,4,0) and the winner is decided by source
 * order alone. Asserting the guarded form is strictly higher removes that dependence.
 */
function classColumn(selector) {
  assert.match(selector, CLASS_ONLY, `${selector} is class-only, so a class count IS its specificity`);
  return selector.match(/\.[A-Za-z][\w-]*/g).length;
}

describe('Stepper fill variant (issue 1050)', () => {
  const FILL_WRAPPER = '.fab-stepper.is-fill:not(.is-vertical)';
  const FILL_INPUT = '.fab-stepper.is-fill:not(.is-vertical) .fab-stepper-input';
  const FILL_COMFORTABLE_INPUT =
    '.fab-stepper.is-fill.is-comfortable:not(.is-vertical) .fab-stepper-input';
  const COMFORTABLE_INPUT = '.fab-stepper.is-comfortable:not(.is-vertical) .fab-stepper-input';

  it('fills its slot and takes its height from a custom property', () => {
    const body = bodyOf(FILL_WRAPPER);
    assert.match(body, /display: flex;/);
    assert.match(body, /width: 100%;/);
    // Declared, not inherited: the sheet's only universal reset is manager-scoped
    // (`.fabricate-manager * { box-sizing: border-box }`), and this import-free leaf
    // cannot see which area it was dropped into. Without it the height above is a
    // CONTENT height and the control stands 42px outside the manager.
    assert.match(body, /box-sizing: border-box;/);
    // A custom property, not a constant: three candidate layout contexts resolve to
    // 30/34/28px, so the 36px is a default rather than the answer.
    assert.match(body, /height: var\(--fab-stepper-fill-height, 36px\);/);
  });

  it('keeps min-width: 0 on the filled input, which is what stops it overflowing', () => {
    const body = bodyOf(FILL_INPUT);
    assert.match(body, /flex: 1 1 0;/);
    assert.match(body, /width: auto;/);
    // `width: auto` removes the specified size suggestion that today's `width: 48px`
    // supplies, leaving the UA min-content width of an `<input>` (~140-180px) as the
    // flex item's automatic minimum. Without this the filled control's own minimum
    // OVERFLOWS the 160px slot the variant exists to fill.
    assert.match(body, /min-width: 0;/);
    assert.match(body, /height: 100%;/);
  });

  it('beats the comfortable input rule on specificity, not on source order', () => {
    assert.equal(classColumn(COMFORTABLE_INPUT), 4, 'the existing rule is (0,4,0)');
    // The claim this replaces read the unguarded selector as (0,5,0). It is not:
    assert.equal(
      classColumn('.fab-stepper.is-fill.is-comfortable .fab-stepper-input'),
      classColumn(COMFORTABLE_INPUT),
      'unguarded, fill+comfortable TIES the comfortable rule and resolves on source order'
    );
    assert.equal(classColumn(FILL_COMFORTABLE_INPUT), 5, 'guarded, it is genuinely (0,5,0)');
    assert.ok(
      classColumn(FILL_COMFORTABLE_INPUT) > classColumn(COMFORTABLE_INPUT),
      'so the input takes the wrapper height rather than being pinned to 24px inside a 36px box'
    );
    const body = bodyOf(FILL_COMFORTABLE_INPUT);
    assert.match(body, /height: 100%;/);
    assert.match(body, /min-height: 24px;/);
  });

  it('cannot resolve against the vertical variant by source order either', () => {
    // Both rules exist, so this is not vacuous.
    assert.ok(bodyOf('.fab-stepper.is-vertical').length > 0);
    assert.ok(bodyOf('.fab-stepper.is-vertical .fab-stepper-input').length > 0);
    assert.ok(
      classColumn(FILL_WRAPPER) > classColumn('.fab-stepper.is-vertical'),
      'the fill wrapper rule out-specifies the vertical wrapper rule'
    );
    assert.ok(
      classColumn(FILL_INPUT) > classColumn('.fab-stepper.is-vertical .fab-stepper-input'),
      'and the fill input rule out-specifies the vertical input rule'
    );
    // The guard is what makes `fill` and `vertical` mutually exclusive rather than
    // merely ordered, exactly as `is-comfortable:not(.is-vertical)` already is.
    for (const selector of [FILL_WRAPPER, FILL_INPUT, FILL_COMFORTABLE_INPUT]) {
      assert.match(selector, /:not\(\.is-vertical\)/);
    }
  });
});

describe('Stepper inputProps contract (issue 1050)', () => {
  // Everything above `<script>`: the component's own doc header, which is where a caller
  // reading the props list will actually be standing.
  const header = stepperSource.slice(0, stepperSource.indexOf('<script>'));

  it('records that inputProps carries attributes only, never handlers', () => {
    assert.match(
      header,
      /attributes and `data-\*` only, NEVER event handlers/i,
      'the spread sits after oninput/onblur, so a handler routed through it silently '
        + 'replaces the commit path and the control stops reporting edits'
    );
    assert.match(header, /oninput/);
    assert.match(header, /onblur/);
  });

  it('records that disabled is the top-level prop, never an inputProps key', () => {
    // The adjuncts read the top-level prop, so `inputProps={{ disabled }}` would leave
    // −/+ live while every `input.disabled` assertion still passed.
    assert.match(header, /`disabled` is the TOP-LEVEL prop, never an `inputProps` key/);
  });
});
