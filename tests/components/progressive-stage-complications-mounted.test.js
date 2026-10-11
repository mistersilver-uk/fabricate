/** The per-stage complication band on the shared progressive stage list (issue 1286, PR 2). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Mounted through the salvage body, the one caller that draws both tenses (issue 2381).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-stage-complications-',
  // The SHARED crafting lists, not a hand-rolled minimum. A bespoke list omits the component
  // under test's own compiled artefact and every leaf it reaches, and the omission HANGS the
  // suite (# cancelled) rather than failing it — which is how it reached the driver green.
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: [
    ...CRAFTING_APP_COMPILED_MODULES,
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
  rootClass: 'fabricate-app',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** One player-visible complication, exactly as the two builders publish it. */
const complication = (overrides = {}) => ({
  id: 'x-dust',
  name: 'Choking dust',
  description: 'A cloud of caustic dust bursts out of the vessel as it cracks open.',
  severity: 'severe',
  visibility: 'visible',
  fired: false,
  ...overrides,
});

/** A bare stage above an annotated one — the placement fact one annotated row cannot show. */
const stages = (complications) => [
  { id: 's1', componentId: 'c1', name: 'Empty Vial', img: null, difficulty: 2, threshold: 2 },
  {
    id: 's2',
    componentId: 'c2',
    name: 'Ground Reagent',
    img: null,
    difficulty: 3,
    threshold: 5,
    ...(complications ? { complications } : {}),
  },
];

/** A resolved run record: the roll has been spent down the list. */
const SPENT = Object.freeze({ state: 'success', awardedComponentIds: ['c1'] });

const mount = ({ tense = 'forecast', ...props } = {}) =>
  harness.mount({
    stages: stages([complication()]),
    canReorder: true,
    announcement: '',
    result: tense === 'resolved' ? SPENT : null,
    ...props,
  });

const stageRow = (root, id) => root.querySelector(`[data-progressive-stage="${id}"]`);
const bandIn = (root, id) =>
  stageRow(root, id).querySelector('[data-progressive-stage-complications]');
const tenseOf = (root, id) =>
  bandIn(root, id).getAttribute('data-progressive-stage-complication-tense');
const badgeIn = (root, id) => bandIn(root, id).querySelectorAll('.manager-chip')[0];

describe('the per-stage complication band (issue 1286)', () => {
  // ── The row flip is gated on CONTENT ───────────────────────────────────────────

  it('flips ONLY the row that has content, never every row in the list', async () => {
    const root = await mount();
    assert.ok(stageRow(root, 's2').classList.contains('has-band'));
    assert.ok(
      !stageRow(root, 's1').classList.contains('has-band'),
      'a stage whose component authors nothing is the plain row'
    );
    assert.ok(!bandIn(root, 's1'), 'and it draws no band');
  });

  it('renders the band in the row’s body, the sibling of the line that carries the padding', async () => {
    const root = await mount();
    const row = stageRow(root, 's2');
    const children = [...row.children];
    // Compared as INDICES, never as nodes.
    const line = row.querySelector('.fabricate-sortable-list-line');
    const body = row.querySelector('.fabricate-sortable-list-body');
    assert.equal(children.indexOf(line), 0, 'the line is the row’s first child');
    assert.equal(children.indexOf(body), 1, 'and the body follows it as its SIBLING');
    assert.equal([...body.children].indexOf(bandIn(root, 's2')), 0, 'the band fills the body');
  });

  it('lies outside the drag source: only the grip arms a drag', async () => {
    const root = await mount();
    assert.ok(!stageRow(root, 's2').hasAttribute('draggable'), 'the row is not draggable');
    assert.equal(
      stageRow(root, 's2').querySelector('[data-sortable-grip]').getAttribute('draggable'),
      'true',
      'its grip is'
    );
  });

  // ── The two tenses ──────────────────────────────────────────────────────────────

  it('forecasts before a resolution, in the future tense', async () => {
    const root = await mount();
    assert.equal(tenseOf(root, 's2'), 'forecast');
    assert.equal(badgeIn(root, 's2').textContent.trim(), 'This can go wrong');
  });

  it('reads in the PAST tense once the roll is spent — the prototype’s own bug', async () => {
    // The prototype derives `fired` from a stage being short.
    const root = await mount({ tense: 'resolved' });
    assert.equal(tenseOf(root, 's2'), 'resolved');
    assert.equal(badgeIn(root, 's2').textContent.trim(), "This didn't happen");
  });

  it('marks the occurrence the record named, and tones the band with it', async () => {
    const root = await mount({
      tense: 'resolved',
      stages: stages([complication({ fired: true })]),
    });
    assert.equal(tenseOf(root, 's2'), 'fired');
    assert.ok(bandIn(root, 's2').classList.contains('is-fired'), 'the band’s own fill changes');
    assert.equal(badgeIn(root, 's2').textContent.trim(), 'This happened');
  });

  it('never claims fired on a forecast, whatever the row happens to carry', async () => {
    // Crafting is forecast-only: it passes `forecast` always.
    const root = await mount({ stages: stages([complication({ fired: true })]) });
    assert.equal(tenseOf(root, 's2'), 'forecast');
    assert.equal(badgeIn(root, 's2').textContent.trim(), 'This can go wrong');
  });

  // ── Severity is ONE vocabulary, and the tense never touches it ───────────────────

  it('keeps the severity tile on severity in BOTH tenses', async () => {
    const forecast = await mount();
    const forecastTile = bandIn(forecast, 's2').querySelector('.fab-complication-severity');
    assert.ok(forecastTile.classList.contains('is-danger'), 'severe is the danger family');
    harness.remount();

    const fired = await mount({
      tense: 'resolved',
      stages: stages([complication({ fired: true })]),
    });
    const firedTile = bandIn(fired, 's2').querySelector('.fab-complication-severity');
    assert.ok(
      firedTile.classList.contains('is-danger'),
      'a tile recoloured by tense would make one control say two things'
    );
  });

  it('renders the tense chip FIRST and the severity chip LAST', async () => {
    const root = await mount();
    const chips = [...bandIn(root, 's2').querySelectorAll('.manager-chip')];
    assert.equal(chips.length, 2);
    assert.equal(chips[0].textContent.trim(), 'This can go wrong');
    assert.equal(chips.at(-1).textContent.trim(), 'Severe');
  });

  // ── The disclosure the band exists to make ──────────────────────────────────────

  it('renders the authored DESCRIPTION, wrapped and clamped rather than clipped', async () => {
    const root = await mount();
    const body = bandIn(root, 's2').querySelector('.fab-complication-row-body');
    assert.equal(body.textContent.trim(), complication().description);
    assert.ok(
      body.classList.contains('is-clamped'),
      'one-line clipping would remove the disclosure at roughly sixty characters'
    );
    assert.match(body.getAttribute('style') || '', /--fab-complication-body-lines:\s*3/);
    assert.equal(body.getAttribute('title'), complication().description, 'the full string stays reachable');
  });

  it('never shows the player a trigger sentence', async () => {
    // The body slot is TYPED on the shared row.
    const root = await mount({
      stages: stages([complication({ description: 'A cloud of dust.' })]),
    });
    assert.doesNotMatch(bandIn(root, 's2').textContent, /When|1d20|rolls/);
  });

  // ── Multiplicity ────────────────────────────────────────────────────────────────

  it('renders the FIRST complication in fire order plus a "+N more" count', async () => {
    const root = await mount({
      stages: stages([
        complication(),
        complication({ id: 'x-shatter', name: 'The vessel shatters' }),
        complication({ id: 'x-scald', name: 'Scalding steam' }),
      ]),
    });
    const band = bandIn(root, 's2');
    const rows = band.querySelectorAll('[data-progressive-stage-complication]');
    assert.equal(rows.length, 1, 'an unbounded list turns one row into several paragraphs');
    assert.equal(rows[0].dataset.progressiveStageComplication, 'x-dust', 'the FIRST in fire order');

    const more = band.querySelector('[data-progressive-stage-complication-more]');
    assert.ok(more, 'the overflow is stated rather than silently dropped');
    assert.equal(more.dataset.progressiveStageComplicationMore, '2');
    assert.equal(more.textContent.trim(), '+2 more');
    assert.equal(
      more.getAttribute('title'),
      'The vessel shatters, Scalding steam',
      'the names behind the count, so it is a pointer rather than a dead end'
    );
  });

  it('renders no overflow affordance for a single complication', async () => {
    const root = await mount();
    assert.ok(!bandIn(root, 's2').querySelector('[data-progressive-stage-complication-more]'));
  });

  it('tones the band FIRED when the firing sits behind the count', async () => {
    const root = await mount({
      tense: 'resolved',
      stages: stages([
        complication(),
        complication({ id: 'x-shatter', name: 'The vessel shatters', fired: true }),
      ]),
    });
    assert.equal(
      tenseOf(root, 's2'),
      'fired',
      'the band answers "did anything happen here?"; the badge answers "did THIS one?"'
    );
    assert.equal(badgeIn(root, 's2').textContent.trim(), "This didn't happen");
  });

  // ── What the band must NOT grow ─────────────────────────────────────────────────

  it('offers no exclude toggle, no excluded-results list and no hidden-result note', async () => {
    // The prototype draws a checkbox on every ordered result and a "N more excluded from
    // your list" footer. Exclusion would contradict the reconciliation guarantee that a
    // result is never dropped, and there is nowhere to persist one, so the vocabulary is
    // not built rather than built and disabled.
    const root = await mount();
    const band = bandIn(root, 's2');
    assert.ok(!band.querySelector('input'), 'no control of any kind');
    assert.ok(!band.querySelector('button'), 'and nothing destructive or navigational');
    assert.ok(!root.querySelector('[data-progressive-stage-exclude]'));
    assert.ok(!root.querySelector('input[type="checkbox"]'));
  });

  it('draws the band on a FIXED row too — a spent order still explains itself', async () => {
    const root = await mount({ canReorder: false, tense: 'resolved' });
    assert.ok(stageRow(root, 's2').hasAttribute('data-progressive-stage-fixed'));
    assert.ok(bandIn(root, 's2'), 'the post-roll list is exactly where the fired tense is read');
  });
});
