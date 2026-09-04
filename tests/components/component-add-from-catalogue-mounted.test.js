/**
 * `Add from catalogue to {system}` — the system Component Rules list's header picker (issue 1371,
 * maintainer ruling M9), mounted.
 *
 * ## Why this file exists at all
 *
 * Revision 5 shipped the header action as `openWorldScopedEntry('world-component-catalogue', '')`.
 * `world-component-catalogue` is a VIEW LAB CASE ID and not a route token: it is in no route
 * table, the root's view chain has no branch for it, and the navigation helper assigns whatever
 * token it is handed — so the control dropped the GM on the crafting-systems library. It survived
 * four full gate runs because `data-component-add-from-catalogue` appeared in NO test file: the
 * whole of its coverage was the two lines of the component itself.
 *
 * So the criterion here is not "the dialog renders". It is the four claims a picker has to make
 * good on, each of which is unobservable from a rendered tree that nobody acts on: it offers the
 * records this system does NOT hold, it adopts each ticked one through the composed write, it
 * does so SEQUENTIALLY behind one in-flight flag, and it leaves no selection behind.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  COMPONENT_SYSTEMS,
  componentCorpus,
  createComponentScopeHarness,
  drainMicrotasks,
} from '../helpers/componentScopeMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const dialog = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-add-from-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/ComponentAddFromCatalogueDialog.svelte',
  // `ManagerModal`'s own three leaves. A `.svelte` (or a module it transitively imports) the tree
  // renders and the manifest omits HANGS this suite as `# cancelled` rather than failing it.
  rawExtras: [
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledExtras: ['src/ui/svelte/apps/manager/ManagerModal.svelte'],
});

/**
 * A world corpus in which `sys-forge` holds EXACTLY ONE of the four records.
 *
 * The shared fixture adopts three of them into `sys-forge`, which leaves a one-row offer — too
 * small to state anything about ordering, about a multi-selection, or about a sequential write.
 * Narrowing the membership rather than widening the corpus keeps the four records (and their
 * linked/unlinked/tagged states) exactly as every sibling suite reads them.
 */
function offerScope() {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: componentCorpus({
      membership: [
        { entityId: 'ingot', systemId: 'sys-forge', inherit: { category: true } },
        // `coal` IS held by the other system, which is what makes the `{n} other systems` column
        // non-zero for a record `sys-forge` is being offered.
        { entityId: 'coal', systemId: 'sys-alchemy', inherit: { category: false } },
      ],
    }),
    systems: COMPONENT_SYSTEMS,
  });
}

/** The portaled dialog root. `ManagerModal` portals out of the mount point. */
function panel() {
  return document.querySelector('[data-component-add-from-catalogue-dialog]');
}

function rowIds() {
  return [...document.querySelectorAll('[data-component-add-from-catalogue-row]')].map((row) =>
    row.getAttribute('data-component-add-from-catalogue-row')
  );
}

/**
 * Tick one offered row through its real `<input type="checkbox">`.
 *
 * `flushSync` IS LOAD-BEARING, not tidying: the Apply is `disabled` while nothing is ticked, and
 * a disabled button swallows `.click()` — so without the flush every Apply below fires against
 * last render's markup and records nothing, which reads as a broken write path rather than as a
 * test that clicked an inert control.
 */
function tick(entityId) {
  const box = document.querySelector(`[data-component-add-from-catalogue-select="${entityId}"]`);
  assert.ok(Boolean(box), `the offer holds a row for ${entityId}`);
  box.checked = true;
  box.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  flushSync();
}

function applyButton() {
  return document.querySelector('[data-component-add-from-catalogue-apply]');
}

/**
 * An `onAdd` fake that records the ORDER of every write and, optionally, holds each one open.
 *
 * It records a `start` before it awaits and an `end` after, so a caller that fired the writes
 * concurrently produces `start start end end` and a caller that awaits each one produces
 * `start end start end`. A fake recording only ids cannot tell those apart, and the whole reason
 * this loop is sequential is that every world-scope write reads-modifies-writes ONE setting.
 */
function recordingAdd({ gated = false } = {}) {
  const events = [];
  let release = () => {};
  const gate = new Promise((resolve_) => {
    release = resolve_;
  });
  return {
    events,
    release,
    onAdd: async (entityId) => {
      events.push(`start:${entityId}`);
      if (gated) await gate;
      else await Promise.resolve();
      events.push(`end:${entityId}`);
      return true;
    },
  };
}

async function open(props = {}) {
  // DESTROY THE PREVIOUS TREE FIRST. `mount()` does not, and this dialog PORTALS its panel — so a
  // second mount without this leaves two panels in the document and every `document.querySelector`
  // below silently reads the first one.
  dialog.remount();
  const closed = [];
  const recorder = props.recorder ?? recordingAdd();
  await dialog.mount({
    open: true,
    systemId: 'sys-forge',
    systemName: 'Forge',
    entries: offerScope().entries,
    onAdd: recorder.onAdd,
    onClose: () => closed.push(true),
    ...props,
  });
  return { closed, recorder };
}

describe('ComponentAddFromCatalogueDialog (mounted, issue 1371 M9)', () => {
  before(async () => {
    await dialog.setup();
  });

  after(() => {
    dialog.teardown();
  });

  it('renders nothing at all while closed', async () => {
    await open({ open: false });
    assert.ok(!panel(), 'a picker with no subject draws no chrome');
  });

  it('offers the catalogue records this system does NOT hold, and only those', async () => {
    // `proto:6027`: `CAT.filter(c => !this.has(c.id, S.sysId))`. The filter is over the world
    // corpus against THIS system's membership — not over what the list behind the dialog happens
    // to be showing — so a record the system holds is absent however the list is filtered.
    await open();
    assert.ok(Boolean(panel()), 'the dialog renders');
    assert.deepEqual(
      rowIds(),
      ['coal', 'orphan', 'resin'],
      'the three records Forge has no rules for, in name order'
    );
    // THE NEGATIVE HALF IS THE ASSERTION. Without it a dialog listing everything passes the
    // deepEqual above the moment the fixture's held record sorts last.
    assert.ok(
      !document.querySelector('[data-component-add-from-catalogue-row="ingot"]'),
      'Iron Ingot is already in Forge, so adopting it again is not on offer'
    );
  });

  it('and the membership it reads is THIS system’s, not any system’s', async () => {
    // The positive control for the filter above: the same corpus against the other system offers
    // a DIFFERENT set. A dialog that filtered on "held by nobody" would answer the same three
    // rows here, and a dialog that ignored membership entirely would answer four.
    await open({ systemId: 'sys-alchemy', systemName: 'Alchemy' });
    assert.deepEqual(rowIds(), ['ingot', 'orphan', 'resin']);
  });

  it('states how much of the world already holds each offered record', async () => {
    await open();
    const coal = document.querySelector('[data-component-add-from-catalogue-row="coal"]');
    assert.match(coal.textContent, /1 other system\b/, 'singular, for the one system that has it');
    const resin = document.querySelector('[data-component-add-from-catalogue-row="resin"]');
    assert.match(resin.textContent, /0 other systems/, 'and plural at zero');
  });

  it('states each offered record’s SOURCE under its name, as the reference does', async () => {
    // `proto:6027` maps each row's second line to `c.src`, and the captured prototype frame writes
    // `Foundry item` / `Compendium` there. The first draft of this dialog put the record's
    // DESCRIPTION on that line, which renders blank for most of a real corpus — a world
    // component's description is a snapshot only a linked creation fills.
    //
    // IT IS THE SHIPPED `componentSourceLine`, so this picker, the catalogue inspector and the
    // world entry's header cannot disagree about what a record's source is.
    await open();
    const metaOf = (id) =>
      document.querySelector(`[data-component-add-from-catalogue-row="${id}"]`).textContent;
    assert.match(metaOf('coal'), /Linked Foundry item/, 'a record naming a world Item');
    assert.match(metaOf('orphan'), /No source item/, 'and one naming none, which is a real state');
    // The Compendium branch needs a `Compendium.`-prefixed uuid, which this shared fixture has
    // no record for; it is the helper's own branch and is covered where the helper is.
  });

  it('adopts every ticked record through the composed write, in offer order', async () => {
    const { recorder } = await open();
    // TICKED OUT OF ORDER, so the assertion below is about the DIALOG's ordering rather than
    // about the order a test happened to click in.
    tick('resin');
    tick('coal');
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(recorder.events, [
      'start:coal',
      'end:coal',
      'start:resin',
      'end:resin',
    ]);
  });

  it('and the writes are SEQUENTIAL, which is what one shared settings key requires', async () => {
    // Every world-scope action loads the persisted payload, edits it and writes it back, so two
    // concurrent adoptions would have two writers racing one setting and the last one home would
    // carry only its own edit. `start start end end` is that failure; `start end start end` is
    // the contract.
    const { recorder } = await open();
    tick('coal');
    tick('orphan');
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(recorder.events.slice(0, 3), ['start:coal', 'end:coal', 'start:orphan']);
  });

  it('refuses a second Apply while one is in flight, and says so on the control', async () => {
    const recorder = recordingAdd({ gated: true });
    await open({ recorder });
    tick('coal');
    tick('orphan');
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(recorder.events, ['start:coal'], 'the first write is open');
    assert.equal(applyButton().disabled, true, 'and the control is inert, so the guard is REACHED');
    // …and the flag itself, not merely the disabled attribute: a click dispatched at the node
    // while the run is open must add nothing to the queue.
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(recorder.events, ['start:coal'], 'a second Apply adds no second run');
    recorder.release();
    await drainMicrotasks();
    assert.deepEqual(recorder.events, [
      'start:coal',
      'end:coal',
      'start:orphan',
      'end:orphan',
    ]);
  });

  it('closes and clears the selection once the run lands', async () => {
    const { closed } = await open();
    tick('coal');
    assert.match(
      document.querySelector('[data-component-add-from-catalogue-count]').textContent,
      /1 selected/
    );
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(closed, [true], 'the picker dismisses itself rather than sitting there');
    assert.match(
      document.querySelector('[data-component-add-from-catalogue-count]').textContent,
      /0 selected/,
      'and the selection is cleared IN PLACE, so a picker reopened on the same instance does ' +
        'not re-offer a selection that has already been written'
    );
  });

  it('the Apply is inert with nothing ticked, and names the count and the system when it is not', async () => {
    await open();
    assert.equal(applyButton().disabled, true, 'nothing ticked writes nothing');
    tick('coal');
    tick('resin');
    assert.equal(applyButton().disabled, false);
    assert.match(applyButton().textContent, /Add 2 to Forge/);
  });

  it('search narrows the offer without dropping a row the GM already ticked', async () => {
    // The search is this dialog's one licensed departure from `proto:6027-6039`, which draws
    // none: the reference's fixture holds a dozen catalogue entries and a real world holds
    // hundreds. A narrowing that also UNTICKED would be worse than no search — the GM narrowed
    // the list, they did not change their mind.
    const { recorder } = await open();
    tick('coal');
    const search = document.querySelector('[data-component-add-from-catalogue-search]');
    search.value = 'resin';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    assert.deepEqual(rowIds(), ['resin'], 'the offer narrows to the match');
    assert.match(
      document.querySelector('[data-component-add-from-catalogue-count]').textContent,
      /1 selected/,
      'and the hidden tick survives'
    );
    tick('resin');
    applyButton().click();
    await drainMicrotasks();
    assert.deepEqual(
      recorder.events.filter((event) => event.startsWith('start:')),
      ['start:coal', 'start:resin'],
      'so Apply writes both, including the one the search hid'
    );
  });

  it('says which of the two empty states it is in', async () => {
    // An offer emptied by a SEARCH and an offer that was empty to begin with are different facts,
    // and only one of them is about the GM's own typing.
    await open();
    const search = document.querySelector('[data-component-add-from-catalogue-search]');
    search.value = 'nothing matches this';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    assert.match(
      document.querySelector('[data-component-add-from-catalogue-empty]').textContent,
      /matches that search/
    );

    await open({ entries: [] });
    assert.match(
      document.querySelector('[data-component-add-from-catalogue-empty]').textContent,
      /already has rules for every component/
    );
  });

  it('wears the shared modal chrome rather than a hand-rolled overlay', async () => {
    // The manager has ONE modal-dialog chrome (issue 877). A third implementation of "centred
    // panel with a title, a scrolling body and a footer rail" is what this assertion is against.
    await open();
    const root = panel();
    assert.ok(root.hasAttribute('data-manager-modal'), 'it IS the shared chrome');
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
    assert.match(root.querySelector('h3').textContent, /Add from catalogue to Forge/);
    assert.ok(
      Boolean(document.querySelector('[data-manager-modal-close]')),
      'and keeps the chrome’s own close control'
    );
  });
});
