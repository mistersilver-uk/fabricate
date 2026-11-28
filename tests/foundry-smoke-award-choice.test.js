/**
 * The award-choice smoke's settled reads (issue 3025): a poll returns only once every condition
 * its step asserts holds, a negative check holds across its dwell, and the charm ledger fails a
 * stack stored at 0 or less and a pre-step stack that is gone or fell.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ledgerFault,
  observerFault,
  pickFault,
  readSettled,
  replayFault,
  stageFault,
} from '../scripts/foundry-smoke/scenarios/phase-e-award-choice.mjs';

const ARGS = Object.freeze({ crafterId: 'a1', recipeId: 'r', loreId: 'l', charmName: 'Charm' });
const DRAW = { alternativeId: 'high', roll: { formula: '1d1+9', total: 10 } };
const PICKS = ['charm', 'coin', 'lore'];
// A poll that never returns fails its test, and the read cap ends its loop so the run exits.
const BOUNDED = Object.freeze({ timeout: 5000 });
const READ_CAP = 1000;

/** A GM page whose `readWorld` answers `reads` in turn, then the last one up to `READ_CAP`. */
function fakePage(reads) {
  const waits = [];
  let served = 0;
  const page = {
    evaluate: async () => {
      if (served >= READ_CAP) throw new Error(`the poll read past ${READ_CAP} reads`);
      return structuredClone(reads[Math.min(served++, reads.length - 1)]);
    },
    waitForTimeout: (ms) => {
      waits.push(ms);
      return new Promise((resolve) => setTimeout(resolve, 1));
    },
  };
  return { page, waits, served: () => served };
}

const stack = (id, quantity) => ({
  id,
  quantity,
  compendiumSource: null,
  duplicateSource: null,
  sourceId: null,
});

const STAGE_BEFORE = Object.freeze({
  charms: 0,
  charmStacks: [],
  gp: 10,
  learned: null,
  cards: 3,
  awardRows: 1,
  run: null,
});

const STAGED_READ = Object.freeze({
  charms: 4,
  charmStacks: [stack('c1', 1), stack('c2', 3)],
  gp: 10,
  learned: null,
  cards: 4,
  awardRows: 2,
  run: {
    id: 'run-1',
    status: 'succeeded',
    runRevision: 2,
    awardChoiceJournal: null,
    choice: { choiceId: 'smoke-award-pick', settledAt: null },
    groupAwards: [{ choiceId: 'smoke-award-draw', selections: [DRAW] }],
    consumedSummary: null,
  },
});

const PICKED_READ = Object.freeze({
  ...STAGED_READ,
  charms: 5,
  charmStacks: [stack('c1', 1), stack('c2', 3), stack('c3', 1)],
  gp: 15,
  learned: { granted: true },
  cards: 5,
  run: {
    ...STAGED_READ.run,
    runRevision: 3,
    awardChoiceJournal: 'committed',
    choice: { choiceId: 'smoke-award-pick', settledAt: 7, outcome: 'awarded', picks: PICKS },
    groupAwards: [
      ...STAGED_READ.run.groupAwards,
      {
        choiceId: 'smoke-award-pick',
        selections: PICKS.map((alternativeId) => ({ alternativeId })),
      },
    ],
  },
});

/** `read` with one field broken by `breakIt`. */
function broken(read, breakIt) {
  const copy = structuredClone(read);
  breakIt(copy);
  return copy;
}

const STAGE_CASES = [
  ['no run', (read) => (read.run = null), 'no run of the recipe is recorded'],
  ['run status', (read) => (read.run.status = 'failed'), 'the run is failed'],
  ['pick already settled', (read) => (read.run.choice.settledAt = 9), 'the pick is'],
  ['pick missing', (read) => delete read.run.choice, 'the pick is undefined'],
  ['award row', (read) => (read.awardRows = 1), 'carries 0 award rows'],
  ['charm count', (read) => (read.charms = 3), 'the stage awarded 3 charms, not 4'],
  ['draw', (read) => (read.run.groupAwards = []), 'the draw recorded undefined'],
  ['gp before the pick', (read) => (read.gp = 15), 'the pick awarded before it was made'],
  ['lore before the pick', (read) => (read.learned = {}), 'the pick awarded before it was made'],
  ['zero stack', (read) => (read.charmStacks[0].quantity = 0), 'charm stack c1 stores quantity 0'],
  [
    'negative stack',
    (read) => (read.charmStacks[1].quantity = -1),
    'charm stack c2 stores quantity -1',
  ],
];

const PICK_CASES = [
  ['gp', (read) => (read.gp = 14), 'gp rose by 4'],
  ['lore', (read) => (read.learned = null), 'learned: null'],
  ['charm count', (read) => (read.charms = 6), 'the picked charm awarded 2'],
  ['outcome', (read) => (read.run.choice.outcome = 'declined'), 'the choice settled'],
  [
    'pick order',
    (read) => (read.run.choice.picks = read.run.choice.picks.toReversed()),
    'the choice settled',
  ],
  ['group award', (read) => read.run.groupAwards.pop(), 'the group award is undefined'],
  ['journal', (read) => (read.run.awardChoiceJournal = 'pending'), 'the award journal is pending'],
  ['revision', (read) => (read.run.runRevision = 2), 'the run revision did not advance'],
  ['card', (read) => (read.cards = 4), '0 cards posted'],
  // The count reads a stored 0 as 1, so only the ledger sees it.
  ['zero stack', (read) => (read.charmStacks[2].quantity = 0), 'charm stack c3 stores quantity 0'],
  [
    'pre-pick stack gone',
    (read) => (read.charmStacks = [stack('c2', 3), stack('c3', 1), stack('c4', 1)]),
    'charm stack c1 vanished',
  ],
  ['pre-pick stack fell', (read) => (read.charmStacks[1].quantity = 2), 'c2 fell from 3 to 2'],
];

const stageHolds = (read) => stageFault(STAGE_BEFORE, read) === null;
const pickHolds = (read) => pickFault(STAGED_READ, { revision: 2 }, read) === null;

describe('readSettled, positive', () => {
  it('returns the first read every condition holds on, polling every 250 ms', async () => {
    const { page, waits } = fakePage([
      { ...STAGE_BEFORE },
      broken(STAGED_READ, (r) => (r.charms = 1)),
      STAGED_READ,
    ]);
    const read = await readSettled(page, ARGS, stageHolds);
    assert.deepStrictEqual(read, structuredClone(STAGED_READ));
    assert.deepStrictEqual(waits, [250, 250]);
  });

  it('answers the last read at the timeout, for the step to report on', BOUNDED, async () => {
    const short = broken(STAGED_READ, (r) => (r.awardRows = 1));
    // The stage predicate ignores `cards`, so it marks the last read.
    const last = broken(short, (r) => (r.cards = 99));
    const { page, served } = fakePage([short, last]);
    const read = await readSettled(page, ARGS, stageHolds, { timeout: 30 });
    assert.ok(served() > 2, 'it polled before giving up');
    assert.equal(read.cards, 99);
    assert.match(stageFault(STAGE_BEFORE, read), /carries 0 award rows/);
  });

  for (const [label, breakIt, message] of STAGE_CASES) {
    it(`the stage poll waits out a read short of its ${label}, which its assertion names`, async () => {
      const short = broken(STAGED_READ, breakIt);
      assert.ok(stageFault(STAGE_BEFORE, short).includes(message), stageFault(STAGE_BEFORE, short));
      const { page } = fakePage([short, STAGED_READ]);
      assert.deepStrictEqual(
        await readSettled(page, ARGS, stageHolds),
        structuredClone(STAGED_READ)
      );
    });
  }

  for (const [label, breakIt, message] of PICK_CASES) {
    it(`the pick poll waits out a read short of its ${label}, which its assertion names`, async () => {
      const short = broken(PICKED_READ, breakIt);
      const fault = pickFault(STAGED_READ, { revision: 2 }, short);
      assert.ok(fault?.includes(message), fault);
      const { page } = fakePage([short, PICKED_READ]);
      assert.deepStrictEqual(
        await readSettled(page, ARGS, pickHolds),
        structuredClone(PICKED_READ)
      );
    });
  }

  it('holds on the settled reads themselves', () => {
    assert.equal(stageFault(STAGE_BEFORE, STAGED_READ), null);
    assert.equal(pickFault(STAGED_READ, { revision: 2 }, PICKED_READ), null);
  });
});

describe('readSettled, negative with a dwell', () => {
  const observerHolds = (read) => observerFault(STAGED_READ, read) === null;
  const replayHolds = (read) => replayFault(PICKED_READ, read) === null;

  it('returns the first read that breaks it, however late in the dwell', async () => {
    const late = broken(STAGED_READ, (r) => (r.run.runRevision = 3));
    const { page, served } = fakePage([STAGED_READ, STAGED_READ, STAGED_READ, late]);
    const read = await readSettled(page, ARGS, observerHolds, { minDwell: 10_000 });
    assert.equal(served(), 4);
    assert.equal(observerFault(STAGED_READ, read), 'the refused settle changed the run');
  });

  it('holds on every read across the dwell before answering the last', BOUNDED, async () => {
    // The replay predicate ignores `consumedSummary`, so it marks the last read.
    const last = broken(PICKED_READ, (r) => (r.run.consumedSummary = { last: true }));
    const { page, served } = fakePage([PICKED_READ, last]);
    const started = Date.now();
    const read = await readSettled(page, ARGS, replayHolds, { minDwell: 40 });
    assert.ok(Date.now() - started >= 40, 'it dwelt');
    assert.ok(served() > 2, 'it read more than once');
    assert.deepStrictEqual(read.run.consumedSummary, { last: true });
    assert.equal(replayFault(PICKED_READ, read), null);
  });

  for (const [label, breakIt, message] of [
    ['gp', (read) => (read.gp = 20), 'awarded again'],
    ['charms', (read) => (read.charms = 6), 'awarded again'],
    ['cards', (read) => (read.cards = 6), 'awarded again'],
    ['a stack', (read) => read.charmStacks.shift(), 'charm stack c1 vanished'],
    ['the run', (read) => (read.run = null), 'no run of the recipe is recorded'],
  ]) {
    it(`a late replay change to ${label} breaks the dwell`, async () => {
      const late = broken(PICKED_READ, breakIt);
      const { page } = fakePage([PICKED_READ, PICKED_READ, late]);
      const read = await readSettled(page, ARGS, replayHolds, { minDwell: 10_000 });
      assert.equal(replayFault(PICKED_READ, read), message);
    });
  }

  it('treats a missing run as broken', () => {
    assert.equal(
      observerFault(STAGED_READ, { ...STAGED_READ, run: null }),
      'no run of the recipe is recorded'
    );
  });
});

describe('the charm ledger', () => {
  it('leaves an unquantified stack and a positive one alone', () => {
    const read = { charmStacks: [stack('c1', null), stack('c2', 2)] };
    assert.equal(ledgerFault({ charmStacks: [stack('c1', 1)] }, read), null);
  });

  it('names a surviving stack whose stored quantity fell', () => {
    const before = { charmStacks: [stack('c1', 1), stack('c2', 2)] };
    const read = { charmStacks: [stack('c1', 1), stack('c2', 1)] };
    assert.equal(ledgerFault(before, read), 'charm stack c2 fell from 2 to 1');
  });

  it('passes an unchanged stack and a rising one', () => {
    const before = { charmStacks: [stack('c1', 1), stack('c2', 2)] };
    const read = { charmStacks: [stack('c1', 1), stack('c2', 3)] };
    assert.equal(ledgerFault(before, read), null);
  });
});
