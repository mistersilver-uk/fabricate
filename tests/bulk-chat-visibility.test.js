/**
 * `applyBulkChatVisibility` — the ONE Foundry-version edge that decides whether a blind
 * bulk run's result table is whispered or published (issue 859).
 *
 * ## Why this suite exists at all
 *
 * `ChatMessage#_preCreate` maps the legacy `rollMode` CREATE OPTION inside
 * `if (this.isRoll)`, and `isRoll` is `rolls.length > 0`. The aggregated bulk card
 * carries no rolls, so `create(data, { rollMode: 'blindroll' })` maps nothing, never
 * reaches an applier, and posts PUBLICLY. This module is what stops that — and it is a
 * real importable module rather than a private helper in `src/main.js` (which cannot be
 * imported under `node --test`) precisely so this can be a behaviour pin rather than a
 * hand-mirrored copy of the mapping.
 *
 * ## What is asserted is the TOKEN EACH APPLIER RECEIVES
 *
 * V13 and V14 have DISJOINT vocabularies, and crossing them fails two different ways: a
 * legacy key handed to V14's `applyMode` THROWS, and a V14 key handed to V13's
 * `applyRollMode` silently posts public. Asserting only "an applier was called" would
 * pass against either failure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBulkChatVisibility,
  V14_CHAT_MODE_BY_LEGACY_ROLL_MODE,
} from '../src/systems/bulkChatVisibility.js';

/**
 * Install a `ChatMessage` global exposing EXACTLY one of the two appliers, and record
 * every `(method, token)` pair either receives.
 *
 * `applyMode` is a STATIC on V14 and absent on V13, which is what the module's capability
 * probe reads — so "which Foundry am I on" is modelled here as "which static exists",
 * the same fact the probe uses.
 *
 * @param {'v13'|'v14'} version
 * @returns {{calls: Array<[string, string]>, restore: () => void}}
 */
function stubChatMessage(version) {
  const original = globalThis.ChatMessage;
  const calls = [];
  const base = {
    applyRollMode: (chatData, rollMode) => {
      calls.push(['applyRollMode', rollMode]);
      chatData.applied = rollMode;
      return chatData;
    },
  };
  globalThis.ChatMessage =
    version === 'v14'
      ? {
          ...base,
          applyMode: (chatData, mode) => {
            calls.push(['applyMode', mode]);
            chatData.applied = mode;
            return chatData;
          },
        }
      : base;
  return {
    calls,
    restore: () => {
      if (original === undefined) delete globalThis.ChatMessage;
      else globalThis.ChatMessage = original;
    },
  };
}

/** Apply one token under one Foundry version and hand back the recorded pairs. */
function applyUnder(version, rollMode, chatData = { speaker: { actor: 'Actor.a1' }, content: '' }) {
  const stub = stubChatMessage(version);
  try {
    const returned = applyBulkChatVisibility(chatData, rollMode);
    return { calls: stub.calls, returned, chatData };
  } finally {
    stub.restore();
  }
}

describe('applyBulkChatVisibility: the token each applier branch receives', () => {
  it('reproduces the known-good probe output across both versions', () => {
    // The four-row probe recorded when this edge was built. It is asserted as ONE
    // deep-equal so a change to any of the four — the method chosen, or the vocabulary
    // handed to it — reds a single, readable assertion.
    const probe = [
      ...applyUnder('v14', 'blindroll').calls,
      ...applyUnder('v14', 'ic').calls,
      ...applyUnder('v13', 'blindroll').calls,
      ...applyUnder('v13', 'selfroll').calls,
    ];
    assert.deepEqual(probe, [
      ['applyMode', 'blind'],
      ['applyMode', 'ic'],
      ['applyRollMode', 'blindroll'],
      ['applyRollMode', 'selfroll'],
    ]);
  });

  it('V14 receives the TRANSLATED key for every legacy token', () => {
    // A legacy key handed to `applyMode` throws, so a missed translation is a hard
    // runtime failure on V14 — not a silent one — and every one of the four is asserted
    // rather than a representative sample.
    for (const [legacy, expected] of Object.entries(V14_CHAT_MODE_BY_LEGACY_ROLL_MODE)) {
      assert.deepEqual(applyUnder('v14', legacy).calls, [['applyMode', expected]], legacy);
    }
    assert.deepEqual(Object.keys(V14_CHAT_MODE_BY_LEGACY_ROLL_MODE), [
      'publicroll',
      'gmroll',
      'blindroll',
      'selfroll',
    ]);
  });

  it('V13 receives the legacy token UNCHANGED', () => {
    // The picker's vocabulary is deliberately left legacy (the V13/V14 roll-mode
    // vocabulary defect is its own change), so on V13 the card's token and the N dice
    // messages' token are literally the same string.
    for (const legacy of Object.keys(V14_CHAT_MODE_BY_LEGACY_ROLL_MODE)) {
      assert.deepEqual(applyUnder('v13', legacy).calls, [['applyRollMode', legacy]], legacy);
    }
  });

  it('never hands a V14 key to V13, which would silently post public', () => {
    const { calls } = applyUnder('v13', 'blindroll');
    assert.equal(calls[0][1], 'blindroll');
    assert.notEqual(calls[0][1], 'blind', 'a V14 key here posts public with no error anywhere');
  });

  it('never hands a legacy key to V14, which would throw', () => {
    const { calls } = applyUnder('v14', 'gmroll');
    assert.equal(calls[0][1], 'gm');
    assert.notEqual(calls[0][1], 'gmroll');
  });
});

describe('applyBulkChatVisibility: unknown tokens pass through, never default', () => {
  it('passes an unmapped token to V14 verbatim', () => {
    // Mirrors `Roll._mapLegacyRollMode`'s own `|| rollMode`. This matters on the
    // NO-PROMPT path: with nothing to prompt about there is no decision, the token falls
    // back to the client's `core.rollMode`, and V14's shim returns `'ic'` verbatim for a
    // user set to In-Character. `ic` is a real `CONFIG.ChatMessage.modes` key, so
    // pass-through is correct.
    assert.deepEqual(applyUnder('v14', 'ic').calls, [['applyMode', 'ic']]);
    assert.deepEqual(applyUnder('v14', 'roll').calls, [['applyMode', 'roll']]);
  });

  it('NEVER coerces an unknown token to public', () => {
    // `?? 'public'` here would silently downgrade a blind client default to public — the
    // exact leak class this edge exists to close — and would do it on the path with no
    // prompt, where the player never chose anything and so has no reason to suspect it.
    for (const token of ['ic', 'ooc', 'emote', 'whisper', 'blind']) {
      const { calls } = applyUnder('v14', token);
      assert.equal(calls[0][1], token, `${token} must not be rewritten`);
      assert.notEqual(calls[0][1], 'public');
    }
  });

  it('passes an unmapped token to V13 verbatim too', () => {
    assert.deepEqual(applyUnder('v13', 'ic').calls, [['applyRollMode', 'ic']]);
  });
});

describe('applyBulkChatVisibility: an absent token applies NOTHING', () => {
  for (const token of [null, undefined, '', 0, false]) {
    it(`applies no visibility for ${JSON.stringify(token)}`, () => {
      for (const version of ['v13', 'v14']) {
        const { calls, chatData } = applyUnder(version, token);
        assert.deepEqual(calls, [], `${version}: no applier is called`);
        assert.equal('applied' in chatData, false, `${version}: the data is untouched`);
      }
    });
  }

  it('still returns the same chatData object, for call-site readability', () => {
    const chatData = { speaker: { actor: 'Actor.a1' }, content: '<p>x</p>' };
    const { returned } = applyUnder('v14', null, chatData);
    assert.equal(returned, chatData, 'the same object, not a copy');
  });
});

describe('applyBulkChatVisibility: it mutates in place, as both core appliers do', () => {
  it('returns the SAME object the applier mutated', () => {
    const chatData = { speaker: { actor: 'Actor.a1' }, content: '<p>x</p>' };
    const { returned } = applyUnder('v14', 'blindroll', chatData);
    assert.equal(returned, chatData);
    assert.equal(chatData.applied, 'blind', "the applier wrote onto the caller's object");
  });

  it('tolerates a V13 build exposing neither applier without throwing', () => {
    // `applyRollMode?.()` is optional for a reason: a harness (or a very old build) that
    // exposes neither must not cost a completed run its report.
    const original = globalThis.ChatMessage;
    globalThis.ChatMessage = {};
    try {
      const chatData = { speaker: { actor: null } };
      assert.equal(applyBulkChatVisibility(chatData, 'blindroll'), chatData);
    } finally {
      if (original === undefined) delete globalThis.ChatMessage;
      else globalThis.ChatMessage = original;
    }
  });
});

describe('applyBulkChatVisibility: the probe cannot be fooled by a subclass', () => {
  it('reads `applyMode` off a subclassed document class, which INHERITS the static', () => {
    // `CONFIG.ChatMessage.documentClass` is routinely subclassed by systems and modules.
    // `applyMode` is a static, so a subclass inherits it — and the probe therefore still
    // reads V14 correctly. A probe on an instance method, or on `own` properties, would
    // read a subclassed V14 world as V13 and hand it a legacy key, which throws.
    const original = globalThis.ChatMessage;
    const calls = [];
    class CoreChatMessage {
      static applyMode(chatData, mode) {
        calls.push(mode);
        return chatData;
      }
    }
    class SystemChatMessage extends CoreChatMessage {}
    globalThis.ChatMessage = SystemChatMessage;
    try {
      applyBulkChatVisibility({ speaker: { actor: null } }, 'blindroll');
      assert.deepEqual(calls, ['blind'], 'the inherited static is found and given V14 keys');
    } finally {
      if (original === undefined) delete globalThis.ChatMessage;
      else globalThis.ChatMessage = original;
    }
  });
});
