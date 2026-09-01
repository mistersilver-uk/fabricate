/**
 * The system Tool Rules inspector, mounted (issue 1373, epic 1357).
 *
 * ## What this suite is FOR
 *
 * The design's panel ends in two actions and ours had neither:
 *
 *  - a full-width `Edit the world Tool`, which leaves this system entirely - identity, art,
 *    description and the world defaults are authored once, in the world catalogue;
 *  - `Add {tool} to {system}` pinned to the foot, for a world Tool this system has no rules
 *    record for.
 *
 * Both were reported blocked on the same two facts never reaching the component: the crafting
 * system's NAME, and whether the selected Tool is a MEMBER. The second is the sharper one - the
 * panel used to be fed this system's own library row alone, so for an unadopted Tool there was
 * nothing to render at all, which is exactly the state the second button exists to answer.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { TOOL_TREE_COMPILED_MODULES, TOOL_TREE_RAW_MODULES } from '../helpers/toolMountModules.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tool-browser-inspector-',
  componentPath: 'src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte',
  // The panel is fed a system's own library row, so it needs the Tool model closure and
  // nothing of the world scope stack the two catalogue screens project through.
  rawModules: [...TOOL_TREE_RAW_MODULES],
  compiledModules: [
    ...TOOL_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte',
  ],
});

const MEMBER_TOOL = {
  id: 'pick',
  label: 'Mining Pick',
  enabled: true,
  componentId: 'c1',
  requirement: null,
  breakage: { mode: 'breakageChance', breakageChance: 8 },
  onBreak: { mode: 'destroy' },
};

/** The world entry shape `worldScopeProjection` publishes, for the unadopted branch. */
const UNADOPTED = {
  id: 'pick',
  entity: { id: 'pick', name: 'Mining Pick', img: 'icons/tools/pick.webp', description: 'A pick.' },
  defaults: { id: 'pick', breakage: { mode: 'breakageChance', breakageChance: 8 } },
};

describe('the system Tool Rules inspector (issue 1373)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('gives an ADOPTED Tool both routes: its own rules, and the world record behind them', async () => {
    const edits = [];
    const worldEdits = [];
    const target = await harness.mount({
      tool: MEMBER_TOOL,
      managedItems: [{ id: 'c1', name: 'Iron Ore' }],
      systemName: 'Mythwright Forge',
      onEdit: (id) => edits.push(id),
      onEditWorldTool: (id) => worldEdits.push(id),
    });

    target.querySelector('[data-tool-inspector-edit="pick"]').click();
    assert.deepEqual(edits, ['pick'], 'the rules route is unchanged');

    const world = target.querySelector('[data-tool-inspector-edit-world="pick"]');
    assert.ok(Boolean(world), 'and the world record is now reachable from the panel');
    world.click();
    assert.deepEqual(worldEdits, ['pick']);

    assert.ok(
      !target.querySelector('[data-tool-inspector-add]'),
      'a Tool this system already has cannot be added to it'
    );
    assert.equal(
      target.querySelector('[data-tool-browser-inspector]').dataset.toolInspectorMembership,
      'member'
    );
  });

  it('describes an UNADOPTED world Tool instead of going empty, and offers the adoption', async () => {
    const adds = [];
    const worldEdits = [];
    const target = await harness.mount({
      tool: null,
      unadopted: UNADOPTED,
      systemName: 'Mythwright Forge',
      onAddToSystem: (id) => adds.push(id),
      onEditWorldTool: (id) => worldEdits.push(id),
    });

    const panel = target.querySelector('[data-tool-browser-inspector]');
    assert.ok(Boolean(panel), 'the panel renders for a Tool with no rules record here');
    assert.equal(panel.dataset.toolInspectorMembership, 'absent');
    assert.match(panel.textContent, /Mining Pick/);
    assert.match(
      panel.querySelector('[data-tool-inspector-description]').textContent,
      /A pick\./,
      'identity comes from the WORLD record, which is the only place it exists'
    );

    // THE PILL STATES MEMBERSHIP, NOT AN ENABLED FLAG. `Enabled here` over a Tool with no rules
    // record would claim rules that do not exist.
    assert.ok(Boolean(panel.querySelector('[data-tool-inspector-no-rules]')));
    assert.match(panel.querySelector('[data-tool-inspector-no-rules]').textContent, /No rules here/);

    // The button NAMES BOTH HALVES, which is exactly what it could not do before the system
    // name reached this component.
    const add = panel.querySelector('[data-tool-inspector-add="pick"]');
    assert.ok(Boolean(add));
    assert.match(add.textContent, /Add Mining Pick to Mythwright Forge/);
    add.click();
    assert.deepEqual(adds, ['pick']);

    panel.querySelector('[data-tool-inspector-edit-world="pick"]').click();
    assert.deepEqual(worldEdits, ['pick']);

    assert.ok(
      !panel.querySelector('[data-tool-inspector-edit]'),
      'there are no rules to edit yet, so the rules route is withheld rather than dead'
    );
  });

  it('states what an UNADOPTED Tool WOULD inherit, under a heading that says so', async () => {
    const target = await harness.mount({ tool: null, unadopted: UNADOPTED, systemName: 'Forge' });
    const panel = target.querySelector('[data-tool-browser-inspector]');
    // The cards are the WORLD defaults, and the kicker qualifies them. Stating "Effective rules
    // here" over a system with no record would be a claim about rules that do not exist; stating
    // nothing would leave a GM deciding whether to adopt with no idea what they would get.
    assert.match(panel.textContent, /What it would inherit here/);
    assert.match(
      panel.querySelector('[data-tool-inspector-rule="breakage"]').textContent,
      /8% break/
    );
  });

  it('still renders the no-selection state when there is neither a record nor a world Tool', async () => {
    const target = await harness.mount({ tool: null, unadopted: null, systemName: 'Forge' });
    assert.ok(!target.querySelector('[data-tool-browser-inspector]'));
    assert.ok(Boolean(target.querySelector('[data-tool-browser-inspector-empty]')));
  });
});
