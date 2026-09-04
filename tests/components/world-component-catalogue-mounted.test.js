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
// The frame's own lifted view-state factory, so the page-size case below states the SHIPPED
// shape and changes with it rather than hand-rolling a second one.
import { createScopedListBrowserState } from '../../src/utils/managerBrowserViewState.js';

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
    'src/ui/svelte/components/SearchablePopover.svelte',
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

  // THE GAME-WORLD ITEM ROSTER, which is what makes a DANGLING link answerable at all. It holds
  // `ingot`'s address and not `coal`'s or `resin`'s, so the corpus carries both halves of the
  // question: one record whose world address resolves and two whose do not.
  const WORLD_ITEMS = Object.freeze([
    Object.freeze({
      uuid: 'Item.ingot-source',
      name: 'Iron Ingot',
      description: 'A bar of worked iron, straight from the Item.',
    }),
    Object.freeze({ uuid: 'Item.spare-source', name: 'Spare Bar', description: 'Unregistered.' }),
  ]);

  describe('the row is the reference row: pills on the name line, columns at the edge', () => {
    async function mountRows(props = {}) {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        ...props,
      });
    }

    // AC-6 / gap-list row 13.
    it('names the KIND of source on every row, where the frame drew only a presence badge', async () => {
      const target = await mountRows();

      // THE ROW COUNT FIRST, so no answer below is an empty match dressed as a pass.
      assert.equal(
        target.querySelectorAll('[data-scoped-list-row]').length,
        4,
        'every record in the corpus renders a row'
      );

      assert.equal(
        target
          .querySelector('[data-scoped-list-row="ingot"] [data-world-component-row-source-pill]')
          .textContent.trim(),
        'Foundry item',
        'a world address names the kind of address it is, not merely that there is one'
      );
      assert.equal(
        target
          .querySelector('[data-scoped-list-row="orphan"] [data-world-component-row-source-pill]')
          .textContent.trim(),
        'No source item',
        'and the record naming nothing says so in the same slot'
      );
      assert.ok(
        !target.querySelector('[data-scoped-list-source]'),
        "the frame's own trailing Linked/No source badge is withheld: one row may not carry two " +
          'answers to one question'
      );
    });

    // Gap-list row 14.
    it('flags the DANGLING link, and only where the roster proves it dangles', async () => {
      const target = await mountRows();
      assert.ok(
        Boolean(target.querySelector('[data-world-component-row-flag="coal"]')),
        'a world address the Item roster does not hold is flagged'
      );
      assert.ok(
        !target.querySelector('[data-world-component-row-flag="ingot"]'),
        'and one it does hold is not — an inverted answer passes any presence-only check'
      );
      assert.match(
        target.querySelector('[data-world-component-row-flag="coal"]').textContent,
        /Broken link/
      );
      assert.ok(
        Boolean(
          target
            .querySelector('[data-scoped-list-row="coal"] [data-scoped-list-inspect]')
            .contains(target.querySelector('[data-world-component-row-flag="coal"]'))
        ),
        'and it sits on the NAME LINE, inside the identity cell, not on a second row below it'
      );
    });

    it('claims nothing at all when the Item roster was never handed over', async () => {
      // THE LOUDEST POSSIBLE FALSE ALARM. A call site that does not extend its roster to this
      // route passes `[]`, and testing every address against an empty list would flag EVERY
      // linked component on the screen at once.
      const target = await mountRows({ worldItems: [] });
      assert.equal(
        target.querySelectorAll('[data-world-component-row-flag]').length,
        0,
        'no roster means no claim, in either direction'
      );
    });

    // Gap-list row 16.
    it('states both reach counts as a VALUE over a LABEL, in two columns', async () => {
      const target = await mountRows();
      const meta = target.querySelector('[data-world-component-row-meta="ingot"]');
      assert.ok(Boolean(meta), 'the row renders its stat cluster');
      assert.equal(
        meta.querySelector('[data-world-component-row-stat-value="systems"]').textContent.trim(),
        '2/2'
      );
      assert.equal(
        meta.querySelector('[data-world-component-row-stat-label="systems"]').textContent.trim(),
        'Systems'
      );
      assert.equal(
        meta.querySelector('[data-world-component-row-stat-value="recipes"]').textContent.trim(),
        '0'
      );
      assert.ok(
        !meta.querySelector('.manager-chip'),
        'a reach count set as a chip reads as a third property of the component'
      );
      assert.ok(
        !target
          .querySelector('[data-scoped-list-row="ingot"] [data-scoped-list-inspect]')
          .contains(meta),
        'and the cluster is at the row TRAILING EDGE, not inside the identity cell'
      );
    });

    // Gap-list row 15.
    it('gives the second line to the DESCRIPTION, resolving it from the linked Item', async () => {
      const target = await mountRows();
      assert.match(
        target.querySelector('[data-scoped-list-row="ingot"] .manager-system-description')
          .textContent,
        /A bar of worked iron/
      );
    });

    // Gap-list row 17.
    it('opens the entry from a 28px pen that NAMES the screen it opens', async () => {
      const opened = [];
      const target = await mountRows({ onOpenEntry: (id) => opened.push(id) });
      const pen = target.querySelector(
        '[data-scoped-list-row="ingot"] [data-scoped-list-action="open-entry"]'
      );
      assert.ok(Boolean(pen), 'the row carries the action at all');
      assert.equal(pen.getAttribute('title'), 'Open catalogue entry');
      assert.ok(
        Boolean(pen.querySelector('i.fa-pen')),
        'and it is the icon control, not the 104px labelled button that shipped'
      );
      assert.equal(
        pen.textContent.trim(),
        '',
        'a labelled button would print its verb; the reference draws a bare pen with a title'
      );
      pen.click();
      await drain();
      assert.deepEqual(opened, ['ingot']);
    });
  });

  describe('the toolbar is two rows, and the second one filters by MEMBERSHIP', () => {
    async function mountToolbar(props = {}) {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        systemId: 'sys-forge',
        ...props,
      });
    }

    // Gap-list rows 5 and 6.
    it('offers the four system-relative options, naming the system the rail has selected', async () => {
      const target = await mountToolbar();
      assert.equal(
        target.querySelector('[data-scoped-list-filter-label="membership"]').textContent.trim(),
        'Membership',
        'the label is VISIBLE, not an invisible accessible name'
      );
      const select = target.querySelector('[data-scoped-list-filter="membership"]');
      assert.deepEqual(
        [...select.options].map((option) => option.textContent.trim()),
        ['Any system', 'Has rules in Forge', 'No rules in Forge', 'In no system at all'],
        'and the two system-relative options interpolate the selected system'
      );
      assert.equal(
        target.querySelector('[data-scoped-list-search]').getAttribute('placeholder'),
        'Search catalogue by name or source item…'
      );
    });

    it('withholds the system-relative pair when no system is in scope', async () => {
      // `Has rules in ` with nothing after it is worse than an absent option, and a predicate
      // keyed on an empty id would match nothing and read as a corpus of zero.
      const target = await mountToolbar({ systemId: '' });
      assert.deepEqual(
        [...target.querySelector('[data-scoped-list-filter="membership"]').options].map((option) =>
          option.value
        ),
        ['all', 'orphan']
      );
    });

    it('actually narrows the list, in both directions', async () => {
      const target = await mountToolbar();
      const select = target.querySelector('[data-scoped-list-filter="membership"]');
      const rows = () =>
        [...target.querySelectorAll('[data-scoped-list-row]')].map((row) =>
          row.getAttribute('data-scoped-list-row')
        );
      assert.equal(rows().length, 4, 'unfiltered first, so the narrowing below is a real change');

      select.value = 'in';
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      assert.deepEqual(rows().sort(), ['coal', 'ingot', 'orphan'], 'the three Forge holds');

      select.value = 'orphan';
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      assert.deepEqual(rows(), ['resin'], 'and the one no system holds at all');
    });

    it('puts the search field in its own row above the filter row', async () => {
      // `proto:576`-`586` is TWO rows: search and the source select above, membership, the sort
      // pair and the count below. A single row is what the frame draws for every other caller.
      const target = await mountToolbar();
      const lead = target.querySelector('[data-scoped-list-search-row]');
      assert.ok(Boolean(lead), 'the lead row exists');
      assert.ok(
        Boolean(lead.querySelector('[data-scoped-list-search]')),
        'and holds the search field'
      );
      assert.ok(
        Boolean(lead.querySelector('[data-scoped-list-filter="source-type"]')),
        'and the source select beside it'
      );
      assert.ok(
        !lead.querySelector('[data-scoped-list-filter="membership"]'),
        'while membership stays on the filter row with the sort pair'
      );
    });

    it('leaves the sort DIRECTION live against the source-item sort', async () => {
      // Gap-list row 11. A lane sort shipped as one descriptor and therefore as one whole order,
      // which inerted the toggle: `source-type-asc` did not exist and nothing said so.
      const target = await mountToolbar();
      const sort = target.querySelector('[data-scoped-list-sort]');
      sort.value = 'source-type';
      sort.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      const direction = target.querySelector('[data-scoped-list-direction]');
      assert.equal(direction.disabled, false, 'the toggle is live');

      const names = () =>
        [...target.querySelectorAll('[data-scoped-list-row]')].map((row) =>
          row.getAttribute('data-scoped-list-row')
        );
      const ascending = names();
      assert.equal(ascending[0] !== 'orphan', true, 'linked records lead the ascending order');
      direction.click();
      await drain();
      assert.equal(names()[0], 'orphan', 'and the unlinked one leads once reversed');
    });
  });

  describe('the list opens with the surface that MAKES a component', () => {
    async function mountLead(props = {}) {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        ...props,
      });
    }

    // Gap-list row 1 / M10.
    it('draws `Register item` beside the drop zone, offering only unregistered Items', async () => {
      const target = await mountLead();
      const action = target.querySelector('[data-scoped-list-register-item]');
      assert.ok(Boolean(action), 'the header action is built');
      assert.match(action.textContent, /Register item/);
      assert.ok(
        Boolean(target.querySelector('[data-item-drop-zone="component-create"]')),
        'and M2\'s drop zone stands beside it rather than being replaced by it'
      );

      action.click();
      await drain();
      const options = [...target.querySelectorAll('[data-popover-option]')].map((option) =>
        option.getAttribute('data-popover-option')
      );
      assert.deepEqual(
        options,
        ['Item.spare-source'],
        'the Item already registered as `ingot` is not offered: choosing it could only report ' +
          'that it did nothing'
      );
    });

    // Gap-list row 1 / M10 / M12, and the reason `SearchablePopover` grew a `triggerButton`
    // form: `proto:570` draws this control at 38px, 38 is a published rung, and the rung's own
    // selector is `.manager-button.fab-manager-button.is-size-38` — `fab-manager-button` is
    // written by `ManagerButton` and by nothing else. So a trigger imitating the primitive with
    // `triggerClass="manager-button …"` could not reach the rung however it was spelt, and the
    // sheet had to restate a height and a corner the primitive already owns.
    //
    // The CLASS LIST is the assertion because the class list is the mechanism. A height read off
    // this mount would be `happy-dom`'s guess with no stylesheet attached, which is why the
    // measured 38px lives in the parity run and the reachability lives here.
    it('renders `Register item` through the real ManagerButton, at the 38px rung', async () => {
      const target = await mountLead();
      const action = target.querySelector('[data-scoped-list-register-item]');
      const classes = [...action.classList].filter((name) => !name.startsWith('svelte-'));

      assert.ok(
        classes.includes('fab-manager-button'),
        'the trigger must carry the class only `ManagerButton` writes — without it the rung ' +
          'below matches nothing and the control drops to Foundry`s own button height'
      );
      assert.ok(
        classes.includes('is-size-38'),
        'and the rung itself, which is what makes 38 reachable without a per-site sheet rule'
      );
      assert.ok(
        classes.includes('manager-world-component-register-action'),
        '`triggerClass` still travels: `ManagerButton`s `class` prop APPENDS, so this site`s own ' +
          'paint rule keeps matching'
      );
      assert.ok(
        classes.includes('manager-button'),
        'the base token comes from the primitive now rather than from the call site, so the ' +
          'sheet rule keyed on it is unaffected by the conversion'
      );

      // AND IT IS STILL THE POPOVER'S TRIGGER. A `ManagerButton` that had stopped opening the
      // panel would satisfy every clause above while deleting the affordance.
      assert.equal(action.getAttribute('aria-expanded'), 'false');
      action.click();
      await drain();
      assert.equal(
        action.getAttribute('aria-expanded'),
        'true',
        'the primitive receives the popover`s own click and ARIA contract through the spread'
      );
    });

    it('hands the chosen Item to the SAME resolver a sidebar drag reaches', async () => {
      const drops = [];
      const target = await mountLead({ onCreateFromItemDrop: (data) => drops.push(data) });
      target.querySelector('[data-scoped-list-register-item]').click();
      await drain();
      target.querySelector('[data-popover-option="Item.spare-source"]').click();
      await drain();
      assert.deepEqual(
        drops,
        [{ type: 'Item', uuid: 'Item.spare-source' }],
        'a registration cannot take a second path with a second set of refusals'
      );
    });
  });

  describe('the zero-member inspector offers no dead links', () => {
    async function mount() {
      return harness.mount({ scope: scopeFor(), systems: COMPONENT_SYSTEMS, actions: {} });
    }

    /** Open one row's inspector, which is what the roster and the use line live in. */
    async function inspect(target, entityId) {
      target.querySelector(`[data-scoped-list-inspect="${entityId}"]`).click();
      await drain();
    }

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

    it('the member row’s `Rules ↗` FIRES, with the pair the gateway’s handler takes', async () => {
      // QE 5. This control is newly live on this screen (`systemRowAction="navigate"`), and it
      // was clicked by NOTHING anywhere — so the deep link into a system's Component Rules list
      // was proven to exist and never proven to act. Replacing the gateway's
      // `openSystemComponentRules` body with `return false;` left 628 tests green.
      //
      // THE ARGUMENT PAIR IS THE ASSERTION, not the call count: the handler's signature is
      // `(entityId, systemId)` and the two are the same SHAPE of string, so a row wired with them
      // reversed selects a system named after a component and refuses — silently, because a
      // refused exit stays refused.
      const opened = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        onOpenSystemRules: (entityId, systemId) => opened.push([entityId, systemId]),
      });
      await inspect(target, 'ingot');
      const link = target.querySelector('[data-scoped-list-system-rules="sys-alchemy"]');
      assert.ok(Boolean(link), 'the member row draws its deep link');
      link.click();
      await drain();
      assert.deepEqual(opened, [['ingot', 'sys-alchemy']]);
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
      // R8 REVIEWER 5 ITEM 4. It read `Inherited by 1 rule set`, which asserts the FALSE half of
      // the tag merge: the read union re-derives identity from the in-system record and `tags` is
      // not a section, so a world tag reaches no system's resolved answer today. What is left is
      // checkable on the card itself.
      const note = card.querySelector('[data-world-component-tag-note="coal"]').textContent;
      assert.match(note, /Set on the world record/);
      assert.match(note, /1 rule set/, 'and it still counts RULE SETS, not systems in the world');
      assert.doesNotMatch(
        note,
        /inherit|merge/i,
        'no surface may assert the unconsumed half of the tag merge'
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
      await stageMembership(target, mode, systemId);
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();
    }

    /**
     * Stage one membership instruction without applying it: pick the mode, tick the system.
     *
     * The staging is separate from the Apply because half the assertions below are about the
     * STAGED state — the dock's label, the inert picker, the cleared instruction — and reading
     * them after a write has landed reads a panel that has already reset itself.
     *
     * @param {HTMLElement} target
     * @param {string} mode `add` or `remove`.
     * @param {string} systemId the crafting system to stage against.
     * @returns {Promise<void>}
     */
    async function stageMembership(target, mode, systemId) {
      target.querySelector(`[data-world-component-bulk-mode-option="${mode}"]`).click();
      await drain();
      target
        .querySelector(
          `[data-world-component-bulk-inset="systems"] [data-world-component-bulk-option="${systemId}"]`
        )
        .click();
      await drain();
    }

    /**
     * Cycle one tag's staged direction from the tag inset's own row.
     *
     * @param {HTMLElement} target
     * @param {string} tag
     * @returns {void}
     */
    function stageTag(target, tag) {
      target
        .querySelector(
          `[data-world-component-bulk-inset="tags"] [data-world-component-bulk-option="${tag}"]`
        )
        .click();
    }

    /** One inset's rows, by option id, in rendered order. */
    function insetRows(target, inset) {
      return [
        ...target.querySelectorAll(
          `[data-world-component-bulk-inset="${inset}"] [data-world-component-bulk-option]`
        ),
      ].map((row) => row.getAttribute('data-world-component-bulk-option'));
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

      stageTag(target, 'fuel');
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

      await stageMembership(target, 'add', 'sys-forge');
      stageTag(target, 'fuel');
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
      //
      // THE CYCLE MOVED TO THE INSET ROW in r8 and the painted state stayed on the CHIP, which is
      // the reference's own split (`proto:706`): the staged run is where a direction is read at a
      // glance, and the inset is where it is set.
      const { target } = await selectedCatalogue();

      const row = () =>
        target.querySelector(
          '[data-world-component-bulk-inset="tags"] [data-world-component-bulk-option="fuel"]'
        );
      const chip = () => target.querySelector('[data-world-component-bulk-tag-chip="fuel"]');
      assert.equal(row().getAttribute('data-world-component-bulk-option-state'), 'off');
      assert.ok(!chip(), 'an unstaged tag has no chip in the staged run at all');

      row().click();
      await drain();
      assert.equal(row().getAttribute('data-world-component-bulk-option-state'), 'add');
      const added = chip().className;
      const addLabel = chip().getAttribute('aria-label');
      assert.ok(chip().classList.contains('is-info'));

      row().click();
      await drain();
      assert.equal(row().getAttribute('data-world-component-bulk-option-state'), 'remove');
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
      assert.notEqual(removed, added, 'and it is not the add face');
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

      row().click();
      await drain();
      assert.equal(
        row().getAttribute('data-world-component-bulk-option-state'),
        'off',
        'and the third click returns to "leave this tag alone", which is the state that must ' +
          'stay reachable on a panel whose whole point is a partial instruction'
      );
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

    it('discloses the RECIPE CASCADE on the remove note, not just the overrides', async () => {
      // Lane STORE's disclosure, never wired. `removeFromSystem` runs the in-system delete
      // through `deleteComponents`, which repairs every reference, disables the recipes left
      // without a usable ingredient set or result, cleans up salvage and reconciles alchemy —
      // and the note said only that the world record was untouched. A GM removing twenty
      // components from a system was told the safe half and never the consequential half.
      const { target } = await selectedCatalogue();
      target.querySelector('[data-world-component-bulk-mode-option="remove"]').click();
      await drain();
      const note = target.querySelector('[data-world-component-bulk-mode-state]').textContent;
      assert.match(note, /rewrites every recipe in those systems that names them/);
      assert.match(note, /disables any recipe left without a usable ingredient set or result/);
      assert.match(
        note,
        /The world record is untouched, and no other system changes\./,
        'and the reassuring half survives — the finding is that it was the ONLY half'
      );
    });

    it('sends a GM with no world tags to the screen that mints them', async () => {
      // The empty state read `Add one on a component entry first.` and no entry mints a world
      // tag: the vocabulary is authored on Tags & Categories, which is where the inspector's own
      // `Global tags` exit already goes. A dead instruction is worse than none.
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        // `defaults: []` strips the world tags off the corpus, which is the only way this empty
        // state is reachable at all — the shipped fixture authors two.
        scope: scopeFor({ defaults: [] }),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);
      const empty = target.querySelector('[data-world-component-bulk-tags-empty]');
      assert.ok(Boolean(empty), 'the empty state is reached');
      assert.match(empty.textContent, /Create them in Tags & Categories first\./);
      assert.doesNotMatch(
        empty.textContent,
        /component entry/i,
        'and it no longer sends a GM to a screen that cannot do it'
      );
      assert.deepEqual(calls, [], 'reading an empty state writes nothing');
    });

    it('draws each axis as an INLINE inset, not as a popover trigger', async () => {
      // Gap-list rows 43-45. A popover hides the corpus behind a click, so a GM cannot see that a
      // search matched nothing, cannot see how many systems there are, and cannot read a staged
      // row beside an unstaged one. `proto:628`-`697` draws the set instead.
      const { target } = await selectedCatalogue();
      for (const inset of ['systems', 'category', 'tags']) {
        const card = target.querySelector(`[data-world-component-bulk-inset="${inset}"]`);
        assert.ok(Boolean(card), `${inset} is drawn inline`);
        assert.ok(
          Boolean(card.querySelector(`[data-world-component-bulk-search="${inset}"]`)),
          `${inset} carries its own search well`
        );
        assert.ok(
          Boolean(card.querySelector(`[data-world-component-bulk-range="${inset}"]`)),
          `${inset} states the range it is showing`
        );
      }
      assert.ok(
        !target.querySelector('[data-world-component-bulk-system-trigger]'),
        'and no `Pick a … ▾` trigger survives'
      );
      assert.deepEqual(insetRows(target, 'systems'), ['sys-forge', 'sys-alchemy']);
    });

    it('searches inside an inset without touching the row selection', async () => {
      const { target } = await selectedCatalogue();
      const search = target.querySelector('[data-world-component-bulk-search="systems"]');
      search.value = 'alch';
      search.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      assert.deepEqual(insetRows(target, 'systems'), ['sys-alchemy']);
      assert.match(
        target.querySelector('[data-world-component-bulk-range="systems"]').textContent,
        /1-1 of 1/
      );
      assert.equal(
        target.querySelector('[data-world-component-bulk-count]').textContent.trim(),
        '2 components selected',
        'searching a staging inset says nothing about which ROWS are ticked'
      );

      search.value = 'zzz';
      search.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
      await drain();
      assert.ok(Boolean(target.querySelector('[data-world-component-bulk-empty="systems"]')));
    });

    it('gates the system inset on a chosen DIRECTION', async () => {
      // Staging systems under no direction would compose an instruction with a target and no verb.
      const { target } = await selectedCatalogue();
      const row = () =>
        target.querySelector(
          '[data-world-component-bulk-inset="systems"] [data-world-component-bulk-option="sys-forge"]'
        );
      assert.equal(row().disabled, true, 'closed before a direction is chosen');
      target.querySelector('[data-world-component-bulk-mode-option="add"]').click();
      await drain();
      assert.equal(row().disabled, false, 'and open once one is');
    });

    it('leads each direction with its glyph and writes the note BELOW the track', async () => {
      // Gap-list rows 41 and 42. The direction is the one thing about this control that must
      // survive a monochrome render, and the note describes what the chosen direction will DO —
      // so it reads as a consequence of the track above rather than as an instruction about a
      // control the GM has not reached yet.
      const { target } = await selectedCatalogue();
      const add = target.querySelector('[data-world-component-bulk-mode-option="add"]');
      assert.ok(Boolean(add.querySelector('i.fa-arrow-right-to-bracket')));
      assert.ok(
        Boolean(
          target
            .querySelector('[data-world-component-bulk-mode-option="remove"]')
            .querySelector('i.fa-arrow-right-from-bracket')
        )
      );
      const track = target.querySelector('[data-world-component-bulk-mode]');
      const note = target.querySelector('[data-world-component-bulk-mode-state]');
      assert.equal(
        track.compareDocumentPosition(note) & 4,
        4,
        'the note FOLLOWS the track in document order'
      );
    });

    it('puts the standing explanation SECOND, under the register rather than above Apply', async () => {
      // Gap-list row 40. It says what CANNOT be bulk-edited, so it belongs before the groups a GM
      // is about to read rather than after the decision they have already made.
      const { target } = await selectedCatalogue();
      const note = target.querySelector('[data-world-component-bulk-per-component-note]');
      const firstSection = target.querySelector('[data-world-component-bulk-mode]');
      assert.ok(Boolean(note));
      assert.equal(
        note.compareDocumentPosition(firstSection) & 4,
        4,
        'the note stands BEFORE the first staging group'
      );
    });

    it('names the WRITE on the dock rather than counting edits', async () => {
      // Gap-list row 48. `design-system/spec.md:415` requires a bulk commit action to name the
      // records it writes to; `Apply 2 changes` names neither the records nor the verb.
      const { target } = await selectedCatalogue();
      const apply = () => target.querySelector('[data-world-component-bulk-apply]');
      assert.match(apply().textContent, /Stage a change to write it to 2 components/);

      target.querySelector('[data-world-component-bulk-mode-option="add"]').click();
      await drain();
      assert.match(
        apply().textContent,
        /Pick systems to add 2 components/,
        'a direction with no systems is an instruction, which is what the reference writes'
      );

      await stageMembership(target, 'add', 'sys-forge');
      assert.match(apply().textContent, /Add 2 components to 1 systems/);

      target.querySelector('[data-world-component-bulk-mode-option="remove"]').click();
      await drain();
      assert.match(
        apply().textContent,
        /Remove 2 components from 1 systems/,
        'and the verb follows the direction: the two are one keystroke apart'
      );
    });

    /**
     * Mount with a recording bag and tick ONE FREE RECORD AND ONE IN USE.
     *
     * `resin` is a member of no system; `ingot` has rules in Forge and in Alchemy. That pairing
     * is the whole point of the delete assertions below: a selection where every record is free
     * cannot see the refusal, and one where every record is held cannot see that the free ones
     * still go. The corpus already carries both, which is why no fixture is added for it.
     *
     * @returns {Promise<{target: HTMLElement, calls: Array<{verb: string, args: unknown[]}>}>}
     */
    async function mixedSelection() {
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      for (const id of ['resin', 'ingot']) {
        target.querySelector(`[data-scoped-list-select="${id}"]`).click();
        await drain();
      }
      return { target, calls };
    }

    /** The danger leg's control, whatever primitive draws it. */
    function dangerControl(target) {
      return target.querySelector(
        '[data-world-component-bulk-danger] .manager-button, ' +
          '[data-world-component-bulk-danger] button'
      );
    }

    it('offers the armed bulk delete, and writes only from its confirmed state', async () => {
      // Gap-list row 47. The most destructive verb in the product, behind the manager's one
      // two-step idiom: arming states the count, and only the confirmed press writes.
      const { target, calls } = await mixedSelection();
      const danger = () => dangerControl(target);
      assert.ok(Boolean(danger()), 'the danger leg is drawn');
      assert.match(danger().textContent, /Delete 1 component/);

      danger().click();
      await drain();
      assert.equal(calls.length, 0, 'arming writes nothing');
      assert.match(danger().textContent, /Confirm/);

      danger().click();
      await drain();
      assert.deepEqual(
        calls.map((call) => `${call.verb}:${call.args[0]}`),
        ['deleteEntity:resin'],
        'and the confirmed press deletes the free record, and only that one'
      );
    });

    it('refuses the members the ENTRY refuses, and names them and their systems', async () => {
      // Epic decision 7. The world Component entry will not delete a record any system still has
      // rules for; this panel deleted exactly those records without asking, which made the same
      // record undeletable one screen away and deletable in a tick-box.
      const { target, calls } = await mixedSelection();
      const note = target.querySelector('[data-world-component-bulk-delete-note]');
      assert.ok(Boolean(note), 'the consequence note is drawn');
      assert.equal(
        note.getAttribute('data-world-component-bulk-delete-note'),
        'proceed',
        'a mixed selection PROCEEDS: one held row does not withhold the whole instruction'
      );
      assert.match(note.textContent, /Deletes 1 of 2/, 'and it counts what will actually go');
      assert.match(
        note.textContent,
        /Iron Ingot \(Forge, Alchemy\)/,
        'and NAMES the skipped record and the systems holding it — "some were skipped" without ' +
          'saying which is worse than saying nothing'
      );
      assert.equal(
        dangerControl(target).disabled,
        false,
        'and the control is live, because something can go'
      );

      dangerControl(target).click();
      await drain();
      dangerControl(target).click();
      await drain();
      assert.deepEqual(
        calls.map((call) => call.args[0]),
        ['resin'],
        'the write reaches the free record only'
      );
    });

    it('puts the danger leg INSIDE the shell’s pinned dock, not above it', async () => {
      // Gap-list row 47. `proto:686`-`688` pins the destructive verb and its note in the same
      // bordered foot as the primary action. It shipped as the panel's last CONTENT, a scrolling
      // sibling of a pinned dock — so a GM who had scrolled the staging groups could have the
      // Apply in front of them and the delete somewhere above it.
      const { target } = await mixedSelection();
      const dock = target.querySelector('.fab-bulk-edit-dock');
      assert.ok(Boolean(dock), 'the shell draws its dock');
      assert.ok(
        Boolean(dock.querySelector('[data-world-component-bulk-danger]')),
        'and the danger leg is inside it'
      );
      assert.ok(
        dock.classList.contains('has-foot'),
        'which is what turns the dock into the reference’s two-row column'
      );
      // The alternatives clause: the sibling card and the dock foot are not a pair.
      const panel = target.querySelector('[data-world-component-bulk-panel]');
      assert.equal(
        panel.querySelectorAll('[data-world-component-bulk-danger]').length,
        1,
        'and the control is drawn ONCE — the sibling card and the dock foot are alternatives'
      );
    });

    it('takes the shell’s short Clear and names the staging THIS panel offers', async () => {
      // Gap-list rows 38 and 39. Both were the shell's own hard-coded strings.
      const { target } = await mixedSelection();
      assert.equal(
        target.querySelector('[data-world-component-bulk-clear]').textContent.trim(),
        'Clear',
        'the action sits under a BULK EDIT eyebrow, so "selection" is the only thing it clears'
      );
      assert.match(
        target.querySelector('.fab-bulk-edit-hero-hint').textContent,
        /Pick the systems to add them to, stage a category or tags, then commit below\./,
        'and the hero names the three axes rather than saying only that changes are staged'
      );
    });

    it('offers ONE select-all over the rows on screen, and no master box', async () => {
      // Gap-list row 37. `proto:592` draws no tri-state box in the band at all: it reads
      // `{n} selected` and offers `Select all {n} shown`.
      const { target } = await mixedSelection();
      const band = target.querySelector('[data-scoped-list-selection-toolbar]');
      assert.ok(Boolean(band), 'the band renders under a selection');
      assert.ok(
        !band.querySelector('[data-scoped-list-select-all-page]'),
        'and draws no master checkbox, which the reference has nowhere in this band'
      );
      const results = band.querySelector('[data-scoped-list-select-all-results]');
      assert.ok(Boolean(results), 'the one select-all is a text action');
      const rendered = target.querySelectorAll('[data-scoped-list-row]').length;
      assert.ok(rendered > 0, 'NON-VACUITY: rows are rendered');
      assert.equal(
        results.textContent.trim(),
        `Select all ${rendered} shown`,
        'counting the rows being RENDERED, so the caption names the set a GM can actually see ' +
          'rather than a filtered corpus that may run past the page'
      );

      results.click();
      await drain();
      assert.equal(
        target.querySelectorAll('input[data-scoped-list-select]:checked').length,
        rendered,
        'and it reaches those same rows'
      );
    });

    it('and `shown` means the PAGE, on a corpus the page does not hold all of', async () => {
      // THE ASSERTION ABOVE CANNOT SEE THIS. The default page is 10 and this corpus is 4, so the
      // rendered rows and the filtered corpus are the same set and a select-all wired to either
      // one satisfies it — proved: pointing `onSelectAllResults` at `projected.rows` left that
      // test green. A two-row page separates the populations, which is the only arrangement in
      // which the word `shown` is falsifiable.
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: recordingComponentActions().actions,
        browserState: { ...createScopedListBrowserState(), pageSize: 2 },
      });
      target.querySelector('[data-scoped-list-select="ingot"]').click();
      await drain();
      const rendered = target.querySelectorAll('[data-scoped-list-row]').length;
      assert.equal(rendered, 2, 'the page holds two of the four');
      const results = target.querySelector('[data-scoped-list-select-all-results]');
      assert.match(results.textContent, /Select all 2 shown/, 'and the caption says two');

      results.click();
      await drain();
      // READ OFF THE BAND'S COUNT, not off the checked inputs: the two off-page rows are not in
      // the DOM at all, so a corpus-wide select-all would tick four and still leave exactly two
      // checked boxes on screen. The band counts `selectedIds`, which is the set itself.
      assert.match(
        target.querySelector('[data-scoped-list-selection-count]').textContent,
        /\b2 selected\b/,
        'it selects TWO — a select-all wired to the filtered corpus would have taken four, and ' +
          'the two it took off-page would have been invisible in the row markup'
      );
      assert.equal(
        target.querySelectorAll('input[data-scoped-list-select]:checked').length,
        2,
        'and both of them are the rows on screen'
      );
    });

    it('and withholds the delete outright when every selected record is held', async () => {
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      // `ingot` and `coal` both have rules in Forge.
      await selectTwo(target);
      const note = target.querySelector('[data-world-component-bulk-delete-note]');
      assert.equal(
        note.getAttribute('data-world-component-bulk-delete-note'),
        'refused',
        'the note states a refusal rather than a consequence'
      );
      assert.match(note.textContent, /none of them can be deleted/);
      assert.match(note.textContent, /Remove them from those systems first/);
      // THE CONTROL STAYS ENABLED, and that is `ui-integration/spec.md` requirement 16 rather
      // than an oversight: "a disabled button satisfies any assertion that the delete did not
      // happen while leaving the GM no explanation at all". The refusal is stated in the note
      // and on the ARMED label, so the second press says the outcome before it is taken — the
      // reading the entry's own danger card already ships.
      const danger = () => dangerControl(target);
      assert.equal(danger().disabled, false, 'the control is live, as requirement 16 requires');
      assert.doesNotMatch(
        danger().textContent,
        /Delete 0 components/,
        'and its idle verb makes no count claim it cannot keep'
      );

      danger().click();
      await drain();
      assert.match(
        danger().textContent,
        /Cannot delete/,
        'arming states the OUTCOME, in the ENTRY’s own words, before the second press'
      );
      assert.deepEqual(calls, [], 'arming writes nothing');

      danger().click();
      await drain();
      assert.deepEqual(calls, [], 'and the confirmed press writes nothing either');
    });

    it('withholds the delete entirely when the call site has no delete leg', async () => {
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: { addToSystem: async () => true },
      });
      await selectTwo(target);
      assert.ok(!target.querySelector('[data-world-component-bulk-danger]'));
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
      await stageMembership(target, 'add', 'sys-forge');

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
        target.querySelector(
          '[data-world-component-bulk-inset="systems"] [data-world-component-bulk-option="sys-forge"]'
        ).disabled,
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

  /**
   * THE FOUR SHARED PRIMITIVES THIS SCREEN NOW ASKS FOR A DIFFERENT FACE FROM (issue 1371 r9-cat).
   *
   * Every one of them is rendered by a component this page composes rather than writes —
   * `ManagerSearchField` and the `<select>`s and the `Medallion` by the frame, the roster card by
   * the shell, the tag pill by `Chip` — so the only thing this page can be held to is that it
   * PASSES the opt-in. That is exactly what these assertions read: the class or the attribute the
   * primitive emits for the value passed, on the element the reference measures.
   *
   * They are class assertions and not computed-style ones deliberately. The rules live in
   * `styles/fabricate.css` and in each primitive's own scoped block, neither of which a mounted
   * happy-dom tree loads; the parity harness measures the paint in a real browser, and this suite
   * measures that the paint was ASKED FOR. Between them nothing is taken on trust.
   */
  describe('the screen consumes the shared primitives’ opt-in faces', () => {
    async function mounted() {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        systemId: 'sys-forge',
        onOpenVocabulary: () => {},
      });
    }

    it('takes the 38px rung on the LEAD row’s two controls and nowhere else', async () => {
      // `proto:577`-`578` draws the search field and the source select at 38, which IS a rung of
      // the published ladder; `proto:582`-`585` draws the membership select, the sort select and
      // the direction toggle one row down at 32, which is RETIRED, so those three stay on the
      // ladder's 34. One "toolbar size" would have taken all five, which is why the prop names
      // the ROW.
      const target = await mounted();
      const field = target.querySelector('[data-scoped-list-search]').closest('.manager-search');
      assert.ok(Boolean(field), 'the search field is the shared primitive');
      assert.ok(
        field.classList.contains('is-size-38'),
        'and it carries the rung `ManagerSearchField` emits for size="38"'
      );

      const source = target.querySelector('[data-scoped-list-filter="source-type"]');
      assert.ok(
        source.classList.contains('is-size-38'),
        'the lead row’s select carries the same rung'
      );

      for (const [what, selector] of [
        ['membership', '[data-scoped-list-filter="membership"]'],
        ['sort', '[data-scoped-list-sort]'],
      ]) {
        const control = target.querySelector(selector);
        assert.ok(Boolean(control), `NON-VACUITY: the ${what} control is rendered`);
        assert.ok(
          !control.classList.contains('is-size-38'),
          `and the filter row’s ${what} control keeps the ladder’s 34, because 32 is retired`
        );
      }
    });

    it('draws the row’s tile as the reference’s borderless 38px glyph chip', async () => {
      // UX finding F12. `proto:600`: `width:38px;height:38px;border-radius:9px;font-size:15px`
      // with a slate fill and no edge, against the shipped 40px bordered artwork tile. The
      // variant owns the absent border and the cancelled wash; 38 and 15 are the primitive's own
      // `size` and `glyph`, which is why all three are asserted here.
      const target = await mounted();
      const chip = target.querySelector('[data-scoped-list-row] .fab-medallion');
      assert.ok(Boolean(chip), 'a row leads with the shared medallion');
      assert.ok(
        chip.classList.contains('is-glyph-chip'),
        'and it carries the variant’s class, which is what cancels the border and the wash'
      );
      // The DOM normalises the declaration list it was handed (`width:38px` comes back as
      // `width: 38px`), so each is matched with the separator optional rather than pinned to the
      // component's own spelling of it.
      const style = chip.getAttribute('style') || '';
      assert.match(style, /width:\s*38px/, 'at the reference’s 38px');
      assert.match(style, /height:\s*38px/, 'square');
      assert.match(
        style,
        /--fab-medallion-glyph:\s*15px/,
        'carrying the reference’s 15px glyph rather than the 0.9rem speck a 38px tile would hold'
      );
    });

    it('turns the inspector roster into a recess with its search field lifted out of it', async () => {
      // Reviewer finding 7. Both were restyled IN PLACE for all three catalogues before the props
      // existed; this screen is the one whose reference draws them.
      const target = await mounted();
      target.querySelector('[data-scoped-list-inspect="ingot"]').click();
      await drain();
      const card = target.querySelector('.manager-scoped-roster-card');
      assert.ok(Boolean(card), 'the inspector composes the shared roster');
      assert.ok(card.classList.contains('is-recessed'), 'and the card takes the recess');
      const search = target.querySelector('.manager-scoped-roster-search');
      assert.ok(Boolean(search), 'the roster still draws its search field');
      assert.ok(
        search.classList.contains('manager-scoped-roster-search-well'),
        'and the field is lifted into its own well rather than sitting flush in the recess'
      );
    });

    it('takes the BARE pill face on the source badge and leaves the flag its edge', async () => {
      // `proto:601` draws the source badge edgeless on `--surface-raised`; `proto:3893`'s `pill()`
      // helper draws the exception flag WITH a real 1px edge. They are two faces, and a flag that
      // lost its edge would read as the badge beside it — which is why this asserts both halves.
      const target = await mounted();
      const badge = target.querySelector(
        '[data-world-component-row-source-pill] [data-status-pill]'
      );
      assert.ok(Boolean(badge), 'the row leads its name line with the shared pill');
      assert.equal(
        badge.getAttribute('data-status-pill-emphasis'),
        'bare',
        'and the badge takes the edgeless face'
      );

      const flag = target.querySelector('[data-world-component-row-flag] [data-status-pill]');
      assert.ok(Boolean(flag), 'NON-VACUITY: a broken-link row is in the corpus');
      assert.ok(
        !flag.getAttribute('data-status-pill-emphasis'),
        'and the exception flag keeps the shipped bordered face'
      );
    });

    it('draws a world tag as the reference’s LIT micro pill, on both of Chip’s axes', async () => {
      // UX finding F10. `proto:757`: `padding: 2px 9px; border-radius: 999px; font: 600 9.5px`,
      // purple ink over a purple wash behind a purple edge. `tone="tag"` alone measured a
      // grey-blue fill, a 10px corner and cream ink — `emphasis` is the paint and `density` the
      // scale, and it takes both to state the pill.
      const target = await mounted();
      target.querySelector('[data-scoped-list-inspect="coal"]').click();
      await drain();
      const chip = target.querySelector('[data-world-component-global-tags] .manager-chip');
      assert.ok(Boolean(chip), 'the card draws its tags as the shared chip');
      for (const token of ['is-tag', 'is-lit', 'is-list']) {
        assert.ok(
          chip.classList.contains(token),
          `and it carries \`${token}\`; \`is-lit\` paints nothing without \`is-tag\`’s colour`
        );
      }
      assert.ok(
        !chip.classList.contains('is-tag-run'),
        'and NOT the entry’s control scale, which the reference draws at 11px for a chip a GM clicks'
      );
    });
  });
});
