import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_LABEL_KEYS,
  localizeBlockedReasons,
  describeBlockedReasons,
  misconfigurationDetail,
  logMisconfiguration,
  calloutFor
} from '../src/ui/svelte/apps/gathering/gatheringBlockedReasons.js';

// An echo `localize` so assertions read against the resolved keys/formatting.
const localize = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);

describe('gatheringBlockedReasons', () => {
  it('maps known codes to their player-facing label keys, deduplicated', () => {
    const labels = localizeBlockedReasons(
      [
        { code: 'STAMINA_BLOCKED' },
        { code: 'NO_CURRENT_REALM' },
        { code: 'STAMINA_BLOCKED' } // duplicate code collapses
      ],
      localize
    );
    assert.deepEqual(labels, [
      BLOCK_LABEL_KEYS.STAMINA_BLOCKED,
      BLOCK_LABEL_KEYS.NO_CURRENT_REALM
    ]);
  });

  it('covers the location codes that caused the silent no-op', () => {
    assert.equal(BLOCK_LABEL_KEYS.LOCATION_BLOCKED, 'FABRICATE.App.Gathering.Detail.Callout.Location');
    assert.equal(BLOCK_LABEL_KEYS.NO_CURRENT_REALM, 'FABRICATE.App.Gathering.Detail.Callout.NoRealm');
  });

  it('maps the permanently-exhausted (nonRegenerating) node code to its own label (issue 301)', () => {
    assert.equal(BLOCK_LABEL_KEYS.NODE_EXHAUSTED, 'FABRICATE.App.Gathering.Detail.Callout.NodeExhausted');
    // It is distinct from the regenerating "depleted" code.
    assert.notEqual(BLOCK_LABEL_KEYS.NODE_EXHAUSTED, BLOCK_LABEL_KEYS.NODE_DEPLETED);
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'NODE_EXHAUSTED' }], localize),
      ['FABRICATE.App.Gathering.Detail.Callout.NodeExhausted']
    );
  });

  it('falls back to the reason message, then a generic label, for unknown codes', () => {
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'WEIRD_CODE', message: 'Custom reason' }], localize),
      ['Custom reason']
    );
    assert.deepEqual(
      localizeBlockedReasons([{ code: 'WEIRD_CODE' }], localize),
      ['FABRICATE.App.Gathering.Detail.Blocked']
    );
  });

  it('describeBlockedReasons builds a "Can\'t attempt — …" sentence', () => {
    const sentence = describeBlockedReasons([{ code: 'NO_CURRENT_REALM' }], localize);
    assert.match(sentence, /^FABRICATE\.App\.Gathering\.Detail\.CannotAttempt:/);
    assert.match(sentence, /Callout\.NoRealm/);
  });

  it('describeBlockedReasons returns the generic label for an empty/garbage list', () => {
    assert.equal(describeBlockedReasons([], localize), 'FABRICATE.App.Gathering.Detail.Blocked');
    assert.equal(describeBlockedReasons(null, localize), 'FABRICATE.App.Gathering.Detail.Blocked');
  });

  it('calloutFor pairs a known warning code with its icon, tone and label', () => {
    assert.deepEqual(calloutFor('STAMINA_BLOCKED', {}, localize), {
      code: 'STAMINA_BLOCKED',
      icon: 'fa-bolt',
      tone: 'warning',
      label: BLOCK_LABEL_KEYS.STAMINA_BLOCKED
    });
  });

  it('calloutFor preserves the neutral tone for paused / duplicate-run chips', () => {
    assert.equal(calloutFor('GAME_PAUSED', {}, localize).tone, 'neutral');
    assert.equal(calloutFor('DUPLICATE_ACTIVE_RUN', {}, localize).tone, 'neutral');
  });

  it('calloutFor falls back to a generic warning chip for unknown codes', () => {
    assert.deepEqual(calloutFor('WEIRD_CODE', { message: 'Custom reason' }, localize), {
      code: 'WEIRD_CODE',
      icon: 'fa-triangle-exclamation',
      tone: 'warning',
      label: 'Custom reason'
    });
    assert.deepEqual(calloutFor('WEIRD_CODE', {}, localize), {
      code: 'WEIRD_CODE',
      icon: 'fa-triangle-exclamation',
      tone: 'warning',
      label: 'FABRICATE.App.Gathering.Detail.Blocked'
    });
  });

  describe('misconfiguration details', () => {
    const MESSAGE = 'The task needs GM configuration.';
    const misconfigured = (data) => ({ code: 'TASK_MISCONFIGURED', message: MESSAGE, data });
    const DETAIL = 'FABRICATE.App.Gathering.Detail.CannotAttemptDetail';
    const MORE = 'FABRICATE.App.Gathering.Detail.CannotAttemptMore';
    const CANNOT = 'FABRICATE.App.Gathering.Detail.CannotAttempt';
    const detailed = (reasons) => describeBlockedReasons(reasons, localize, { includeDetail: true });
    const sentence = (details) => `${DETAIL}:${JSON.stringify({ reason: MESSAGE, details })}`;

    it('lists the start-path errors', () => {
      const reasons = [misconfigured({ taskId: 't1', errors: ['No roll formula.', 'Duplicate group.'] })];
      assert.deepEqual(misconfigurationDetail(reasons, localize), ['No roll formula.', 'Duplicate group.']);
      assert.equal(detailed(reasons), sentence('No roll formula.; Duplicate group.'));
    });

    it('localizes a diagnostic message key and falls back to its code', () => {
      const reasons = [
        misconfigured({
          code: 'RESULT_PLAN_DIAGNOSTIC',
          diagnostics: [
            { code: 'RESULT_SOURCE_UNRESOLVED', messageKey: 'FABRICATE.Gathering.Diagnostics.ResultSourceUnresolved' },
            { code: 'ROUTED_TIER_UNROUTED' }
          ]
        })
      ];
      assert.deepEqual(misconfigurationDetail(reasons, localize), [
        'FABRICATE.Gathering.Diagnostics.ResultSourceUnresolved',
        'ROUTED_TIER_UNROUTED'
      ]);
    });

    it('prefers the errors over the diagnostics when both are present', () => {
      const reasons = [misconfigured({ errors: ['Real rule.'], diagnostics: [{ code: 'OTHER' }] })];
      assert.deepEqual(misconfigurationDetail(reasons, localize), ['Real rule.']);
    });

    it('names nothing for diagnostics that carry only the generic code', () => {
      const reasons = [
        misconfigured({ code: 'TASK_MISCONFIGURED', diagnostics: [{ code: 'TASK_MISCONFIGURED' }] })
      ];
      assert.deepEqual(misconfigurationDetail(reasons, localize), []);
      assert.equal(detailed(reasons), `${CANNOT}:${JSON.stringify({ reason: MESSAGE })}`);
    });

    it('uses data.code only when no entry yielded and it is not the generic code', () => {
      assert.deepEqual(
        misconfigurationDetail([misconfigured({ code: 'RESULT_PLAN_DIAGNOSTIC' })], localize),
        ['RESULT_PLAN_DIAGNOSTIC']
      );
      assert.deepEqual(
        misconfigurationDetail(
          [misconfigured({ code: 'RESULT_PLAN_DIAGNOSTIC', diagnostics: [{ code: 'ROUTED_TIER_UNROUTED' }] })],
          localize
        ),
        ['ROUTED_TIER_UNROUTED']
      );
      assert.deepEqual(misconfigurationDetail([misconfigured({ code: 'TASK_MISCONFIGURED' })], localize), []);
    });

    it('dedupes a repeated string and a code shared across reasons', () => {
      assert.deepEqual(
        misconfigurationDetail([misconfigured({ errors: ['Same.', 'Same.', 'Other.'] })], localize),
        ['Same.', 'Other.']
      );
      assert.deepEqual(
        misconfigurationDetail(
          [
            misconfigured({ diagnostics: [{ code: 'SHARED' }] }),
            misconfigured({ code: 'SHARED' }),
            misconfigured({ errors: ['SHARED'] })
          ],
          localize
        ),
        ['SHARED']
      );
    });

    it('shows two entries without a remainder, then counts the rest', () => {
      const names = (n) => Array.from({ length: n }, (_, i) => `Rule ${i + 1}.`);
      assert.equal(detailed([misconfigured({ errors: names(2) })]), sentence('Rule 1.; Rule 2.'));
      for (const [total, more] of [[3, 1], [5, 3]]) {
        const details = `${MORE}:${JSON.stringify({ details: 'Rule 1.; Rule 2.', count: more })}`;
        assert.equal(detailed([misconfigured({ errors: names(total) })]), sentence(details));
      }
    });

    it('truncates each entry at 90 characters with an ellipsis', () => {
      const exact = 'x'.repeat(90);
      const long = 'y'.repeat(91);
      assert.deepEqual(misconfigurationDetail([misconfigured({ errors: [exact, long] })], localize), [
        exact,
        `${'y'.repeat(89)}…`
      ]);
    });

    it('strips angle brackets from a GM-authored name', () => {
      assert.deepEqual(
        misconfigurationDetail([misconfigured({ errors: ['Group "<img src=x>" repeats.', '<>'] })], localize),
        ['Group "img src=x" repeats.']
      );
    });

    it('ignores non-array, non-object and empty entries', () => {
      const reasons = [
        misconfigured({ errors: 'nope', diagnostics: 'nope' }),
        misconfigured({ errors: ['', 7, null, 'Kept.'] }),
        misconfigured({ diagnostics: [null, 'text', 4, { code: '' }, { messageKey: '' }] }),
        misconfigured('text'),
        misconfigured(null),
        { code: 'TASK_MISCONFIGURED' },
        null
      ];
      assert.deepEqual(misconfigurationDetail(reasons, localize), ['Kept.']);
      assert.deepEqual(misconfigurationDetail(null, localize), []);
    });

    it('never shows the detail of a reason whose code is not TASK_MISCONFIGURED', () => {
      const reasons = [{ code: 'TOOL_BLOCKED', data: { errors: ['Hidden.'], diagnostics: [{ code: 'X' }] } }];
      assert.deepEqual(misconfigurationDetail(reasons, localize), []);
      assert.equal(
        detailed(reasons),
        `${CANNOT}:${JSON.stringify({ reason: 'FABRICATE.App.Gathering.Detail.Callout.MissingTools' })}`
      );
    });

    it('leaves a TASK_MISCONFIGURED reason on the generic sentence by default', () => {
      const reasons = [misconfigured({ errors: ['Rule.'] })];
      assert.equal(
        describeBlockedReasons(reasons, localize),
        `${CANNOT}:${JSON.stringify({ reason: MESSAGE })}`
      );
    });

    it('states only the generic sentence when data is null or absent', () => {
      const generic = `${CANNOT}:${JSON.stringify({ reason: MESSAGE })}`;
      assert.equal(detailed([misconfigured(null)]), generic);
      assert.equal(detailed([{ code: 'TASK_MISCONFIGURED', message: MESSAGE }]), generic);
    });
  });

  describe('logMisconfiguration', () => {
    it('writes the full uncapped, unlocalized list with the task id', () => {
      const calls = [];
      const original = console.warn;
      console.warn = (...args) => {
        calls.push(args);
      };
      try {
        const errors = ['A <b>.', 'B.', 'C.', 'C.', 'D.'];
        logMisconfiguration([
          { code: 'TASK_MISCONFIGURED', data: { taskId: 't1', errors } },
          { code: 'TOOL_BLOCKED', data: { errors: ['skipped'] } }
        ]);
        assert.deepEqual(calls, [
          ['Fabricate | Gathering task needs configuration:', { taskId: 't1', errors: ['A <b>.', 'B.', 'C.', 'D.'] }]
        ]);
      } finally {
        console.warn = original;
      }
    });
  });
});
