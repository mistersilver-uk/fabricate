/**
 * The module sheet and every component style against the published `Stepper` (issue 2452): every
 * selector outside its own file that names one of its classes or `data-stepper-*` hooks, and every
 * bare `input` rule its number field can take, each of which a published stepper either cannot
 * match or sits under a pinned ancestor of, but the module rules pinned by their written text. The
 * existing bare-button census already covers its two buttons.
 * Limit: the census takes on trust that no extension target sits under a pinned ancestor, and
 * reads a component's selector only where `:global` reaches it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { templateOf } from './helpers/apiConvention.js';
import { walkNodes } from './helpers/moduleAst.js';
import {
  classesOf,
  compoundsOf,
  entryNamed,
  reachedByGlobal,
} from './helpers/publishedComponentCensus.js';
import {
  byName,
  everyStylesheet,
  gatedRoot,
  isComponent,
  selectorsWithRules,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const STEPPER_CLASSES = new Set(['fab-stepper', 'fab-stepper-input', 'fab-stepper-adjunct']);

/** The nine selectors outside `Stepper.svelte` that name a part of it: five `:not()` exemptions, and four under a pinned ancestor. */
const STEPPER_SELECTORS = Object.freeze([
  'src/ui/svelte/apps/manager/BulkStagingInset.svelte: :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper .fab-stepper)',
  'src/ui/svelte/apps/manager/BulkStagingInset.svelte: :global(.fab-bulk-inset .fab-bulk-inset-row.is-stepper .fab-stepper-input)',
  "src/ui/svelte/apps/manager/component/CheckOverrideField.svelte: :global(.manager-salvage-dc-controls .fab-stepper:has(input[aria-invalid='true']))",
  "src/ui/svelte/apps/manager/gathering-task/GatheringTaskCheckOverrideCard.svelte: :global(.manager-task-dc-row .fab-stepper:has(input[aria-invalid='true']))",
  'styles/fabricate-manager-checks-modifiers.css: .fabricate-rule-row .fabricate-rule-row-body .fabricate-field input:not(.fab-stepper-input):not([type="radio"]):not([type="range"])',
  // The same selector list, written twice in the sheet: the field rule and its `:hover` pair.
  "styles/fabricate-manager-library.css: .fabricate-field.fabricate-field input:not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])",
  "styles/fabricate-manager-library.css: .fabricate-field.fabricate-field input:not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])",
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-manager .manager-tool-inline-fields .manager-recipe-field input:not(.fab-stepper-input)',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-manager [data-salvage-dc-override] .fab-stepper',
]);

/** The classes and hooks under which a rule redraws a stepper of Fabricate's own; no extension target sits in one. */
const STEPPER_ANCESTORS = new Set([
  'fab-bulk-inset',
  'manager-salvage-dc-controls',
  'manager-task-dc-row',
  'data-salvage-dc-override',
]);

/** The module rules a bare `input` compound reaches a published stepper's number field through, as written. */
const BARE_INPUT_RULES = Object.freeze([
  'styles/fabricate-base.css: .fabricate input:focus',
  'styles/fabricate-base.css: .fabricate input:focus-visible',
  "styles/fabricate-base.css: .fabricate :is(input, textarea):where(:not([type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image'])):focus-visible",
  'styles/fabricate-base.css: .fabricate input:focus-visible::placeholder',
  'styles/fabricate-base.css: .fabricate input[data-validation-focused]',
  "styles/fabricate-base.css: .fabricate :is(input, textarea):where(:not([type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image']))[data-validation-focused]",
  'styles/fabricate-manager-shell.css: .fabricate-manager input',
]);

/** The classes under which a rule redraws a bare `input`; no extension target sits in one. */
const BARE_INPUT_ANCESTORS = new Set([
  'bonus-field',
  'checkbox-label',
  'fabricate-color-picker-popover',
  'fabricate-field',
  'fabricate-picker',
  'fabricate-picker-popover',
  'fabricate-search',
  'fabricate-slider',
  'form-group',
  'manager-checks-trigger-value',
  'manager-component-entry-alias-field',
  'manager-condition-add',
  'manager-condition-modifier-value',
  'manager-drop-editor-card',
  'manager-drop-rate-percent',
  'manager-environment-drop-adjustment-input',
  'manager-gathering-event-edit-view',
  'manager-gathering-task-edit-view',
  'manager-prerequisite-path-input',
  'manager-salvage-dc-controls',
  'manager-task-dc-row',
  'manager-tool-label-field',
  'manager-tool-prerequisite-row',
  'manager-tools-authority-segments',
  'manager-vocabulary-form',
]);

/** The attributes the published number field can carry, so a compound requiring another cannot match it. */
const FIELD_ATTRIBUTES = new Set([
  'type',
  'class',
  'value',
  'min',
  'max',
  'step',
  'aria-label',
  'data-stepper-input',
  'data-validation-focused',
]);

/** A selector as its sheet writes it, on one line. */
const spelled = (file, css, complex) =>
  `${file}: ${writtenSelector(css, complex).replaceAll(/\s+/g, ' ')}`;

const isStepperPart = (part) =>
  (part.type === 'ClassSelector' && STEPPER_CLASSES.has(part.name)) ||
  (part.type === 'AttributeSelector' && part.name.startsWith('data-stepper-'));

/** The class and attribute names one compound requires. */
const tokensOf = (compound) => [
  ...classesOf(compound),
  ...compound.selectors.filter(({ type }) => type === 'AttributeSelector').map(({ name }) => name),
];

/** Whether every stepper part a selector names sits inside a `:not()`, which no element it names can carry. */
function namedOnlyInNot(complex) {
  const negated = new Set(
    [...walkNodes(complex)].flatMap((part) =>
      part.type === 'PseudoClassSelector' && part.name === 'not' ? [...walkNodes(part.args)] : []
    )
  );
  return [...walkNodes(complex)]
    .filter((part) => isStepperPart(part))
    .every((part) => negated.has(part));
}

/**
 * Every selector of `sheets` outside `Stepper.svelte` that names a stepper class or a
 * `data-stepper-*` hook, as `{ written, safe }`: safe where it names one only inside `:not()`,
 * or where a compound above the last that names one requires a class or hook of `ancestors`.
 */
function stepperSelectors(sheets, ancestors = STEPPER_ANCESTORS) {
  return sheets
    .filter(([file]) => file !== STEPPER)
    .flatMap(([file, css]) =>
      selectorsWithRules(css, isStepperPart).map(({ complex }) => {
        const written = spelled(file, css, complex);
        if (namedOnlyInNot(complex)) return { written, safe: true };
        const compounds = compoundsOf(complex);
        const at = compounds.findLastIndex((compound) => compound.selectors.some(isStepperPart));
        const above = compounds.slice(0, Math.max(at, 0)).flatMap((compound) => tokensOf(compound));
        return { written, safe: above.some((name) => ancestors.has(name)) };
      })
    );
}

const unquoted = (value) => String(value ?? '').replaceAll(/^["']|["']$/g, '');

/**
 * Whether a `:not()` lists, as one of its alternatives, a lone simple selector `test` accepts: a
 * compound or complex alternative excludes the field only in some states or places, so it is none.
 */
const negatesAlone = (part, test) =>
  part.name === 'not' &&
  (part.args?.children ?? []).some(
    (complex) =>
      complex.children.length === 1 &&
      complex.children[0].selectors.length === 1 &&
      test(complex.children[0].selectors[0])
  );

/** Whether a `:not()` holds `[type]` alone, so the element it qualifies states no type. */
const negatesType = (part) =>
  negatesAlone(
    part,
    (inner) => inner.type === 'AttributeSelector' && inner.name === 'type' && !inner.matcher
  );

/** Whether a `:not()` holds the field's own class alone, which the published number field always carries. */
const negatesField = (part) =>
  negatesAlone(
    part,
    (inner) => inner.type === 'ClassSelector' && inner.name === 'fab-stepper-input'
  );

/**
 * Whether a `type` matcher requires a type other than `number`: only `=` and `~=` name a whole
 * value, and the attribute's value is matched without case, so a prefix, suffix, substring or
 * dash matcher may still take `number`.
 */
const refusesNumber = (part) =>
  ['=', '~='].includes(part.matcher) && unquoted(part.value).toLowerCase() !== 'number';

/**
 * Whether an `input` compound cannot match the published number field: it requires an attribute
 * the field never carries, a `type` other than `number`, no `type`, no `fab-stepper-input`, or
 * `:disabled`, which no published key writes.
 */
function unmatchable(compound) {
  return compound.selectors.some((part) => {
    if (part.type === 'AttributeSelector') {
      const name = part.name.toLowerCase();
      if (!FIELD_ATTRIBUTES.has(name)) return true;
      return name === 'type' && refusesNumber(part);
    }
    if (part.type !== 'PseudoClassSelector') return false;
    return part.name === 'disabled' || negatesType(part) || negatesField(part);
  });
}

/**
 * The classes of `ancestors` one compound requires: its own, and those of an `:is()` or
 * `:where()` each of whose alternatives requires one.
 */
function heldBy(compound, ancestors) {
  const own = classesOf(compound).filter((name) => ancestors.has(name));
  const alternatives = compound.selectors.filter(
    (part) => part.type === 'PseudoClassSelector' && ['is', 'where'].includes(part.name)
  );
  const either = alternatives.filter((part) =>
    part.args.children.every((complex) =>
      [...walkNodes(complex)].some(
        (inner) => inner.type === 'ClassSelector' && ancestors.has(inner.name)
      )
    )
  );
  const named = either.flatMap((part) =>
    [...walkNodes(part.args)]
      .filter((inner) => inner.type === 'ClassSelector' && ancestors.has(inner.name))
      .map((inner) => inner.name)
  );
  return [...own, ...named];
}

const isFieldCompound = (compound) =>
  compound.selectors.some((part) => part.type === 'TypeSelector' && part.name === 'input') &&
  classesOf(compound).every((name) => name === 'fab-stepper-input');

/**
 * Every selector of one parsed stylesheet that names `input`, as `{ written, safe, under }`: safe
 * where its last `input` compound with no class but the field's own is `unmatchable`, or a class of
 * `ancestors` sits above it. A selector that names `input` only inside a pseudo-class is judged by
 * every class it requires; one whose every `input` compound carries another class is no row. A
 * component's selector is read only where `:global` reaches it.
 */
function bareInputSelectors(file, css, ancestors) {
  const names = (part) => part.type === 'TypeSelector' && part.name === 'input';
  return selectorsWithRules(css, names)
    .filter(({ complex }) => !isComponent(file) || reachedByGlobal(css, complex))
    .flatMap(({ complex }) => {
      const compounds = compoundsOf(complex);
      const written = spelled(file, css, complex);
      const direct = compounds.some((compound) => compound.selectors.some(names));
      const at = compounds.findLastIndex((compound) => isFieldCompound(compound));
      if (direct && at === -1) return [];
      if (at !== -1 && unmatchable(compounds[at])) return [{ written, safe: true, under: [] }];
      const holders = at === -1 ? compounds : compounds.slice(0, at);
      const under = holders.flatMap((compound) => heldBy(compound, ancestors));
      return [{ written, safe: under.length > 0, under }];
    });
}

const shippedBareInputs = (ancestors = BARE_INPUT_ANCESTORS) =>
  everyStylesheet().flatMap(([file, css]) => bareInputSelectors(file, css, ancestors));

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);

describe('the module sheet and every component style against the published Stepper', () => {
  it('names a part of the stepper outside its own file in nine selectors, none of which a published stepper takes', () => {
    const census = stepperSelectors(everyStylesheet());
    assert.deepEqual(writtenOf(census), [...STEPPER_SELECTORS].sort(byName));
    assert.deepEqual(
      writtenOf(reachingOf(census)),
      [],
      'each is a :not() or under a pinned ancestor'
    );
    for (const name of STEPPER_ANCESTORS) {
      const narrowed = new Set([...STEPPER_ANCESTORS].filter((other) => other !== name));
      assert.ok(
        reachingOf(stepperSelectors(everyStylesheet(), narrowed)).length > 0,
        `${name} keeps a selector off a published stepper`
      );
    }
  });

  it('reaches a published number field through the seven module rules a bare input takes, and no other', () => {
    const census = shippedBareInputs();
    assert.deepEqual(writtenOf(reachingOf(census)), [...BARE_INPUT_RULES].sort(byName));
    const inPartials = census.filter(({ written }) => written.startsWith('styles/')).length;
    assert.ok(inPartials >= 100, `the partials were read: ${inPartials} bare input selectors`);
    const live = new Set(census.flatMap(({ under }) => under));
    assert.deepEqual(
      [...BARE_INPUT_ANCESTORS].filter((name) => !live.has(name)),
      [],
      'each pinned ancestor keeps at least one selector off a published stepper'
    );
  });

  it('publishes no key that would reopen either census', () => {
    assert.deepEqual(
      [Object.keys(entryNamed('Stepper').props), gatedRoot(entryNamed('Stepper'))],
      [
        [
          'value',
          'min',
          'max',
          'step',
          'ariaLabel',
          'decrementLabel',
          'incrementLabel',
          'onChange',
        ],
        'fabricate',
      ],
      'a published disabled, placeholder, orientation, density, fill, attribute or wider root reopens them'
    );
  });
});

describe('the stepper census, synthetic', () => {
  const sheet = (css) => [['sheet.css', templateOf('sheet.css', `<style>${css}</style>`).ast.css]];
  const reachingIn = (css) => writtenOf(reachingOf(stepperSelectors(sheet(css))));
  const inputsIn = (css) =>
    writtenOf(reachingOf(bareInputSelectors('sheet.css', sheet(css)[0][1], new Set(['host-row']))));

  for (const selector of [
    '.a input:not(.fab-stepper-input)',
    '.manager-task-dc-row .fab-stepper',
    '.x [data-salvage-dc-override] .fab-stepper-adjunct',
  ]) {
    it(`admits ${selector}, which a published stepper cannot take`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate .fab-stepper',
    '.fab-stepper-adjunct',
    '[data-stepper-input]',
    '.a:has(.fab-stepper)',
    '.fab-stepper .manager-task-dc-row',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published stepper`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }

  for (const selector of [
    '.a input[type="text"]',
    '.a input:not([type])',
    '.a input:disabled',
    '.a input[data-recipe-field]',
    '.host-row input',
    '.host-row :is(input, textarea)',
    '.a input.manager-name',
    '.a input[type~="text"]',
    '.a input:not([type], .b)',
    '.a input:not(.fab-stepper-input)',
  ]) {
    it(`admits the bare input rule ${selector}`, () => {
      assert.deepEqual(inputsIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.a input',
    '.a input[type="number"]',
    '.a input:is([type="text"], [type="number"])',
    '.a :is(input, textarea)',
    '.a input.fab-stepper-input',
    // A type matcher that names part of a value, or the value in another case, may take `number`.
    '.a input[type^="num"]',
    '.a input[type$="ber"]',
    '.a input[type*="umb"]',
    '.a input[type|="number"]',
    '.a input[type="NUMBER"]',
    // A `:not()` whose alternative is compound or complex excludes the field only in some states or places.
    '.a input:not([type]:hover)',
    '.a input:not(.b [type])',
    '.a input:not(.fab-stepper-input:focus)',
    '.a input:not(.b .fab-stepper-input)',
  ]) {
    it(`refuses the bare input rule ${selector}`, () => {
      assert.deepEqual(inputsIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});
