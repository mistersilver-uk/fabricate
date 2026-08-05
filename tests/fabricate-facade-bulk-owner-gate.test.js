/**
 * The owner gate on `Fabricate#salvageComponents` / `#destroyComponents` (issue 859).
 *
 * ## Why the ownership pin is a SOURCE contract
 *
 * `src/main.js` imports the global stylesheet and the Svelte UI at module load, so it
 * cannot be imported under `node --test`. `tests/helpers/fabricateFacadeHarness.js`
 * therefore carries a FAITHFUL COPY of the gate, and the source assertions below are what
 * stop that copy drifting from the thing it stands for.
 *
 * ## The pin moved, and where
 *
 * Both facades delegate to `Fabricate#_gateBulkTargets(targets, actorId)`. That is where
 * the literal `target.actorId ?? actorId` lives and where the absent
 * `?? this.getSelectedCraftingActorId()` tail must be guarded — one place to protect
 * rather than two that can drift.
 *
 * ## Bounding strategy, stated
 *
 * Every absence assertion runs against a BOUNDED slice (`mainMethodSource`), never the
 * alchemy suite's `MAIN_SOURCE.slice(indexOf(...))`, which runs to end of file. That
 * distinction is not stylistic here: `_resolveCraftingSources` legitimately exists
 * elsewhere in `src/main.js`, so an unbounded "must not contain `_resolveCraftingSources`"
 * assertion would be permanently red and would have to be deleted rather than fixed. The
 * first test below proves the bound is real by asserting exactly that.
 *
 * ## And what else rides on that slicer
 *
 * Two more `src/main.js` facts are pinned here because this is where the bounded slicer
 * already lives, and because both are invisible to every behavioural test: that each
 * facade FORWARDS its `onProgress` listener into the service call (dropping it freezes
 * the panel at `0 of N` in silence), and that `_postBulkSalvageChatMessage` keeps its
 * speaker → visibility → create order (getting it wrong publishes a blind run's whole
 * result table, or throws for a player whose client default is In-Character). Neither is
 * mirrored into the harness: a hand-copied poster would be evidence about the copy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BulkDestroyService } from '../src/systems/BulkDestroyService.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import {
  bulkComponent,
  bulkSystem,
  ownedItem,
  recordingSalvage,
} from './helpers/bulkSalvageFixtures.js';
import {
  MAIN_SOURCE,
  createFabricateFacadeHarness,
  mainMethodSource,
  makeDeletableFacadeActor,
  makeFacadeActor,
} from './helpers/fabricateFacadeHarness.js';

// LOCATORS, not assertions: each names the signature `mainMethodSource` slices from, so
// it has to be the CURRENT one verbatim. An option added to either facade — `onProgress`
// was — moves the locator and nothing else; the assertions below are about the gate the
// method delegates to, and each one is re-run unchanged against the new slice.
const GATE = '_gateBulkTargets(targets, actorId) {';
const SALVAGE =
  'async salvageComponents({ actorId = null, targets = [], interactive = true, onProgress = null } = {}) {';
const DESTROY =
  'async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {';

describe('the bounded slice is genuinely bounded', () => {
  it('stops at the method it names, and does not run to end of file', () => {
    const gate = mainMethodSource(GATE);
    assert.ok(gate.startsWith(GATE), 'starts at the signature');
    assert.ok(gate.trimEnd().endsWith('}'), 'and ends at its own closing brace');
    assert.ok(gate.length < 800, `the whole gate is small; got ${gate.length} characters`);
    assert.equal(
      gate.includes('salvageComponents'),
      false,
      'the very next method is already outside the slice'
    );
  });

  it('proves the bound is load-bearing: `_resolveCraftingSources` DOES live elsewhere', () => {
    // This is the assertion that justifies the whole helper. An unbounded
    // `slice(indexOf('_gateBulkTargets'))` carries every later method with it, so the
    // absence assertions below would be red forever against a perfectly correct source.
    assert.ok(
      MAIN_SOURCE.split('_resolveCraftingSources').length - 1 > 5,
      'the crafting/gathering facades legitimately use it many times over'
    );
    assert.ok(
      MAIN_SOURCE.slice(MAIN_SOURCE.indexOf(GATE)).includes('_resolveCraftingSources'),
      'so an UNBOUNDED slice from the gate would contain it'
    );
    assert.equal(
      mainMethodSource(GATE).includes('_resolveCraftingSources'),
      false,
      'while the bounded one does not'
    );
  });

  it('fails loudly rather than asserting on an empty string', () => {
    // A pin that silently degrades to `''` passes every absence assertion forever.
    assert.throws(() => mainMethodSource('_noSuchMethodExists(a, b) {'), /declares no/);
  });
});

describe('_gateBulkTargets: the exact expression, and nothing else', () => {
  it('resolves `target.actorId ?? actorId`', () => {
    assert.ok(
      mainMethodSource(GATE).includes('this._resolveCraftingActor(target.actorId ?? actorId)'),
      'the per-target actor id, falling back to the run-level one'
    );
  });

  it('has NO persisted-selection fallback', () => {
    // The whole hazard. A `?? this.getSelectedCraftingActorId()` tail here would silently
    // RETARGET a row whose own actor did not resolve onto whichever actor the player last
    // selected — salvaging or destroying the wrong character's items, with no error
    // anywhere and nothing on screen to distinguish it from a correct run.
    const gate = mainMethodSource(GATE);
    assert.equal(gate.includes('getSelectedCraftingActorId'), false);
    assert.equal(gate.includes('rememberedActorId'), false);
    assert.equal(gate.includes('_resolveCraftingSources'), false);
  });

  it('takes an actor ID and never a uuid, at any nesting level', () => {
    const gate = mainMethodSource(GATE);
    assert.equal(gate.includes('actorUuid'), false);
    assert.equal(gate.includes('fromUuid'), false);
  });

  it('preserves input order and refuses rather than dropping a row', () => {
    const gate = mainMethodSource(GATE);
    assert.ok(gate.includes('.map('), 'a map, so every input row yields an output row');
    assert.equal(gate.includes('.filter((entry) => entry.actor)'), false, 'the gate drops nothing');
  });
});

describe('both facades delegate to the one gate', () => {
  for (const [label, signature] of [
    ['salvageComponents', SALVAGE],
    ['destroyComponents', DESTROY],
  ]) {
    it(`${label} calls _gateBulkTargets and resolves no actor itself`, () => {
      const body = mainMethodSource(signature);
      assert.ok(body.includes('this._gateBulkTargets(targets, actorId)'), 'one gate, not two');
      assert.equal(
        body.includes('this._resolveCraftingActor('),
        false,
        'resolution happens in exactly one place'
      );
      assert.equal(body.includes('_resolveCraftingSources'), false);
      assert.equal(body.includes('getSelectedCraftingActorId'), false);
    });

    it(`${label} filters the gated rows rather than the input`, () => {
      const body = mainMethodSource(signature);
      assert.ok(body.includes('gated.filter((entry) => entry.actor)'));
      assert.ok(body.includes('this._mergeBulkRows(gated'), 'and weaves refusals back in order');
    });
  }

  it('only salvageComponents derives a uuid, and only from the RESOLVED actor', () => {
    const salvage = mainMethodSource(SALVAGE);
    assert.ok(salvage.includes('actorUuid: actor.uuid'), 'derived from the gate, never taken in');
    assert.equal(
      mainMethodSource(DESTROY).includes('actorUuid'),
      false,
      'destroy hands the service the resolved document itself'
    );
  });

  it('names `notPermitted` in the refusal row builder', () => {
    assert.ok(
      mainMethodSource('_buildNotPermittedRow(target) {').includes("outcome: 'notPermitted'")
    );
  });

  for (const [label, signature] of [
    ['salvageComponents', SALVAGE],
    ['destroyComponents', DESTROY],
  ]) {
    it(`${label} FORWARDS onProgress into the service call`, () => {
      // Accepting the option and forwarding it are two different edits, and deleting the
      // forward is silent: the run still completes, the report is still correct, and the
      // panel's progress bar simply freezes at `0 of N` for the whole run. Nothing else
      // can see it — the store hands the facade a listener and never hears back, and the
      // service defaults `onProgress` to `null` and reports nothing.
      const body = mainMethodSource(signature);
      const call = body.indexOf('.run({');
      assert.ok(call > 0, 'the facade delegates to the service');
      assert.ok(
        body.slice(call).includes('onProgress'),
        'the listener reaches `run()`, not just the signature'
      );
      assert.ok(
        body.indexOf('onProgress') < call,
        'and the signature accepts one, so the forward is not reading a global'
      );
    });
  }
});

describe('_postBulkSalvageChatMessage: speaker → visibility → create, in that order', () => {
  // NOT mirrored into the harness: a hand-copied poster would be evidence about the copy
  // rather than about `src/main.js`. The bounded slicer is the honest tool — the suite
  // above proves it is genuinely bounded, and proves it throws rather than degrading to
  // `''` when the signature moves.
  const POSTER =
    'async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {';

  it('creates with `author`, and never the discarded `user` key', () => {
    // The V14 schema defines `author` and has NO `user` field and no shim, so a message
    // created with `user` is silently attributed by defaulting instead — which works
    // often enough that nothing catches it.
    const body = mainMethodSource(POSTER);
    assert.ok(body.includes('author: game.user?.id'));
    assert.equal(body.includes('user:'), false, 'the discarded key appears nowhere');
  });

  it('builds the speaker BEFORE applying visibility', () => {
    // `ChatMessage.applyMode`'s `ic` branch reads `chatData.speaker.actor` unguarded, so
    // a visibility pass over speaker-less data THROWS for any player whose client default
    // is In-Character — and takes the whole card with it.
    const body = mainMethodSource(POSTER);
    assert.ok(body.includes('applyBulkChatVisibility'), 'visibility is applied at all');
    assert.ok(body.indexOf('speaker') < body.indexOf('applyBulkChatVisibility'));
  });

  it('applies visibility BEFORE create, and never as a create option', () => {
    // The legacy `rollMode` CREATE OPTION is honoured only for a message carrying rolls,
    // and this card carries none — so `create(chatData, { rollMode })` would post every
    // blind bulk card publicly. That exact mutation is what the applier module exists to
    // prevent.
    const body = mainMethodSource(POSTER);
    const visibility = body.indexOf('applyBulkChatVisibility');
    const create = body.indexOf('ChatMessage.create');
    assert.ok(visibility > 0 && create > 0);
    assert.ok(visibility < create);
    assert.equal(body.includes('create(chatData, {'), false, 'no create-option smuggling');
  });
});

// ---------------------------------------------------------------------------
// Behaviour, through the harness copy the assertions above protect.
// ---------------------------------------------------------------------------

const ORE = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', img: 'icons/ore.webp' });
const SYSTEM = bulkSystem({ id: 'sys-a', components: [ORE] });

/** Stand up the facade over two actors, with a real `BulkSalvageService` behind it. */
function salvageHarness({ user, actors, selectedCraftingActorId = null }) {
  const { seam, calls } = recordingSalvage({ success: true, results: [] });
  const bulkSalvageService = new BulkSalvageService({
    salvage: seam,
    getCraftingSystem: (systemId) => (systemId === SYSTEM.id ? SYSTEM : null),
  });
  const harness = createFabricateFacadeHarness({
    user,
    actors,
    systems: [{ system: SYSTEM, recipes: [] }],
    selectedCraftingActorId,
    bulkSalvageService,
  });
  return { ...harness, salvageCalls: calls };
}

const target = (actorId) => ({ actorId, systemId: 'sys-a', componentId: 'comp-ore' });

describe('salvageComponents: an unresolvable actor is refused, never retargeted', () => {
  it("reports notPermitted for another player's actor and never calls the engine", async () => {
    const mine = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-mine'), target('a-theirs')],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-mine'],
      'the refused row never reached the engine'
    );
    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['succeeded', 'notPermitted']
    );
    assert.equal(result.counts.notPermitted, 1);
    assert.equal(result.counts.total, 2, 'the refusal is still counted as a row');
  });

  it('does NOT fall back to the persisted crafting actor for an unresolvable row', async () => {
    // The behavioural face of the source pin above. The persisted selection names an
    // actor this user DOES own, so a fallback would resolve — and would silently salvage
    // that character's Iron Ore instead of refusing.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      selectedCraftingActorId: 'a-owned',
    });

    const result = await facade.salvageComponents({
      targets: [target('a-foreign')],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, [], 'nothing was salvaged, from anyone');
    assert.equal(result.items[0].outcome, 'notPermitted');
    assert.equal(
      result.items[0].actorId,
      'a-foreign',
      'and the row still names what was asked for'
    );
  });

  it('refuses a row naming no actor at all when the run names none either', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
      selectedCraftingActorId: 'a-owned',
    });

    const result = await facade.salvageComponents({
      targets: [{ systemId: 'sys-a', componentId: 'comp-ore' }],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, []);
    assert.equal(result.items[0].outcome, 'notPermitted');
  });

  it('uses the RUN-LEVEL actorId for a row that names none of its own', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
    });

    await facade.salvageComponents({
      actorId: 'a-owned',
      targets: [{ systemId: 'sys-a', componentId: 'comp-ore' }],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-owned']
    );
  });

  it("prefers the row's own actorId over the run-level one", async () => {
    const first = makeFacadeActor('a-1', { ownerUserIds: ['u1'] });
    const second = makeFacadeActor('a-2', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [first, second],
    });

    await facade.salvageComponents({
      actorId: 'a-1',
      targets: [target('a-2')],
      interactive: false,
    });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-2']
    );
  });

  it('lets a GM act on any world actor', async () => {
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'gm', isGM: true },
      actors: [theirs],
    });

    await facade.salvageComponents({ targets: [target('a-theirs')], interactive: false });

    assert.deepEqual(
      salvageCalls.map((call) => call.actorUuid),
      ['Actor.a-theirs']
    );
  });

  it('refuses an actor that is not in game.actors at all', async () => {
    // `_resolveCraftingActor` resolves through `game.actors.get` — WORLD actors only — so
    // a compendium-backed actor and an unlinked token actor can never be targets.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade, salvageCalls } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-not-in-the-world')],
      interactive: false,
    });

    assert.deepEqual(salvageCalls, []);
    assert.equal(result.items[0].outcome, 'notPermitted');
  });

  it('never throws for a refused row, and preserves the caller order', async () => {
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
    });

    const result = await facade.salvageComponents({
      targets: [target('a-foreign'), target('a-owned'), target('a-foreign')],
      interactive: false,
    });

    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['notPermitted', 'succeeded', 'notPermitted']
    );
    assert.equal(
      result.items[0].name,
      'Iron Ore',
      'a refused row still READS as what was selected'
    );
    assert.equal(result.items[0].img, 'icons/ore.webp');
  });

  it('threads a progress listener through to the service, over the GATED queue', async () => {
    // The behavioural face of the forwarding pin above, through the real service. It also
    // pins the STATED LIMIT: `total` is what the SERVICE was given — this call's targets
    // minus the rows the gate refused — so a run carrying a refusal finishes below the
    // caller's own denominator rather than reporting a refusal as work done.
    const mine = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
    const theirs = makeFacadeActor('a-theirs', { ownerUserIds: ['u2'] });
    const { facade } = salvageHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
    });
    const ticks = [];

    await facade.salvageComponents({
      targets: [target('a-mine'), target('a-theirs')],
      interactive: false,
      onProgress: (completed, total) => ticks.push([completed, total]),
    });

    assert.deepEqual(ticks, [[1, 1]], 'one tick for the one row that was permitted to run');
  });

  it('passes the service shape straight through when the prompt was dismissed', async () => {
    // Nothing ran, so there is no per-row story to tell — reporting refusals for a run
    // the player cancelled would invent one.
    const owned = makeFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const foreign = makeFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const bulkSalvageService = {
      run: async () => ({ cancelled: true, items: [], counts: {}, posted: false }),
    };
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      systems: [{ system: SYSTEM, recipes: [] }],
      bulkSalvageService,
    });

    const result = await facade.salvageComponents({
      targets: [target('a-owned'), target('a-foreign')],
    });

    assert.equal(result.cancelled, true);
    assert.deepEqual(result.items, []);
  });
});

describe('destroyComponents: the same gate, the same refusal', () => {
  /** Stand up the facade over a real `BulkDestroyService`. */
  function destroyHarness({ user, actors, documentsByActor }) {
    const bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => (systemId === SYSTEM.id ? SYSTEM : null),
      findComponentItems: (actor) => documentsByActor[actor.id] ?? [],
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    return createFabricateFacadeHarness({
      user,
      actors,
      systems: [{ system: SYSTEM, recipes: [] }],
      bulkDestroyService,
    });
  }

  it('never deletes from an actor the user does not own', async () => {
    const mineDocs = [ownedItem('i-mine', 'Iron Ore', 4)];
    const theirDocs = [ownedItem('i-theirs', 'Iron Ore', 9)];
    const mine = makeDeletableFacadeActor('a-mine', {
      ownerUserIds: ['u1'],
      documents: mineDocs,
    });
    const theirs = makeDeletableFacadeActor('a-theirs', {
      ownerUserIds: ['u2'],
      documents: theirDocs,
    });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine, theirs],
      documentsByActor: { 'a-mine': mineDocs, 'a-theirs': theirDocs },
    });

    const result = await facade.destroyComponents({
      targets: [target('a-mine'), target('a-theirs')],
    });

    assert.deepEqual(mine.deletedIds, [{ type: 'Item', itemIds: ['i-mine'] }]);
    assert.deepEqual(theirs.deletedIds, [], 'nothing was submitted against the foreign actor');
    assert.deepEqual(
      result.items.map((item) => item.outcome),
      ['succeeded', 'notPermitted']
    );
    assert.equal(result.unitsDeleted, 4, 'and the foreign stack is not counted');
    assert.equal(theirs.heldDocuments.size, 1, 'their Iron Ore is still in their pack');
  });

  it('gives a refused destroy row the zeroed destroy shape, not the salvage one', async () => {
    // The two facades report different row shapes, and the panel renders unit counts off
    // the destroy one — a refusal carrying the salvage shape would render `undefined`.
    const foreign = makeDeletableFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [foreign],
      documentsByActor: {},
    });

    const result = await facade.destroyComponents({ targets: [target('a-foreign')] });

    assert.deepEqual(result.items[0], {
      actorId: 'a-foreign',
      actorName: '',
      systemId: 'sys-a',
      componentId: 'comp-ore',
      name: 'Iron Ore',
      img: 'icons/ore.webp',
      outcome: 'notPermitted',
      skipReason: null,
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: [],
    });
  });

  it('does NOT fall back to the persisted crafting actor either', async () => {
    const ownedDocs = [ownedItem('i-owned', 'Iron Ore', 7)];
    const owned = makeDeletableFacadeActor('a-owned', {
      ownerUserIds: ['u1'],
      documents: ownedDocs,
    });
    const foreign = makeDeletableFacadeActor('a-foreign', { ownerUserIds: ['u2'] });
    const bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: () => SYSTEM,
      findComponentItems: (actor) => (actor.id === 'a-owned' ? ownedDocs : []),
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned, foreign],
      systems: [{ system: SYSTEM, recipes: [] }],
      selectedCraftingActorId: 'a-owned',
      bulkDestroyService,
    });

    const result = await facade.destroyComponents({ targets: [target('a-foreign')] });

    assert.deepEqual(owned.deletedIds, [], "the persisted selection's items are untouched");
    assert.equal(result.items[0].outcome, 'notPermitted');
    assert.equal(result.unitsDeleted, 0);
  });

  it('threads a progress listener through to the destroy service too', async () => {
    const docs = [ownedItem('i-mine', 'Iron Ore', 4)];
    const mine = makeDeletableFacadeActor('a-mine', { ownerUserIds: ['u1'], documents: docs });
    const { facade } = destroyHarness({
      user: { id: 'u1', isGM: false },
      actors: [mine],
      documentsByActor: { 'a-mine': docs },
    });
    const ticks = [];

    await facade.destroyComponents({
      targets: [target('a-mine')],
      onProgress: (completed, total) => ticks.push([completed, total]),
    });

    assert.deepEqual(ticks, [[1, 1]]);
  });

  it('refuses before ready, rather than deleting from an uninitialized module', async () => {
    const owned = makeDeletableFacadeActor('a-owned', { ownerUserIds: ['u1'] });
    const { facade } = createFabricateFacadeHarness({
      user: { id: 'u1', isGM: false },
      actors: [owned],
      systems: [{ system: SYSTEM, recipes: [] }],
      ready: false,
      bulkDestroyService: { run: async () => ({ items: [] }) },
    });

    await assert.rejects(
      () => facade.destroyComponents({ targets: [target('a-owned')] }),
      /not initialized/
    );
    assert.deepEqual(owned.deletedIds, []);
  });
});
