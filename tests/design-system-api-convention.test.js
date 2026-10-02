/**
 * The shared-primitive API convention gate (issue 1507): a fixed rule at zero over prop names.
 * `openspec/specs/design-system/spec.md`'s "Shared primitives share one API convention" binds it,
 * and the convention's wording is the five-rules block of the library beside that spec.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  REST,
  applyRegister,
  bannedKeys,
  callerReport,
  declarationViolations,
  readDeclaration,
  spreadDrift,
  templateOf,
} from './helpers/apiConvention.js';
import { parseModule } from './helpers/moduleAst.js';

const SYNTHETIC = 'src/ui/svelte/components/Synthetic.svelte';

const CONFORMING_ROOT = '<div class={extraClass} {...rest}></div>';

/** A synthetic primitive declaring `props`, for a control that must not depend on the tree. */
const primitive = (props, markup = CONFORMING_ROOT) =>
  `<script>\n  let { ${props} } = $props();\n</script>\n\n${markup}\n`;

const WITH_REST = "class: extraClass = '', ...rest";

function faultsOf(source, file = SYNTHETIC) {
  return declarationViolations(readDeclaration(templateOf(file, source))).map(
    ({ name, fault }) => `${name} ${fault}`
  );
}

/** A synthetic caller of `Synthetic`, whose declaration is read from `declared`. */
function callerFaults(tag, declared = primitive(`ariaLabel = '', ${WITH_REST}`)) {
  const declaration = readDeclaration(templateOf(SYNTHETIC, declared));
  const caller =
    `<script>\n  import Synthetic from '../components/Synthetic.svelte';\n</script>\n\n` + tag;
  return callerReport(
    templateOf('src/ui/svelte/apps/Caller.svelte', caller),
    new Map([[declaration.component, declaration]])
  );
}

describe('the convention gate fails on each thing it rules out', () => {
  it('passes a primitive that follows every rule, so the controls below are not vacuous', () => {
    const source = primitive(
      `ariaLabel = '', iconDataAttr = '', inputProps = {}, ${WITH_REST}`,
      '<div class={extraClass} aria-label={ariaLabel || undefined} {...rest}></div>'
    );
    assert.deepEqual(faultsOf(source), []);
  });

  it('a retired spelling', () => {
    assert.deepEqual(faultsOf(primitive(`dataValue = '', ${WITH_REST}`)), [
      'dataValue is a retired spelling',
    ]);
  });

  it('a spelling retired on one primitive only', () => {
    const declares = primitive("label = ''", '<div></div>');
    assert.deepEqual(faultsOf(declares), []);
    assert.deepEqual(faultsOf(declares, 'src/ui/svelte/components/Pagination.svelte'), [
      'label is retired on this primitive',
    ]);
  });

  it('a name the register alone admits', () => {
    assert.deepEqual(faultsOf(primitive('compact = false', '<div></div>')), [
      'compact is allowed only through the register',
    ]);
  });

  for (const suffix of ['Attr', 'Attrs', 'Attribute', 'Attributes', 'Data', 'AriaLabel']) {
    it(`a name ending in ${suffix}`, () => {
      assert.deepEqual(faultsOf(primitive(`icon${suffix} = ''`, '<div></div>')), [
        `icon${suffix} ends in the banned suffix \`${suffix}\``,
      ]);
    });
  }

  it('a rest spread with no `class` prop', () => {
    assert.deepEqual(faultsOf(primitive('...rest', '<div {...rest}></div>')), [
      `${REST} declares a rest spread and no \`class\` prop`,
    ]);
  });

  it('a rest spread written before `class`, off the root, or nowhere', () => {
    const cases = [
      ['<div {...rest} class={extraClass}></div>', 'spreads its rest before `class`'],
      [
        '<div class={extraClass}><input {...rest} /></div>',
        'spreads its rest on <input>, which is not the root',
      ],
      ['<div class={extraClass}></div>', 'declares a rest spread it writes on no element'],
    ];
    for (const [markup, fault] of cases) {
      assert.deepEqual(faultsOf(primitive(WITH_REST, markup)), [`${REST} ${fault}`]);
    }
  });

  it('a rest spread on either branch of a root `{#if}` counts as on the root', () => {
    const markup =
      '{#if extraClass}<p class={extraClass} {...rest}></p>{:else}' + CONFORMING_ROOT + '{/if}';
    assert.deepEqual(faultsOf(primitive(WITH_REST, markup)), []);
  });

  it('an `ariaLabel` that reaches no `aria-label`', () => {
    assert.deepEqual(faultsOf(primitive("ariaLabel = ''", '<div></div>')), [
      'ariaLabel never reaches an `aria-label`',
    ]);
    const derived =
      "<script>\n  let { ariaLabel = '' } = $props();\n  const name = $derived(ariaLabel || 'x');\n" +
      "  const attributes = $derived({ 'aria-label': name });\n</script>\n\n<div {...attributes}></div>\n";
    assert.deepEqual(faultsOf(derived), []);
  });

  it('a component the parser cannot read, or one that names no prop', () => {
    assert.throws(
      () => templateOf(SYNTHETIC, '<script>\n  let { = $props();\n</script>'),
      /Synthetic\.svelte failed to parse/u
    );
    assert.throws(
      () => readDeclaration(templateOf(SYNTHETIC, '<script>\n  let props = $props();\n</script>')),
      /without destructuring/u
    );
    assert.throws(
      () => readDeclaration(templateOf(SYNTHETIC, '<div></div>')),
      /declares no `\$props\(\)`/u
    );
  });

  it('a register entry that excuses nothing, and one with no reason', () => {
    const reason = 'a variant flag: it changes what renders';
    const violations = [{ component: 'Synthetic', name: 'compact', fault: 'x' }];
    const earned = { component: 'Synthetic', name: 'compact', reason };
    assert.deepEqual(applyRegister(violations, [earned]), {
      unexcused: [],
      stale: [],
      unreasoned: [],
    });
    const stale = { component: 'Synthetic', name: 'onChoose', reason };
    assert.deepEqual(applyRegister(violations, [earned, stale]).stale, [stale]);
    const bare = { component: 'Synthetic', name: 'compact', reason: '' };
    assert.deepEqual(applyRegister(violations, [bare]).unreasoned, [bare]);
  });

  it('a caller passing `dataAttr` to a rest-spreading primitive', () => {
    const { violations } = callerFaults('<Synthetic dataAttr="data-x" />');
    assert.deepEqual(
      violations.map(({ fault }) => fault),
      ['`dataAttr`, a retired spelling']
    );
  });

  it('a caller passing a misspelled `ariaLable`', () => {
    const { violations } = callerFaults('<Synthetic ariaLable="Name" />');
    assert.deepEqual(
      violations.map(({ fault }) => fault),
      ['`ariaLable`, which the primitive does not declare']
    );
  });

  it('a caller passing `class`, a hook or content the primitive does not take', () => {
    const closed = primitive("ariaLabel = ''", '<div aria-label={ariaLabel}></div>');
    assert.deepEqual(
      callerFaults('<Synthetic class="x" data-x="">text</Synthetic>', closed).violations.map(
        ({ fault }) => fault
      ),
      [
        '`class`, which the primitive does not declare',
        '`data-x`, which the primitive does not declare',
        '`children` content, which the primitive does not declare',
      ]
    );
  });

  it('passes a caller that hands rest a hook, an ARIA attribute and a lowercase handler', () => {
    const report = callerFaults(
      '<Synthetic ariaLabel="Name" data-x="" aria-busy="true" title="t" onclick={() => {}} {...{}} />'
    );
    assert.deepEqual(report, { violations: [], spreads: 1, tags: 1 });
  });

  it('a caller spread the pinned counts do not hold, and a pin nothing earns', () => {
    assert.deepEqual(spreadDrift({ 'a.svelte': 2 }, { 'a.svelte': 1, 'b.svelte': 1 }), [
      'a.svelte: 2 spread(s), pinned at 1',
      'b.svelte: 0 spread(s), pinned at 1',
    ]);
  });

  it('a retired key in a props object', () => {
    const source = "export const notice = { tone: 'info', stateDataAttr: 'data-x' };\n";
    assert.deepEqual(bannedKeys('src/ui/svelte/apps/model.js', parseModule(source).ast), [
      { file: 'src/ui/svelte/apps/model.js', line: 1, name: 'stateDataAttr' },
    ]);
    const destructured = parseModule('export const { dataAttr } = hooks;\n').ast;
    assert.deepEqual(bannedKeys('model.js', destructured), []);
  });
});
