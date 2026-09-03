/**
 * The world Component Catalogue, mounted (issue 1371, epic 1357).
 *
 * ## Why the fixture is projected rather than hand-built
 *
 * `hasSourceLink` and `membershipCount` are both answered INSIDE `buildEntry`, beside the one
 * list of source-link field names — so a `scope` literal that stamped either of them itself would
 * go on passing after a rename while every real row started reporting the opposite. Both are the
 * two facts this row states, so both come from the real projection.
 *
 * ## And why the bulk panel's fake records the VERB NAME
 *
 * `Add to` and `Remove from` are one keystroke apart and destructive in one direction only. A
 * panel wired to the wrong one ships green against any assertion that counts calls or inspects
 * argument lists; only the verb name distinguishes them, and this is the highest-consequence
 * untested surface in the lane.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_SYSTEMS,
  SCOPED_LIST_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SCOPED_SHARED_COMPILED_MODULES,
  WORLD_COMPONENT_SCOPE_RAW_MODULES,
  componentCorpus,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-catalogue-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldComponentCataloguePage.svelte',
  rawModules: [
    ...WORLD_COMPONENT_SCOPE_RAW_MODULES,
    ...SCOPED_LIST_RAW_MODULES,
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    // The drop zone's two leaves: the action it binds and the payload normalizer behind it.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
  ],
  compiledModules: [
    ...SCOPED_SHARED_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/scoped/WorldComponentCataloguePage.svelte',
    'src/ui/svelte/apps/manager/scoped/ComponentCatalogueBulkPanel.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
  ],
});

function scopeFor(overrides) {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: componentCorpus(overrides),
    systems: COMPONENT_SYSTEMS,
  });
}

/** Drain the microtask queue the sequential apply loop awaits through. */
async function drain() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

describe('world Component Catalogue (issue 1371)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  describe('the row states its source link and its reach', () => {
    // AC-6.
    it('flags the record with NO source Item and says nothing about the ones that have one', async () => {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
      });

      // THE ROW COUNT FIRST, so no answer below is an empty match dressed as a pass.
      assert.equal(
        target.querySelectorAll('[data-scoped-list-row]').length,
        4,
        'every record in the corpus renders a row'
      );

      const orphan = target.querySelector(
        '[data-scoped-list-row="orphan"] [data-scoped-list-source]'
      );
      assert.ok(Boolean(orphan), 'the record naming no Item IS flagged');
      assert.equal(orphan.getAttribute('data-scoped-list-source'), 'unlinked');
      assert.ok(
        !target.querySelector('[data-scoped-list-row="ingot"] [data-scoped-list-source]'),
        'and a linked row states no badge: being linked is what a component here is'
      );
    });

    it('flags the component NO system has, and not the one two systems hold', async () => {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
      });

      assert.ok(
        Boolean(target.querySelector('[data-world-component-row-flag="resin"]')),
        'a component with zero membership records is Unused'
      );
      assert.ok(
        !target.querySelector('[data-world-component-row-flag="ingot"]'),
        'and one two systems hold is not — an inverted flag passes any presence-only check'
      );
    });

    it('states BOTH reach counts as text, never as a chip', async () => {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
      });
      const meta = target.querySelector('[data-world-component-row-meta="ingot"]');
      assert.ok(Boolean(meta), 'the row renders its meta run');
      assert.equal(
        meta.querySelector('[data-world-component-row-stat="systems"]').textContent.trim(),
        '2/2 systems'
      );
      assert.ok(
        !meta.querySelector('.manager-chip'),
        'a reach count set as a chip reads as a third property of the component'
      );
    });
  });

  describe('the bulk panel stages, and the page writes SEQUENTIALLY', () => {
    // AC-22. This is the highest-consequence untested surface in the lane.

    /** Tick two rows, so every assertion below is over a real multi-row selection. */
    async function selectTwo(target) {
      for (const id of ['ingot', 'coal']) {
        target.querySelector(`[data-scoped-list-select="${id}"]`).click();
        await drain();
      }
    }

    it('swaps the inspector for the panel the moment a row is ticked', async () => {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: recordingComponentActions().actions,
      });
      assert.ok(!target.querySelector('[data-world-component-bulk-panel]'), 'absent at rest');
      await selectTwo(target);
      assert.ok(
        Boolean(target.querySelector('[data-world-component-bulk-panel]')),
        'and present once a selection exists'
      );
    });

    it('forwards addToSystem once per selected component, per chosen system', async () => {
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);

      target.querySelector('[data-world-component-bulk-mode-option="add"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-system-trigger]').click();
      await drain();
      target.querySelector('[data-popover-option="sys-forge"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();

      assert.deepEqual(
        calls,
        [
          { verb: 'addToSystem', args: ['ingot', 'sys-forge'] },
          { verb: 'addToSystem', args: ['coal', 'sys-forge'] },
        ],
        'the VERB NAME is asserted beside the arguments: a panel wired to `removeFromSystem` ' +
          'ships green against any assertion that only counts calls'
      );
    });

    it('and forwards removeFromSystem when the mode says so', async () => {
      // THE OTHER DIRECTION, and it is the whole reason the verb name is recorded. Without this
      // half, a panel that forwarded `addToSystem` for both modes passes.
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);

      target.querySelector('[data-world-component-bulk-mode-option="remove"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-system-trigger]').click();
      await drain();
      target.querySelector('[data-popover-option="sys-alchemy"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();

      assert.deepEqual(
        calls.map((call) => call.verb),
        ['removeFromSystem', 'removeFromSystem']
      );
      assert.deepEqual(calls[0].args, ['ingot', 'sys-alchemy']);
    });

    it('applies the world tag stage as a WHOLE list, computed per component', async () => {
      // `setWorldTags` REPLACES the list, so an implementation that wrote the staged tags alone
      // would silently delete every tag the GM had not ticked — and `coal` carries two.
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);

      target.querySelector('[data-world-component-bulk-tag="fuel"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();

      const tagCalls = calls.filter((call) => call.verb === 'setWorldTags');
      assert.equal(tagCalls.length, 2, 'one write per selected component');
      assert.deepEqual(
        tagCalls.find((call) => call.args[0] === 'coal').args[1],
        ['fuel', 'bulk'],
        "coal's existing tags SURVIVE the staged addition"
      );
      assert.deepEqual(
        tagCalls.find((call) => call.args[0] === 'ingot').args[1],
        ['fuel'],
        'and a component with none gains only the staged tag'
      );
    });

    it('runs the writes ORDERED rather than concurrent, and clears only after the last', async () => {
      // Each fake verb awaits a real microtask, so a `Promise.all` implementation interleaves
      // here and an awaited loop does not. Without that boundary this assertion is vacuous.
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);

      target.querySelector('[data-world-component-bulk-mode-option="add"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-system-trigger]').click();
      await drain();
      target.querySelector('[data-popover-option="sys-forge"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-tag="fuel"]').click();
      await drain();

      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();

      // PER COMPONENT, membership then tags — never both components' membership and then both
      // their tags, which is what a per-axis loop would produce.
      assert.deepEqual(
        calls.map((call) => `${call.verb}:${call.args[0]}`),
        ['addToSystem:ingot', 'setWorldTags:ingot', 'addToSystem:coal', 'setWorldTags:coal'],
        'twelve writers racing one setting is what a Promise.all here would produce'
      );
      assert.equal(
        target.querySelectorAll('[data-scoped-list-row][data-scoped-list-selected="true"]').length,
        0,
        'the selection clears once the last write has landed'
      );
    });

    it('refuses a second Apply while one is in flight', async () => {
      // The guard is a flag rather than a disabled attribute alone, because a second click that
      // slipped through re-runs every write against a payload the first run has not yet
      // persisted — the read-modify-write race the sequential loop exists to prevent.
      const calls = [];
      let release = null;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const actions = {
        addToSystem: async (...args) => {
          calls.push(args);
          await gate;
          return true;
        },
      };
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);
      target.querySelector('[data-world-component-bulk-mode-option="add"]').click();
      await drain();
      target.querySelector('[data-world-component-bulk-system-trigger]').click();
      await drain();
      target.querySelector('[data-popover-option="sys-forge"]').click();
      await drain();

      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();
      assert.equal(calls.length, 1, 'the first write is in flight and the loop is parked on it');

      target.querySelector('[data-world-component-bulk-apply]')?.click();
      await drain();
      assert.equal(calls.length, 1, 'and a second Apply is refused rather than queued behind it');

      release();
      await drain();
    });
  });
});
