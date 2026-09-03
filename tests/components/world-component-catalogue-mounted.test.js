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
import { componentBulkMembershipModes } from '../../src/ui/svelte/apps/manager/scoped/componentScoped.js';

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

  describe('the Unused flag is a PILL, and the zero-member inspector offers no dead links', () => {
    async function mount() {
      return harness.mount({ scope: scopeFor(), systems: COMPONENT_SYSTEMS, actions: {} });
    }

    /** Open one row's inspector, which is what the roster and the use line live in. */
    async function inspect(target, entityId) {
      target.querySelector(`[data-scoped-list-inspect="${entityId}"]`).click();
      await drain();
    }

    it('renders the flag as a chip rather than as bare uppercase text', async () => {
      // G.2 / UX F11. The reference draws this as a pill on the recessive surface. Painted as
      // unbordered uppercase in the disabled ink it was the least legible thing on the row — the
      // one EXCEPTION on it reading as the least important thing on it.
      const target = await mount();
      const flag = target.querySelector('[data-world-component-row-flag="resin"]');
      assert.ok(Boolean(flag), 'the unused row is still flagged');
      assert.ok(
        flag.classList.contains('manager-chip'),
        `the flag is the manager's one chip; it rendered as "${flag.className}"`
      );
    });

    it('replaces a zero-member roster with a sentence, not six dead links', async () => {
      // G.1 / UX F10. Under `systemRowAction="navigate"` every roster row is a live `Rules ↗`,
      // which for a component NO system has means one live link per system in the world, each
      // into a screen that holds no rules for it. `SYSTEM RULES 0 / 6` over six of them is the
      // most confident-looking wrong answer on the screen.
      const target = await mount();
      await inspect(target, 'resin');
      assert.ok(
        Boolean(target.querySelector('[data-scoped-roster-empty]')),
        'the zero-member roster states what the zero MEANS'
      );
      assert.equal(
        target.querySelectorAll('[data-scoped-system]').length,
        0,
        'and lists no system rows at all, dead links included'
      );
    });

    it('and still lists them for a component some system HAS', async () => {
      // The positive control on the branch. Without it a roster that dropped its rows entirely
      // passes the assertion above, and the shared component is read by five other screens.
      const target = await mount();
      await inspect(target, 'ingot');
      assert.ok(!target.querySelector('[data-scoped-roster-empty]'));
      assert.equal(target.querySelectorAll('[data-scoped-system]').length, 2);
    });

    it('and a member row is MARKED, which the emitted state attribute never painted', async () => {
      const target = await mount();
      await inspect(target, 'coal');
      const rows = [...target.querySelectorAll('[data-scoped-system]')];
      const states = rows.map((row) => row.getAttribute('data-scoped-system-state'));
      assert.deepEqual(states.slice().sort(), ['absent', 'member'], 'the two states are both drawn');
    });

    it('states its membership fraction ONCE', async () => {
      // G.6. The roster header already reads `SYSTEM RULES n / m` and lists the systems by name;
      // the use line restated both a line above it. What survives is the ZERO branch, which the
      // header cannot say: `0 / 6` is a number, and "registered but unreferenced" is its meaning.
      const target = await mount();
      await inspect(target, 'ingot');
      assert.ok(
        !target.querySelector('[data-world-component-use="ingot"]'),
        'a component some system holds gets the roster header count and nothing restating it'
      );

      await inspect(target, 'resin');
      const use = target.querySelector('[data-world-component-use="resin"]');
      assert.ok(Boolean(use), 'and the zero case keeps the line that says what zero means');
      assert.match(use.textContent, /unreferenced|unused|no system/i);
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

    it('distinguishes the two tag DIRECTIONS, which shared one grey', async () => {
      // G.3 / UX F13. The stager is a three-state control cycled by clicking: unstaged, add,
      // remove. `muted` and `neutral` differ only in their ink token — same border, no fill on
      // either — so "about to be taken off every selected component" and "leave alone" were the
      // same chip, on the one panel whose header says the two directions are one click apart.
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: recordingComponentActions().actions,
      });
      await selectTwo(target);

      const chip = () => target.querySelector('[data-world-component-bulk-tag="fuel"]');
      const unstaged = chip().className;
      assert.equal(chip().getAttribute('data-world-component-bulk-tag-state'), 'unchanged');
      assert.equal(chip().getAttribute('aria-pressed'), 'false');

      chip().click();
      await drain();
      assert.equal(chip().getAttribute('data-world-component-bulk-tag-state'), 'add');
      const added = chip().className;
      const addLabel = chip().getAttribute('aria-label');

      chip().click();
      await drain();
      assert.equal(chip().getAttribute('data-world-component-bulk-tag-state'), 'remove');
      const removed = chip().className;

      // THE FAMILY, NOT MERELY A DIFFERENT CLASS STRING. `is-muted` and `is-neutral` are two
      // different strings over two ink tokens on the same borderless, fill-less chip, so a
      // class-inequality assertion is satisfied by the very palette the finding is about. Naming
      // the family is the only assertion that distinguishes "different" from "legibly different".
      assert.ok(
        chip().classList.contains('is-warning'),
        `staged-for-removal takes the family that means "this takes something away"; it read ` +
          `"${removed}"`
      );
      assert.ok(chip().classList.contains('manager-chip'));
      assert.notEqual(removed, unstaged, 'and it is not the unstaged face');
      assert.notEqual(removed, added, 'nor the add face');
      assert.ok(
        Boolean(chip().querySelector('i.fa-minus')),
        'and it carries the subtractive glyph, so the state survives a monochrome render'
      );

      // `aria-pressed` IS TWO-STATE, so it says staged-versus-unstaged and nothing else; the
      // DIRECTION is in the accessible NAME, which has room for it. Round 1 read `true` for both
      // directions, so a screen reader announced add and remove identically.
      assert.equal(chip().getAttribute('aria-pressed'), 'true');
      assert.notEqual(
        chip().getAttribute('aria-label'),
        addLabel,
        'the two directions are announced differently'
      );
      assert.match(chip().getAttribute('aria-label'), /remove/i);
      assert.match(addLabel, /add/i);
    });

    it('builds its mode segments and notes from the model rather than beside it', async () => {
      // G.5 / reviewer F5. `componentBulkMembershipModes` stated both labels and both notes in the
      // model with NO consumer, while the panel spelled the same four strings inline — two
      // implementations of one meaning, and the one the delta said would be read was the dead one.
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: recordingComponentActions().actions,
      });
      await selectTwo(target);

      const modes = componentBulkMembershipModes((key, fallback) => fallback);
      assert.equal(modes.length, 2, 'the model states exactly the two directions');
      for (const mode of modes) {
        const option = target.querySelector(
          `[data-world-component-bulk-mode-option="${mode.id}"]`
        );
        assert.ok(Boolean(option), `the panel renders a segment for ${mode.id}`);
        assert.equal(
          option.textContent.trim(),
          mode.label,
          'and takes its wording from the model, not from a second copy of it'
        );

        option.click();
        await drain();
        assert.equal(
          target.querySelector('[data-world-component-bulk-mode-state]').textContent.trim(),
          mode.note,
          `and the ${mode.id} note is the model's, so the two cannot drift`
        );
      }
    });

    it('hands its staged instruction over and CLEARS it, so no second Apply exists', async () => {
      // A second application re-runs every write against a payload the first run has not yet
      // persisted — the read-modify-write race the sequential loop exists to prevent.
      //
      // WHAT ROUND 1 ASSERTED WAS NOT THE GUARD IT NAMED. It clicked Apply a second time and
      // asserted no second write, crediting the page's `if (bulkApplying) return` — and deleting
      // that line kept the test green, because the click never reaches it. Two things stop it
      // first, and only one of them is this lane's:
      //
      //   1. THE PANEL CLEARS ITS STAGED INSTRUCTION when it hands one over, so there is nothing
      //      left to apply a second time. That is the real guard, and it is what is asserted here
      //      — removing the clear reds this test.
      //   2. The disabled attribute swallows `.click()`, which is the DOM's behaviour and not a
      //      claim about this page. A DISPATCHED event does not reach Svelte's delegated handler
      //      in this environment either, so no assertion here can probe the page's own flag; that
      //      flag defends callers that are not this panel, and says so in place.
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

      // THE GUARD. The membership mode is back at `unchanged` while the write it describes is
      // still running, which is what makes a second application impossible to compose: `canApply`
      // is false, the system picker is disabled by the same reset, and Apply is inert.
      assert.equal(
        target
          .querySelector('[data-world-component-bulk-mode-state]')
          .getAttribute('data-world-component-bulk-mode-state'),
        'unchanged',
        'the staged instruction was handed over and cleared, so there is nothing to re-apply'
      );
      assert.equal(
        target.querySelector('[data-world-component-bulk-system-trigger]').disabled,
        true,
        'and the staging control that would compose a new one is closed'
      );
      const apply = target.querySelector('[data-world-component-bulk-apply]');
      assert.equal(apply.disabled, true, 'and Apply is inert over an empty stage');

      apply.click();
      await drain();
      assert.equal(calls.length, 1, 'and no second write reaches the store');

      release();
      await drain();
    });
  });
});
