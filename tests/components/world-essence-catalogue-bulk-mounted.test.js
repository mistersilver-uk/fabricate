/** The world Essence Catalogue's bulk face, mounted (issue 2485; `ui-world-scope` essence req 22). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick as settleSvelte } from '../../node_modules/svelte/src/index-client.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';
import {
  ESSENCE_CATALOGUE_BULK_COMPILED_MODULES,
  ESSENCE_CATALOGUE_BULK_RAW_MODULES,
  ESSENCE_WORLD_SCOPE_RAW_MODULES,
  ESSENCE_WORLD_SHELL_MODULES,
} from '../helpers/essenceWorldScopeModules.js';
import { assertDockAtColumnFoot, measureInspectorDock } from '../helpers/inspectorDockGeometry.js';
import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PAGE = 'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-bulk-',
  rawModules: [...ESSENCE_WORLD_SCOPE_RAW_MODULES, ...ESSENCE_CATALOGUE_BULK_RAW_MODULES],
  compiledModules: [
    ...ESSENCE_WORLD_SHELL_MODULES,
    ...SELECT_COMPILED_MODULES,
    ...ESSENCE_CATALOGUE_BULK_COMPILED_MODULES,
    PAGE,
  ],
  componentPath: PAGE,
});

const SYSTEMS = [{ id: 'sys-a', name: 'Mythwright Forge' }];
const IDS = ['ash', 'brine', 'cinder'];

function essenceScope(extraIds = []) {
  return projectWorldScopeEntity({
    entityType: 'essence',
    corpus: {
      entities: [
        { id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'peach' },
        { id: 'brine', name: 'Brine', icon: 'fas fa-water', colorToken: 'aqua' },
        { id: 'cinder', name: 'Cinder', icon: 'fas fa-fire-flame-curved' },
        ...extraIds.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
      ],
      defaults: [],
      membership: [...IDS, ...extraIds].map((entityId) => ({
        entityId,
        systemId: 'sys-a',
        enabled: true,
        inherit: {},
      })),
    },
    systems: SYSTEMS,
  });
}

/** Mounts the page over a recorded `updateEntity`; `answer(id)` is what each write resolves to. */
async function mountPage(answer = () => true, extraIds = []) {
  const calls = [];
  const target = await harness.mount({
    scope: essenceScope(extraIds),
    systems: SYSTEMS,
    actions: {
      updateEntity: (entityId, patch) => {
        calls.push([entityId, patch]);
        return answer(entityId);
      },
    },
    onOpenEntry: () => {},
  });
  return { target, calls };
}

const panelOf = (target) => target.querySelector('[data-world-essence-bulk-panel]');
const applyOf = (target) => target.querySelector('[data-world-essence-bulk-apply]');

async function rerender() {
  await harness.setProps({});
}

async function tickRows(target, ids) {
  for (const id of ids) {
    const input = target.querySelector(`[data-scoped-list-select="${id}"]`);
    assert.ok(Boolean(input), `no selection box for ${id}`);
    input.click();
  }
  await rerender();
}

async function stageColour(target, token) {
  const cell = target.querySelector(
    `:scope [data-world-essence-bulk-colour] [data-manager-color-token="${token}"]`
  );
  assert.ok(Boolean(cell), `no ${token} cell in the colour axis`);
  cell.click();
  await rerender();
}

async function stageNoColour(target) {
  target.querySelector(':scope [data-world-essence-bulk-colour] [data-manager-color-none]').click();
  await rerender();
}

/** Opens the icon picker and chooses its first offered glyph, answering that glyph's class. */
async function stageFirstIcon(target) {
  target
    .querySelector(':scope [data-world-essence-bulk-icon] .essence-icon-picker-trigger')
    .click();
  flushSync();
  await settleSvelte();
  const option = document.querySelector('.essence-icon-picker-option');
  assert.ok(Boolean(option), 'the icon picker offered no glyph');
  const iconClass = option.querySelector(':scope .essence-icon-picker-preview i').className;
  option.click();
  await rerender();
  return iconClass;
}

async function drain() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  await rerender();
}

async function apply(target) {
  applyOf(target).click();
  await drain();
}

describe('the world Essence Catalogue bulk face (issue 2485)', () => {
  const notified = [];
  let previousUi;

  before(async () => {
    await harness.setup();
    previousUi = globalThis.ui;
  });

  after(() => harness.teardown());

  afterEach(() => {
    harness.remount();
    Reflect.set(globalThis, 'ui', previousUi);
    notified.length = 0;
  });

  function captureNotifications() {
    Reflect.set(globalThis, 'ui', {
      notifications: {
        error: (message) => {
          notified.push(message);
        },
      },
    });
  }

  it('replaces the identity panel and its pinned foot from the first ticked row', async () => {
    const { target } = await mountPage();
    assert.ok(!panelOf(target), 'the bulk panel is on screen before any tick');
    assert.ok(
      Boolean(target.querySelector('[data-scoped-essence-open-entry]')),
      'NON-VACUITY: the identity foot must be on screen before the tick'
    );
    await tickRows(target, ['ash']);
    assert.ok(
      Boolean(panelOf(target)?.closest('[data-scoped-list-inspector]')),
      'the bulk panel did not replace the inspector'
    );
    for (const hook of [
      '[data-scoped-list-inspector-name]',
      '[data-scoped-list-inspector-foot]',
      '[data-scoped-essence-open-entry]',
    ]) {
      assert.ok(!target.querySelector(hook), `${hook} is still drawn beside the bulk panel`);
    }
  });

  it('states the count the selection register states, and the register points at it', async () => {
    const { target } = await mountPage();
    await tickRows(target, ['ash']);
    const hero = () => target.querySelector('[data-world-essence-bulk-count]').textContent;
    const register = () => target.querySelector('[data-scoped-list-selection-count]').textContent;
    assert.match(hero(), /\b1 essence selected/);
    assert.match(register(), /\b1 selected/);
    await tickRows(target, ['brine']);
    assert.match(hero(), /\b2 essences selected/);
    assert.match(register(), /\b2 selected/, 'the register and the hero disagree');
    assert.match(
      target.querySelector('.fab-bulk-selection-hint')?.textContent ?? '',
      /Bulk actions are in the inspector/
    );
  });

  it('keeps Apply inert until a colour is staged, then writes only that colour in order', async () => {
    const { target, calls } = await mountPage();
    await tickRows(target, IDS);
    assert.equal(applyOf(target).disabled, true, 'Apply is live with nothing staged');
    await stageColour(target, 'rose');
    assert.equal(applyOf(target).disabled, false);
    assert.match(
      target.querySelector('[data-world-essence-bulk-colour-state]').textContent,
      /on GM screens in every crafting system/
    );
    await apply(target);
    assert.deepEqual(
      calls,
      IDS.map((id) => [id, { colorToken: 'rose' }]),
      'each ticked essence takes exactly the staged colour, one write each, in order'
    );
    assert.ok(!panelOf(target), 'the selection survived the run');
    assert.ok(
      Boolean(target.querySelector('[data-scoped-essence-open-entry]')),
      'no identity back'
    );
  });

  it('writes icon and colour in one patch, and a cleared colour as the empty token', async () => {
    const { target, calls } = await mountPage();
    await tickRows(target, ['ash', 'brine']);
    const icon = await stageFirstIcon(target);
    assert.match(
      target.querySelector('[data-world-essence-bulk-icon-state]').textContent,
      /on its world entry and catalogue/
    );
    await stageNoColour(target);
    await apply(target);
    assert.deepEqual(calls, [
      ['ash', { icon, colorToken: '' }],
      ['brine', { icon, colorToken: '' }],
    ]);
  });

  it('counts a refused and a thrown write, finishes the run and notifies once', async () => {
    captureNotifications();
    const { target, calls } = await mountPage((id) => {
      if (id === 'ash') return false;
      if (id === 'brine') throw new Error('save refused');
      return true;
    });
    await tickRows(target, IDS);
    await stageColour(target, 'rose');
    await apply(target);
    assert.deepEqual(
      calls.map(([id]) => id),
      IDS,
      'the run stopped at a failure'
    );
    assert.deepEqual(notified, [
      '2 essences could not be updated: Ash, Brine. The other selected essences were updated.',
    ]);
    assert.ok(!panelOf(target), 'the selection survived a failed run');
  });

  it('names a single failure, and notifies nothing when every write landed', async () => {
    captureNotifications();
    const first = await mountPage((id) => id !== 'cinder');
    await tickRows(first.target, IDS);
    await stageColour(first.target, 'rose');
    await apply(first.target);
    assert.deepEqual(notified, [
      'Cinder could not be updated. The other selected essences were updated.',
    ]);

    notified.length = 0;
    harness.remount();
    const second = await mountPage();
    await tickRows(second.target, IDS);
    await stageColour(second.target, 'rose');
    await apply(second.target);
    assert.deepEqual(notified, [], 'a clean run notified');
  });

  it('names three failures at most, then how many more', async () => {
    captureNotifications();
    const ids = [...IDS, 'dross'];
    const { target } = await mountPage(() => false, ['dross']);
    await tickRows(target, ids);
    await stageColour(target, 'rose');
    await apply(target);
    assert.deepEqual(notified, [
      'None of the 4 selected essences could be updated: Ash, Brine, Cinder, and 1 more.',
    ]);
  });

  it('counts a write that resolves undefined as a failure', async () => {
    captureNotifications();
    const { target } = await mountPage((id) => (id === 'brine' ? undefined : true));
    await tickRows(target, IDS);
    await stageColour(target, 'rose');
    await apply(target);
    assert.deepEqual(notified, [
      'Brine could not be updated. The other selected essences were updated.',
    ]);
  });

  it('caps the names at three when some, not all, of four writes fail', async () => {
    captureNotifications();
    const { target } = await mountPage((id) => id === 'cinder', ['dross', 'ember']);
    await tickRows(target, ['ash', 'brine', 'cinder', 'dross', 'ember']);
    await stageColour(target, 'rose');
    await apply(target);
    await drain(); // five sequential writes outlast one drain
    assert.deepEqual(notified, [
      '4 essences could not be updated: Ash, Brine, Dross, and 1 more. The other selected essences were updated.',
    ]);
  });

  it('names an essence removed mid-run by its name, not its id', async () => {
    captureNotifications();
    const pending = [];
    const { target } = await mountPage(
      () =>
        new Promise((resolveWrite) => {
          pending.push(resolveWrite);
        })
    );
    await tickRows(target, IDS);
    await stageColour(target, 'rose');
    await apply(target);
    const scope = essenceScope();
    scope.entries = scope.entries.filter((entry) => entry.id !== 'brine');
    await harness.setProps({ scope });
    for (const answer of [true, false, true]) {
      pending.shift()?.(answer);
      await drain();
      if (pending.length === 0 && answer === true && notified.length === 0) await drain();
    }
    assert.deepEqual(notified, [
      'Brine could not be updated. The other selected essences were updated.',
    ]);
  });

  it('clears the selection from the panel without writing', async () => {
    const { target, calls } = await mountPage();
    await tickRows(target, ['ash']);
    target.querySelector('[data-world-essence-bulk-clear]').click();
    await rerender();
    assert.ok(!panelOf(target), 'the panel Clear did not reach the frame selection');
    assert.deepEqual(calls, []);
  });

  it('offers no delete, status or membership control, and names what stays per-essence', async () => {
    const { target } = await mountPage();
    await tickRows(target, ['ash']);
    const panel = panelOf(target);
    for (const hook of [
      '[data-arm-token]',
      '.fab-bulk-delete-card',
      '.manager-segment-input',
      '.manager-status-toggle-track',
      '[data-scoped-membership-actions]',
    ]) {
      assert.ok(!panel.querySelector(hook), `the panel draws ${hook}`);
    }
    assert.match(
      panel.querySelector('[data-world-essence-bulk-per-essence-note]')?.textContent ?? '',
      /stay per-essence[\s\S]*Essence Rules screen[\s\S]*adding one to a system or removing it happens there[\s\S]*deleting one happens on its own page/
    );
  });

  it('runs one write at a time and stays inert until the run ends', async () => {
    const pending = [];
    const { target, calls } = await mountPage(
      () =>
        new Promise((resolveWrite) => {
          pending.push(resolveWrite);
        })
    );
    await tickRows(target, IDS);
    await stageColour(target, 'rose');
    await apply(target);
    assert.equal(calls.length, 1, 'a second write began before the first answered');
    assert.equal(applyOf(target).disabled, true, 'Apply is live during the run');
    assert.equal(
      target.querySelector(':scope [data-world-essence-bulk-icon] .essence-icon-picker-trigger')
        .disabled,
      true,
      'the icon picker is live during the run'
    );
    assert.equal(
      target.querySelector('[data-world-essence-bulk-colour]').hasAttribute('inert'),
      true,
      'the colour palette is live during the run'
    );
    // happy-dom does not honour `inert`, so this click reaches the handler the run must refuse.
    await stageColour(target, 'mauve');
    assert.equal(
      target
        .querySelector('[data-world-essence-bulk-colour-state]')
        .getAttribute('data-world-essence-bulk-colour-state'),
      'unchanged',
      'a colour was staged during the run'
    );
    applyOf(target).click();
    await drain();
    assert.equal(calls.length, 1, 'a second Apply started another write');

    for (let index = 0; index < IDS.length; index += 1) {
      pending[index](true);
      await drain();
    }
    assert.deepEqual(
      calls.map(([id]) => id),
      IDS
    );
    assert.ok(!panelOf(target), 'the selection survived the run');
  });

  it("seats the dock on the inspector column's foot at its full width", async () => {
    const { target } = await mountPage();
    await tickRows(target, ['ash']);
    const aside = target.querySelector('[data-scoped-list-inspector]');
    assert.ok(Boolean(aside?.querySelector('.fab-bulk-edit-dock')), 'no dock in the inspector');
    assertDockAtColumnFoot(
      await measureInspectorDock(aside.outerHTML, {
        repoRoot,
        componentPaths: [
          'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
          'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
          'src/ui/svelte/apps/manager/InspectorPanel.svelte',
          'src/ui/svelte/apps/manager/BulkEditSection.svelte',
          'src/ui/svelte/apps/manager/scoped/EssenceCatalogueBulkPanel.svelte',
          'src/ui/svelte/components/TintPicker.svelte',
          'src/ui/svelte/components/Callout.svelte',
        ],
        view: 'world-essences',
      })
    );
  });
});
