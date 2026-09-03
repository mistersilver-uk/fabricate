/**
 * The world Component entry editor, mounted (issue 1371, epic 1357).
 *
 * ## Every write assertion here is on the FORWARDED ARGUMENT LIST
 *
 * `updateWorldDefaultSection`, `setWorldTags`, `setMutedTags`, `addToSystem`, `removeFromSystem`
 * and `deleteEntity` all answer `false` on a refused write and report nothing at all. So an
 * assertion on a post-state cannot distinguish "the write landed" from "the write was refused and
 * the projection never moved": `updateWorldDefaultSection` refuses any section name outside
 * `COMPONENT_SECTIONS` BEFORE it writes, and `setMutedTags` refuses silently for a non-member.
 * Both are exactly the mistakes a screen makes, and neither has a rendered symptom.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_SYSTEMS,
  SCOPED_LIST_RAW_MODULES,
  SCOPED_SHARED_COMPILED_MODULES,
  WORLD_COMPONENT_SCOPE_RAW_MODULES,
  componentCorpus,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-entry-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPage.svelte',
  rawModules: [
    ...WORLD_COMPONENT_SCOPE_RAW_MODULES,
    ...SCOPED_LIST_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js',
  ],
  compiledModules: [
    ...SCOPED_SHARED_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPage.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
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

async function drain() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

/** Mount the entry on one component, with a recording action bag and the draft wires captured. */
async function open(entityId, overrides) {
  const { calls, actions } = recordingComponentActions();
  const reports = { dirty: [], handles: [], deletes: [] };
  const target = await harness.mount({
    scope: scopeFor(overrides),
    actions,
    entityId,
    systemId: 'sys-forge',
    worldItems: [],
    onDirtyChange: (dirty) => reports.dirty.push(dirty),
    onDraftChange: (handle) => reports.handles.push(handle),
    onDeleteChange: (descriptor) => reports.deletes.push(descriptor),
  });
  return { target, calls, actions, reports };
}

describe('world Component entry editor (issue 1371)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  describe('the identity edit is BUFFERED and saved explicitly', () => {
    // AC-7.
    it('does not write on change, and reports the dirty state up', async () => {
      const { target, calls, reports } = await open('ingot');
      const name = target.querySelector('[data-scoped-entry-name]');
      assert.ok(Boolean(name), 'the entry renders its name field');

      name.value = 'Wrought Iron Ingot';
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'updateEntity'),
        [],
        'a keystroke writes NOTHING; a screen that persisted on change would have no Save at all'
      );
      assert.equal(
        reports.dirty.at(-1),
        true,
        'and the shell is told, because the header Save is disabled from this flag'
      );
    });

    it('and the reported handle saves ONLY the changed field', async () => {
      const { target, calls, reports } = await open('ingot');
      const name = target.querySelector('[data-scoped-entry-name]');
      name.value = 'Wrought Iron Ingot';
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      await drain();

      const handle = reports.handles.filter(Boolean).at(-1);
      assert.ok(Boolean(handle), 'the page reports a live draft handle to the shell');
      await handle.save();
      await drain();

      const writes = calls.filter((call) => call.verb === 'updateEntity');
      assert.equal(writes.length, 1, 'one write, not one per buffered field');
      assert.deepEqual(
        writes[0].args,
        ['ingot', { name: 'Wrought Iron Ingot' }],
        'saving the whole identity record would restate the description over whatever another ' +
          'client wrote to it meanwhile — which is what requirement 14 forbids'
      );
    });

    it('and a discard puts the field back without writing anything', async () => {
      const { target, calls, reports } = await open('ingot');
      const name = target.querySelector('[data-scoped-entry-name]');
      name.value = 'Something Else';
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      await drain();

      reports.handles.filter(Boolean).at(-1).discard();
      await drain();

      assert.equal(target.querySelector('[data-scoped-entry-name]').value, 'Iron Ingot');
      assert.deepEqual(calls, [], 'discarding writes nothing at all');
    });
  });

  describe('the world category write names the section the store accepts', () => {
    // AC-11. `worldScopeActions` refuses any name outside `COMPONENT_SECTIONS` BEFORE it writes,
    // and reports nothing — so `'categories'` or `'componentCategory'` is a control that silently
    // does nothing forever, with no rendered symptom.
    it('forwards (entityId, "category", value)', async () => {
      const { target, calls } = await open('ingot');
      const picker = target.querySelector('[data-scoped-entry-category-input]');
      assert.ok(Boolean(picker), 'the entry renders its category picker');

      picker.value = 'Reagent';
      picker.dispatchEvent(new window.Event('change', { bubbles: true }));
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'updateWorldDefaultSection'),
        [{ verb: 'updateWorldDefaultSection', args: ['ingot', 'category', 'Reagent'] }]
      );
    });

    it('and REFUSES the reserved bucket rather than forwarding it', async () => {
      // The picker is the enforcement point: nothing below it can refuse the token, and since
      // issue 1372 a world `general` really does reset every inheriting system on the next read.
      const { target, calls } = await open('ingot');
      const picker = target.querySelector('[data-scoped-entry-category-input]');
      picker.value = ' GENERAL ';
      picker.dispatchEvent(new window.Event('change', { bubbles: true }));
      await drain();

      const written = calls.find((call) => call.verb === 'updateWorldDefaultSection');
      assert.equal(
        written.args[2],
        '',
        'a variant spelling of the reserved bucket is cleared, never stored'
      );
    });
  });

  describe('per-system tag muting is gated on membership and names its system', () => {
    // AC-12's entry half.
    it('forwards setMutedTags with the SYSTEM the chip was authored on', async () => {
      const { target, calls } = await open('coal');
      const chip = target.querySelector('[data-scoped-entry-mute="sys-forge|fuel"]');
      assert.ok(Boolean(chip), 'a member row renders one mute chip per world tag');

      chip.click();
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'setMutedTags'),
        [{ verb: 'setMutedTags', args: ['coal', 'sys-forge', ['bulk', 'fuel']] }],
        'passing the ENTITY id where the system id belongs finds no membership record, returns ' +
          'false, and changes nothing — with no rendered symptom at all'
      );
    });

    it('and the control is ABSENT on a non-member row', async () => {
      const { target } = await open('coal');
      assert.ok(
        !target.querySelector('[data-scoped-entry-mute^="sys-alchemy|"]'),
        'the write refuses silently without a membership record, so an ungated chip would be a ' +
          'control that does nothing on every click forever'
      );
      // The positive control: the member row's chips ARE rendered, so the absence above is a
      // measurement rather than a selector that matches nothing anywhere.
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-mute^="sys-forge|"]')));
    });

    it('each chip is a real button reporting its muted state', async () => {
      // AC-28. A `<span onclick>` passes a pointer hit-test and is unreachable by keyboard.
      const { target } = await open('coal');
      const muted = target.querySelector('[data-scoped-entry-mute="sys-forge|bulk"]');
      const unmuted = target.querySelector('[data-scoped-entry-mute="sys-forge|fuel"]');

      for (const chip of [muted, unmuted]) {
        assert.equal(chip.tagName, 'BUTTON', 'a clickable chip is a real button');
        assert.equal(chip.getAttribute('type'), 'button');
      }
      assert.equal(muted.getAttribute('aria-pressed'), 'true');
      assert.equal(unmuted.getAttribute('aria-pressed'), 'false');
    });

    it('and its accessible name states the tag AND the system', async () => {
      // An N-by-M grid of bare tag names is ambiguous the moment it leaves visual context.
      const { target } = await open('coal');
      const label = target
        .querySelector('[data-scoped-entry-mute="sys-forge|bulk"]')
        .getAttribute('aria-label');
      assert.match(label, /bulk/);
      assert.match(label, /Forge/);
    });
  });

  describe('deleting a component any system has rules for is REFUSED', () => {
    // AC-15. Asserted on the CALL, never on a disabled attribute: a disabled button satisfies
    // "the delete did not happen" while leaving the GM no explanation at all.
    it('reports an ENABLED descriptor whose armed name states the refusal', async () => {
      const { reports } = await open('ingot');
      const descriptor = reports.deletes.filter(Boolean).at(-1);
      assert.ok(Boolean(descriptor), 'the page reports a delete descriptor to the header band');
      assert.match(descriptor.armedAriaLabel, /cannot be deleted yet/);
      assert.match(descriptor.armedAriaLabel, /Forge/);
      assert.match(descriptor.armedAriaLabel, /Alchemy/, 'and names BOTH member systems');
    });

    it('and confirming it does NOT call deleteEntity', async () => {
      const { calls, reports } = await open('ingot');
      await reports.deletes.filter(Boolean).at(-1).run();
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'deleteEntity'),
        [],
        'the write path does not refuse — it removes the entity, its world defaults and every ' +
          'membership record naming it — so the guard has to be here'
      );
    });

    it('but a component NO system has rules for is deleted', async () => {
      // THE POSITIVE CONTROL, and without it a screen that never deletes anything at all passes
      // every assertion above.
      const { calls, reports } = await open('resin');
      const descriptor = reports.deletes.filter(Boolean).at(-1);
      assert.match(descriptor.armedAriaLabel, /nothing else is affected/);
      await descriptor.run();
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'deleteEntity'),
        [{ verb: 'deleteEntity', args: ['resin'] }]
      );
    });
  });

  describe('the validation tab reports the entry it is open on', () => {
    // AC-17's rendered half: the check set is unit-covered, and this is that the tab RENDERS it.
    it('blocks on the record with no source Item and warns on its blank classification', async () => {
      const { target } = await open('orphan');
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();

      const rows = [...target.querySelectorAll('[data-scoped-entry-check]')];
      assert.ok(rows.length > 0, 'the validation tab renders its rows');
      const byId = new Map(rows.map((row) => [row.getAttribute('data-scoped-entry-check'), row]));
      assert.ok(byId.has('source'), 'the source check renders');
      assert.ok(byId.has('worldCategory'), 'and the world classification checks do too');
      assert.ok(byId.has('worldTags'));
    });
  });
});
