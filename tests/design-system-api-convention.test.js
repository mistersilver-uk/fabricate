/**
 * The shared-primitive API convention gate (issue 1507): a fixed rule at zero over prop names.
 * `openspec/specs/design-system/spec.md`'s "Shared primitives share one API convention" binds it,
 * and the convention's wording is the five-rules block of the library beside that spec.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  COMPONENTS_DIR,
  REST,
  applyRegister,
  bannedKeys,
  callerReport,
  declarationViolations,
  readDeclaration,
  spreadDrift,
  templateOf,
} from './helpers/apiConvention.js';
import { byCodePoint } from './helpers/codePointOrder.js';
import {
  MODULE_CORPUS,
  TEMPLATE_CORPUS,
  assertFloor,
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

/**
 * Every name a primitive declares outside the convention, with why it stays. An entry excuses
 * every rule that names its `component` and `name`; one that excuses nothing fails the gate.
 */
const EXCEPTIONS = Object.freeze([
  {
    component: 'ArmedDangerButton',
    name: 'idleAriaLabel',
    reason: 'the idle face has a visible label and a consequence sentence, so the part needs both',
  },
  {
    component: 'ArmedDangerButton',
    name: 'armedAriaLabel',
    reason: 'the armed face has a visible label and a consequence sentence, so the part needs both',
  },
  {
    component: 'ChoiceOptionList',
    name: 'onChoose',
    reason: 'a requirement chooser, the one family the convention gives `onChoose`',
  },
  {
    component: 'SlotRow',
    name: 'onChoose',
    reason: 'a requirement chooser, the one family the convention gives `onChoose`',
  },
  {
    component: 'EmptyState',
    name: 'compact',
    reason: 'a variant flag: it swaps the tile and padding the panel draws, not a spacing scale',
  },
  {
    component: 'ItemDropZone',
    name: 'compact',
    reason: 'a variant flag: it suppresses the identity block and the actions outright',
  },
  {
    component: 'EditorValidationSurface',
    name: 'hookAttrs',
    reason: 'a bag keyed by a closed region set, so no single `<part>Props` names it',
  },
  {
    component: 'EditorValidationSurface',
    name: 'countAttrs',
    reason: 'a bag keyed by count kind, so no single `<part>Props` names it',
  },
  {
    component: 'ItemDropZone',
    name: 'hookAttrs',
    reason: 'a bag keyed by a closed region set, so no single `<part>Props` names it',
  },
  {
    component: 'SortableList',
    name: 'rowData',
    reason: 'a function returning one row’s attributes, where `<part>Props` names a fixed object',
  },
  {
    component: 'SortableList',
    name: 'removeData',
    reason: 'a function returning one row’s attributes, where `<part>Props` names a fixed object',
  },
  {
    component: 'SearchablePopoverPanel',
    name: 'dialogNameAttribute',
    reason: 'an internal part with one caller, handed the name its parent already derived',
  },
  {
    component: 'EditorTabs',
    name: REST,
    reason: 'the root class prop is `containerClass`, which nine converged sites already pass',
  },
  {
    component: 'EmptyState',
    name: REST,
    reason: 'the root class prop is `contextClass`, which its callers already pass',
  },
  {
    component: 'Kicker',
    name: REST,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'StatBox',
    name: REST,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'Notice',
    name: REST,
    reason: 'takes no `class` by design: layout stays on the caller’s wrapper, rest is for a hook',
  },
  {
    component: 'SelectionCheckbox',
    name: REST,
    reason: 'rest lands on the input a caller clicks and a test drives, and it takes no `class`',
  },
  {
    component: 'StatusToggle',
    name: REST,
    reason: 'rest lands on the host’s interactive element, which on the checkbox host is the input',
  },
  {
    component: 'Select',
    name: REST,
    reason:
      'rest reaches the `<Field>` root in the labelled form only; the bare root is the picker’s',
  },
]);

/**
 * Retired keys a module still writes for a component outside `components/`, which the convention
 * does not bind. Each is held at its count, so a new one cannot hide behind the entry.
 */
const KEY_EXCEPTIONS = Object.freeze([
  {
    file: 'src/ui/svelte/apps/manager/scoped/componentScoped.js',
    name: 'hookAttribute',
    count: 2,
    reason: 'a fact-group model read by `ScopedEntityPreview`, which names the group it hooks',
  },
]);

/** How many spreads each template writes onto a primitive's tag, fixed at issue 1507's counts. */
const CALLER_SPREADS = Object.freeze({
  'src/ui/svelte/apps/InteractableConfigRoot.svelte': 1,
  'src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte': 1,
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte': 1,
  'src/ui/svelte/apps/crafting/RollPromptTarget.svelte': 1,
  'src/ui/svelte/apps/crafting/RunSummaryPanel.svelte': 1,
  'src/ui/svelte/apps/crafting/ShoppingList.svelte': 3,
  'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte': 1,
  'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte': 2,
  'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte': 2,
  'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte': 1,
  'src/ui/svelte/apps/crafting/detail/IoTable.svelte': 2,
  'src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte': 1,
  'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte': 1,
  'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte': 1,
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkComplicationGroup.svelte': 1,
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte': 1,
  'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte': 2,
  'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte': 6,
  'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte': 1,
  'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte': 1,
  'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte': 1,
  'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte': 1,
  'src/ui/svelte/apps/inventory/detail/salvage/SalvageToolRequirements.svelte': 1,
  'src/ui/svelte/apps/journal/RunDetail.svelte': 1,
  'src/ui/svelte/apps/manager/BulkDeleteCard.svelte': 1,
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte': 1,
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte': 1,
  'src/ui/svelte/apps/manager/ExplainerCard.svelte': 1,
  'src/ui/svelte/apps/manager/GatheringEconomyView.svelte': 2,
  'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte': 9,
  'src/ui/svelte/apps/manager/checks/CheckCountInputField.svelte': 1,
  'src/ui/svelte/apps/manager/checks/CheckCountPoolFields.svelte': 1,
  'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte': 3,
  'src/ui/svelte/apps/manager/checks/CheckOutcomeRow.svelte': 4,
  'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte': 3,
  'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte': 1,
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte': 1,
  'src/ui/svelte/apps/manager/component/CheckOverrideField.svelte': 3,
  'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte': 1,
  'src/ui/svelte/apps/manager/component/ComponentEditorHeader.svelte': 3,
  'src/ui/svelte/apps/manager/components/EssenceChip.svelte': 1,
  'src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte': 1,
  'src/ui/svelte/apps/manager/environment/CompositionList.svelte': 1,
  'src/ui/svelte/apps/manager/recipe/RecipeModeBanner.svelte': 1,
  'src/ui/svelte/apps/manager/scoped/ScopedEntryHeaderActions.svelte': 2,
  'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte': 2,
  'src/ui/svelte/apps/manager/tools/ToolBreakageTab.svelte': 1,
  'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte': 2,
  'src/ui/svelte/components/ActionMenu.svelte': 1,
  'src/ui/svelte/components/EditorTabs.svelte': 1,
  'src/ui/svelte/components/EditorValidationSurface.svelte': 1,
  'src/ui/svelte/components/ItemDropZone.svelte': 3,
  'src/ui/svelte/components/ModifierPillSelect.svelte': 1,
  'src/ui/svelte/components/RadioCardGroup.svelte': 1,
  'src/ui/svelte/components/SearchablePopover.svelte': 2,
  'src/ui/svelte/components/Select.svelte': 1,
  'src/ui/svelte/components/SortableList.svelte': 1,
  'src/ui/svelte/components/StatBox.svelte': 1,
  'src/ui/svelte/components/ToggleCard.svelte': 1,
});

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
    const listed = readdirSync(path.join(repoRoot, COMPONENTS_DIR))
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

  it('no caller passes a primitive a name it does not take, and spreads stay pinned', () => {
    const declared = declarations();
    const violations = [];
    const spreads = {};
    let tags = 0;
    for (const template of templates()) {
      const report = callerReport(template, declared);
      violations.push(...report.violations);
      tags += report.tags;
      if (report.spreads > 0) spreads[template.file] = report.spreads;
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
    assert.deepEqual(
      spreadDrift(spreads, CALLER_SPREADS),
      [],
      'a spread onto a primitive tag can carry any name past this gate; check what the new one ' +
        'carries, then re-pin CALLER_SPREADS'
    );
  });

  it('no props object under the UI templates carries a retired key', () => {
    const modules = workingTree(MODULE_CORPUS)
      .listFiles()
      .filter((file) => file.startsWith(`${UI_TEMPLATE_ROOT}/`));
    assertFloor('UI modules', modules.length, 100);
    const found = modules.flatMap((file) => bannedKeys(file, moduleAstOf(file).ast));
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
