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
  componentCorpus,
  componentScopeFor,
  createComponentScopeHarness,
  createWorldComponentCatalogueHarness,
  drainMicrotasks,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { componentBulkMembershipModes } from '../../src/ui/svelte/apps/manager/scoped/componentScoped.js';
import { buildWorldScopeState } from '../../src/ui/svelte/stores/worldScopeProjection.js';
// The frame's own lifted view-state factory, so the page-size case below states the SHIPPED
// shape and changes with it rather than hand-rolling a second one.
import { createScopedListBrowserState } from '../../src/utils/managerBrowserViewState.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const { harness } = createWorldComponentCatalogueHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-component-catalogue-',
});

// The microtask drain is SHARED with the entry suite; both suites carried it verbatim. Aliased
// so every call site below reads unchanged.
const drain = drainMicrotasks;

/**
 * The WORLD VOCABULARY the shared corpus' defaults were minted from (issue 1371 r14-cat).
 *
 * `componentCorpus` writes `Refined`, `Raw`, `fuel` and `bulk` onto its world defaults, and until
 * maintainer ruling M18 reached the bulk panel that was where its two insets read their options.
 * They read the vocabulary now, so a suite that wants `Refined` offered has to AUTHOR it here —
 * the defaults alone are what a migrated world carries, and offering them is the defect.
 */
const CORPUS_VOCABULARY = Object.freeze({
  categories: Object.freeze(['Raw', 'Refined']),
  tags: Object.freeze(['bulk', 'fuel']),
});

/**
 * The world-scope projection over the corpus, with the vocabulary's names attached as
 * `buildWorldScopeState` attaches them (`scope.worldVocabulary`, bare names on the component leg).
 *
 * `componentScopeFor` runs `projectWorldScopeEntity` alone and never sees the vocabulary store.
 * `null` publishes NO vocabulary at all — an older publish, or a world with none authored — which
 * is the state the ruling was raised against, so it is a first-class argument rather than an
 * empty object.
 *
 * @param {object} [overrides] passed straight to `componentCorpus`.
 * @param {{categories?: readonly string[], tags?: readonly string[]}|null} [vocabulary]
 * @returns {object}
 */
function scopeFor(overrides = {}, vocabulary = CORPUS_VOCABULARY) {
  const scope = componentScopeFor(overrides);
  if (!vocabulary) return scope;
  const categories = [...(vocabulary.categories ?? [])];
  const tags = [...(vocabulary.tags ?? [])];
  return { ...scope, worldVocabulary: { categories, tags } };
}

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

    it('leaves the sort DIRECTION live against the source-type sort', async () => {
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

  // ── THE SOURCE FILTER AND THE SORT ARE THE REFERENCE'S OWN SETS (issue 1371 r11-cat) ────────
  // UX round-2 finding F-C. `proto:579` offers `Any source` / `World items` / `Compendium` /
  // `Broken link` and `proto:5228` sorts by `Name` / `System count` / `Source type`; the screen
  // offered a two-option PRESENCE question and a `Source item` sort, so `inventory` reported
  // `MISSING LABEL` for four of the reference's own words and a GM could not ask the one question
  // the catalogue exists to answer on a world whose Items have moved.
  //
  // EVERY CASE HERE ACTS: it selects the option and reads the rows that survive, because an
  // `<option>` list assertion passes just as well over a predicate wired to the wrong answer.
  describe('the source filter asks WHICH KIND of address, and the sort orders by it', () => {
    // A FIFTH RECORD, and the corpus has no other way to state the compendium case: the shared
    // four are one world link, one dangling world link, one unlinked and one more world link, so
    // `Compendium` and `World items` would select the same set and `Source type` would be a
    // two-value order dressed as a three-value one. It is added HERE rather than in the shared
    // corpus because the entry suite counts that corpus's records.
    const PACK_RECORD = Object.freeze({
      id: 'quartz',
      name: 'Sky Quartz',
      description: 'Bought in from a pack.',
      originItemUuid: 'Compendium.fabricate.demo-items.Item.sky-quartz',
    });

    async function mountFiveSources(props = {}) {
      const base = componentCorpus();
      return harness.mount({
        scope: componentScopeFor({ entities: [...base.entities, PACK_RECORD] }),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        systemId: 'sys-forge',
        ...props,
      });
    }

    /** The rendered row ids, sorted, so an assertion is about the SET rather than the order. */
    function rowIds(target) {
      return [...target.querySelectorAll('[data-scoped-list-row]')]
        .map((row) => row.getAttribute('data-scoped-list-row'))
        .sort((left, right) => left.localeCompare(right));
    }

    /** Choose one source option and let the projection settle. */
    async function chooseSource(target, value) {
      const select = target.querySelector('[data-scoped-list-filter="source-type"]');
      select.value = value;
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      return select;
    }

    it('offers the reference’s four options, in the reference’s own words', async () => {
      const target = await mountFiveSources();
      const select = target.querySelector('[data-scoped-list-filter="source-type"]');
      assert.deepEqual(
        [...select.options].map((option) => option.textContent.trim()),
        ['Any source', 'World items', 'Compendium', 'Broken link'],
        '`proto:579`, verbatim — the shipped pair asked about presence, which the row pill ' +
          'already states one row at a time'
      );
    });

    it('narrows to the WORLD Items, which is not the same set as “has a link”', async () => {
      const target = await mountFiveSources();
      assert.deepEqual(
        rowIds(target),
        ['coal', 'ingot', 'orphan', 'quartz', 'resin'],
        'unfiltered first, so every narrowing below is a real change'
      );
      await chooseSource(target, 'world');
      assert.deepEqual(
        rowIds(target),
        ['coal', 'ingot', 'resin'],
        'the three world addresses — and NOT the pack-linked record, which the old ' +
          '`Linked` option would have included'
      );
    });

    it('narrows to the COMPENDIUM records, which the shipped filter could not ask for', async () => {
      const target = await mountFiveSources();
      await chooseSource(target, 'compendium');
      assert.deepEqual(rowIds(target), ['quartz'], 'only the pack address');
    });

    it('narrows to the BROKEN links, from the same roster the row flag is painted from', async () => {
      const target = await mountFiveSources();
      await chooseSource(target, 'broken');
      assert.deepEqual(
        rowIds(target),
        ['coal', 'resin'],
        'the two world addresses the Item roster does not hold'
      );
      // THE FLAGS AND THE FILTERED SET AGREE, which is the whole reason the option routes
      // through `componentSourceBroken` rather than re-deriving the answer.
      assert.equal(
        target.querySelectorAll('[data-world-component-row-flag]').length,
        2,
        'every surviving row wears the broken flag'
      );
    });

    it('claims nothing is broken when the call site handed over no Item roster', async () => {
      // The loudest possible false alarm is the failure a resolution answer must not have: an
      // empty roster means "not known", so this option selects NOTHING rather than everything.
      const target = await mountFiveSources({ worldItems: [] });
      await chooseSource(target, 'broken');
      assert.deepEqual(rowIds(target), [], 'no roster, no claim');
    });

    it('offers the reference’s three sort keys, in the reference’s own words', async () => {
      // `proto:5228`. `System count` is the FRAME's own key — every catalogue sorts by the same
      // member-system count, so it is renamed at the shared string rather than overridden here;
      // `Source type` is this lane's, and `Source item` was the presence question the filter
      // beside it used to ask.
      const target = await mountFiveSources();
      assert.deepEqual(
        [...target.querySelector('[data-scoped-list-sort]').options].map((option) =>
          option.textContent.trim()
        ),
        ['Name', 'System count', 'Source type']
      );
    });

    it('sorts by the KIND of source, compendium first, with the name tie-break', async () => {
      const target = await mountFiveSources();
      const sort = target.querySelector('[data-scoped-list-sort]');
      sort.value = 'source-type';
      sort.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();
      assert.deepEqual(
        [...target.querySelectorAll('[data-scoped-list-row]')].map((row) =>
          row.getAttribute('data-scoped-list-row')
        ),
        ['quartz', 'coal', 'ingot', 'resin', 'orphan'],
        'Compendium, then the three world Items by name, then the record naming nothing — ' +
          'an order a linked/unlinked compare cannot produce, because it puts the pack record ' +
          'in the same bucket as the three world ones'
      );
    });
  });

  describe('the list opens with the surface that MAKES a component, and nothing beside it', () => {
    async function mountLead(props = {}) {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        ...props,
      });
    }

    // M13 (issue 1371 r13-cat), amending M10. The maintainer's own words from testing the branch:
    // "Remove the `+ Register Item` button next to the drop zone in the component catalogue
    // browser and make the drop zone full-width. That search popover doesn't even seem to list
    // unregistered Foundry items, and a search by name is not the intended flow."
    //
    // happy-dom lays nothing out, so "full-width" is stated here as the STRUCTURE that makes it
    // true — the zone is the lead's only child, with no flex sibling to share the row — and the
    // measured width is the rendered suite's (`world-component-catalogue-rendered.test.js`).
    it('draws the drop zone ALONE at the head of the list: no `Register item` beside it (M13)', async () => {
      const target = await mountLead();
      const lead = target.querySelector('.manager-scoped-list-lead');
      assert.ok(Boolean(lead), 'NON-VACUITY: the frame renders the list lead this page supplies');
      const zone = lead.querySelector('[data-item-drop-zone="component-create"]');
      assert.ok(Boolean(zone), 'M2`s drop zone still opens the list');
      assert.match(zone.textContent, /Drag an Item here to make it a component/);

      assert.ok(
        !target.querySelector('[data-scoped-list-register-item]'),
        'the M10 action is gone — M13 removes it rather than restyling it'
      );
      assert.ok(
        !lead.querySelector('[aria-haspopup], [data-popover-option]'),
        'and no picker of any kind stands in the lead in its place'
      );
      const children = [...lead.children];
      assert.equal(
        children.length,
        1,
        'the zone is the lead`s ONLY child: a second flex item is what took the row`s width'
      );
      assert.ok(
        children[0] === zone,
        'and that child is the zone itself, not a wrapper still holding a slot for the action'
      );
    });

    // The one thing the picker test used to cover on the way past: a registration reaches the
    // root's resolver with the RAW drag data, the shipped `ItemDropZone` contract. It is stated
    // on the zone now, because the zone is the only surface that registers.
    it('hands a dropped Item to the SAME resolver a sidebar drag reaches', async () => {
      const drops = [];
      const target = await mountLead({ onCreateFromItemDrop: (data) => drops.push(data) });
      const zone = target.querySelector('[data-item-drop-zone="component-create"]');
      // A Foundry-style drop: with no `foundry` global the action reads
      // `dataTransfer.getData('text/plain')`, so a JSON payload round-trips as a real drag would.
      const event = new target.ownerDocument.defaultView.Event('drop', {
        bubbles: true,
        cancelable: true,
      });
      event.dataTransfer = {
        getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.spare-source' }),
      };
      zone.dispatchEvent(event);
      await drain();
      assert.deepEqual(
        drops,
        [{ type: 'Item', uuid: 'Item.spare-source' }],
        'the page raises the raw payload and the root resolves, refuses, creates and navigates'
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
        // A vocabulary with NO tags is what reaches this state now (issue 1371 r14-cat, M18):
        // the corpus is left carrying `fuel` and `bulk` on `coal`, so a panel that still read the
        // records rather than the vocabulary would draw the inset here and never reach it.
        scope: scopeFor({}, { categories: CORPUS_VOCABULARY.categories, tags: [] }),
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

    // ── THE PANEL'S OWN CONTROLS ARE ACTED ON, NOT SEEN (issue 1371 r11-cat) ──────────────────
    // Quality round-2 finding F1: five controls the r8-r10 rebuild ADDED to this panel — the
    // inset pager's two buttons and the three `Clear`s — were referenced by no file under
    // `tests/` at all, and replacing all five `onclick` bodies with no-ops left the suites green.
    // Each test below stages something, presses the control, and reads the state it changes.

    /** The `Systems` / `World category` / `World tags` group's inline hint, by group label. */
    function sectionHint(target, label) {
      const row = [...target.querySelectorAll('.fab-bulk-edit-label-row')].find(
        (candidate) => candidate.querySelector('.fab-bulk-edit-label')?.textContent.trim() === label
      );
      assert.ok(Boolean(row), `the ${label} group renders a label row`);
      return row.querySelector('.fab-bulk-edit-hint')?.textContent.trim() ?? '';
    }

    /**
     * Mount with a tag vocabulary LARGER than one inset page, which the shared corpus is not.
     *
     * `pageSize` is 5 and the shared corpus authors two tags across two systems, so no mounted
     * assertion has ever entered the paged branch: `range` only ever read `1-1 of 1` or
     * `1-2 of 2`, and the window arithmetic, the clamp, the `Page {page}/{of}` sentence and both
     * pager handlers were unmeasured. Seven tags is the smallest corpus with a second page that
     * is not also a full one, so the range sentence differs at both ends.
     */
    async function selectedWithSevenTags() {
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        // AUTHORED in the vocabulary, not applied to a record (issue 1371 r14-cat, M18): the
        // inset pages over what the world has, and a tag no component carries yet is still a
        // row a GM may stage.
        scope: scopeFor({}, {
          categories: CORPUS_VOCABULARY.categories,
          tags: ['alloy', 'bulk', 'ceramic', 'dust', 'ember', 'fuel', 'glass'],
        }),
        systems: COMPONENT_SYSTEMS,
        actions,
      });
      await selectTwo(target);
      return { target, calls };
    }

    /** One inset's pager parts. */
    function pagerOf(target, inset) {
      return {
        prev: target.querySelector(`[data-world-component-bulk-prev="${inset}"]`),
        next: target.querySelector(`[data-world-component-bulk-next="${inset}"]`),
        range: target
          .querySelector(`[data-world-component-bulk-range="${inset}"]`)
          .textContent.trim(),
      };
    }

    it('pages an inset FORWARD and BACK, and inerts each end of the window', async () => {
      const { target } = await selectedWithSevenTags();
      assert.deepEqual(
        insetRows(target, 'tags'),
        ['alloy', 'bulk', 'ceramic', 'dust', 'ember'],
        'page one holds the window, not the whole vocabulary'
      );
      assert.equal(pagerOf(target, 'tags').range, 'Showing 1-5 of 7');
      assert.equal(pagerOf(target, 'tags').prev.disabled, true, 'and there is no page before it');
      assert.equal(pagerOf(target, 'tags').next.disabled, false);

      pagerOf(target, 'tags').next.click();
      await drain();
      assert.deepEqual(
        insetRows(target, 'tags'),
        ['fuel', 'glass'],
        'NEXT moves the window — the two rows page one could not hold'
      );
      assert.equal(pagerOf(target, 'tags').range, 'Showing 6-7 of 7');
      assert.equal(
        pagerOf(target, 'tags').next.disabled,
        true,
        'and the far end inerts, so the clamp is not merely arithmetic nobody can reach'
      );
      assert.equal(pagerOf(target, 'tags').prev.disabled, false);

      pagerOf(target, 'tags').prev.click();
      await drain();
      assert.deepEqual(insetRows(target, 'tags'), ['alloy', 'bulk', 'ceramic', 'dust', 'ember']);
      assert.equal(pagerOf(target, 'tags').range, 'Showing 1-5 of 7');
      assert.equal(pagerOf(target, 'tags').prev.disabled, true);
    });

    it('names the page a GM is on, out of the pages there are', async () => {
      const { target } = await selectedWithSevenTags();
      const label = () =>
        target
          .querySelector(
            ':scope [data-world-component-bulk-inset="tags"] .fab-bulk-component-inset-pager'
          )
          .textContent.replaceAll(/\s+/g, ' ');
      assert.match(label(), /Page 1\/2/);
      pagerOf(target, 'tags').next.click();
      await drain();
      assert.match(label(), /Page 2\/2/, 'the sentence moves with the window it describes');
    });

    it('CLEARS the staged systems, and Apply goes inert with them', async () => {
      const { target, calls } = await selectedCatalogue();
      await stageMembership(target, 'add', 'sys-forge');
      assert.equal(sectionHint(target, 'Systems'), '1 chosen', 'staged first');
      assert.equal(target.querySelector('[data-world-component-bulk-apply]').disabled, false);

      target.querySelector('[data-world-component-bulk-clear-systems]').click();
      await drain();
      assert.equal(
        sectionHint(target, 'Systems'),
        'None',
        'the group reads back to its unstaged state — the only reset this axis offers'
      );
      assert.equal(
        target
          .querySelector(
            ':scope [data-world-component-bulk-inset="systems"] [data-world-component-bulk-option="sys-forge"]'
          )
          .getAttribute('data-world-component-bulk-option-state'),
        'off',
        'and the row it staged is untick'
      );
      assert.equal(
        target.querySelector('[data-world-component-bulk-apply]').disabled,
        true,
        'so Apply has nothing left to commit'
      );
      assert.deepEqual(calls, [], 'and clearing a stage writes nothing');
    });

    it('CLEARS the staged world category, back to leaving it unchanged', async () => {
      const { target, calls } = await selectedCatalogue();
      target
        .querySelector(
          ':scope [data-world-component-bulk-inset="category"] [data-world-component-bulk-option="Refined"]'
        )
        .click();
      await drain();
      assert.equal(sectionHint(target, 'World category'), 'Refined', 'staged first');
      assert.equal(target.querySelector('[data-world-component-bulk-apply]').disabled, false);

      target.querySelector('[data-world-component-bulk-clear-category]').click();
      await drain();
      assert.equal(
        sectionHint(target, 'World category'),
        'Leave unchanged',
        'CLEAR is not the same instruction as `No world category`, which is itself a write'
      );
      assert.equal(
        target
          .querySelector('[data-world-component-bulk-category-state]')
          .getAttribute('data-world-component-bulk-category-state'),
        'unchanged'
      );
      assert.equal(target.querySelector('[data-world-component-bulk-apply]').disabled, true);
      assert.deepEqual(calls, []);
    });

    it('CLEARS both staged tag directions at once', async () => {
      const { target, calls } = await selectedCatalogue();
      stageTag(target, 'fuel');
      await drain();
      stageTag(target, 'bulk');
      await drain();
      stageTag(target, 'bulk');
      await drain();
      assert.equal(
        sectionHint(target, 'World tags'),
        '1 added · 1 removed',
        'one of each direction staged, so the clear has both to undo'
      );

      target.querySelector('[data-world-component-bulk-clear-tags]').click();
      await drain();
      assert.equal(
        sectionHint(target, 'World tags'),
        'Leave unchanged',
        'a GM cycling eleven tag rows back through three states by hand is what this control is for'
      );
      assert.ok(
        !target.querySelector('[data-world-component-bulk-tags]'),
        'and the staged chip run goes with it'
      );
      assert.equal(target.querySelector('[data-world-component-bulk-apply]').disabled, true);
      assert.deepEqual(calls, []);
    });

    // ── A THROWN PAIR IS A REFUSED PAIR (issue 1371 r11-cat) ──────────────────────────────────
    // Reviewer round-2 finding 4 / Foundry round-2 finding 4. `applyBulk` had no `try`/`catch`,
    // so a throw out of one write skipped every remaining pair, never reached `clearSelection()`
    // and escaped as an unhandled rejection — leaving a page of rows still ticked, some written
    // and some not, with no statement of which. `ui-integration/spec.md` requirement 6 states the
    // opposite rule for the same composed verb.
    //
    // BOTH AXES ARE DRIVEN, and the tag axis is the one that is still REACHABLE at the store:
    // lane STORE's r11 change makes `partComponentFromSystem` catch, notify and answer, so the
    // membership leg no longer throws in the product — while `setWorldTags` and
    // `updateWorldDefaultSection` are raw family verbs with no such wrapper and reject straight
    // into this loop on a refused settings write.
    it('finishes the run when ONE pair throws, and still clears the selection', async () => {
      const { calls, actions } = recordingComponentActions();
      const thrown = [];
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {
          ...actions,
          removeFromSystem: async (entityId, systemId) => {
            calls.push({ verb: 'removeFromSystem', args: [entityId, systemId] });
            await Promise.resolve();
            if (entityId === 'ingot') {
              thrown.push(entityId);
              throw new Error('the settings write was refused');
            }
            return true;
          },
        },
      });
      await selectTwo(target);
      await applyMembership(target, 'remove', 'sys-forge');

      assert.deepEqual(thrown, ['ingot'], 'NON-VACUITY: the throwing leg really threw');
      assert.deepEqual(
        calls.map((call) => call.args[0]),
        ['ingot', 'coal'],
        'the pair AFTER the throw still runs — the whole defect was that it did not'
      );
      assert.ok(
        !target.querySelector('[data-world-component-bulk-panel]'),
        'and the selection is cleared, so no page of rows is left ticked over a half-run instruction'
      );
      assert.equal(
        target.querySelectorAll('input[data-scoped-list-select]:checked').length,
        0,
        'read off the rows themselves as well as off the panel'
      );
    });

    it('runs the remaining components when a RAW family verb rejects on one of them', async () => {
      // `setWorldTags` is not a composed verb: nothing catches for it, so a refused settings
      // write arrives here as a rejection. The membership write of the SAME component precedes
      // it and the next component's writes follow it, so this pins both halves of "counted, not
      // propagated" — the pair that threw is skipped and nothing else is.
      const { calls, actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {
          ...actions,
          setWorldTags: async (entityId, tags) => {
            calls.push({ verb: 'setWorldTags', args: [entityId, tags] });
            await Promise.resolve();
            if (entityId === 'ingot') throw new Error('the settings write was refused');
            return true;
          },
        },
      });
      await selectTwo(target);
      await stageMembership(target, 'add', 'sys-forge');
      stageTag(target, 'fuel');
      await drain();
      target.querySelector('[data-world-component-bulk-apply]').click();
      await drain();

      assert.deepEqual(
        calls.map((call) => `${call.verb}:${call.args[0]}`),
        ['addToSystem:ingot', 'setWorldTags:ingot', 'addToSystem:coal', 'setWorldTags:coal'],
        'ingot’s tag write threw and BOTH of coal’s writes still ran — the rejecting pair is ' +
          'counted like a refused one and nothing else in the run is skipped'
      );
      assert.ok(
        !target.querySelector('[data-world-component-bulk-panel]'),
        'and the selection clears, so the panel does not sit open over a finished run'
      );
    });

    it('and re-arms after a throwing run rather than staying busy forever', async () => {
      // The in-flight flag is reset in the `finally`; a throw that escaped it would leave the
      // panel inert for the rest of the session with no way back.
      const { actions } = recordingComponentActions();
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {
          ...actions,
          removeFromSystem: async () => {
            throw new Error('the settings write was refused');
          },
        },
      });
      await selectTwo(target);
      await applyMembership(target, 'remove', 'sys-forge');

      target.querySelector('[data-scoped-list-select="ingot"]').click();
      await drain();
      await stageMembership(target, 'add', 'sys-forge');
      assert.equal(
        target.querySelector('[data-world-component-bulk-apply]').disabled,
        false,
        'a second instruction can be staged and committed after the failed one'
      );
    });

    // ── THE TWO INSETS OFFER THE WORLD VOCABULARY AND NOTHING ELSE (issue 1371 r14-cat) ──────
    // Maintainer ruling M18, extended from the entry's picker to the catalogue's bulk panel. The
    // category inset read the corpus union of every entry's world default, and the tag inset the
    // union of every entry's world tags. On a migrated world each world default was elected FROM
    // a system, so the first list was the systems' categories offered as the world's; and a
    // vocabulary tag no record had applied yet was not offered at all, with the empty sentence
    // saying none was authored — a string denying a reach that exists (`brief-r11-common.md`
    // rule 1). Both insets read `scope.worldVocabulary` now, which `buildWorldScopeState` publishes
    // on the component leg.
    describe('the two insets offer the WORLD VOCABULARY and nothing else (M18)', () => {
      /** Mount with two rows ticked over a scope built from `vocabulary`, and read one inset. */
      async function insetOver(vocabulary, overrides = {}) {
        const target = await harness.mount({
          scope: scopeFor(overrides, vocabulary),
          systems: COMPONENT_SYSTEMS,
          actions: recordingComponentActions().actions,
        });
        await selectTwo(target);
        return target;
      }

      it('offers the category inset the unset row ALONE when the world has no vocabulary, over defaults migrated from systems', async () => {
        const scope = scopeFor({}, null);
        assert.ok(
          scope.entries.some((entry) => entry.defaults?.category === 'Refined'),
          'the corpus DOES carry a world default the systems minted — that is what must not be offered'
        );
        const target = await insetOver(null);
        assert.deepEqual(
          insetRows(target, 'category'),
          ['none'],
          'a migrated default is a system’s category, not the world’s'
        );
      });

      it('and offers two authored categories in full, with the corpus’ own values absent', async () => {
        const target = await insetOver({ categories: ['Corpses', 'Bespoke Items'], tags: [] });
        assert.deepEqual(insetRows(target, 'category'), ['none', 'Bespoke Items', 'Corpses']);
      });

      it('offers the tag inset the vocabulary’s tags, not the tags applied across the corpus', async () => {
        const target = await insetOver({ categories: [], tags: ['fuel', 'ash'] });
        assert.deepEqual(
          insetRows(target, 'tags'),
          ['ash', 'fuel'],
          '`bulk` is applied to `coal` and unauthored; `ash` is authored and applied nowhere'
        );
        // AND A TAG NO COMPONENT CARRIES IS STILL A ROW A GM CAN STAGE: the row acts.
        stageTag(target, 'ash');
        await drain();
        assert.equal(
          target
            .querySelector(
              ':scope [data-world-component-bulk-inset="tags"] [data-world-component-bulk-option="ash"]'
            )
            .getAttribute('data-world-component-bulk-option-state'),
          'add'
        );
        assert.ok(
          Boolean(target.querySelector('[data-world-component-bulk-tag-chip="ash"]')),
          'and the staged run shows it'
        );
      });

      it('draws the tag inset, NOT the `not authored yet` sentence, for a fresh vocabulary no component has applied', async () => {
        // The case the r13-entry handoff named: tags authored, none applied. The corpus union
        // is empty here, so the old panel said `No world tags are authored yet` over a world
        // that had just authored one.
        const target = await insetOver({ categories: [], tags: ['fuel'] }, { defaults: [] });
        assert.ok(
          !target.querySelector('[data-world-component-bulk-tags-empty]'),
          'the sentence denies a reach that exists'
        );
        assert.deepEqual(insetRows(target, 'tags'), ['fuel']);
      });

      it('and both lists reach the panel through the REAL projection, not only through this suite’s wrapper', async () => {
        // `scopeFor` mirrors what `buildWorldScopeState` attaches; a mirror that drifted from the
        // producer would keep every assertion above green while the shipped panel offered
        // nothing. So the seam runs end to end once: two fake stores, the real assembler, and
        // the page mounted on the component leg it publishes.
        const seeded = (corpus) => ({ corpus: () => corpus, isSeeded: () => true });
        const { worldScope } = buildWorldScopeState({
          stores: {
            component: seeded(componentCorpus()),
            vocabulary: seeded({
              componentCategories: [{ id: 'reagents', name: 'Reagents' }],
              componentTags: [
                { id: 'ore', name: 'ore' },
                { id: 'moss', name: 'moss' },
              ],
              recipeCategories: [],
            }),
          },
          systems: COMPONENT_SYSTEMS,
        });
        const target = await harness.mount({
          scope: worldScope.component,
          systems: COMPONENT_SYSTEMS,
          actions: recordingComponentActions().actions,
        });
        await selectTwo(target);
        assert.deepEqual(insetRows(target, 'category'), ['none', 'Reagents']);
        assert.deepEqual(insetRows(target, 'tags'), ['moss', 'ore']);
      });
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
  // ── M14: THE CATALOGUE OPENS WITH ITS FIRST ROW INSPECTED (issue 1371 r13-cat) ─────────────
  // "the component library should auto-select the first component when it is opened, both in the
  // system-rules and world screens." This is the WORLD half; the system rules list is
  // `ComponentsBrowserView`'s. It is an opt-in on the shared shell and frame (`autoSelectFirst`,
  // default OFF, so the essence and tool catalogues are byte-identical) and this page wires it.
  describe('the catalogue opens with its first row inspected (M14)', () => {
    async function mountOpen(props = {}) {
      return harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        worldItems: WORLD_ITEMS,
        ...props,
      });
    }

    function selectedRowIds(target) {
      return [...target.querySelectorAll('[data-scoped-list-row].is-selected')].map((row) =>
        row.getAttribute('data-scoped-list-row')
      );
    }

    function shownRowIds(target) {
      return [...target.querySelectorAll('[data-scoped-list-row]')].map((row) =>
        row.getAttribute('data-scoped-list-row')
      );
    }

    function typeSearch(target, value) {
      const search = target.querySelector('[data-scoped-list-search]');
      search.value = value;
      search.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    }

    it('turns the flush list column ON, so the toolbar, rows and pager run edge to edge (M21)', async () => {
      // The page-level half of M21; the shell-level default-OFF half sits with the shell mounts
      // below. Mounted on THIS harness, not the shell's: the two harnesses own different
      // documents and a page mounted inside the shell block lands on a foreign DOM.
      const target = await harness.mount({
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
      });
      const column = target.querySelector('.manager-scoped-list-column');
      assert.ok(Boolean(column), 'NON-VACUITY: the page renders the frame`s list column');
      assert.ok(
        column.classList.contains('is-flush'),
        'the page hands the shell `flushColumn`; the rendered suite measures what that yields'
      );
    });

    it('inspects the FIRST row in the shown order the moment it opens, with nothing else chosen', async () => {
      const target = await mountOpen();
      // Name ascending is the shipped sort, so `Coal` leads the corpus.
      assert.equal(shownRowIds(target)[0], 'coal', 'NON-VACUITY: the first row on screen');
      assert.deepEqual(selectedRowIds(target), ['coal'], 'the first shown row is the inspected one');
      assert.equal(
        target.querySelector('[data-scoped-list-row="coal"]').getAttribute('aria-current'),
        'true'
      );
      assert.equal(
        target.querySelector('[data-scoped-list-inspector-name]').textContent.trim(),
        'Coal',
        'and the inspector describes it rather than resting on `Select a component`'
      );
      const inspector = target.querySelector('[data-scoped-list-inspector]');
      assert.ok(
        !/Select a component/.test(inspector.textContent),
        'the resting copy is not shown over a populated inspector'
      );
      // AND FOCUS DID NOT MOVE. A row CLICK focuses the inspector so the keyboard follows the
      // selection; a selection the frame made on its own must not yank focus out of wherever
      // the GM's keyboard was when the screen opened.
      const active = target.ownerDocument.activeElement;
      assert.ok(
        !(active && inspector.contains(active)),
        'the auto-selection does not focus the inspector the way a click does'
      );
    });

    it('takes the first SHOWN row, which on a remembered page is that page`s first', async () => {
      // The lifted view-state remembers the page; the frame must not fight it by selecting a
      // row that is not on screen, and must not reset the page to reach the corpus's first.
      const target = await mountOpen({
        browserState: { ...createScopedListBrowserState(), pageSize: 2, pageIndex: 1 },
      });
      assert.ok(
        !shownRowIds(target).includes('coal'),
        'NON-VACUITY: the corpus`s first row is on the page NOT shown'
      );
      assert.deepEqual(
        selectedRowIds(target),
        ['orphan'],
        'the first row of the page a GM is on is the one inspected'
      );
      assert.equal(
        target.querySelector('[data-scoped-list-inspector-name]').textContent.trim(),
        'Unbound Salt'
      );
    });

    it('does NOT re-select when the shown order changes', async () => {
      const target = await mountOpen();
      assert.deepEqual(selectedRowIds(target), ['coal'], 'opened on the first row');
      target.querySelector('[data-scoped-list-direction]').click();
      await drain();
      assert.equal(
        shownRowIds(target)[0],
        'resin',
        'NON-VACUITY: the direction toggle put a different row first'
      );
      assert.deepEqual(
        selectedRowIds(target),
        ['coal'],
        'the inspected row is the one the frame chose on open, not the new first row'
      );
    });

    it('keeps a chosen row through a filter that hides it, so it comes back when the filter clears', async () => {
      // The frame's own rule — a row that leaves the filtered set stops being inspected, and its
      // id is KEPT so the selection returns with the row — is not overridden by the opt-in. A
      // frame that re-homed the selection to the first match on every keystroke would lose the
      // GM's own choice to the act of searching for something else.
      const target = await mountOpen();
      target.querySelector('[data-scoped-list-inspect="ingot"]').click();
      await drain();
      assert.deepEqual(selectedRowIds(target), ['ingot'], 'the GM chose `Iron Ingot`');

      typeSearch(target, 'resin');
      await drain();
      assert.deepEqual(shownRowIds(target), ['resin'], 'NON-VACUITY: the search hid the chosen row');
      assert.deepEqual(selectedRowIds(target), [], 'and nothing on screen is inspected in its place');

      typeSearch(target, '');
      await drain();
      assert.deepEqual(selectedRowIds(target), ['ingot'], 'the GM`s own choice is back');
    });
  });

  // ── THE OPT-IN AT THE SHELL, where an owner can hand a selection in (issue 1371 r13-cat) ────
  // The page cannot be handed a remembered or deep-linked selection — its `selectedId` is its own
  // `$state('')` — so the rule that a selection the owner supplies WINS over the first row is
  // stated on the shell, which the page composes and which binds `selectedId` from its owner.
  // The same mount proves the default: with the prop unset the shell opens exactly as it always
  // did, on a resting inspector, which is what keeps the essence and tool catalogues unchanged.
  describe('the shell`s `autoSelectFirst` yields to a selection the owner supplies', () => {
    const shellHarness = createComponentScopeHarness({
      repoRoot,
      tmpPrefix: 'fabricate-world-component-catalogue-shell-',
      componentPath: 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
      compiledExtras: [
        'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
        'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
        'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
        'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
        'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
        'src/ui/svelte/apps/manager/Callout.svelte',
        'src/ui/svelte/apps/manager/SegmentedControl.svelte',
      ],
    });

    before(() => shellHarness.setup());
    after(() => shellHarness.teardown());

    function shellProps(props = {}) {
      return {
        scope: scopeFor(),
        systems: COMPONENT_SYSTEMS,
        actions: {},
        hookValue: 'world-components',
        title: 'Component catalogue',
        countUnit: 'components',
        inspectorKicker: 'Catalogue entry',
        ...props,
      };
    }

    it('a remembered or deep-linked selection wins over the first row', async () => {
      const target = await shellHarness.mount(
        shellProps({ autoSelectFirst: true, selectedId: 'ingot' })
      );
      assert.equal(
        target.querySelector('[data-scoped-list-row]').getAttribute('data-scoped-list-row'),
        'coal',
        'NON-VACUITY: the supplied selection is not the first row'
      );
      assert.ok(
        target.querySelector('[data-scoped-list-row="ingot"]').classList.contains('is-selected'),
        'the owner`s selection is the inspected row'
      );
      assert.ok(
        !target.querySelector('[data-scoped-list-row="coal"]').classList.contains('is-selected'),
        'and the first row was NOT selected over it'
      );
    });

    it('leaves the list column carrying the pane inset with `flushColumn` unset, exactly as the other catalogues do (M21)', async () => {
      const target = await shellHarness.mount(shellProps());
      const column = target.querySelector('.manager-scoped-list-column');
      assert.ok(Boolean(column), 'NON-VACUITY: the frame renders its list column');
      assert.ok(
        !column.classList.contains('is-flush'),
        'the default is OFF: the essence and tool catalogues keep the inset they always had'
      );
    });

    it('and with the prop unset the shell opens resting, exactly as the other catalogues do', async () => {
      const target = await shellHarness.mount(shellProps());
      assert.ok(
        Boolean(target.querySelector('[data-scoped-list-row="coal"]')),
        'NON-VACUITY: there are rows to select'
      );
      assert.equal(
        target.querySelectorAll('[data-scoped-list-row].is-selected').length,
        0,
        'the default is OFF: no row is inspected on open'
      );
    });
  });
});
