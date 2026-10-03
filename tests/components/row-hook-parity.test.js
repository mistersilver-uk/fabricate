/**
 * The three fact and complication rows' caller hooks (issue 1521): every site keeps the attribute
 * and the rendered value it had while the rows took `dataAttr`/`dataValue`, and each row lands a
 * caller's hook on its root.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { parse } from 'svelte/compiler';

import { byCodePoint } from '../helpers/codePointOrder.js';
import { collectSources } from '../helpers/sourceScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const MANAGER = 'src/ui/svelte/apps/manager';
const ICON_FACT_ROW = `${MANAGER}/IconFactRow.svelte`;
const EFFECT_ROW = `${MANAGER}/ComplicationEffectRow.svelte`;
const SUMMARY_ROW = `${MANAGER}/ComplicationSummaryRow.svelte`;

/** The rows whose `dataAttr`/`dataValue` retired; `ComplicationSummaryRow` keeps them until #1516. */
const CONVERTED_ROWS = new Set(['IconFactRow', 'ComplicationEffectRow']);

/**
 * The 15 hooked sites at `9b891d90b`, frozen. `rendered` is what the root's attribute is set from:
 * `true` for a bare hook, a quoted literal, or an expression where `dataValue || true` once stood.
 */
const SITES = Object.freeze([
  [
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    'ComplicationSummaryRow',
    'data-progressive-stage-complication',
    'lead.id || true',
  ],
  [
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkComplicationGroup.svelte',
    'ComplicationSummaryRow',
    'data-inventory-bulk-complication',
    'row.id || true',
  ],
  [
    `${MANAGER}/ComponentEditView.svelte`,
    'ComplicationSummaryRow',
    'data-salvage-stage-complication',
    'complication.id || true',
  ],
  [
    `${MANAGER}/checks/CheckOutcomePreview.svelte`,
    'IconFactRow',
    'data-checks-simulator-fact',
    'row.id || true',
  ],
  [
    `${MANAGER}/checks/SimpleCraftingCheckEditor.svelte`,
    'IconFactRow',
    'data-simple-outcome',
    '"success"',
  ],
  [
    `${MANAGER}/checks/SimpleCraftingCheckEditor.svelte`,
    'IconFactRow',
    'data-simple-outcome',
    '"failure"',
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationSummaryRow',
    'data-complication',
    'complication.id || true',
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationEffectRow',
    'data-complication-visibility',
    true,
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationEffectRow',
    'data-complication-condition',
    'condition.key || true',
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationEffectRow',
    'data-complication-condition',
    '"checkTrigger"',
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationEffectRow',
    'data-complication-roll-condition',
    true,
  ],
  [
    `${MANAGER}/component/ComponentComplicationsSection.svelte`,
    'ComplicationEffectRow',
    'data-complication-effect-roll',
    true,
  ],
  [
    `${MANAGER}/recipe/RecipeStageComplicationBand.svelte`,
    'ComplicationSummaryRow',
    'data-recipe-result-complication',
    'complication.id || true',
  ],
  [
    `${MANAGER}/tools/ToolBehaviorPreview.svelte`,
    'IconFactRow',
    'data-tool-preview-usability',
    true,
  ],
  [
    `${MANAGER}/tools/ToolBrowserInspector.svelte`,
    'IconFactRow',
    'data-tool-inspector-rule',
    'fact.id || true',
  ],
]);

const ROWS = new Set(SITES.map(([, row]) => row));

/** Every row tag in a component, as `{ row, attributes }` keyed by attribute name. */
function rowTags(source) {
  const tags = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node.type === 'Component' && ROWS.has(node.name)) {
      tags.push({ row: node.name, attributes: new Map(node.attributes.map((a) => [a.name, a])) });
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'parent') walk(value);
  };
  walk(parse(source, { modern: true }).fragment);
  return tags;
}

/** An attribute value as rendered: `true`, a quoted literal, or the expression's own source. */
function valueOf(attribute, source) {
  if (attribute.value === true) return true;
  const parts = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
  if (parts.length === 1 && parts[0].type === 'Text') return JSON.stringify(parts[0].data);
  if (parts.length === 1 && parts[0].type === 'ExpressionTag') {
    const { start, end } = parts[0].expression;
    return source.slice(start, end).replaceAll(/\s+/g, ' ');
  }
  return `<${parts.length} parts>`;
}

/** A tag's one hook, from either the retired prop pair or a `data-*` attribute it passes. */
function hookOf({ row, attributes }, source) {
  const name = attributes.get('dataAttr');
  if (name) {
    const value = attributes.get('dataValue');
    const literal = value && valueOf(value, source);
    const rendered = value ? (literal.startsWith('"') ? literal : `${literal} || true`) : true;
    return [row, JSON.parse(valueOf(name, source)), rendered];
  }
  const hooks = [...attributes.values()].filter((a) => a.name.startsWith('data-'));
  return hooks.length === 1 ? [row, hooks[0].name, valueOf(hooks[0], source)] : null;
}

describe('row hook parity', () => {
  it('keeps every frozen site at its attribute name and rendered value', () => {
    for (const file of new Set(SITES.map(([path]) => path))) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      const actual = rowTags(source)
        .map((tag) => hookOf(tag, source))
        .filter(Boolean)
        .map((hook) => JSON.stringify(hook));
      const expected = SITES.filter(([path]) => path === file).map(([, ...hook]) =>
        JSON.stringify(hook)
      );
      assert.deepEqual(actual.sort(byCodePoint), expected.sort(byCodePoint), file);
    }
  });

  it('leaves no call site passing dataAttr or dataValue to a converted row', () => {
    const offenders = [];
    let scanned = 0;
    for (const [file, source] of Object.entries(collectSources(`${repoRoot}/src`))) {
      if (!file.endsWith('.svelte')) continue;
      for (const { row, attributes } of rowTags(source)) {
        if (!CONVERTED_ROWS.has(row)) continue;
        scanned += 1;
        for (const name of ['dataAttr', 'dataValue']) {
          if (attributes.has(name)) offenders.push(`${file}: <${row} ${name}>`);
        }
      }
    }
    assert.ok(scanned >= 10, `the scan reached ${scanned} converted-row tags, short of the table`);
    assert.deepEqual(offenders, []);
    const converted = SITES.filter(([, row]) => CONVERTED_ROWS.has(row));
    assert.equal(converted.length, 10, 'the frozen table still names the ten converted sites');
  });
});

/** Mount one row and read the hook back off its root. */
function rowHarness(componentPath, compiledModules) {
  return createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-row-hook-parity-',
    compiledModules: [...compiledModules, componentPath],
    componentPath,
  });
}

const MOUNTED = [
  {
    path: ICON_FACT_ROW,
    root: '.manager-icon-fact-row',
    compiled: ['src/ui/svelte/components/Chip.svelte'],
    props: { icon: 'fas fa-cube', title: 'Title' },
    hook: (name, value) => ({ [name]: value }),
  },
  {
    path: EFFECT_ROW,
    root: '.fab-complication-effect',
    compiled: [
      'src/ui/svelte/components/SelectionCheckbox.svelte',
      'src/ui/svelte/components/StatusToggle.svelte',
    ],
    props: { title: 'Title' },
    hook: (name, value) => ({ [name]: value }),
  },
  {
    path: SUMMARY_ROW,
    root: '.fab-complication-row',
    compiled: [
      'src/ui/svelte/components/Chip.svelte',
      'src/ui/svelte/components/RowDisclosure.svelte',
      'src/ui/svelte/components/IconButton.svelte',
    ],
    props: { name: 'Name', variant: 'readonly-gm' },
    hook: (name, value) =>
      value === true ? { dataAttr: name } : { dataAttr: name, dataValue: value },
  },
];

for (const { path, root, compiled, props, hook } of MOUNTED) {
  describe(`${path.split('/').pop()} lands a caller's hook on its root`, () => {
    const harness = rowHarness(path, compiled);
    before(() => harness.setup());
    after(() => harness.teardown());
    afterEach(() => harness.remount());

    for (const [value, rendered] of [
      [true, 'true'],
      ['id', 'id'],
    ]) {
      it(`renders ${JSON.stringify(value)} as "${rendered}"`, async () => {
        const target = await harness.mount({ ...props, ...hook('data-x', value) });
        const node = target.querySelector('[data-x]');
        assert.ok(Boolean(node), 'the hook renders');
        assert.ok(node.matches(root), `the hook sits on ${root}`);
        assert.equal(node.getAttribute('data-x'), rendered);
      });
    }
  });
}
