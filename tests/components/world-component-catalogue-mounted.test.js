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

import {
  COMPONENT_SYSTEMS,
  SEARCHABLE_POPOVER_RAW_MODULES,
  componentScopeFor,
  createComponentScopeHarness,
  drainMicrotasks,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { componentBulkMembershipModes } from '../../src/ui/svelte/apps/manager/scoped/componentScoped.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-catalogue-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldComponentCataloguePage.svelte',
  rawExtras: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    // The drop zone's two leaves: the action it binds and the payload normalizer behind it.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
  ],
  compiledExtras: [
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

// The projection wrapper and the microtask drain are SHARED with the entry suite; both suites
// carried them verbatim. Aliased so every call site below reads unchanged.
const scopeFor = componentScopeFor;
const drain = drainMicrotasks;

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

    it('states its membership fraction ONCE, and the zero case in ONE place', async () => {
      // The roster's own header reads `SYSTEM RULES n / m`, so a second fraction above it is a
      // restatement — that half has held since round 2.
      //
      // THE ZERO CASE MOVED IN ROUND 4. It used to be a second sentence in the inspector body
      // beside the roster's own empty state, which is the same restatement one state down: two
      // paragraphs, one block apart, saying "no system has rules for this". The reference draws
      // exactly one, inside the roster, and that is the one that survives.
      const target = await mount();
      await inspect(target, 'ingot');
      assert.ok(
        !target.querySelector('[data-world-component-use="ingot"]'),
        'a component some system holds gets the roster header count and nothing restating it'
      );

      await inspect(target, 'resin');
      assert.ok(
        !target.querySelector('[data-world-component-use="resin"]'),
        'and the zero case does not get a second sentence beside the roster empty state'
      );
      const empty = target.querySelector('[data-scoped-roster-empty]');
      assert.ok(Boolean(empty), 'which is where the one surviving sentence is');
      assert.match(empty.textContent, /unreferenced|unused|no system/i);
    });
  });

  describe('the inspector draws the blocks the reference draws, and only those', () => {
    async function inspected(entityId) {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        onOpenVocabulary: () => {},
      });
      target.querySelector(`[data-scoped-list-inspect="${entityId}"]`).click();
      await drain();
      return target;
    }

    it('names the SOURCE under the name, not the category', async () => {
      // The two say different things and only one is true of the record itself: a category is a
      // value some system may or may not resolve, and the source is what the entry IS. The
      // category has its own labelled row in the `Global tags` card below.
      const target = await inspected('ingot');
      const source = target.querySelector('[data-world-component-inspector-source]');
      assert.ok(Boolean(source), 'the inspector draws a source line under the name');
      assert.equal(source.textContent.trim(), 'Linked Foundry item');

      const orphaned = await inspected('orphan');
      assert.equal(
        orphaned.querySelector('[data-world-component-inspector-source]').textContent.trim(),
        'No source item',
        'and the unlinked record says so rather than falling back to a category'
      );
    });

    it('draws the Source identity inset: the address and what else import matches on', async () => {
      const target = await inspected('ingot');
      const card = target.querySelector('[data-world-component-source-card="ingot"]');
      assert.ok(Boolean(card), 'the inset exists');
      assert.equal(
        card.querySelector('[data-world-component-inspector-uuid]').textContent.trim(),
        'Item.ingot-source'
      );
      assert.equal(
        card.querySelector('[data-world-component-alias-note]').textContent.trim(),
        '1 alias recorded',
        'the alias note is a SENTENCE and it pluralises; `ingot` carries exactly one'
      );
    });

    it('and states the alias-free record as a sentence rather than as a zero', async () => {
      // A count reads as a deficiency, and zero aliases is the normal state of a healthy record.
      const target = await inspected('coal');
      assert.equal(
        target.querySelector('[data-world-component-alias-note]').textContent.trim(),
        'No aliases recorded'
      );
    });

    it('draws the Global tags inset: an exit, the category row, the chips and the reach', async () => {
      const target = await inspected('coal');
      const card = target.querySelector('[data-world-component-tag-card="coal"]');
      assert.ok(Boolean(card), 'the inset exists');
      assert.ok(
        Boolean(card.querySelector('[data-world-component-vocabulary-exit]')),
        'with the head action the reference draws at its trailing edge'
      );
      assert.match(
        card.querySelector('[data-world-component-inspector-category="coal"]').textContent,
        /Raw/,
        'the category is a LABELLED ROW inside this card, which is why it is not the name caption'
      );
      const chips = [...card.querySelectorAll('[data-world-component-global-tag]')].map((chip) =>
        chip.getAttribute('data-world-component-global-tag')
      );
      assert.deepEqual(chips, ['fuel', 'bulk']);
      assert.match(
        card.querySelector('[data-world-component-tag-note="coal"]').textContent,
        /Inherited by 1 rule set/,
        'and the note counts RULE SETS, not systems in the world'
      );
    });

    it('and says so when there are no global tags, rather than drawing an empty run', async () => {
      const target = await inspected('resin');
      const card = target.querySelector('[data-world-component-tag-card="resin"]');
      assert.equal(card.querySelectorAll('[data-world-component-global-tag]').length, 0);
      assert.match(card.textContent, /No global tags/);
      assert.match(card.textContent, /No world category/);
    });

    it('and the vocabulary exit hands the click BACK rather than navigating', async () => {
      const opened = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        onOpenVocabulary: () => opened.push(true),
      });
      target.querySelector('[data-scoped-list-inspect="coal"]').click();
      await drain();
      target.querySelector('[data-world-component-vocabulary-exit]').click();
      await drain();
      assert.deepEqual(opened, [true]);
    });

    it('and withholds the exit entirely when the call site offers no route', async () => {
      // A dead affordance is worse than no affordance, and this shell is composed by three
      // catalogues; only one of them has a vocabulary screen to send a GM to.
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
      });
      target.querySelector('[data-scoped-list-inspect="coal"]').click();
      await drain();
      assert.ok(!target.querySelector('[data-world-component-vocabulary-exit]'));
    });

    it('draws NONE of the three subject-only blocks the reference has no counterpart for', async () => {
      // `Used by` belongs on the ENTRY's preview rail beside `Produced by`; one of the two lists,
      // on the surface with no room for the other, is worse than both where there is room. The
      // `World defaults` card is a differently-shaped card standing in for `Global tags`. And the
      // standing disclosure had no counterpart at all — in the shipped frame the pinned foot
      // CLIPPED it, and a paragraph a GM cannot finish reading is not a disclosure.
      const target = await inspected('ingot');
      for (const hook of [
        '[data-world-component-required-by]',
        '[data-world-component-disclosure]',
        '[data-scoped-list-defaults]',
      ]) {
        assert.ok(!target.querySelector(hook), `${hook} is subject-only and is gone`);
      }
    });

    it('and its one pinned action names the screen it opens', async () => {
      const target = await inspected('ingot');
      assert.equal(
        target.querySelector('[data-scoped-component-open-entry]').textContent.trim(),
        'Open catalogue entry'
      );
      assert.equal(
        target.querySelector('[data-scoped-list-inspector-kicker]').textContent.trim(),
        'Catalogue entry'
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

    /**
     * Mount the catalogue with a recording action bag and two rows already ticked.
     *
     * ONE ARRANGEMENT, NOT FIVE COPIES OF IT. Every test in this block opened with the same
     * mount, the same recording bag and the same two ticks; only the staged instruction and the
     * expected calls differed. SonarCloud's copy-paste detector matches by token SHAPE rather
     * than by literal, so three bodies differing only in a mode word and a system id are
     * duplicated lines against the quality gate. Gate aside, an arrangement restated per test is
     * one that drifts per test, and the arrangement is the half no assertion is about.
     *
     * @returns {Promise<{target: HTMLElement, calls: Array<{verb: string, args: unknown[]}>}>}
     */
    async function selectedCatalogue() {
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);
      return { target, calls };
    }

    /**
     * Stage one membership instruction and apply it: pick the mode, pick the system, press Apply.
     *
     * The MODE and the SYSTEM are the parameters because they are the two things the tests
     * disagree about, and they are the two the panel can get wrong in a way no count assertion
     * would see.
     *
     * @param {HTMLElement} target
     * @param {string} mode `add` or `remove`.
     * @param {string} systemId the crafting system to stage against.
     * @returns {Promise<void>}
     */
    async function applyMembership(target, mode, systemId) {
      target.querySelector(`[data-world-component-bulk-mode-option="${mode}"]`).click();
      await drain();
      target.querySelector('[data-world-component-bulk-system-trigger]').click();
      await drain();
      target.querySelector(`[data-popover-option="${systemId}"]`).click();
      await drain();
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();
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
      const { target, calls } = await selectedCatalogue();
      await applyMembership(target, 'add', 'sys-forge');

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
      const { target, calls } = await selectedCatalogue();
      await applyMembership(target, 'remove', 'sys-alchemy');

      assert.deepEqual(
        calls.map((call) => call.verb),
        ['removeFromSystem', 'removeFromSystem']
      );
      assert.deepEqual(calls[0].args, ['ingot', 'sys-alchemy']);
    });

    it('applies the world tag stage as a WHOLE list, computed per component', async () => {
      // `setWorldTags` REPLACES the list, so an implementation that wrote the staged tags alone
      // would silently delete every tag the GM had not ticked — and `coal` carries two.
      const { target, calls } = await selectedCatalogue();

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
      const { target } = await selectedCatalogue();

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
      const { target } = await selectedCatalogue();

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
