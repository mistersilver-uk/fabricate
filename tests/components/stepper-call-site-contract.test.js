/**
 * What every `<Stepper>` CALL SITE has to pass (issue 1050).
 *
 * The primitive's own behaviour is pinned by `stepper-unset-fill.test.js`, which mounts it. This
 * file is the other half: 39 call sites across 19 components, none of which that suite can see.
 * Three rules, each closing a gap where a defect would otherwise ship green:
 *
 *   D8  every `data-*` hook rides `inputProps` onto the real `<input>`, never the wrapper. The
 *       smoke harness calls Playwright's `fill()` / `inputValue()` on three of them, and neither
 *       resolves against a `<div>`; a failing smoke step is not waivable.
 *   D9  `disabled` is the TOP-LEVEL prop, never an `inputProps` key. The adjuncts read the
 *       top-level prop, so `inputProps={{ disabled }}` disables only the input — and every DOM
 *       assertion that checks `input.disabled` still passes while `−`/`+` stay live.
 *   D1a `allowUnset` is passed if and only if the field's domain admits absence. Nothing else in
 *       the change asserts which call site is which.
 *
 * ── ONE TABLE, NOT TWENTY-SEVEN `it()` BLOCKS ──────────────────────────────────────
 * The call sites are near-identical by construction — that is the point of migrating them onto one
 * primitive — so a per-field test block would be near-identical too, and SonarCloud's Automatic
 * Analysis counts duplication in `tests/**` exactly as it does in `src/`. Every rule below is one
 * assertion driven over a hoisted table in `tests/helpers/stepperSourceContract.js`.
 *
 * ── WHY THESE ARE SOURCE ASSERTIONS ────────────────────────────────────────────────
 * Mounting all nineteen components would need nineteen harnesses and nineteen fixtures, which is
 * the duplication this file exists to avoid, and several of them (the manager root) are not
 * mountable at a useful cost. The behavioural halves that a source scan genuinely cannot state are
 * mounted instead, next to the components that already have a harness: the unset/cosmetic-zero
 * commit behaviour in `gathering-task-editor-stepper-mounted.test.js` and
 * `gathering-economy-view-mounted.test.js`, and the primitive's own contract in
 * `stepper-unset-fill.test.js`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MIGRATED_INPUT_HOOKS,
  MINIMUM_SCANNED_SVELTE_FILES,
  STEPPER_PATH,
  UNSET_VALUE_CALL_SITES,
  collectSvelteSources,
  inputPropsExpression,
  labelsBindingAStepper,
  objectLiteralKeys,
  repoRoot,
  stepperTags,
  withoutComments,
} from '../helpers/stepperSourceContract.js';

const sources = collectSvelteSources();
const markup = Object.fromEntries(
  Object.entries(sources).map(([path, source]) => [path, withoutComments(source)])
);
const stepperSource = readFileSync(resolve(repoRoot, STEPPER_PATH), 'utf8');

/** Every `<Stepper …/>` in the product, tagged with the file it came from. */
const CALL_SITES = Object.entries(markup)
  .filter(([path]) => path !== STEPPER_PATH)
  .flatMap(([path, source]) => stepperTags(source).map((tag) => ({ path, tag })));

/** A hook name matched as a whole token, so `…-node-interval` does not match `…-node-interval-unit`. */
const asToken = (hook) => new RegExp(String.raw`(?<![\w-])${hook}(?![\w-])`);

describe('Stepper call sites (issue 1050)', () => {
  it('scans a non-trivial corpus and finds call sites in it', () => {
    // Fail CLOSED: an empty corpus or a tag extractor that matched nothing would make every
    // assertion below hold over an empty set.
    assert.ok(
      Object.keys(sources).length >= MINIMUM_SCANNED_SVELTE_FILES,
      `scanned only ${Object.keys(sources).length} .svelte files; the enumeration is broken`
    );
    assert.ok(
      CALL_SITES.length >= UNSET_VALUE_CALL_SITES.length,
      `found only ${CALL_SITES.length} <Stepper> tags, fewer than the ${UNSET_VALUE_CALL_SITES.length} `
        + 'the unset-value table alone names, so the tag extractor is broken'
    );
  });

  it('extracts inputProps case-sensitively, so a ChanceSlider prop cannot satisfy a Stepper rule', () => {
    // The negative control for the rule below. `ToolBreakageTab.svelte` really does ship
    // `numberInputProps={{ … }}` and `rangeInputProps={{ … }}` on its `ChanceSlider`; a
    // case-insensitive or unanchored match would read either as a Stepper's `inputProps` and every
    // hook assertion would then pass on the wrong component's props.
    assert.equal(
      inputPropsExpression("<Stepper numberInputProps={{ 'data-tier-dc': '' }} />"),
      null,
      'capital-I `numberInputProps` is a different prop on a different component'
    );
    assert.equal(
      objectLiteralKeys(inputPropsExpression("<Stepper inputProps={{ 'data-tier-dc': '' }} />"))[0],
      'data-tier-dc',
      'and the real spelling still resolves'
    );
    // Brace-balanced, not lazy: Prettier prints these multi-line over expression values, so a
    // `\{\{[\s\S]*?\}\}` terminator closes inside the value and drops every later key.
    assert.deepEqual(
      objectLiteralKeys(
        inputPropsExpression("<Stepper inputProps={{ 'data-a': fn({ x: 1 }), 'data-b': '' }} />")
      ),
      ['data-a', 'data-b'],
      'a nested object in a value does not truncate the extraction'
    );
  });

  it('routes every migrated data-* hook through inputProps, never onto the <Stepper> tag', () => {
    const owners = new Map();
    const bare = [];
    for (const { path, tag } of CALL_SITES) {
      const props = inputPropsExpression(tag);
      for (const key of props ? objectLiteralKeys(props) : []) {
        if (MIGRATED_INPUT_HOOKS.includes(key)) owners.set(key, `${path} (inputProps)`);
      }
      // The same tag with its `inputProps` expression removed: whatever hook is left is a bare
      // attribute on the wrapper `<div>` the component renders, which `fill()` cannot resolve.
      const withoutProps = props ? tag.replace(props, '') : tag;
      for (const hook of MIGRATED_INPUT_HOOKS) {
        if (asToken(hook).test(withoutProps)) bare.push(`${hook} on a <Stepper> tag in ${path}`);
      }
    }
    // Checked against the delta's FIXED list, never a list derived from the tree: a derived list
    // shrinks with the code, so a dropped hook would pass vacuously.
    assert.deepEqual(
      MIGRATED_INPUT_HOOKS.filter((hook) => !owners.has(hook)),
      [],
      'these hooks no longer ride `inputProps` on any Stepper — the smoke harness and the mounted '
        + 'suites resolve them against the real `<input>`'
    );
    assert.deepEqual(bare, [], 'a hook on the tag lands on the wrapper `<div>`, not on the input');
  });

  it('names both adjuncts and the input at every call site', () => {
    // `Stepper` is an import-free leaf and localizes NOTHING itself, so an omitted label ships an
    // anonymous button rather than an English one. Shorthand (`{decrementLabel}`) counts: the two
    // pass-through wrappers, `EssenceQuantityCard` and `ComponentBulkEditPanel`, spell it that way.
    const named = (tag, prop) =>
      new RegExp(String.raw`(?:\b${prop}=|\{\s*${prop}\s*\})`).test(tag);
    const anonymous = CALL_SITES.filter(
      ({ tag }) =>
        !named(tag, 'ariaLabel')
        || !named(tag, 'decrementLabel')
        || !named(tag, 'incrementLabel')
    ).map(({ path }) => path);
    assert.deepEqual(anonymous, [], 'every Stepper names its input and both of its adjuncts');
  });

  it('keeps the two parametrized adjunct label keys, which localize() alone would not gate', () => {
    // The V2 tail. Two parametrized keys replace the ~58 bespoke strings a per-field pair would
    // need — and because they are reached through `localize(key, data)` rather than through the
    // `text('KEY', 'fallback')` idiom, `manager-contract.test.js`'s matcher cannot see them and
    // `lang-keys-no-orphans.test.js` would not notice their removal either. Deleting them would
    // ship the literal key strings as the adjuncts' accessible names on every migrated field.
    const stepperKeys = JSON.parse(
      readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8')
    ).FABRICATE?.Common?.Stepper;
    assert.ok(Boolean(stepperKeys), 'FABRICATE.Common.Stepper exists');
    for (const name of ['Decrease', 'Increase']) {
      assert.match(
        String(stepperKeys[name] ?? ''),
        /\{label\}/,
        `${name} is parametrized on {label}, which is what makes one key serve every field`
      );
    }
    // And the keys are actually the ones the call sites reach for, so renaming either half fails.
    const users = CALL_SITES.filter(({ tag }) =>
      tag.includes('FABRICATE.Common.Stepper.Decrease')
    ).length;
    assert.ok(users > 0, 'at least one call site localizes the shared Decrease key');
  });

  it('never passes disabled through inputProps', () => {
    // `disabled || atMin` / `disabled || atMax` read the TOP-LEVEL prop. Routed through the
    // spread, the input would go dead while both adjuncts stayed live — and
    // `gathering-economy-view-mounted.test.js` asserts `disabled` on the element carrying the
    // `data-*` hook, i.e. the inner `<input>`, so it would be fooled too.
    const offenders = CALL_SITES.filter(({ tag }) => {
      const props = inputPropsExpression(tag);
      return props !== null && objectLiteralKeys(props).includes('disabled');
    }).map(({ path }) => path);
    assert.deepEqual(offenders, [], '`disabled` is the top-level prop, never an inputProps key');
  });
});

describe('Stepper unset-value split (issue 1050, D1a)', () => {
  // The fixture IS D1a's two tables. Every entry resolves to exactly one tag, so a formatting
  // change that breaks an anchor fails here loudly rather than silently matching nothing.
  const resolved = UNSET_VALUE_CALL_SITES.map((entry) => {
    const matches = stepperTags(markup[entry.path] ?? '').filter((tag) =>
      entry.anchor.every((needle) => tag.includes(needle))
    );
    return { entry, matches };
  });

  it('resolves every table entry to exactly one call site', () => {
    assert.deepEqual(
      resolved.filter(({ matches }) => matches.length !== 1).map(({ entry, matches }) => `${entry.id}: ${matches.length} matches`),
      [],
      'an unresolved entry would make its rule below hold over nothing'
    );
  });

  it('passes allowUnset if and only if the field genuinely persists absence', () => {
    // The asymmetry is deliberate. For a genuine-absence field this is the first link of
    // "clearing persists null": the primitive commits `null` on clear only under `allowUnset`
    // (pinned in `stepper-unset-fill.test.js` and by the closure assertion below), and the
    // behavioural half — that the call site's own handler forwards it rather than coercing it — is
    // mounted for the gathering task editor and the economy view.
    //
    // For a cosmetic-zero field the testable invariant is NOT that clearing persists `0`, which
    // `allowUnset={false}` cannot do: `onInput` returns early on `''` and `onBlur` re-asserts the
    // prior value, so nothing is committed at all. It is that the update function can never
    // RECEIVE `null` — which follows from this assertion plus the closure one below.
    const wrong = resolved
      .filter(({ entry, matches }) => {
        if (matches.length !== 1) return false;
        return /\ballowUnset\b/.test(matches[0]) !== (entry.kind === 'genuine-absence');
      })
      .map(({ entry }) => `${entry.id} (${entry.kind}): ${entry.evidence}`);
    assert.deepEqual(
      wrong,
      [],
      'a genuine-absence field that drops `allowUnset` starts persisting 0 where null was the '
        + 'value; a cosmetic-zero field that gains it starts persisting null where 0 was'
    );
    // Not vacuous in either direction: the table has to contain both kinds for the `iff` to bite.
    for (const kind of ['genuine-absence', 'cosmetic-zero']) {
      assert.ok(
        UNSET_VALUE_CALL_SITES.some((entry) => entry.kind === kind),
        `the table still carries a ${kind} entry`
      );
    }
  });

  it('lets the primitive emit null only under allowUnset, which closes the cosmetic-zero half', () => {
    // This is what turns "passes no allowUnset" into "its update function never receives null".
    // Without it, a future change could commit `null` from some other branch and every
    // cosmetic-zero call site would start receiving one with nothing to say so.
    const nulls = stepperSource.match(/onChange\(null\)/g) ?? [];
    assert.equal(nulls.length, 1, 'the primitive has exactly one path that commits absence');
    assert.match(
      stepperSource,
      /if \(allowUnset\) onChange\(null\)/,
      'and it is gated on `allowUnset`, so a call site that passes none cannot be handed null'
    );
  });
});

describe('no <label> implicitly binds a Stepper (issue 1050)', () => {
  // A `<label>` binds to its FIRST labelable descendant, and a Stepper's is the `−` button — so a
  // caption above a Stepper made clicking the caption DECREMENT the value. Five such labels
  // shipped in `GatheringTaskEditView.svelte` before this guard existed. Every migrated Stepper
  // carries its own `ariaLabel`, so the fix is a `<div>` and nothing is lost.
  it('detects the pattern it is looking for, on a fixture that has it', () => {
    // The positive control. A detector that matched nothing would report a clean tree whether or
    // not the tree was clean, which is exactly how this defect survived four phases.
    assert.deepEqual(
      labelsBindingAStepper('<label class="f">\n<span>DC</span>\n<Stepper value={1} />\n</label>'),
      [1],
      'a caption followed by a Stepper is reported'
    );
    assert.deepEqual(
      labelsBindingAStepper('<label class="f">\n<span>DC</span>\n<select></select>\n<Stepper />\n</label>'),
      [],
      'and a label whose first labelable descendant is a real control is not'
    );
  });

  it('finds none in src/ui/svelte', () => {
    const offenders = Object.entries(markup).flatMap(([path, source]) =>
      labelsBindingAStepper(source).map((line) => `${path}:${line}`)
    );
    assert.deepEqual(
      offenders,
      [],
      'wrap the caption and the Stepper in a `<div>` instead — the Stepper\'s own `ariaLabel` is '
        + 'the accessible name, and an implicit label here binds to the `−` button'
    );
  });
});
