/**
 * The run detail's one state notice (issue 3011, D-4): five ranked tiers, the iterative notice
 * fourth, and every pair of tiers decided by `NOTICE_RANK`, so a re-ranking cannot pass unseen.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ITERATIVE_NOTICE_ORDER,
  leadingNotice,
} from '../../src/ui/presenters/iterative/iterativeNotice.js';
import { NOTICE_RANK, runStateNotice } from '../../src/ui/svelte/apps/journal/runStateNotice.js';

const localize = (key) => key;

const DESCRIPTOR = {
  kind: 'result',
  reason: 'check-passed',
  tone: 'info',
  icon: 'fas fa-dice-d20',
  title: 'Session 1 · Hammer',
  detail: 'Saved.',
  ledger: { actionId: 'hammer' },
};

/** The run fields that raise each tier, and the hook that names the tier that was shown. */
const TIERS = {
  recovery: {
    run: { recoveryEvidence: { required: true, appliedEffectCount: 1 } },
    hook: 'data-journal-recovery',
  },
  unsupported: {
    run: { actions: { disabledReason: 'unsupportedLifecycle' } },
    hook: 'data-journal-unsupported',
  },
  blocker: {
    run: { actions: { disabledReason: 'notOwner' } },
    hook: 'data-journal-action-blocker',
  },
  iterative: { run: {}, hook: 'data-iterative-notice', iterative: DESCRIPTOR },
  award: { run: { awardChoicePending: true }, hook: 'data-journal-award-pending' },
  choice: { run: { awaitingChoice: true }, hook: 'data-journal-awaiting-choice' },
  paused: { run: { pauseState: { since: 1 } }, hook: null },
};

function pair(higher, lower) {
  const run = {
    ...TIERS[lower].run,
    ...TIERS[higher].run,
    actions: { ...TIERS[lower].run.actions, ...TIERS[higher].run.actions },
  };
  const iterative = TIERS[higher].iterative ?? TIERS[lower].iterative ?? null;
  return { run, iterative };
}

/** The tier a notice came from: the one whose own hook it carries, else the paused notice. */
const shownTier = (notice) =>
  NOTICE_RANK.find((tier) => TIERS[tier].hook && TIERS[tier].hook in notice.hooks) ?? 'paused';

describe('the five ranked tiers', () => {
  test('the rank names exactly the tiers this suite fixtures', () => {
    assert.deepEqual([...NOTICE_RANK], Object.keys(TIERS));
  });

  for (const [high, higher] of NOTICE_RANK.entries()) {
    for (const lower of NOTICE_RANK.slice(high + 1)) {
      if (['unsupported', 'blocker'].includes(higher) && ['unsupported', 'blocker'].includes(lower))
        continue;
      test(`${higher} outranks ${lower}`, () => {
        const { run, iterative } = pair(higher, lower);
        const notice = runStateNotice(run, localize, iterative);
        assert.equal(shownTier(notice), higher);
      });
    }
  }

  for (const tier of NOTICE_RANK) {
    test(`${tier} shows alone`, () => {
      const { run, iterative = null } = TIERS[tier];
      assert.equal(shownTier(runStateNotice(run, localize, iterative)), tier);
    });
  }

  test('unsupported outranks any other blocker, and version-unsupported is unsupported too', () => {
    for (const code of ['unsupportedLifecycle', 'version-unsupported']) {
      const notice = runStateNotice({ actions: { disabledReason: code } }, localize);
      assert.ok('data-journal-unsupported' in notice.hooks, code);
      assert.equal(notice.blocking, false, code);
    }
  });
});

describe('the iterative notice', () => {
  test('it adds its glyph and ledger, polite, with its own two hooks', () => {
    const notice = runStateNotice({}, localize, DESCRIPTOR);
    assert.equal(notice.icon, 'fas fa-dice-d20');
    assert.deepEqual(notice.ledger, DESCRIPTOR.ledger);
    assert.equal(notice.blocking, false);
    assert.deepEqual(notice.hooks, {
      'data-iterative-notice': 'result',
      'data-iterative-reason': 'check-passed',
    });
    assert.equal(notice.evidence, false);
    assert.equal(notice.claim, null);
  });

  test('a paused run keeps its paused hook beside the notice’s own', () => {
    const notice = runStateNotice({ pauseState: { since: 1 } }, localize, DESCRIPTOR);
    assert.equal(notice.hooks['data-journal-paused'], 'true');
    assert.equal(notice.hooks['data-iterative-notice'], 'result');
  });

  test('the two-argument call equals the call with null', () => {
    for (const { run } of Object.values(TIERS)) {
      assert.deepEqual(runStateNotice(run, localize), runStateNotice(run, localize, null));
    }
  });

  test('a shipped notice never gains the iterative keys', () => {
    for (const tier of ['recovery', 'unsupported', 'blocker', 'award', 'choice', 'paused']) {
      const notice = runStateNotice(TIERS[tier].run, localize, null);
      assert.ok(!('icon' in notice) && !('ledger' in notice), tier);
    }
  });

  test('evidence stays the recovery boolean for every tier', () => {
    for (const tier of NOTICE_RANK) {
      const { run, iterative = null } = TIERS[tier];
      const notice = runStateNotice(run, localize, iterative);
      assert.equal(typeof notice.evidence, 'boolean', tier);
      assert.equal(notice.evidence, tier === 'recovery', tier);
    }
  });

  test('a refused begin never makes two blocking notices: a blocker wins and is one object', () => {
    const refusal = { ...DESCRIPTOR, kind: 'refusal', reason: 'stale-run', tone: 'danger' };
    const notice = runStateNotice({ actions: { disabledReason: 'notOwner' } }, localize, refusal);
    assert.ok('data-journal-action-blocker' in notice.hooks);
    assert.ok(!('data-iterative-notice' in notice.hooks));
    assert.equal(runStateNotice({}, localize, refusal).blocking, false);
  });
});

describe('the iterative notice order', () => {
  const kinds = ITERATIVE_NOTICE_ORDER;

  test('names every state the pane can show, busy first and resume last', () => {
    assert.equal(kinds[0], 'busy');
    assert.equal(kinds.at(-1), 'resume');
    assert.equal(new Set(kinds).size, kinds.length);
  });

  for (const [high, higher] of kinds.entries()) {
    for (const lower of kinds.slice(high + 1)) {
      test(`${higher} outranks ${lower}`, () => {
        assert.equal(leadingNotice([{ kind: lower }, { kind: higher }])?.kind, higher);
        assert.equal(leadingNotice([{ kind: higher }, null, { kind: lower }])?.kind, higher);
      });
    }
  }

  test('nothing to show answers null', () => {
    assert.equal(leadingNotice([null, null]), null);
    assert.equal(leadingNotice([]), null);
  });
});
