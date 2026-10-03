/**
 * The shared-primitive API convention gate (issue 1507): a fixed rule at zero over prop names,
 * and one ratchet clause over the spreads a caller writes onto a primitive's tag.
 * `openspec/specs/design-system/spec.md`'s "Shared primitives share one API convention" binds it,
 * and the convention's wording is the five-rules block of the library beside that spec.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CALLER_SPREAD,
  COMPONENTS_DIR,
  REST,
  applyRegister,
  bannedKeys,
  callerReport,
  callerSpreadSites,
  declarationViolations,
  readDeclaration,
  templateOf,
} from './helpers/apiConvention.js';
import { byCodePoint } from './helpers/codePointOrder.js';
import {
  MODULE_CORPUS,
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  gateOver,
  templatesOf,
  workingTree,
} from './helpers/designSystemRatchet.js';
import { parseModule } from './helpers/moduleAst.js';
import { moduleAstOf } from './helpers/parsedSource.js';
import { repoRoot } from './helpers/sourceScan.js';
import { UI_TEMPLATE_ROOT } from './helpers/svelteTemplateScan.js';

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

const CALLER = 'src/ui/svelte/apps/Caller.svelte';

/** A synthetic caller's source: `tag` under an import of the primitive `name`. */
const callerOf = (tag, name = 'Synthetic', specifier = name) =>
  `<script>\n  import ${specifier} from '../components/${name}.svelte';\n</script>\n\n${tag}\n`;

/** What a synthetic caller of the primitive `name` is faulted for, `declared` being its source. */
function callerFaults(tag, declared = primitive(`ariaLabel = '', ${WITH_REST}`), name = '') {
  const file = name ? `${COMPONENTS_DIR}/${name}.svelte` : SYNTHETIC;
  const declaration = readDeclaration(templateOf(file, declared));
  const report = callerReport(
    templateOf(CALLER, callerOf(tag, declaration.component)),
    new Map([[declaration.component, declaration]])
  );
  return { ...report, faults: report.violations.map(({ fault }) => fault) };
}

const NO_CLASS = 'declares a rest spread and no `class` prop';
const REGISTER_ONLY = 'is allowed only through the register';
const suffixed = (suffix) => `ends in the banned suffix \`${suffix}\``;

/**
 * Every name a primitive declares outside the convention, with why it stays. An entry excuses
 * the one `fault` it names; one that excuses nothing fails the gate.
 */
const EXCEPTIONS = Object.freeze([
  {
    component: 'ArmedDangerButton',
    name: 'idleAriaLabel',
    fault: suffixed('AriaLabel'),
    reason: 'the idle face has a visible label and a consequence sentence, so the part needs both',
  },
  {
    component: 'ArmedDangerButton',
    name: 'armedAriaLabel',
    fault: suffixed('AriaLabel'),
    reason: 'the armed face has a visible label and a consequence sentence, so the part needs both',
  },
  {
    component: 'ChoiceOptionList',
    name: 'onChoose',
    fault: REGISTER_ONLY,
    reason: 'a requirement chooser, the one family the convention gives `onChoose`',
  },
  {
    component: 'SlotRow',
    name: 'onChoose',
    fault: REGISTER_ONLY,
    reason: 'a requirement chooser, the one family the convention gives `onChoose`',
  },
  {
    component: 'EmptyState',
    name: 'compact',
    fault: REGISTER_ONLY,
    reason:
      'a density-shaped flag whose values and geometry are the library’s planned-migrations ' +
      'row "Empty variant geometry"',
  },
  {
    component: 'ItemDropZone',
    name: 'compact',
    fault: REGISTER_ONLY,
    reason: 'a variant flag: it suppresses the identity block and the actions outright',
  },
  {
    component: 'EditorValidationSurface',
    name: 'hookAttrs',
    fault: suffixed('Attrs'),
    reason: 'a bag keyed by a closed region set, so no single `<part>Props` names it',
  },
  {
    component: 'EditorValidationSurface',
    name: 'countAttrs',
    fault: suffixed('Attrs'),
    reason: 'a bag keyed by count kind, so no single `<part>Props` names it',
  },
  {
    component: 'ItemDropZone',
    name: 'hookAttrs',
    fault: suffixed('Attrs'),
    reason: 'a bag keyed by a closed region set, so no single `<part>Props` names it',
  },
  {
    component: 'SortableList',
    name: 'rowData',
    fault: suffixed('Data'),
    reason: 'a function returning one row’s attributes, where `<part>Props` names a fixed object',
  },
  {
    component: 'SortableList',
    name: 'removeData',
    fault: suffixed('Data'),
    reason: 'a function returning one row’s attributes, where `<part>Props` names a fixed object',
  },
  {
    component: 'SearchablePopoverPanel',
    name: 'dialogNameAttribute',
    fault: suffixed('Attribute'),
    reason: 'an internal part with one caller, handed the name its parent already derived',
  },
  {
    component: 'EditorTabs',
    name: REST,
    fault: NO_CLASS,
    reason: 'the root class prop is `containerClass`, which nine converged sites already pass',
  },
  {
    component: 'EmptyState',
    name: REST,
    fault: NO_CLASS,
    reason: 'the root class prop is `contextClass`, which its callers already pass',
  },
  {
    component: 'Kicker',
    name: REST,
    fault: NO_CLASS,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'StatBox',
    name: REST,
    fault: NO_CLASS,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'Notice',
    name: REST,
    fault: NO_CLASS,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'SelectionCheckbox',
    name: REST,
    fault: NO_CLASS,
    reason: 'rest lands on the input a caller clicks and a test drives, and it takes no `class`',
  },
  {
    component: 'StatusToggle',
    name: REST,
    fault: 'spreads its rest on <input>, which is not the root',
    reason: 'rest lands on the host’s interactive element, which on the checkbox host is the input',
  },
  {
    component: 'Select',
    name: REST,
    fault: 'declares a rest spread it writes on no element',
    reason:
      'rest reaches the `<Field>` root in the labelled form only; the bare root is the picker’s',
  },
]);

/**
 * Retired keys a module or template still writes for a component outside `components/`, which the
 * convention does not bind. Each is held at its count, so a new one cannot hide behind the entry.
 */
const KEY_EXCEPTIONS = Object.freeze([
  {
    file: 'src/ui/svelte/apps/manager/scoped/componentScoped.js',
    name: 'hookAttribute',
    count: 2,
    reason: 'a fact-group model read by `ScopedEntityPreview`, which names the group it hooks',
  },
  {
    file: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
    name: 'hookAttribute',
    count: 2,
    reason: 'a fact-group model read by `ScopedEntityPreview`, which names the group it hooks',
  },
  {
    file: 'src/ui/svelte/apps/manager/tools/ToolBehaviorPreview.svelte',
    name: 'hookAttribute',
    count: 1,
    reason: 'the identity model `ScopedEntityPreview` reads, which names the block it hooks',
  },
  {
    file: 'src/ui/svelte/apps/manager/GrantAccessInspector.svelte',
    name: 'dataAttr',
    count: 2,
    reason: 'a section model whose row hook the inspector hands its own row component',
  },
]);

/** One site per spread a caller writes onto a primitive's tag, compared with the base commit. */
const SPREAD_GATE = gateOver([TEMPLATE_CORPUS], (readFile, files) =>
  templatesOf(readFile, files).flatMap(callerSpreadSites)
);

/** Every UI template the working tree holds, parsed. */
function templates() {
  const tree = workingTree(TEMPLATE_CORPUS);
  return templatesOf(tree.readFile, tree.listFiles());
}

function declarations() {
  const read = templates()
    .filter(({ file }) => path.posix.dirname(file) === COMPONENTS_DIR)
    .map((template) => readDeclaration(template));
  return new Map(read.map((declaration) => [declaration.component, declaration]));
}

describe('the shared primitives and their callers follow the API convention', () => {
  it('reads every component in the directory, and the directory is not empty', () => {
    const entries = readdirSync(path.join(repoRoot, COMPONENTS_DIR), { withFileTypes: true });
    assert.deepEqual(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
      [],
      `${COMPONENTS_DIR} holds a subdirectory, whose components the gate would not read`
    );
    const listed = entries
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.svelte'))
      .map((name) => path.basename(name, '.svelte'))
      .sort(byCodePoint);
    assert.ok(listed.length > 0, `${COMPONENTS_DIR} lists no component`);
    assert.deepEqual([...declarations().keys()].sort(byCodePoint), listed);
  });

  it('no primitive declares a name outside the convention or the register', () => {
    const violations = [...declarations().values()].flatMap(declarationViolations);
    const { unexcused, stale, unreasoned } = applyRegister(violations, EXCEPTIONS);
    assert.deepEqual(
      unexcused.map(({ component, name, fault }) => `${component}: ${name} ${fault}`),
      [],
      'rename the prop to the convention the library publishes, or carry it in EXCEPTIONS with ' +
        'its reason'
    );
    assert.deepEqual(stale, [], 'an EXCEPTIONS entry excuses nothing; delete it');
    assert.deepEqual(unreasoned, [], 'an EXCEPTIONS entry states no reason');
  });

  it('no caller passes a primitive a name it does not take', () => {
    const declared = declarations();
    const violations = [];
    let tags = 0;
    for (const template of templates()) {
      const report = callerReport(template, declared);
      violations.push(...report.violations);
      tags += report.tags;
    }
    assertFloor('primitive tags', tags, 1000);
    assert.deepEqual(
      violations.map(
        ({ file, line, component, fault }) => `${file}:${line} <${component}> ${fault}`
      ),
      [],
      'a primitive drops a prop it does not declare, or renders it as an attribute through its ' +
        'rest spread; pass the declared name'
    );
  });

  it('no caller writes a new spread onto a primitive tag', (t) => {
    checkGate(
      t,
      SPREAD_GATE,
      'A spread onto a primitive tag can carry any name past this gate. Pass the names as ' +
        'attributes, or check what the spread carries and say so in the marker above the tag.'
    );
  });

  it('no props object in a UI module or template carries a retired key', () => {
    const modules = workingTree(MODULE_CORPUS)
      .listFiles()
      .filter((file) => file.startsWith(`${UI_TEMPLATE_ROOT}/`));
    assertFloor('UI modules', modules.length, 100);
    const found = [
      ...modules.flatMap((file) => bannedKeys(file, moduleAstOf(file).ast)),
      ...templates().flatMap(({ file, ast }) => bannedKeys(file, ast)),
    ];
    const counted = {};
    for (const { file, name } of found) {
      counted[`${file} ${name}`] = (counted[`${file} ${name}`] ?? 0) + 1;
    }
    const pinned = Object.fromEntries(
      KEY_EXCEPTIONS.map(({ file, name, count }) => [`${file} ${name}`, count])
    );
    assert.deepEqual(counted, pinned, 'a props object writes a retired key; see BANNED_NAMES');
    assert.deepEqual(
      KEY_EXCEPTIONS.filter(({ reason }) => reason.trim().length < 20),
      []
    );
  });
});

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
    const earned = { component: 'Synthetic', name: 'compact', fault: 'x', reason };
    assert.deepEqual(applyRegister(violations, [earned]), {
      unexcused: [],
      stale: [],
      unreasoned: [],
    });
    const stale = { component: 'Synthetic', name: 'onChoose', fault: 'x', reason };
    assert.deepEqual(applyRegister(violations, [earned, stale]).stale, [stale]);
    const bare = { component: 'Synthetic', name: 'compact', fault: 'x', reason: '' };
    assert.deepEqual(applyRegister(violations, [bare]).unreasoned, [bare]);
  });

  it('a register entry naming another fault of the same prop', () => {
    const reason = 'takes no `class` by design: rest is for a hook';
    const violations = [
      { component: 'Synthetic', name: REST, fault: NO_CLASS },
      { component: 'Synthetic', name: REST, fault: 'spreads its rest before `class`' },
    ];
    const entry = { component: 'Synthetic', name: REST, fault: NO_CLASS, reason };
    assert.deepEqual(applyRegister(violations, [entry]), {
      unexcused: [violations[1]],
      stale: [],
      unreasoned: [],
    });
    const other = { ...entry, fault: 'declares a rest spread it writes on no element' };
    assert.deepEqual(applyRegister(violations, [other]), {
      unexcused: violations,
      stale: [other],
      unreasoned: [],
    });
  });

  it('a caller passing `dataAttr` to a rest-spreading primitive', () => {
    assert.deepEqual(callerFaults('<Synthetic dataAttr="data-x" />').faults, [
      '`dataAttr`, a retired spelling',
    ]);
  });

  it('a caller passing a misspelled `ariaLable`', () => {
    assert.deepEqual(callerFaults('<Synthetic ariaLable="Name" />').faults, [
      '`ariaLable`, which the primitive does not declare',
    ]);
  });

  it('a caller passing `class`, a hook or content the primitive does not take', () => {
    const closed = primitive("ariaLabel = ''", '<div aria-label={ariaLabel}></div>');
    assert.deepEqual(
      callerFaults('<Synthetic class="x" data-x="">text</Synthetic>', closed).faults,
      [
        '`class`, which the primitive does not declare',
        '`data-x`, which the primitive does not declare',
        '`children` content, which the primitive does not declare',
      ]
    );
  });

  it('a caller handing a hook-only primitive anything but a `data-*` hook', () => {
    const hookOnly = primitive('...rest', '<div {...rest}></div>');
    const tag = (name) => `<${name} data-x="" role="none" style="margin: 0" onclick={() => {}} />`;
    assert.deepEqual(callerFaults(tag('Notice'), hookOnly, 'Notice').faults, [
      '`role`, which the primitive does not declare',
      '`style`, which the primitive does not declare',
      '`onclick`, which the primitive does not declare',
    ]);
    assert.deepEqual(callerFaults(tag('Synthetic'), hookOnly).faults, []);
  });

  it('a caller naming a primitive through rest where it declares the prop', () => {
    const tag = '<Synthetic aria-label="Name" aria-labelledby="a" aria-describedby="b" />';
    assert.deepEqual(callerFaults(tag).faults, [
      '`aria-label`, which the primitive takes as `ariaLabel`',
    ]);
    const all = primitive(`ariaLabelledBy = '', ariaDescribedBy = '', ${WITH_REST}`);
    assert.deepEqual(callerFaults(tag, all).faults, [
      '`aria-labelledby`, which the primitive takes as `ariaLabelledBy`',
      '`aria-describedby`, which the primitive takes as `ariaDescribedBy`',
    ]);
  });

  it('a primitive imported by any form but its default', () => {
    const declaration = readDeclaration(templateOf(SYNTHETIC, primitive("label = ''", '<p></p>')));
    const declared = new Map([[declaration.component, declaration]]);
    for (const specifier of ['{ default as Synthetic }', '* as Synthetic', 'Synthetic, { x }']) {
      const caller = templateOf(CALLER, callerOf('<Synthetic />', 'Synthetic', specifier));
      assert.throws(() => callerReport(caller, declared), /by a form other than its default/u);
      assert.throws(() => callerSpreadSites(caller), /by a form other than its default/u);
    }
  });

  it('passes a caller that hands rest a hook, an ARIA attribute and a lowercase handler', () => {
    const report = callerFaults(
      '<Synthetic ariaLabel="Name" data-x="" aria-busy="true" title="t" onclick={() => {}} {...{}} />'
    );
    assert.deepEqual(report, { violations: [], faults: [], tags: 1 });
  });

  it('a caller spread the base does not hold, unless a reasoned marker sits above its tag', (t) => {
    const marker = '<!-- ratchet-exempt(design-system): the spread carries one `data-*` hook -->';
    const caller = (...tags) => callerOf(tags.join('\n'));
    const base = { [CALLER]: caller('<Synthetic {...a} />'), 'README.md': 'unrelated\n' };
    const added = 'src/ui/svelte/apps/Added.svelte';
    assertGateCases(t, SPREAD_GATE, base, [
      {
        head: { [CALLER]: caller('<Synthetic {...a} />', '<Synthetic {...b} />') },
        failures: [`${CALLER}: ${CALLER_SPREAD} rose from 1 to 2`],
      },
      {
        head: { [added]: caller('<Synthetic {...a} />') },
        failures: [`${added}: ${CALLER_SPREAD} is new (1)`],
      },
      {
        head: { [CALLER]: caller('<Synthetic {...a} />', marker, '<Synthetic {...b} />') },
        failures: [],
      },
      {
        head: { [CALLER]: caller(marker, '<Synthetic {...a} />', '<Synthetic {...b} />') },
        failures: [`${CALLER}: ${CALLER_SPREAD} rose from 1 to 2`],
      },
      { head: { [CALLER]: caller('<Synthetic a={a} />') }, failures: [] },
      { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
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

  it('a retired key in a template’s object literal, in its script or its markup', () => {
    const source =
      "<script>\n  const hooks = { dataAttr: 'data-x' };\n</script>\n\n" +
      "<div {...{ ...hooks, testId: 'y' }}></div>\n";
    assert.deepEqual(bannedKeys(CALLER, templateOf(CALLER, source).ast), [
      { file: CALLER, line: 5, name: 'testId' },
      { file: CALLER, line: 2, name: 'dataAttr' },
    ]);
  });
});
