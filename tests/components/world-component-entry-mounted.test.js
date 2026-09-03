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
    'src/ui/svelte/apps/manager/Callout.svelte',
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

    it('REFUSES the reserved bucket, and does not CLEAR the value doing it', async () => {
      // The picker is the enforcement point: nothing below it can refuse the token, and since
      // issue 1372 a world `general` really does reset every inheriting system on the next read.
      //
      // BUT A REFUSAL THAT WRITES ABSENCE IS A DELETION. Round 1 forwarded `''`, so typing
      // `General` into a component that already had `Refined` silently blanked the authored value
      // with no message — a refusal the GM experiences as data loss.
      const notices = [];
      const previousUi = globalThis.ui;
      globalThis.ui = { notifications: { warn: (message) => notices.push(message) } };
      try {
        const { target, calls } = await open('ingot');
        const picker = target.querySelector('[data-scoped-entry-category-input]');
        picker.value = ' GENERAL ';
        picker.dispatchEvent(new window.Event('change', { bubbles: true }));
        await drain();

        assert.deepEqual(
          calls.filter((call) => call.verb === 'updateWorldDefaultSection'),
          [],
          'nothing is written at all, so the authored category survives'
        );
        assert.equal(picker.value, 'Refined', 'and the control shows what is actually stored');
        assert.equal(notices.length, 1, 'and the GM is told why');
      } finally {
        if (previousUi === undefined) delete globalThis.ui;
        else globalThis.ui = previousUi;
      }
    });

    it('but a BLANK input still clears it, because that is a real edit', async () => {
      // The positive control on the refusal: an empty field is a GM removing the world category
      // deliberately, and a guard that refused every non-offered value would break it.
      const { target, calls } = await open('ingot');
      const picker = target.querySelector('[data-scoped-entry-category-input]');
      picker.value = '';
      picker.dispatchEvent(new window.Event('change', { bubbles: true }));
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'updateWorldDefaultSection'),
        [{ verb: 'updateWorldDefaultSection', args: ['ingot', 'category', ''] }]
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

  describe('the hero reports the WORST thing the rows say', () => {
    // E.1 / AC-17. The surface always drew the pass medallion because no `summary.status` was
    // passed at all, so a record that BLOCKS was headed by a green hero over red rows. The status
    // reaches the DOM verbatim on the primitive's own hook AND resolves to a class, and both are
    // asserted: a site that passed the word and a primitive that dropped it look identical from
    // the model.
    async function heroOf(entityId) {
      const { target } = await open(entityId);
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();
      const hero = target.querySelector('[data-editor-validation-summary]');
      assert.ok(Boolean(hero), 'the validation tab renders its hero');
      return hero;
    }

    it('blocks over a record with no source Item', async () => {
      const hero = await heroOf('orphan');
      assert.equal(hero.getAttribute('data-editor-validation-summary'), 'block');
      assert.ok(
        hero.className.includes('is-invalid') || hero.className.includes('is-block'),
        `and paints the blocking face; it painted "${hero.className}"`
      );
    });

    it('and does NOT block over the complete one, so the hero is discriminating', async () => {
      // The positive control. Without it a hero hard-wired to `block` passes the assertion above.
      const hero = await heroOf('ingot');
      assert.notEqual(hero.getAttribute('data-editor-validation-summary'), 'block');
    });
  });

  describe('the delete refusal is VISIBLE, and the armed name contains its visible label', () => {
    // E.3 / AC-16. Round 1 put the refusal only in the armed control's accessible name, so the
    // sighted flow was: click Delete, watch it read `Cannot delete`, click again, and nothing at
    // all happens — no toast, no sentence, no state change.
    it('renders the refusal beside the systems that cause it', async () => {
      const { target } = await open('ingot');
      const callout = target.querySelector('[data-scoped-entry-delete-refusal]');
      assert.ok(Boolean(callout), 'the refusal is body copy, not only an accessible name');
      assert.match(callout.textContent, /Forge/, 'and it names the systems holding rules');
    });

    it('and WITHHOLDS it for a component no system has rules for', async () => {
      // The positive control: an always-rendered callout tells a deletable component it cannot be
      // deleted, which is the same defect facing the other way.
      const { target } = await open('resin');
      assert.ok(!target.querySelector('[data-scoped-entry-delete-refusal]'));
    });

    it('and the armed accessible name STARTS with the armed visible label', async () => {
      // WCAG 2.5.3 Label in Name: a control whose accessible name omits its visible string is
      // unactivatable by speech input. `ArmedDangerButton` states the requirement and cannot
      // enforce it, because the descriptor is authored here.
      const { reports } = await open('ingot');
      const descriptor = reports.deletes.filter(Boolean).at(-1);
      assert.ok(Boolean(descriptor), 'the page reports a delete descriptor');
      assert.equal(descriptor.armedLabel, 'Cannot delete');
      assert.ok(
        descriptor.armedAriaLabel.startsWith(descriptor.armedLabel),
        `the armed name must contain its visible label; it read "${descriptor.armedAriaLabel}"`
      );
      assert.ok(descriptor.idleAriaLabel.includes(descriptor.label));
    });
  });

  describe('the per-system card filters, searches and counts what it draws', () => {
    // E.5 / D-9. Round 1 shipped an unfiltered, unsearchable, unbounded list. On the two-system
    // fixture that is invisible; the count and the two narrowing controls are what a twenty-system
    // world needs, and each is asserted on the ROWS it changes rather than on its own presence.
    it('states how many of the total it is showing', async () => {
      const { target } = await open('ingot');
      const count = target.querySelector('[data-scoped-entry-system-count]');
      assert.ok(Boolean(count));
      assert.match(count.textContent, /2 of 2/);
    });

    it('and the membership filter NARROWS the rows, carrying its own counts', async () => {
      const { target } = await open('resin');
      const select = target.querySelector('[data-scoped-entry-system-filter]');
      assert.ok(Boolean(select), 'the card renders its membership filter');
      assert.equal(target.querySelectorAll('[data-scoped-entry-system]').length, 2);

      const withRules = target.querySelector('[data-scoped-entry-system-filter-option="with"]');
      assert.match(withRules.textContent, /\(0\)/, 'the option states the set it would show');

      select.value = 'with';
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      assert.equal(
        target.querySelectorAll('[data-scoped-entry-system]').length,
        0,
        'resin is a member of neither system, so `With rules` shows none of them'
      );
      assert.ok(
        Boolean(target.querySelector('[data-scoped-entry-systems-empty]')),
        'and the card says so rather than rendering an unexplained void'
      );
    });

    it('and the search narrows by system NAME', async () => {
      const { target } = await open('ingot');
      const search = target.querySelector('[data-scoped-entry-system-search]');
      assert.ok(Boolean(search));
      search.value = 'alch';
      search.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      const rows = [...target.querySelectorAll('[data-scoped-entry-system]')].map((row) =>
        row.getAttribute('data-scoped-entry-system')
      );
      assert.deepEqual(rows, ['sys-alchemy']);
      assert.match(
        target.querySelector('[data-scoped-entry-system-count]').textContent,
        /1 of 2/,
        'and the count follows the filtered set, not the corpus'
      );
    });

    it('and each row states its MODE and what that system resolves', async () => {
      // The row used to carry a name and a membership cluster and nothing else, so the one
      // question the card exists to answer — what does THIS system get — needed a route change.
      const { target } = await open('ingot');
      const inheriting = target.querySelector('[data-scoped-entry-system-mode="sys-forge"]');
      const overriding = target.querySelector('[data-scoped-entry-system-mode="sys-alchemy"]');
      assert.ok(Boolean(inheriting) && Boolean(overriding), 'both rows state a mode');
      assert.notEqual(
        inheriting.textContent.trim(),
        overriding.textContent.trim(),
        'and the two modes read differently, which is the whole claim'
      );
      assert.match(
        target.querySelector('[data-scoped-entry-system-summary="sys-forge"]').textContent,
        /Refined/,
        'the inheriting row resolves the world value'
      );
      // THE OVERRIDE BRANCH NAMES NO VALUE, and that is the assertion rather than an omission:
      // the published system row does not carry an overriding system's category, so a summary
      // that stated one would be stating `row.category ?? ''` — which renders as `Resolves No
      // world category` beside a chip reading `Overrides world category`.
      const overrideSummary = target.querySelector(
        '[data-scoped-entry-system-summary="sys-alchemy"]'
      ).textContent;
      assert.match(overrideSummary, /own category in its rules/);
      assert.ok(
        !/No world category/.test(overrideSummary),
        'and it never says the system resolves nothing over a world record that HAS a category'
      );
    });

    it('and a NON-MEMBER row says nothing resolves there, rather than naming a category', async () => {
      const { target } = await open('resin');
      const summary = target.querySelector('[data-scoped-entry-system-summary="sys-forge"]');
      assert.match(summary.textContent, /No rules here/);
    });
  });

  describe('the source Item block offers its uuid rather than only printing it', () => {
    // E.9. The uuid is the one string on this screen a GM has to move somewhere else — into a
    // macro, a bug report, or a sibling module's config — and selecting a `<span>` inside a
    // Foundry application window is a drag the surrounding drop zones intercept.
    it('renders the uuid beside a copy control for a linked record', async () => {
      const { target } = await open('ingot');
      assert.equal(
        target.querySelector('[data-scoped-entry-source-uuid]').textContent.trim(),
        'Item.ingot-source'
      );
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-source-copy]')));
    });

    it('and withholds BOTH for a record with no source Item', async () => {
      const { target } = await open('orphan');
      assert.ok(!target.querySelector('[data-scoped-entry-source-uuid]'));
      assert.ok(
        !target.querySelector('[data-scoped-entry-source-copy]'),
        'a copy control over nothing is a control that reports success having copied an empty string'
      );
      assert.ok(
        Boolean(target.querySelector('[data-scoped-entry-aliases-empty]')),
        'and the alias list states its empty case rather than rendering a bare heading'
      );
    });
  });

  describe('the per-system membership controls are ACTUATED, not merely rendered', () => {
    // AC-28. Round 1 asserted the cluster was PRESENT on each row and stopped there, so a page
    // that wired Add to `removeFromSystem` — or wired every row to the FIRST row's system — shipped
    // green. Both mistakes are one identifier, and neither has a rendered symptom: the write
    // refuses silently for a pair that is already a member, so even the post-state agrees.
    function rowOf(target, systemId) {
      const row = target.querySelector(`[data-scoped-entry-system="${systemId}"]`);
      assert.ok(Boolean(row), `the card renders a row for ${systemId}`);
      return row;
    }

    it('Add forwards addToSystem with the row OWN system, not the first row', async () => {
      // `resin` is a member of neither system, so both rows offer Add and the SECOND one is the
      // one actuated: a page that closed over the loop's first row passes on the first and fails
      // here.
      const { target, calls } = await open('resin');
      rowOf(target, 'sys-alchemy').querySelector('[data-scoped-membership-add]').click();
      await drain();
      assert.deepEqual(calls, [{ verb: 'addToSystem', args: ['resin', 'sys-alchemy'] }]);
    });

    it('and Remove forwards removeFromSystem, ARMED FIRST, on its own row', async () => {
      // `ingot` is a member of both. The first click ARMS and must write nothing at all — a
      // destructive verb that fires on the first click is the defect the armed control exists to
      // prevent, and an assertion that only checks the end state cannot see it.
      const { target, calls } = await open('ingot');
      const remove = rowOf(target, 'sys-alchemy').querySelector('[data-armed]');
      assert.ok(Boolean(remove), 'the member row renders its armed Remove');
      assert.equal(remove.getAttribute('data-armed'), 'false');

      remove.click();
      await drain();
      assert.deepEqual(calls, [], 'arming writes NOTHING');
      assert.equal(
        rowOf(target, 'sys-alchemy').querySelector('[data-armed]').getAttribute('data-armed'),
        'true',
        'and the control reports itself armed'
      );

      rowOf(target, 'sys-alchemy').querySelector('[data-armed]').click();
      await drain();
      assert.deepEqual(calls, [{ verb: 'removeFromSystem', args: ['ingot', 'sys-alchemy'] }]);
    });

    it('and arming one row DISARMS the other, so a stray Enter cannot delete a second', async () => {
      // The single-armed-token invariant, which this page owns rather than the cluster. Two rows
      // armed at once is a keyboard hazard specifically: the GM arms one, tabs, and confirms
      // whichever the browser focused.
      const { target } = await open('ingot');
      rowOf(target, 'sys-forge').querySelector('[data-armed]').click();
      await drain();
      rowOf(target, 'sys-alchemy').querySelector('[data-armed]').click();
      await drain();
      assert.equal(
        rowOf(target, 'sys-forge').querySelector('[data-armed]').getAttribute('data-armed'),
        'false'
      );
      assert.equal(
        rowOf(target, 'sys-alchemy').querySelector('[data-armed]').getAttribute('data-armed'),
        'true'
      );
    });

    it('and the armed control is operable from the KEYBOARD, Escape included', async () => {
      // AC-28's keyboard half. Two separate claims, and the second is the one an implementation
      // gets wrong: the control is a native `<button type="button">`, so Enter and Space are the
      // BROWSER'S activation rather than a handler this repo could omit — and Escape disarms
      // without leaving the control, which IS a handler and would otherwise strand a GM who armed
      // by mistake with no way out but a mouse.
      const { target, calls } = await open('ingot');
      const remove = rowOf(target, 'sys-forge').querySelector('[data-armed]');
      assert.equal(remove.tagName, 'BUTTON');
      assert.equal(remove.getAttribute('type'), 'button');

      remove.click();
      await drain();
      const armed = rowOf(target, 'sys-forge').querySelector('[data-armed]');
      const escape = new target.ownerDocument.defaultView.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      armed.dispatchEvent(escape);
      await drain();
      assert.equal(
        rowOf(target, 'sys-forge').querySelector('[data-armed]').getAttribute('data-armed'),
        'false',
        'Escape disarms'
      );
      assert.equal(escape.defaultPrevented, true, 'and is consumed, so no ancestor surface closes');
      assert.deepEqual(calls, [], 'and nothing was written on the way through');
    });
  });
});
