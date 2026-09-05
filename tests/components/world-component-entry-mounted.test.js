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

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  componentScopeFor,
  createComponentScopeHarness,
  drainMicrotasks,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { dispatchDrop, dispatchRejectedDrops } from '../helpers/dropPayloads.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-entry-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPage.svelte',
  rawExtras: [
    // THE POPOVER'S FOUR LEAVES (issue 1371, revision 8). The world category picker is
    // `SearchablePopover` now rather than a native `<select>`, so its dismiss action, its portal,
    // its layout helper and its overlay host are all in this tree's STATIC graph — and a module
    // missing from this manifest HANGS the suite and reports `# cancelled`, never `# fail`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js',
  ],
  compiledExtras: [
    // THE ENTRY'S OWN THREE CHILDREN (issue 1371, parity round 4). Each is imported STATICALLY by
    // the page, so an omission HANGS this suite and is reported as `# cancelled`, not `# fail`.
    'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySourceCard.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySystemsCard.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPreviewRail.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
  ],
});

/**
 * THE SOURCE CARD ON ITS OWN, for the one prop the page cannot exercise.
 *
 * `onReviewDuplicates` is withheld by the entry page on purpose — there is no merge screen to
 * route to — so its rendered arm has no path through the page's tree. Rather than give the page a
 * prop no call site passes, the card is mounted directly; the factory means this costs a manifest
 * of three extras rather than a second copy of the harness arrangement.
 */
const sourceCardHarness = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-entry-source-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldComponentEntrySourceCard.svelte',
  rawExtras: ['src/ui/svelte/actions/dragDrop.js', 'src/ui/svelte/util/dropUtils.js'],
  compiledExtras: [
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
  ],
});

/**
 * `ItemDropZone` ON ITS OWN, for the DEFAULT half of `compact` (issue 1371 r11-entry, UX minor).
 *
 * `compact` is an opt-in this issue added to a primitive with eight other call sites, and the
 * positive arm — the entry's identity zone IS `is-compact` — is proved through the page below.
 * The negative arm is not reachable there: the ONE zone the entry renders — the source card's,
 * since maintainer ruling M17 removed the identity card's — opts in, so nothing on this screen
 * can show that a zone which does NOT ask keeps the linked art, the name and the uuid. Every other opt-in this PR shipped carries that pair (`ManagerButton`, `ManagerSearchField`,
 * `Medallion`, `ScopedEntityPreview`), and it is the pair that makes "byte-identical by default"
 * a measurement rather than a claim.
 *
 * The manifest is three modules because that is the primitive's whole static graph.
 */
const dropZoneHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-entry-drop-zone-',
  componentPath: 'src/ui/svelte/apps/manager/ItemDropZone.svelte',
  rawModules: [
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/util/foundryBridge.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/components/IconButton.svelte',
  ],
});

// SHARED WITH THE CATALOGUE SUITE, which carried both verbatim; aliased so the call sites read
// unchanged. See `createComponentScopeHarness` for why the arrangement moved rather than the
// manifests being pruned.
const scopeFor = componentScopeFor;
const drain = drainMicrotasks;

/**
 * THE ROSTER WITH ITS RESOLUTION MODES, which the shared fixture's `{id, name}` pairs do not
 * carry. The entry's system row draws that mode as its sub-line (`proto:936`), so a roster that
 * cannot answer draws no sub-line at all — and a suite mounting the shared pairs would assert an
 * empty string on both rows and call the two rows discriminating.
 *
 * The two modes DIFFER on purpose: one row per mode is what makes "the sub-line reads the row's
 * own system" a measurement rather than a coincidence.
 */
const ENTRY_SYSTEMS = Object.freeze([
  Object.freeze({ id: 'sys-forge', name: 'Forge', resolutionMode: 'progressive' }),
  Object.freeze({ id: 'sys-alchemy', name: 'Alchemy', resolutionMode: 'simple' }),
]);

/**
 * Mount the entry on one component, with a recording action bag and the draft wires captured.
 *
 * THE FOUR SHELL CALLBACKS ARE RECORDED TOO (issue 1371, revision 8). The source card's replace,
 * unlink and copy, and the missing state's way back, are not `actions` verbs: they resolve a
 * Foundry document or reach the clipboard, so the page reports them UP and the shell performs
 * them. A mount that left them at their `() => {}` defaults could not tell a wired control from a
 * control wired to nothing, which is exactly the state all three shipped in.
 */
async function open(entityId, overrides) {
  const { calls, actions } = recordingComponentActions();
  const reports = {
    dirty: [],
    handles: [],
    sublines: [],
    vocabulary: [],
    rules: [],
    shell: [],
  };
  const target = await harness.mount({
    scope: scopeFor(overrides),
    actions,
    entityId,
    systemId: 'sys-forge',
    systems: ENTRY_SYSTEMS,
    worldItems: [],
    onDirtyChange: (dirty) => reports.dirty.push(dirty),
    onDraftChange: (handle) => reports.handles.push(handle),
    onSublineChange: (subline) => reports.sublines.push(subline),
    onOpenWorldVocabulary: () => reports.vocabulary.push(true),
    onOpenSystemRules: (id, systemId) => reports.rules.push([id, systemId]),
    onSourceDrop: (data) => reports.shell.push(['drop', data?.uuid ?? null]),
    onUnlinkSource: (...args) => reports.shell.push(['unlink', ...args]),
    onCopySourceUuid: (uuid) => reports.shell.push(['copy', uuid]),
    onBackToCatalogue: () => reports.shell.push(['back']),
  });
  return { target, calls, actions, reports };
}

/**
 * Re-project one entry with world-usage references attached.
 *
 * The shared fixture wires NO `requiredBy` / `producedBy`, because the projection takes them from
 * a `usage` map the admin store computes over every system's recipes and gathering tasks — a
 * corpus this suite does not build. Patching the projected entry is the smallest way to reach the
 * populated face without restating that whole leg.
 *
 * @param {object} scope
 * @param {string} entityId
 * @param {{requiredBy: object[], producedBy: object[]}} usage
 * @returns {object}
 */
function withUsage(scope, entityId, usage) {
  return {
    ...scope,
    entries: scope.entries.map((entry) => (entry.id === entityId ? { ...entry, ...usage } : entry)),
  };
}

describe('world Component entry editor (issue 1371)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  describe('the identity edit is BUFFERED and saved explicitly', () => {
    // AC-7, ON THE UNLINKED RECORD. `proto:834-841` draws a linked component's name, art and
    // description as READ-ONLY values under a lock pill, because the linked Item owns them; the
    // editable pair survives only for a record with no source item, which is the one state where
    // nothing else can name it. `orphan` is that record in the shared fixture.
    it('does not write on change, and reports the dirty state up', async () => {
      const { target, calls, reports } = await open('orphan');
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
      const { target, calls, reports } = await open('orphan');
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
        ['orphan', { name: 'Wrought Iron Ingot' }],
        'saving the whole identity record would restate the description over whatever another ' +
          'client wrote to it meanwhile — which is what requirement 14 forbids'
      );
    });

    it('and a discard puts the field back without writing anything', async () => {
      const { target, calls, reports } = await open('orphan');
      const name = target.querySelector('[data-scoped-entry-name]');
      name.value = 'Something Else';
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      await drain();

      reports.handles.filter(Boolean).at(-1).discard();
      await drain();

      assert.equal(target.querySelector('[data-scoped-entry-name]').value, 'Unbound Salt');
      assert.deepEqual(calls, [], 'discarding writes nothing at all');
    });
  });

  describe('the world category write names the section the store accepts', () => {
    // AC-11. `worldScopeActions` refuses any name outside `COMPONENT_SECTIONS` BEFORE it writes,
    // and reports nothing — so `'categories'` or `'componentCategory'` is a control that silently
    // does nothing forever, with no rendered symptom.
    //
    // THE ASSERTION MOVED WITH THE CONTROL (issue 1371, revision 8). The picker was a native
    // `<select>` and is now `SearchablePopover`, so the write is reached by OPENING the panel and
    // clicking an option rather than by assigning `value` and dispatching `change`. Every claim
    // below is the same claim; only the path to it changed.

    /**
     * Open the category picker and answer its option buttons, in render order.
     *
     * @param {HTMLElement} target
     * @returns {Promise<HTMLElement[]>}
     */
    async function openCategoryPicker(target) {
      const trigger = target.querySelector('[data-scoped-entry-category-input]');
      assert.ok(Boolean(trigger), 'the entry renders its category picker');
      trigger.click();
      await drain();
      return [...target.querySelectorAll('[data-popover-option]')];
    }

    it('forwards (entityId, "category", value)', async () => {
      const { target, calls } = await open('ingot');
      const trigger = target.querySelector('[data-scoped-entry-category-input]');
      assert.ok(Boolean(trigger), 'the entry renders its category picker');
      assert.notEqual(
        trigger.tagName,
        'SELECT',
        'the OS drop-down is gone: this is the app own picker, which the debt ratchet requires'
      );
      assert.equal(
        trigger.getAttribute('aria-haspopup'),
        'listbox',
        'and it announces the bare list it actually opens, not a dialog'
      );

      const options = await openCategoryPicker(target);
      const raw = options.find((option) => option.textContent.trim() === 'Raw');
      assert.ok(Boolean(raw), `the corpus vocabulary is offered; read ${options.length} options`);
      raw.click();
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'updateWorldDefaultSection'),
        [{ verb: 'updateWorldDefaultSection', args: ['ingot', 'category', 'Raw'] }]
      );
    });

    it('and its FIRST option is the unset one, so clearing is reachable', async () => {
      // `proto:891` writes `No world category` as the first option. A picker whose only options
      // are authored values cannot express "this record has none", which is the state every
      // freshly created component is in.
      const { target } = await open('ingot');
      const options = await openCategoryPicker(target);
      assert.equal(options[0].getAttribute('data-popover-option'), '__no-world-category');
      assert.equal(options[0].textContent.trim(), 'No world category');
    });

    it('never OFFERS the reserved bucket, whatever the corpus already holds', async () => {
      // The picker is the enforcement point: nothing below it can refuse the token, and since
      // issue 1372 a world `general` really does reset every inheriting system on the next read.
      // The picker moves the refusal from the COMMIT to the OFFER — a value that is not an option
      // cannot be chosen — so this is the assertion that carries it, driven from a corpus that
      // really does hold the reserved bucket on a sibling record.
      const { target } = await open('ingot', {
        defaults: [
          { id: 'ingot', category: 'Refined' },
          { id: 'coal', category: ' GENERAL ' },
        ],
      });
      const offered = (await openCategoryPicker(target)).map((option) =>
        option.getAttribute('data-popover-option')
      );
      assert.ok(offered.includes('Refined'), 'the authored vocabulary is offered');
      assert.ok(
        !offered.some((value) => String(value).trim().toLowerCase() === 'general'),
        `the reserved bucket must never be offered; the picker held ${offered.join(', ')}`
      );
    });

    it('but the BLANK option still clears it, because that is a real edit', async () => {
      // The positive control on the refusal: the empty option is a GM removing the world category
      // deliberately, and a guard that refused every non-offered value would break it.
      const { target, calls } = await open('ingot');
      const options = await openCategoryPicker(target);
      options[0].click();
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'updateWorldDefaultSection'),
        [{ verb: 'updateWorldDefaultSection', args: ['ingot', 'category', ''] }]
      );
    });

    it('and the trigger reads the PERSISTED value, so a refusal needs no restore step', async () => {
      // What replaced `control.value = worldCategory`. The `<select>` held its own selection, so a
      // refused choice had to be pushed back onto the element; the trigger is painted from the
      // record, so there is nothing to put back — and this is the assertion that would red if a
      // later change gave the trigger local selection state.
      const { target } = await open('ingot');
      assert.equal(
        target.querySelector('[data-scoped-entry-category-input]').textContent.trim(),
        'Refined'
      );
      const { target: unset } = await open('resin');
      assert.equal(
        unset.querySelector('[data-scoped-entry-category-input]').textContent.trim(),
        'No world category',
        'and a record with no world category says so on the control itself'
      );
    });
  });

  describe('the world tags are a TOGGLE RUN over the vocabulary, not an add field', () => {
    // `proto:899-901` draws the world tag list as click-to-toggle chips over the world
    // vocabulary, with no add field and no remove glyph on this card: authoring the vocabulary
    // itself is behind `Edit world vocabulary ↗`. Round 3 drew `✕ fuel` removable chips over an
    // `Add a world tag` field, which is a second authority for the same list.
    it('applies an unlit tag by writing the WHOLE list, not a delta', async () => {
      // `setWorldTags` replaces the array. A screen that forwarded only the tag it touched would
      // clear every other tag on the record, and the projection would agree with it.
      const { target, calls } = await open('coal');
      const unlit = target.querySelector('[data-scoped-entry-tag="fuel"]');
      assert.ok(Boolean(unlit), 'the run offers every tag the world vocabulary holds');

      target.querySelector('[data-scoped-entry-tag="bulk"]').click();
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'setWorldTags'),
        [{ verb: 'setWorldTags', args: ['coal', ['fuel']] }],
        'clearing `bulk` keeps `fuel`'
      );
    });

    it('and lights an unapplied one, so the toggle runs both ways', async () => {
      // The positive control: a run wired only to removal passes the assertion above.
      const { target, calls } = await open('ingot');
      const chip = target.querySelector('[data-scoped-entry-tag="fuel"]');
      assert.ok(Boolean(chip), 'a record with no tags of its own still sees the vocabulary');
      chip.click();
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'setWorldTags'),
        [{ verb: 'setWorldTags', args: ['ingot', ['fuel']] }]
      );
    });

    it('each chip is a real button reporting whether the tag is applied', async () => {
      // AC-28. A `<span onclick>` passes a pointer hit-test and is unreachable by keyboard, and
      // a toggle that does not report its state is a control a screen reader cannot read back.
      //
      // TWO RECORDS, because the fixture's tag vocabulary is `coal`'s OWN pair: on `coal` both
      // chips are lit, and only a record that holds neither can supply the unapplied face.
      const { target: applying } = await open('coal');
      const { target: empty } = await open('ingot');
      const applied = applying.querySelector('[data-scoped-entry-tag="bulk"]');
      const unapplied = empty.querySelector('[data-scoped-entry-tag="bulk"]');

      for (const chip of [applied, unapplied]) {
        assert.equal(chip.tagName, 'BUTTON', 'a clickable chip is a real button');
        assert.equal(chip.getAttribute('type'), 'button');
      }
      assert.equal(applied.getAttribute('aria-pressed'), 'true');
      assert.equal(unapplied.getAttribute('aria-pressed'), 'false');
    });

    it('and its accessible name states the DIRECTION as well as the tag', async () => {
      // A run of bare tag names says nothing out of visual context, and the two directions are
      // the same words unless the name carries the verb.
      const { target: applying } = await open('coal');
      const { target: empty } = await open('ingot');
      assert.match(
        applying.querySelector('[data-scoped-entry-tag="bulk"]').getAttribute('aria-label'),
        /Remove the world tag bulk/
      );
      assert.match(
        empty.querySelector('[data-scoped-entry-tag="bulk"]').getAttribute('aria-label'),
        /Apply the world tag bulk/
      );
    });

    it('and the card carries NO add field, because the vocabulary is authored elsewhere', async () => {
      const { target } = await open('coal');
      assert.ok(!target.querySelector('[data-scoped-entry-tag-input]'));
      assert.ok(!target.querySelector('[data-scoped-entry-tag-add]'));
    });

    it('and the note under it CLAIMS NO REACH, because the tags reach no system yet', async () => {
      // The rendered half of the same ruling the model test pins. World tags are merged by the
      // resolver only and the read union discards them, so the note used to close ` in every
      // system that has rules` about a list nothing reads. `setMutedTags` has no caller under
      // `src/` either — the mute clause survives only because a MIGRATED world can carry
      // `mutedTags` on a membership record, and this note is the one place that data is visible.
      //
      // BOTH BRANCHES, and the second is the one that matters. The fixture's `coal` is muted in
      // `sys-forge`, so it takes the mute clause and never reaches the `else` the false sentence
      // lived in — an assertion on `coal` alone passes with that sentence restored, which makes
      // it no guard at all. The no-mute face needs a record carrying tags and no mute, so the
      // defaults are overridden to put one on `ingot`.
      const { target: muted } = await open('coal');
      assert.equal(
        muted.querySelector('[data-scoped-entry-tag-note]').textContent.trim(),
        '2 world tags set on this record · muted in 1 system'
      );

      const { target: plain } = await open('ingot', {
        defaults: [
          { id: 'ingot', category: 'Refined', tags: ['ore'] },
          { id: 'coal', category: 'Raw', tags: ['fuel', 'bulk'] },
        ],
      });
      const sentence = plain.querySelector('[data-scoped-entry-tag-note]').textContent.trim();
      assert.equal(sentence, '1 world tag set on this record');
      assert.ok(
        !/every system/.test(sentence),
        `it promises the GM no reach it cannot deliver, and read "${sentence}"`
      );
    });
  });

  describe('deleting a component any system has rules for is REFUSED', () => {
    // AC-15, from the FOOT CARD rather than a header descriptor (`proto:928-936`). Asserted on
    // the CALL, never on a disabled attribute: a disabled button satisfies "the delete did not
    // happen" while leaving the GM no explanation at all.
    function deleteControl(target) {
      const card = target.querySelector('[data-scoped-entry-delete-card]');
      assert.ok(Boolean(card), 'the Catalogue entry tab ends in a Delete from the world card');
      const control = card.querySelector('[data-armed]');
      assert.ok(Boolean(control), 'and the card carries the armed control');
      return control;
    }

    it('states the refusal as VISIBLE body copy, naming the systems that cause it', async () => {
      const { target } = await open('ingot');
      const note = target.querySelector('[data-scoped-entry-delete-note]');
      assert.ok(Boolean(note), 'the refusal is body copy, not only an accessible name');
      assert.match(note.textContent, /cannot be deleted yet/);
      assert.match(note.textContent, /Forge/);
      assert.match(note.textContent, /Alchemy/, 'and names BOTH member systems');
    });

    it('and confirming it does NOT call deleteEntity', async () => {
      const { target, calls } = await open('ingot');
      deleteControl(target).click();
      await drain();
      deleteControl(target).click();
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
      const { target, calls } = await open('resin');
      assert.match(
        target.querySelector('[data-scoped-entry-delete-note]').textContent,
        /nothing else is affected/
      );
      deleteControl(target).click();
      await drain();
      deleteControl(target).click();
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'deleteEntity'),
        [{ verb: 'deleteEntity', args: ['resin'] }]
      );
    });

    it('and the header band carries no Delete at all', async () => {
      // `proto:817-819` puts Back and Save on the band and nothing else. The page reported a
      // descriptor into the shell's `danger` slot until round 4; a page that still reports one
      // would draw the control in BOTH places.
      const { target } = await open('ingot');
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-delete-card]')));
      assert.ok(
        !target.querySelector('[data-scoped-entry-delete-refusal]'),
        'and the separate refusal callout above the systems card is gone with it'
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

  /**
   * THE VALIDATION TAB IS THE REFERENCE'S (issue 1371 r11-entry, UX finding F-D).
   *
   * Three separate claims, and each was a different kind of wrong before this revision:
   *
   *  - the tab drew an `Entry validation` heading and an intro paragraph where `proto:957-960`
   *    puts the two-column grid as the body's FIRST child;
   *  - the hero read `World record` over "What every system inheriting this component resolves
   *    from it." — a description of the SUBJECT — on a record whose own tab badge said `Blocking
   *    2`, under a fixed `fa-clipboard-check` glyph. `proto:4577-4579` derives all three from the
   *    counts;
   *  - the block badge read `INCOMPLETE`, which is on no vocabulary the reference draws;
   *    `proto:4573`'s tone table gives `Blocking` / `Warning` / `Pass`.
   *
   * The hero copy is read off the RENDERED text rather than off a prop, because the derivation
   * moved into `ScopedValidationTab` and a page-level assertion on what the page passes could not
   * see a tab that dropped it.
   */
  /**
   * WHERE THIS SCREEN'S POINTER HIT-TESTS LIVE, AND WHY NOT HERE (issue 1371 r11-entry, UX F-H).
   *
   * The round-2 review looked for `elementFromPoint` in this file and found none. It is absent on
   * purpose and the absence is measured below rather than asserted in prose: happy-dom computes
   * NO layout, so every rendered node reports a 0x0 box and `document.elementFromPoint` answers
   * `null` at any coordinate. A hit-test written here would therefore be one of two useless
   * things — permanently red, or green over `null` — and neither can tell "the chip owns its
   * centre" from "an overlay swallows it", which is the whole question.
   *
   * The four `elementFromPoint` sites that DO exist under `tests/components/` are all real-browser
   * suites that stand up Chromium and a hand-built fixture page (`manager-layout`,
   * `overlay-portal-host-position`, `theme-rendered-validation`, `tool-rules-list-parity`). This
   * screen's are stronger than that: they run against the REAL app in the View Lab case registry,
   * in real Chromium, on every push — `world-component-entry-tags` carries `expectCenterHit` on a
   * world tag chip, and `world-component-entry-systems` carries one on the member row's 26px exit
   * icon plus an `expectClick`, which is a real Playwright pointer click whose actionability pass
   * is strictly stronger than `elementFromPoint`. `scoped-shell-prop-contract.test.js` guards that
   * those three survive, because a registry entry is a hand-maintained mirror.
   *
   * THE DELTA'S FOURTH NAMED TARGET NO LONGER EXISTS. Issue body line 540 asks for a hit-test on
   * "the entry's N-by-M mute chip grid"; the reference draws no per-system tag mute anywhere on
   * this screen and revision 8 removed it, which `viewLabCases.js`'s own note records in terms.
   * There is nothing to point at.
   *
   * This block is SELF-RETIRING: it reds the day happy-dom starts laying out, which is the day a
   * mounted hit-test becomes worth writing.
   */
  describe('a pointer hit-test cannot be made in this harness, and here is the measurement', () => {
    it('reports a zero box and a null hit for a chip the tree plainly renders', async () => {
      const { target } = await open('coal');
      const chip = target.querySelector('[data-scoped-entry-tag="fuel"]');
      assert.ok(Boolean(chip), 'NON-VACUITY: the chip this would hit-test is really rendered');

      const box = chip.getBoundingClientRect();
      assert.equal(
        `${box.width}x${box.height}`,
        '0x0',
        'happy-dom lays nothing out, so a rendered chip has no box to find a centre of'
      );
      const hit = window.document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
      assert.ok(
        !hit,
        'and nothing is at that point, so a mounted hit-test could only ever assert about `null`'
      );
    });
  });

  describe('the Validation tab states the VERDICT, with no heading above it', () => {
    async function validationTab(entityId) {
      const { target } = await open(entityId);
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();
      const tab = target.querySelector('[data-scoped-entry-validation]');
      assert.ok(Boolean(tab), 'the validation tab renders');
      return tab;
    }

    const heroCopy = (tab) => ({
      title: tab.querySelector('.manager-recipe-rail-summary-title').textContent.trim(),
      sub: tab.querySelector('.manager-recipe-rail-summary-sub').textContent.trim(),
      glyph: tab.querySelector('.manager-recipe-rail-summary-medallion i').className,
    });

    it('draws NO in-pane heading and no intro, so the grid is the first thing in the body', async () => {
      const tab = await validationTab('orphan');
      assert.ok(
        !tab.querySelector('.manager-recipe-tab-intro'),
        'the head block is absent entirely, not an empty one holding open a row of space'
      );
      assert.ok(
        !/Entry validation/.test(tab.textContent),
        'and the heading string is gone from the tab rather than merely unstyled'
      );
      const surface = tab.querySelector('[data-editor-validation-surface]');
      assert.equal(
        surface.firstElementChild.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
        'manager-recipe-validation-summary-row',
        'the two-column grid is the body’s first child, which is what `proto:958-959` draws'
      );
    });

    it('heads a BLOCKED record with the count, SINGULAR, over the sentence that says why', async () => {
      // `resin` is linked and named but no system has rules for it, so `systemRules` is the ONE
      // blocking check it fails — which is what makes it the fixture for the singular key.
      const copy = heroCopy(await validationTab('resin'));
      assert.equal(copy.title, '1 blocking issue');
      assert.equal(copy.sub, 'Clear these before saving.');
      assert.match(
        copy.glyph,
        /fa-circle-exclamation/,
        'and the glyph is the surface’s own blocking icon, not the tab strip’s clipboard'
      );
    });

    it('and the count MOVES when another blocking check fails, in the plural spelling', async () => {
      // ACTS on the control rather than reading a third fixture. `orphan` fails two blocking
      // checks at rest — no source Item, and no category resolves in the system in view — and
      // emptying its name is the third. A headline hard-wired to either spelling, or one reading
      // a snapshot rather than the live counts, fails one half of this pair.
      const { target } = await open('orphan');
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();
      assert.equal(
        heroCopy(target.querySelector('[data-scoped-entry-validation]')).title,
        '2 blocking issues'
      );

      target.querySelector('[data-scoped-entry-tab="definition"]').click();
      await drain();
      const name = target.querySelector('[data-scoped-entry-name]');
      name.value = '   ';
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      await drain();
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();
      assert.equal(
        heroCopy(target.querySelector('[data-scoped-entry-validation]')).title,
        '3 blocking issues',
        'the hero reads the counts the rows are grouped by, live'
      );
    });

    it('heads a WARNING record with the reference’s own two sentences', async () => {
      // `ingot` is linked and categorised, and carries no world tags — one warning, no blocker.
      const copy = heroCopy(await validationTab('ingot'));
      assert.equal(copy.title, 'Passing with warnings');
      assert.equal(copy.sub, '1 warning will not stop a save.');
      assert.match(copy.glyph, /fa-triangle-exclamation/);
    });

    it('and heads a CLEAN record with All clear, so all three verdicts are measured', async () => {
      // `coal` carries a world category and two world tags and is a member of the system in
      // view, so every check passes. Without this arm a hero that answered `warn` for anything
      // short of a blocker would pass both of the assertions above.
      const copy = heroCopy(await validationTab('coal'));
      assert.equal(copy.title, 'All clear');
      assert.equal(copy.sub, 'Every check passes. Ready to save.');
      assert.match(copy.glyph, /fa-circle-check/);
    });

    it('badges a blocking row `Blocking`, which is the reference’s own word for it', async () => {
      // `proto:4573`'s tone table gives the three badges as `Blocking` / `Warning` / `Pass`. Only
      // the block word is this family's to choose — the other two come from the shared recipe
      // keys and already read the reference's words in `lang/en.json`, which is asserted at the
      // source level in `scoped-shell-prop-contract.test.js` because this harness's `localize`
      // answers with the key and every mounted badge therefore renders a FALLBACK.
      const tab = await validationTab('orphan');
      const badges = [...tab.querySelectorAll('.manager-recipe-val-pill')].map((pill) =>
        pill.textContent.trim()
      );
      assert.ok(badges.includes('Blocking'), `the blocking badge reads Blocking; read ${badges}`);
      assert.ok(
        !badges.includes('INCOMPLETE') && !badges.includes('BLOCKS ENABLE'),
        `neither superseded word survives anywhere in the run; read ${badges}`
      );
    });
  });

  describe('the delete control names its consequence in BOTH faces', () => {
    // E.3 / AC-16 and WCAG 2.5.3 Label in Name: a control whose accessible name omits its visible
    // string is unactivatable by speech input, and `ArmedDangerButton` states that requirement
    // and cannot enforce it because the labels are authored by the page.
    it('reads Cannot delete when armed over a component with rules', async () => {
      const { target } = await open('ingot');
      const control = target.querySelector('[data-scoped-entry-delete-card] [data-armed]');
      control.click();
      await drain();
      const armed = target.querySelector('[data-scoped-entry-delete-card] [data-armed]');
      assert.equal(armed.textContent.trim(), 'Cannot delete');
      assert.ok(
        armed.getAttribute('aria-label').startsWith('Cannot delete'),
        `the armed name must contain its visible label; it read "${armed.getAttribute('aria-label')}"`
      );
    });

    it('and Confirm delete over one that can be, so the two faces are discriminating', async () => {
      const { target } = await open('resin');
      const control = target.querySelector('[data-scoped-entry-delete-card] [data-armed]');
      assert.ok(control.getAttribute('aria-label').includes('Delete entry'));
      control.click();
      await drain();
      const armed = target.querySelector('[data-scoped-entry-delete-card] [data-armed]');
      assert.equal(armed.textContent.trim(), 'Confirm delete');
      assert.ok(armed.getAttribute('aria-label').startsWith('Confirm delete'));
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
      // `proto:929` draws three PRESSABLE SEGMENTS, each with a trailing count badge; round 3
      // shipped a `<select>` whose option labels carried the counts in parentheses. The badge is
      // asserted per segment, because a filter that states the widened and narrowed sets is what
      // makes choosing between them legible before the click.
      const { target } = await open('resin');
      const segments = [...target.querySelectorAll('[data-scoped-entry-system-filter]')].map(
        (segment) => [
          segment.getAttribute('data-scoped-entry-system-filter'),
          segment.querySelector('[data-segment-badge]')?.textContent.trim(),
        ]
      );
      assert.deepEqual(
        segments,
        [
          ['all', '2'],
          ['with', '0'],
          ['without', '2'],
        ],
        'each segment states the set choosing it would show'
      );
      assert.equal(target.querySelectorAll('[data-scoped-entry-system]').length, 2);

      const radio = target.querySelector(
        '[data-scoped-entry-system-filter="with"] input[type="radio"]'
      );
      assert.ok(Boolean(radio), 'the segment is a real radio, not a span with a click handler');
      radio.checked = true;
      radio.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
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

    it('and each row states its SYSTEM RESOLUTION MODE under the name', async () => {
      // `proto:936` puts the system's own resolution mode under its name at 9.5px. Round 3 drew
      // a warning-toned `Overrides world category` CHIP there instead, which states a different
      // fact about a different record.
      const { target } = await open('ingot');
      const forge = target.querySelector('[data-scoped-entry-system-mode="sys-forge"]');
      const alchemy = target.querySelector('[data-scoped-entry-system-mode="sys-alchemy"]');
      assert.ok(Boolean(forge) && Boolean(alchemy), 'both rows state a mode');
      assert.equal(forge.textContent.trim(), 'Progressive');
      assert.equal(
        alchemy.textContent.trim(),
        'Simple',
        'and each reads its OWN roster entry, not the first one'
      );
    });

    it('and the summary column is ONE line of clauses beside the name, not a paragraph under it', async () => {
      const { target } = await open('coal');
      const row = target.querySelector('[data-scoped-entry-system="sys-forge"]');
      const summary = target.querySelector('[data-scoped-entry-system-summary="sys-forge"]');
      assert.ok(Boolean(summary));
      assert.equal(
        summary.parentElement,
        row,
        'the summary is a COLUMN of the row (`proto:937`), not a sibling block below it'
      );
      // `coal` overrides its category in Forge and mutes one of its two world tags there.
      assert.match(summary.textContent, /Its own category/);
      // AND IT STATES NO TAG COUNT AT ALL (issue 1371, revision 8). The clause read
      // `{n} tags`, computed as the world list minus this system's mutes — a number NO system
      // resolves, because `tags` is not a section and the read union discards the resolver's
      // additive merge. `coal` is the fixture record that carries two world tags AND a mute in
      // this very system, so it is the one row where a restored clause would have a number to
      // print: this assertion is on the record that can red.
      assert.ok(
        !/\btags?\b/i.test(summary.textContent),
        `the row claims no per-system tag count, and read "${summary.textContent}"`
      );
      assert.match(
        summary.textContent,
        /recipes?/,
        'while the clauses the projection CAN answer survive'
      );
    });

    it('and an INHERITING member names the world value it resolves', async () => {
      // The positive control on the clause above: a summary hard-wired to `Its own category`
      // passes that assertion on every row.
      const { target } = await open('ingot');
      assert.match(
        target.querySelector('[data-scoped-entry-system-summary="sys-forge"]').textContent,
        /Refined/
      );
      // THE OVERRIDE BRANCH NAMES NO VALUE, and that is the assertion rather than an omission:
      // the published system row does not carry an overriding system's category, so a summary
      // that stated one would be stating `row.category ?? ''`.
      const overrideSummary = target.querySelector(
        '[data-scoped-entry-system-summary="sys-alchemy"]'
      ).textContent;
      assert.match(overrideSummary, /Its own category/);
      assert.ok(
        !/No world category/.test(overrideSummary),
        'and it never says the system resolves nothing over a world record that HAS a category'
      );
    });

    it('and a NON-MEMBER row says nothing REACHES it, rather than naming a category', async () => {
      const { target } = await open('resin');
      const summary = target.querySelector('[data-scoped-entry-system-summary="sys-forge"]');
      assert.match(summary.textContent, /No rules — invisible to recipes in this system/);
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

    it('and `Add alias` is inert until a uuid is actually typed', async () => {
      // `proto:5436-5438` gives the control two faces and switches on the FIELD, because an
      // enabled-looking button that commits an empty alias is a control that reports success
      // having stored nothing. The paint follows the disabled state, so the state is the
      // assertion: a card that dropped the guard would still look right and behave wrongly.
      const { target } = await open('ingot');
      const add = target.querySelector('[data-scoped-entry-alias-add]');
      assert.ok(Boolean(add), 'the alias row offers its add control');
      assert.ok(add.disabled, 'and it is off over an empty field');

      const field = target.querySelector('[data-scoped-entry-alias-input]');
      assert.ok(Boolean(field));
      field.value = 'Item.second-source';
      field.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      assert.ok(
        !target.querySelector('[data-scoped-entry-alias-add]').disabled,
        'and on once there is a uuid to commit'
      );
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

  describe('identity is READ-ONLY for a linked record, and says why', () => {
    // `proto:834-841`, and the single biggest information-model divergence round 3 shipped: it
    // drew a `Name` input and a `Description` textarea, which is a second authority for three
    // values the linked Foundry Item already owns and refreshes.
    it('draws the name as a VALUE under a lock pill naming the source type', async () => {
      const { target } = await open('ingot');
      const name = target.querySelector('[data-scoped-entry-name]');
      assert.ok(Boolean(name));
      assert.notEqual(name.tagName, 'INPUT', 'a linked name is not an editable field');
      assert.equal(name.textContent.trim(), 'Iron Ingot');

      const pill = target.querySelector('[data-scoped-entry-linked-pill]');
      assert.ok(Boolean(pill), 'and the lock pill states what it is linked to');
      assert.match(pill.textContent, /Linked Foundry item/);
    });

    it('and the description with it, over the note that says both refresh', async () => {
      const { target } = await open('ingot');
      const description = target.querySelector('[data-scoped-entry-description]');
      assert.ok(Boolean(description));
      assert.notEqual(description.tagName, 'TEXTAREA');
      assert.equal(
        target.querySelector('[data-scoped-entry-attribution]').textContent.trim(),
        'Name, image and description refresh from the linked item. Every system shows the same three.'
      );
    });

    it('and the identity card carries NO drop zone: the source card holds the one way to re-point it', async () => {
      // MAINTAINER RULING M17 (issue 1371, revision 13). The read-only card used to trail a
      // compact drop target beside the description (`proto:842`), so a linked record had TWO
      // zones on one tab doing one thing; the ruling removes the identity card's and lets the
      // description run the card's full width. The source card's zone stays, because it is the
      // one that says what a drop rewrites.
      const { target } = await open('ingot');
      assert.ok(
        !target.querySelector('[data-item-drop-zone="component-identity"]'),
        'the identity card offers no drop target of its own'
      );
      assert.ok(
        !target.querySelector('[data-scoped-entry-identity-card] .manager-item-drop-zone'),
        'and no other zone sits inside it either'
      );
      const zone = target.querySelector(
        '[data-scoped-entry-source-card] [data-item-drop-zone="component-source"]'
      );
      assert.ok(Boolean(zone), 'the source card still offers the one way to re-point the link');
      assert.ok(
        zone.classList.contains('is-compact'),
        `and it is still the prompt-only face; it read "${zone.className}"`
      );
    });

    it('but a record with NO source item keeps both fields, because nothing else can name it', async () => {
      // The positive control, and the product ruling this lane reports rather than assumes: an
      // unlinked component has no Item to refresh from, so the editable pair is the only way its
      // name exists at all.
      const { target } = await open('orphan');
      assert.equal(target.querySelector('[data-scoped-entry-name]').tagName, 'INPUT');
      assert.equal(target.querySelector('[data-scoped-entry-description]').tagName, 'TEXTAREA');
      assert.match(
        target.querySelector('[data-scoped-entry-linked-pill]').textContent,
        /No source item/
      );
    });

    it('and the standing disclosure paragraph and world banner are gone', async () => {
      // Both were subject-only and displaced the reference's FIRST card (`proto:833`). What they
      // said is said by the identity note above and the classification card's own subtitle.
      const { target } = await open('ingot');
      assert.ok(!target.querySelector('[data-scoped-entry-disclosure]'));
      assert.ok(!target.querySelector('[data-scoped-entry-world-banner]'));
    });
  });

  describe('the three controls this module\'s STYLESHEET cannot reach are drawn by a prop', () => {
    /*
     * WHY THESE THREE ARE PINNED HERE AND NOT IN `styles/fabricate.css`.
     *
     * `module.json` publishes one stylesheet and Foundry imports an unlayered module sheet at
     * `layer(modules)`, while a Svelte component's own `<style>` block is injected UNLAYERED. An
     * unlayered normal declaration beats a layered one at ANY specificity, so the lock pill's
     * type, the tag run's scale and the filter's shape and paint cannot be written in the sheet
     * — measured in round 5, where a five-compound selector left the chip at the primitive's
     * 9.92px and only `!important` moved it.
     *
     * Each is therefore an OPT-IN prop on the primitive, and a prop that stops being passed
     * regresses silently to the shipped face: the control still renders, still behaves, and the
     * rest of this suite still passes. That is exactly the class of defect nothing else here can
     * see, which is why the three assertions below are on the resolved variant rather than on a
     * measured pixel this suite has no way to read.
     */
    it('the linked lock pill is the OUTLINED emphasis over the subtle tone', async () => {
      // `proto:834` draws it at 9px secondary ink on a `--fab-border` hairline over a 2px/8px
      // band; the shipped `subtle` face is 9.92px on no border at 1px/4px. `tone` still says
      // WHAT it is, so both props are asserted — an emphasis that had displaced the tone would
      // repaint the pill's surface as well as its band.
      const { target } = await open('ingot');
      const pill = target.querySelector('[data-scoped-entry-linked-pill] .fab-status-pill');
      assert.ok(Boolean(pill), 'a linked record draws the pill');
      assert.equal(
        pill.getAttribute('data-status-pill-emphasis'),
        'outlined',
        'the primitive reports the RESOLVED emphasis, so a dropped prop reads as an absent one'
      );
      assert.ok(
        pill.classList.contains('is-subtle'),
        `and the tone survives beside it, but read "${pill.className}"`
      );
    });

    it('every world-tag chip carries the TAG-RUN scale, lit and unlit alike', async () => {
      // `proto:5401` draws the run at 600/11px on a 5px/12px band at radius 999 — a chip that is
      // a CONTROL, not a badge. BOTH faces, because `density` and `tone` are separate props: a
      // wiring that passed the scale only on the lit branch would draw two chip sizes in one run,
      // and the fixture's `coal` (both tags applied) cannot show the unlit face at all.
      const { target: applying } = await open('coal');
      const { target: empty } = await open('ingot');
      const lit = applying.querySelector('[data-scoped-entry-tag="bulk"]');
      const unlit = empty.querySelector('[data-scoped-entry-tag="bulk"]');
      for (const chip of [lit, unlit]) {
        assert.ok(
          chip.classList.contains('is-tag-run'),
          `each chip carries the run's own scale, and read "${chip.className}"`
        );
      }
      assert.ok(lit.classList.contains('is-tag'), 'the applied chip keeps the purple fill');
      assert.ok(
        unlit.classList.contains('is-neutral'),
        `and the unapplied one keeps the neutral tone, whose ink is the reference's own \`--muted\`, but read "${unlit.className}"`
      );
    });

    it('and the APPLIED chip alone asks for the lit emphasis, which is its ink and its fill', async () => {
      // `proto:5401`/`proto:5665` draw the applied tag as one colour said three ways — on the
      // edge, on a wash of itself, and ON THE LABEL. `tone="tag"` states the edge and only the
      // edge: it mixes its wash into the opaque surface behind the chip and inks the label in the
      // default text token. The other two declarations are the shared primitive's
      // `emphasis="lit"`, so a wiring that dropped that prop would still render a toned,
      // correctly scaled, correctly edged chip and would still pass every other assertion here —
      // the same silent regression to a shipped face this describe block exists to catch.
      //
      // The unlit chip is asserted WITHOUT it, and that is a constraint rather than symmetry:
      // the emphasis is selected on the two chip classes that declare a colour of their own, so
      // `is-lit` beside `is-neutral` matches nothing. A wiring that passed the emphasis
      // unconditionally would read as correct from the lit chip alone and would be dead markup on
      // every other chip in the run.
      const { target: applying } = await open('coal');
      const { target: empty } = await open('ingot');
      const lit = applying.querySelector('[data-scoped-entry-tag="bulk"]');
      const unlit = empty.querySelector('[data-scoped-entry-tag="bulk"]');
      assert.ok(
        lit.classList.contains('is-lit'),
        `the applied chip asks for the lit face, and read "${lit.className}"`
      );
      assert.ok(
        !unlit.classList.contains('is-lit'),
        `and the unapplied one does not ask for a face it has no colour to wear, but read "${unlit.className}"`
      );
    });

    it('the systems filter is a PILL run on the SOFT accent track', async () => {
      // `proto:5457`: three unenclosed segments at radius 999, the chosen one on the soft accent
      // and the rest on a `--fab-bg-1` fill behind a hairline, all three at 600.
      const { target } = await open('resin');
      const track = target.querySelector('[data-scoped-entry-system-filters]');
      assert.ok(Boolean(track), 'the card draws the filter');
      // WHOLE-TOKEN MATCHING, never `className.includes`: `is-accent` is a PREFIX of
      // `is-accent-soft` and BOTH tracks ship, so a substring test would call the solid accent
      // present here and would keep passing if the tone were changed to it.
      assert.ok(
        track.classList.contains('is-pill'),
        `the construction is the pill run, and read "${track.className}"`
      );
      assert.ok(track.classList.contains('is-accent-soft'), 'and the paint is the soft accent');
      assert.ok(
        !track.classList.contains('is-accent'),
        'and NOT the solid accent track, which paints the chosen segment as a filled button'
      );
      assert.ok(
        track.classList.contains('is-compact'),
        'the scale is untouched: shape and tone are orthogonal to density'
      );
      assert.ok(
        Boolean(track.querySelector('[data-scoped-entry-system-filter="all"] .is-badge')),
        'and the tally stays the `badge` slot, which inks the idle numeral subtle and lets the chosen one inherit the accent'
      );
    });
  });

  describe('the header band is told what the record IS and how far it reaches', () => {
    // `proto:815`. The band drew the PAGE name and a generic subtitle; the reference draws the
    // entity. The page reports the sub-line up because it already resolves the source type for
    // its own lock pill, and resolving it twice is how a band and a card come to disagree.
    it('reports the source type and the membership reach', async () => {
      const { reports } = await open('ingot');
      assert.equal(reports.sublines.at(-1), 'Linked Foundry item · rules in 2 of 2 systems');
    });

    it('and says so for an unlinked record too, so the branches are discriminating', async () => {
      const { reports } = await open('orphan');
      assert.equal(reports.sublines.at(-1), 'No source item · rules in 1 of 2 systems');
    });
  });

  describe('the world category card exits to the vocabulary screen', () => {
    // The reference draws one `World classification` card carrying `Edit world vocabulary`; this
    // screen splits that card in two, and the split dropped the exit. It is restored on the
    // category half, because the category is the value a system resolves and the vocabulary
    // screen is where the list it is chosen from is authored.
    it('hands the click BACK, so the owner runs the unsaved-changes guard', async () => {
      // THE HANDOFF IS THE POINT. This editor buffers its identity edits, and every other route
      // change on this screen goes through the gateway's `setView`, which confirms before it
      // moves. A link that navigated itself would be the one exit here that discarded a draft
      // silently — so the assertion is that the page CALLS OUT rather than that a route changed.
      const { target, reports, calls } = await open('ingot');
      const exit = target.querySelector('[data-scoped-entry-vocabulary-exit]');
      assert.ok(Boolean(exit), 'the category card offers the exit');
      exit.click();
      await drain();
      assert.deepEqual(reports.vocabulary, [true], 'exactly one handoff');
      assert.deepEqual(calls, [], 'and it writes nothing on the way out');
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

    it('and its accessible name DISCLOSES the recipe cascade the removal runs', async () => {
      // The idle face of this control is a bare 26px exit icon with NO visible label, so its
      // `aria-label` is the only name it has — and `removeFromSystem` for a COMPONENT is
      // `partComponentFromSystem`, which runs the in-system delete through `deleteComponents`
      // and disables every recipe left without a usable ingredient set or result. A sentence
      // that names only the overrides tells a GM the safe half and not the consequential one.
      //
      // Read off the ROW, from the same fixture the actuation cases above use, so this cannot
      // pass against a sentence assembled anywhere but the control the GM activates.
      const { target } = await open('ingot');
      const remove = rowOf(target, 'sys-alchemy').querySelector('[data-armed]');
      const note = remove.getAttribute('aria-label');
      assert.match(note, /Remove from this system/, 'the name still opens with the action');
      assert.match(note, /Remove Iron Ingot from Alchemy/, 'and names this row own pair');
      assert.match(note, /rewrites every recipe in that system that names it/);
      assert.match(note, /disables any recipe left without a usable ingredient set or result/);
      assert.equal(
        /Its overrides go with it/.test(note),
        false,
        'the sentence that stopped at the overrides is what this pin exists to refuse'
      );
      // The hover title is the same sentence, because a sighted GM reads it from there.
      assert.equal(remove.getAttribute('title'), note);
    });

    it('and the member row trails `View system rules` beside the exit icon', async () => {
      // `proto:942-945` draws the two together in the row's trailing cluster. Round 3 drew
      // `Open rules` plus a 97px labelled `🗑 Remove` danger button.
      const { target } = await open('ingot');
      const exit = rowOf(target, 'sys-forge').querySelector('[data-scoped-entry-system-rules]');
      assert.ok(Boolean(exit), 'the member row offers its exit');
      assert.equal(exit.textContent.trim(), 'View system rules');

      const cluster = exit.closest('.manager-component-entry-row-actions');
      assert.ok(Boolean(cluster), 'and it is inside the row trailing cluster');
      const remove = cluster.querySelector('[data-armed]');
      assert.ok(Boolean(remove), 'sharing that cluster with the removal control');
      assert.equal(
        remove.textContent.trim(),
        '',
        'which is a bare glyph until it is armed (`proto:944`), not a labelled danger button'
      );
      assert.ok(
        !exit.classList.contains('is-full-width'),
        'and neither control is stretched across the row'
      );
    });

    it('and the NON-MEMBER row trails a DASHED add with no hint paragraph', async () => {
      // The maintainer's stated example. Round 3 drew a full-width filled green `is-primary`
      // `+ Add to this system` with an explanatory line beside it; `proto:948` draws a 28px
      // transparent control on a dashed hairline, labelled `Add to system`, and nothing else.
      const { target } = await open('resin');
      const add = rowOf(target, 'sys-forge').querySelector('[data-scoped-membership-add]');
      assert.ok(Boolean(add));
      assert.equal(add.textContent.trim(), 'Add to system');
      assert.ok(add.classList.contains('is-dashed'), `it read "${add.className}"`);
      assert.ok(!add.classList.contains('is-primary'), 'never the filled accent treatment');
      assert.ok(
        !target.querySelector('[data-scoped-membership-hint]'),
        'and the hint paragraph beside it is gone with it'
      );
    });

    it('and the non-member row is MARKED as one, so the cohort is addressable', async () => {
      // `proto:5461` fills a row with no rules with `surface-soft` and leaves the member row
      // transparent, which needs a class on the row rather than only an ink change on its copy.
      // `orphan` is a member of `sys-forge` and NOT of `sys-alchemy`, so one mount carries both
      // faces and the claim is a discrimination rather than a presence check — `ingot`, which
      // every other test here mounts, is a member of both and could not tell them apart.
      const { target } = await open('orphan');
      assert.ok(
        !rowOf(target, 'sys-forge').classList.contains('is-outsider'),
        'a member row is not marked'
      );
      const outsider = rowOf(target, 'sys-alchemy');
      assert.ok(
        outsider.classList.contains('is-outsider'),
        `and one with no rules is, but read "${outsider.className}"`
      );
    });

    it('and that exit carries the OWN row system, not the first one', async () => {
      const { target, reports } = await open('ingot');
      rowOf(target, 'sys-alchemy').querySelector('[data-scoped-entry-system-rules]').click();
      await drain();
      assert.deepEqual(reports.rules, [['ingot', 'sys-alchemy']]);
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
  describe('every card is HEADED, not kickered', () => {
    // `proto:845`, `:882` and `:921` draw one head three times: a glyph in the card's own ink, an
    // `h3` at 14px serif, and a sentence saying what the card decides. Round 3 drew a bare
    // uppercase kicker on each — a FIELD label doing a SECTION head's job — and on the systems
    // card the kicker read the DATA (`2 OF 6 SYSTEMS HAVE RULES`) rather than naming the card.
    const HEADS = [
      ['[data-scoped-entry-source-card]', 'Source identity', 'fa-fingerprint'],
      ['[data-scoped-entry-classification-card]', 'World classification', 'fa-tags'],
      ['[data-scoped-entry-systems-card]', 'Systems using this component', 'fa-layer-group'],
    ];

    for (const [selector, heading, glyph] of HEADS) {
      it(`heads ${heading} with a glyph, a serif h3 and a subtitle`, async () => {
        const { target } = await open('ingot');
        const card = target.querySelector(selector);
        assert.ok(Boolean(card), `the tab renders ${heading}`);

        const title = card.querySelector('.manager-card-heading');
        assert.ok(Boolean(title), 'the head carries a heading element');
        assert.equal(title.tagName, 'H3');
        assert.equal(title.textContent.trim(), heading);
        assert.ok(
          Boolean(card.querySelector(`.manager-card-glyph.${glyph}`)),
          `and its own ${glyph} glyph`
        );
        assert.ok(
          card.querySelector('.manager-subtitle')?.textContent.trim().length > 0,
          'and a sentence under it saying what the card decides'
        );
      });
    }

    it('and the classification card holds BOTH the category and the tags', async () => {
      // `proto:881-910` draws ONE card with a `minmax(0,260px) minmax(0,1fr)` body. Round 3 drew
      // two cards, `World category` and `World tags`, and the split put the vocabulary exit on
      // only one of them.
      const { target } = await open('coal');
      const card = target.querySelector('[data-scoped-entry-classification-card]');
      assert.ok(Boolean(card.querySelector('[data-scoped-entry-category-input]')));
      assert.ok(Boolean(card.querySelector('[data-scoped-entry-tags]')));
      assert.ok(Boolean(card.querySelector('[data-scoped-entry-vocabulary-exit]')));
      assert.ok(
        Boolean(card.querySelector('[data-scoped-entry-category-label]')),
        'each column carries its own micro-label (`proto:889`, `:898`)'
      );
      assert.ok(Boolean(card.querySelector('[data-scoped-entry-tags-label]')));
    });

    it('and the systems head trails its own Add to systems… action', async () => {
      const { target } = await open('ingot');
      const card = target.querySelector('[data-scoped-entry-systems-card]');
      const action = card.querySelector('[data-scoped-entry-add-to-systems]');
      assert.ok(Boolean(action), '`proto:925` pins it to the head trailing edge');
      assert.equal(action.textContent.trim(), 'Add to systems…');
    });

    it('and the vocabulary exit is a bare text action, not a filled button', async () => {
      // `proto:886` draws it as accent ink with a trailing external-link mark. Round 3 drew a
      // filled 34px `ManagerButton` with a leading `fa-tags`.
      const { target } = await open('ingot');
      const exit = target.querySelector('[data-scoped-entry-vocabulary-exit]');
      assert.ok(exit.classList.contains('manager-inline-link'), `it read "${exit.className}"`);
      assert.ok(!exit.classList.contains('manager-button'));
      assert.ok(Boolean(exit.querySelector('.fa-arrow-up-right-from-square')));
    });
  });

  describe('the preview rail is a COLUMN of the page, drawn on both tabs', () => {
    // `proto:986`. Round 3 nested the rail inside the Definition tab's scrolling panel, so
    // scrolling to the systems card left it blank (`subject-entry-definition-scroll-03.png`) and
    // the Validation tab had no rail at all.
    it('sits beside the tab panel rather than inside it', async () => {
      const { target } = await open('ingot');
      const rail = target.querySelector('[data-scoped-entry-preview]');
      assert.ok(Boolean(rail), 'the page renders its rail');
      assert.ok(
        !rail.closest('[data-scoped-entry="world-component-entry"]'),
        'a rail inside the tab panel scrolls away with the cards'
      );
      assert.ok(
        rail.parentElement.classList.contains('manager-component-entry-page'),
        `the rail is a child of the page grid; it read "${rail.parentElement.className}"`
      );
    });

    it('and survives the switch to Validation', async () => {
      const { target } = await open('ingot');
      target.querySelector('[data-scoped-entry-tab="validation"]').click();
      await drain();
      assert.ok(
        Boolean(target.querySelector('[data-scoped-entry-validation]')),
        'the tab really switched'
      );
      assert.ok(
        Boolean(target.querySelector('[data-scoped-entry-preview]')),
        'and the rail is still drawn'
      );
    });

    it('draws the inventory tile, the resolved category and the effective tags', async () => {
      // `proto:990-1000`. None of this existed in round 3, which drew a `World defaults` rule
      // list — the same three values the cards beside it already author.
      const { target } = await open('coal');
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-preview-tile]')));
      assert.equal(
        target.querySelector('[data-scoped-entry-preview-category]').textContent.trim(),
        'Raw'
      );
      const tags = [
        ...target.querySelectorAll('[data-scoped-entry-preview-tags] .manager-chip'),
      ].map((chip) => chip.textContent.trim());
      assert.deepEqual(tags, ['fuel', 'bulk']);
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-preview-scope-note]')));
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-preview-live]')));
    });

    it('and both fact groups, each with its own empty sentence', async () => {
      // `proto:1003-1017`. `entry.requiredBy` and `entry.producedBy` are both projected; the
      // fixture wires neither, so this is the EMPTY face — and an absent group and an empty one
      // say different things, only one of which is ever true here.
      const { target } = await open('ingot');
      const sentences = [...target.querySelectorAll('.manager-scoped-preview-fact-empty')].map(
        (node) => node.textContent.trim()
      );
      assert.deepEqual(sentences, ['No recipe requires it yet.', 'Nothing produces it yet.']);
      const kickers = [
        ...target.querySelectorAll('[data-scoped-entry-preview] .manager-kicker'),
      ].map((node) => node.textContent.trim());
      assert.deepEqual(kickers, ['How players see it', 'Used by', 'Produced by']);
    });

    it('and the fact rows carry their reference and its badge when the corpus has one', async () => {
      // The positive control on the empty faces above: a rail hard-wired to its empty sentences
      // passes every assertion in the previous test.
      const target = await harness.mount({
        scope: withUsage(scopeFor(), 'ingot', {
          requiredBy: [
            {
              id: 'r1',
              name: 'Forge a Blade',
              kind: 'recipe',
              systemId: 'sys-forge',
              systemName: 'Forge',
            },
          ],
          producedBy: [
            {
              id: 't1',
              name: 'Pan the Shallows',
              kind: 'gathering',
              systemId: 'sys-forge',
              systemName: 'Forge',
            },
          ],
        }),
        actions: recordingComponentActions().actions,
        entityId: 'ingot',
        systemId: 'sys-forge',
        systems: ENTRY_SYSTEMS,
        worldItems: [],
      });
      const rows = [...target.querySelectorAll('[data-scoped-entry-preview-rule]')];
      assert.equal(rows.length, 2, 'one row per reference, across both groups');
      assert.match(rows[0].textContent, /Forge a Blade/);
      assert.match(rows[0].textContent, /Ingredient/);
      assert.match(rows[1].textContent, /Pan the Shallows/);
      assert.match(
        rows[1].textContent,
        /Gathering/,
        'the produced-by badge names the KIND the corpus actually carries'
      );
    });
  });

  describe('the tab strip names the CATALOGUE ENTRY and badges its validation state', () => {
    // `proto:824`. Round 3 read `Definition`, and badged the Validation tab only on a failure —
    // so a clear record and an unchecked one drew the same tab.
    it('reads Catalogue entry, and ticks when nothing blocks or warns', async () => {
      const { target } = await open('coal');
      assert.equal(
        target.querySelector('[data-scoped-entry-tab="definition"]').textContent.trim(),
        'Catalogue entry'
      );
      assert.equal(
        target.querySelector('[data-scoped-entry-tab-badge="validation"]').textContent.trim(),
        '✓'
      );
    });

    it('and carries the blocking COUNT when there is one', async () => {
      const { target } = await open('orphan');
      const badge = target.querySelector('[data-scoped-entry-tab-badge="validation"]');
      assert.equal(badge.getAttribute('data-badge-tone'), 'danger');
      assert.notEqual(badge.textContent.trim(), '✓');
    });
  });

  describe('the source card ACTS: all three controls forward, none is decoration', () => {
    // THE COVERAGE THAT DID NOT MOVE WITH THE BEHAVIOUR (issue 1371, revision 8). M7 retired
    // `onReplaceSource` / `onUnlinkSource` / `onCopySourceUuid` from the rules editor and
    // `component-identity-strip-mounted.test.js` deleted the three tests that proved them. The
    // behaviours arrived HERE and nothing followed them: a no-op substituted for each of the
    // three handlers left 672 tests green.
    //
    // Each is asserted on the FORWARDED ARGUMENT LIST rather than on a post-state, for this
    // screen's standing reason — none of the three writes anything the projection republishes,
    // so there is no post-state to read.
    it('Unlink reports the cut UP, because the shell owns the document write', async () => {
      const { target, calls, reports } = await open('ingot');
      const unlink = target.querySelector('[data-scoped-entry-source-unlink]');
      assert.ok(Boolean(unlink), 'a linked record offers the cut');
      unlink.click();
      await drain();
      assert.deepEqual(reports.shell, [['unlink']]);
      assert.deepEqual(calls, [], 'and it is not an `actions` verb, so nothing was written here');
    });

    it('and it is WITHHELD for a record with no link, so the control never lies', async () => {
      // The negative arm the page wires with `sourceLinked ? onUnlinkSource : null`. Without it a
      // card that always drew Unlink would pass the assertion above and offer a GM a cut with
      // nothing to cut.
      const { target } = await open('orphan');
      assert.ok(
        !target.querySelector('[data-scoped-entry-source-unlink]'),
        'an unlinked record offers no cut'
      );
    });

    it('Copy hands the source uuid to the clipboard seam and acknowledges it', async () => {
      // THE ARGUMENT IS THE ASSERTION. The clipboard write is silent, so a control wired to
      // `onCopySourceUuid()` with no argument — or with the entry id, one identifier away —
      // copies an empty string or the wrong string and looks identical either way.
      const { target, reports } = await open('ingot');
      const copy = target.querySelector('[data-scoped-entry-source-copy]');
      assert.ok(Boolean(copy));
      assert.equal(copy.textContent.trim(), 'Copy');
      copy.click();
      await drain();
      assert.deepEqual(reports.shell, [['copy', 'Item.ingot-source']]);
      assert.equal(
        target.querySelector('[data-scoped-entry-source-copy]').textContent.trim(),
        'Copied',
        'and the label acknowledges, which is the whole feedback a silent clipboard write has'
      );
    });

    it('a drop on the replace target forwards the dropped uuid, and refuses a non-Item', async () => {
      // `proto:856-861`. The drop is the only way to RE-POINT a linked record, and it goes
      // through the same shipped `ItemDropZone` guard every other zone uses — so the rejected
      // table is asserted beside the accepted one, or a zone that dropped its document-type check
      // would pass on the accepted arm alone.
      const { target, reports } = await open('ingot');
      const zone = target.querySelector('[data-item-drop-zone="component-source"]');
      assert.ok(Boolean(zone), 'the source card offers its replace target');

      dispatchDrop(zone, { type: 'Item', uuid: 'Item.replacement' });
      await drain();
      assert.deepEqual(reports.shell, [['drop', 'Item.replacement']]);

      dispatchRejectedDrops(zone);
      await drain();
      assert.equal(
        reports.shell.filter(([kind]) => kind === 'drop').length,
        1,
        'an Actor, a Macro and a uuid-less payload all bounce'
      );
    });

    it('and a drop on the IDENTITY card forwards nothing, because it is no target any more', async () => {
      // MAINTAINER RULING M17 (issue 1371, revision 13). This used to prove `proto:842`'s second
      // prompt-only zone was wired to the same seam; the ruling removes that zone, so the
      // inverse is what stands: an Item dropped on the identity card reaches the shell through
      // NO handler, and the source card's zone above is the one drop that re-points the link.
      const { target, reports } = await open('ingot');
      dispatchDrop(target.querySelector('[data-scoped-entry-identity-card]'), {
        type: 'Item',
        uuid: 'Item.from-identity',
      });
      await drain();
      assert.deepEqual(reports.shell, [], 'nothing on the identity card accepts a drop');
    });
  });

  describe('the alias row WRITES, rather than only enabling itself', () => {
    // The other half of `Add alias is inert until a uuid is typed`. That test proves the DISABLED
    // state and stops there, so a button that enabled correctly and committed nothing — or
    // committed the wrong list shape — passed it.
    it('Add alias appends the TYPED uuid to the list already on the record', async () => {
      const { target, calls } = await open('ingot');
      const field = target.querySelector('[data-scoped-entry-alias-input]');
      field.value = 'Item.second-source';
      field.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      target.querySelector('[data-scoped-entry-alias-add]').click();
      await drain();

      // THE WHOLE LIST, NOT A DELTA. `updateEntity` replaces the field it is given, so a write of
      // `[uuid]` alone would silently drop `Item.ingot-legacy` — the alias the fixture record
      // already answers to, and the one a re-pointed link exists to keep matching.
      assert.deepEqual(calls, [
        {
          verb: 'updateEntity',
          args: ['ingot', { aliasItemUuids: ['Item.ingot-legacy', 'Item.second-source'] }],
        },
      ]);
      assert.equal(
        target.querySelector('[data-scoped-entry-alias-input]').value,
        '',
        'and the field clears, so a second Enter cannot commit the same uuid twice'
      );
    });

    it('and Enter commits it too, which is what the placeholder promises', async () => {
      const { target, calls } = await open('ingot');
      const field = target.querySelector('[data-scoped-entry-alias-input]');
      assert.match(field.getAttribute('placeholder'), /then Enter/);
      field.value = 'Item.typed-then-entered';
      field.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      field.dispatchEvent(
        new target.ownerDocument.defaultView.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );
      await drain();
      assert.deepEqual(calls, [
        {
          verb: 'updateEntity',
          args: ['ingot', { aliasItemUuids: ['Item.ingot-legacy', 'Item.typed-then-entered'] }],
        },
      ]);
    });
  });

  describe('`Add to systems…` reveals the addable cohort', () => {
    // `proto:925` draws a modal picker over the non-member systems; this repository has no such
    // overlay and `actions` exposes only the per-pair `addToSystem`, so the control narrows the
    // card to the systems the component is NOT in. That is a real behaviour with a real
    // consequence for what is on screen, and it was named by a lab `expectContained` and one
    // presence query — clicked by neither.
    it('narrows the card to the systems the component has no rules in', async () => {
      // `orphan` is a member of `sys-forge` and not of `sys-alchemy`, so the widened and the
      // narrowed sets are DIFFERENT — on a record that is a member of both, or of neither, this
      // control could do nothing at all and still pass.
      const { target } = await open('orphan');
      assert.equal(target.querySelectorAll('[data-scoped-entry-system]').length, 2);

      target.querySelector('[data-scoped-entry-add-to-systems]').click();
      await drain();

      const shown = [...target.querySelectorAll('[data-scoped-entry-system]')].map((row) =>
        row.getAttribute('data-scoped-entry-system')
      );
      assert.deepEqual(shown, ['sys-alchemy'], 'only the system it can still be added to');
      assert.match(
        target.querySelector('[data-scoped-entry-system-count]').textContent,
        /1 of 2/,
        'and the count follows what the head action did'
      );
      const chosen = target.querySelector(
        '[data-scoped-entry-system-filter="without"] input[type="radio"]'
      );
      assert.ok(
        chosen.checked,
        'the segmented filter moves with it, so the narrowing is legible and reversible'
      );
      assert.ok(
        Boolean(
          target.querySelector('[data-scoped-entry-system="sys-alchemy"] [data-scoped-membership-add]')
        ),
        'and every revealed row carries the Add this control exists to reach'
      );
    });
  });

  describe('the duplicate-source band offers a merge route only where one exists', () => {
    /** A corpus in which `resin` claims the SAME source item as `ingot`. */
    const SHARED_SOURCE = {
      entities: [
        {
          id: 'ingot',
          name: 'Iron Ingot',
          description: 'A bar of worked iron.',
          img: 'icons/commodities/metal/ingot-worn-iron.webp',
          originItemUuid: 'Item.ingot-source',
          registeredItemUuid: 'Item.ingot-source',
          aliasItemUuids: ['Item.ingot-legacy'],
        },
        { id: 'orphan', name: 'Unbound Salt', description: 'No Item behind it.' },
        {
          id: 'resin',
          name: 'Wildwood Resin',
          description: 'Tapped from an ironwood.',
          originItemUuid: 'Item.ingot-source',
        },
        { id: 'coal', name: 'Coal', description: 'Fuel.', originItemUuid: 'Item.coal-source' },
      ],
    };

    it('states the duplicate, and WITHHOLDS the review action the page has no route for', async () => {
      // The shipped arrangement, asserted as one claim rather than two: the BAND draws because
      // the state it reports is real, and the action does not because this repository has no
      // merge screen and the page therefore passes no handler. A card that drew the action
      // anyway would hand a GM a button that does nothing — the failure `onUnlink` and
      // `onOpenWorldVocabulary` are both withheld to avoid on this same screen.
      const { target } = await open('ingot', SHARED_SOURCE);
      const band = target.querySelector('[data-scoped-entry-duplicate-source]');
      assert.ok(Boolean(band), 'the band reports the shared source item');
      assert.match(band.textContent, /1 other catalogue entry names the same source item/);
      assert.ok(
        !target.querySelector('[data-scoped-entry-duplicate-review]'),
        'and no dead Review & merge sits beside it'
      );
    });

    it('and the band is absent when no other entry claims the same item', async () => {
      const { target } = await open('ingot');
      assert.ok(!target.querySelector('[data-scoped-entry-duplicate-source]'));
    });
  });

  describe('the MISSING entry is a dead end with exactly one way out, and it is wired', () => {
    // The issue-1373 pattern on a new screen: `[data-tool-empty-browse-world]` shipped inert
    // because its state was reached by no test and no capture case. This state is reachable — a
    // GM opens the entry on a component the world corpus no longer holds — the Back button is the
    // screen's only affordance, and until now it was proven neither to exist nor to act.
    it('draws the missing state, and Back reports UP so the owner runs its exit guard', async () => {
      const { target, reports } = await open('no-such-component');
      const state = target.querySelector('[data-scoped-entry-state="missing"]');
      assert.ok(Boolean(state), 'the page states that it is open on nothing');
      assert.match(state.textContent, /No component chosen/);
      assert.ok(
        !target.querySelector('[data-scoped-entry-identity-card]'),
        'and draws none of the editor behind it'
      );

      const back = target.querySelector('[data-scoped-entry-back]');
      assert.ok(Boolean(back), 'the empty state offers the one way out');
      back.click();
      await drain();
      assert.deepEqual(reports.shell, [['back']]);
    });

    it('and a component the corpus DOES hold draws the editor instead', async () => {
      // The positive control. A page hard-wired to the empty state passes every assertion above.
      const { target } = await open('ingot');
      assert.ok(!target.querySelector('[data-scoped-entry-state="missing"]'));
      assert.ok(Boolean(target.querySelector('[data-scoped-entry-identity-card]')));
    });
  });
});

describe('the world Component entry source card, mounted on its own (issue 1371)', () => {
  // WHY A SECOND HARNESS. `onReviewDuplicates` is the card's own opt-in prop and the entry page
  // deliberately passes none, so the POSITIVE arm — the action renders and calls its handler — is
  // unreachable through the page. Mounting the card is what lets both arms be proved, and it is
  // what stops the prop from becoming the dead API a reviewer found on `InheritRow`.
  before(async () => {
    await sourceCardHarness.setup();
  });

  after(() => {
    sourceCardHarness.teardown();
  });

  it('renders `Review & merge` for a caller that HAS a route, and calls it', async () => {
    const merges = [];
    const target = await sourceCardHarness.mount({
      entryId: 'ingot',
      sourceUuid: 'Item.ingot-source',
      aliasUuids: [],
      duplicateCount: 2,
      onReviewDuplicates: () => merges.push(true),
    });
    const review = target.querySelector('[data-scoped-entry-duplicate-review]');
    assert.ok(Boolean(review), 'the action appears beside the band');
    assert.equal(review.textContent.trim(), 'Review & merge');
    review.click();
    await drainMicrotasks();
    assert.deepEqual(merges, [true]);
  });

  it('and the band still draws without one, because the state it reports is real', async () => {
    const target = await sourceCardHarness.mount({
      entryId: 'ingot',
      sourceUuid: 'Item.ingot-source',
      aliasUuids: [],
      duplicateCount: 2,
    });
    assert.ok(Boolean(target.querySelector('[data-scoped-entry-duplicate-source]')));
    assert.ok(!target.querySelector('[data-scoped-entry-duplicate-review]'));
  });
});

/**
 * THE DEFAULT HALF OF `compact` (issue 1371 r11-entry, UX minor).
 *
 * The positive arm lives above, through the page: the entry's identity card draws its zone
 * `is-compact`, which is M7's fourth clause. This is the arm the page cannot reach, because both
 * of the entry's zones opt in — a `compact` that had quietly become the primitive's DEFAULT would
 * pass every assertion on this screen while silently deleting the linked art, the name and the
 * uuid from the eight sites that never asked for it.
 */
describe('ItemDropZone keeps its shipped LINKED form when nothing asks for the compact one', () => {
  const LINKED_ITEM = Object.freeze({
    name: 'Iron Ingot',
    img: 'icons/commodities/metal/ingot-worn-iron.webp',
  });

  before(async () => {
    await dropZoneHarness.setup();
  });

  after(() => {
    dropZoneHarness.teardown();
  });

  it('draws the art, the resolved name and the uuid with the prop unset', async () => {
    const target = await dropZoneHarness.mount({
      item: LINKED_ITEM,
      title: 'Drop an item',
      uuid: 'Item.ingot-source',
      kind: 'component-source',
    });
    const zone = target.querySelector('[data-item-drop-zone="component-source"]');
    assert.ok(Boolean(zone), 'the zone renders');
    assert.ok(
      zone.classList.contains('is-linked') && !zone.classList.contains('is-compact'),
      `an unasked zone is the LINKED face; it read "${zone.className}"`
    );
    assert.equal(
      zone.querySelector('.manager-item-drop-zone-icon img')?.getAttribute('src'),
      LINKED_ITEM.img,
      'the art is the resolved document’s, not the empty glyph'
    );
    assert.equal(
      zone.querySelector('.manager-item-drop-zone-copy strong').textContent.trim(),
      'Iron Ingot',
      'the name is the document’s, not the caller’s prompt'
    );
    assert.equal(
      zone.querySelector('[data-item-drop-zone-uuid]').textContent.trim(),
      'Item.ingot-source',
      'and the address is printed under it'
    );
  });

  it('and the SAME props with `compact` on suppress all three, so the pair discriminates', async () => {
    // The control on the control: without this arm an `is-compact` that had stopped suppressing
    // anything would satisfy the assertions above and the negative would prove nothing.
    const target = await dropZoneHarness.mount({
      item: LINKED_ITEM,
      title: 'Drop an item',
      uuid: 'Item.ingot-source',
      kind: 'component-source',
      compact: true,
    });
    const zone = target.querySelector('[data-item-drop-zone="component-source"]');
    assert.ok(zone.classList.contains('is-compact') && !zone.classList.contains('is-linked'));
    assert.ok(!zone.querySelector('.manager-item-drop-zone-icon img'), 'the art is a glyph again');
    assert.equal(
      zone.querySelector('.manager-item-drop-zone-copy strong').textContent.trim(),
      'Drop an item',
      'the strong line is the caller’s prompt rather than the document’s name'
    );
    assert.ok(!zone.querySelector('[data-item-drop-zone-uuid]'), 'and the address is gone');
  });
});
