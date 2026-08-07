/**
 * Issue 1036 — `src/utils/macroReference.js`: resolving a linked Macro for an authoring
 * surface, and deciding whether a dropped one may be linked at all.
 *
 * Criterion 7's `type !== 'script'` half is pinned HERE, at the chokepoint, rather than at
 * a control's rendered state. The check cannot live in a drop PREDICATE — a drag payload's
 * `type` is the document name (`'Macro'`), and the macro's own type needs `await fromUuid`
 * — so the predicate accepts a Macro document and this function decides whether that macro
 * is runnable. Foundry defaults a NEW Macro to `type: 'chat'`, so a GM who pastes
 * JavaScript into a fresh macro and never changes the type produces exactly the payload
 * this rejects, and `MacroExecutor.run` guards only that `command` is a string.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const {
  MACRO_DROP_REJECTED_MISSING,
  MACRO_DROP_REJECTED_NOT_SCRIPT,
  evaluateMacroDrop,
  resolveMacroName,
} = await import('../src/utils/macroReference.js');

/** Install a `fromUuid` over a plain uuid → document map, and return a restore function. */
function withDocuments(documents) {
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = async (uuid) => documents[uuid] ?? null;
  return () => {
    globalThis.fromUuid = previous;
  };
}

function withoutResolver() {
  const previous = globalThis.fromUuid;
  delete globalThis.fromUuid;
  return () => {
    globalThis.fromUuid = previous;
  };
}

// ---------------------------------------------------------------------------
// evaluateMacroDrop — criterion 7, the `type !== 'script'` half
// ---------------------------------------------------------------------------

test('1036/7: a dropped Macro whose type is not `script` is REJECTED, with a reason', async () => {
  const restore = withDocuments({
    'Macro.chat': { name: 'Shout', type: 'chat' },
    'Macro.script': { name: 'Scaling DC', type: 'script' },
  });
  try {
    const rejected = await evaluateMacroDrop('Macro.chat');
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.reason, MACRO_DROP_REJECTED_NOT_SCRIPT);
    assert.equal(rejected.name, 'Shout', 'the macro is NAMED, so the warning can say which one');

    // The negative control. Without it, "chat is rejected" would also pass on a function
    // that rejects everything — which is the failure mode that matters here, because the
    // control would then silently accept nothing at all.
    const accepted = await evaluateMacroDrop('Macro.script');
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.reason, null);
    assert.equal(accepted.uuid, 'Macro.script');
    assert.equal(accepted.name, 'Scaling DC');
  } finally {
    restore();
  }
});

test('1036/7: every non-script macro type is rejected, not just `chat`', async () => {
  const restore = withDocuments({
    'Macro.chat': { name: 'A', type: 'chat' },
    'Macro.blank': { name: 'B', type: '' },
    'Macro.absent': { name: 'C' },
  });
  try {
    for (const uuid of ['Macro.chat', 'Macro.blank', 'Macro.absent']) {
      const result = await evaluateMacroDrop(uuid);
      assert.equal(result.accepted, false, `${uuid} is refused`);
      assert.equal(result.reason, MACRO_DROP_REJECTED_NOT_SCRIPT);
    }
  } finally {
    restore();
  }
});

test('1036/7: a uuid that resolves to nothing, or throws, is rejected as MISSING', async () => {
  const restore = withDocuments({});
  try {
    const unresolved = await evaluateMacroDrop('Macro.deleted');
    assert.equal(unresolved.accepted, false);
    assert.equal(unresolved.reason, MACRO_DROP_REJECTED_MISSING);

    globalThis.fromUuid = async () => {
      throw new Error('pack offline');
    };
    const threw = await evaluateMacroDrop('Compendium.mod.macros.x');
    assert.equal(threw.accepted, false, 'a throwing resolver is a miss, not an exception');
    assert.equal(threw.reason, MACRO_DROP_REJECTED_MISSING);
  } finally {
    restore();
  }
});

test('1036/7: an empty uuid is rejected without consulting the resolver at all', async () => {
  let calls = 0;
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = async () => {
    calls += 1;
    return null;
  };
  try {
    for (const uuid of ['', '   ', null, undefined]) {
      const result = await evaluateMacroDrop(uuid);
      assert.equal(result.accepted, false);
      assert.equal(result.reason, MACRO_DROP_REJECTED_MISSING);
    }
    assert.equal(calls, 0, 'nothing to resolve means nothing is asked');
  } finally {
    globalThis.fromUuid = previous;
  }
});

test('1036/7: with NO resolver installed the check fails OPEN', async () => {
  const restore = withoutResolver();
  try {
    const result = await evaluateMacroDrop('Macro.unknowable');
    // Outside a live world nothing can be checked. Refusing every drop there would make the
    // control unusable in the View Lab and untestable in a mounted suite, while proving
    // nothing whatever about real data.
    assert.equal(result.accepted, true);
    assert.equal(result.uuid, 'Macro.unknowable');
    assert.equal(result.reason, null);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// resolveMacroName — the two behaviours lifted out of SimpleCraftingCheckEditor
// ---------------------------------------------------------------------------

test('1036: resolveMacroName reports the document NAME once it resolves', async () => {
  const restore = withDocuments({ 'Macro.dc': { name: 'Scaling DC', type: 'script' } });
  try {
    const seen = [];
    resolveMacroName('Macro.dc', (state) => seen.push(state));
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(seen, [{ name: 'Scaling DC', missing: false }]);
  } finally {
    restore();
  }
});

test('1036: resolveMacroName reports MISSING only on a proven miss', async () => {
  const restore = withDocuments({});
  try {
    const seen = [];
    resolveMacroName('Macro.deleted', (state) => seen.push(state));
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(seen, [{ name: '', missing: true }]);
  } finally {
    restore();
  }
});

test('1036: resolveMacroName falls back to the RAW uuid when no resolver exists', async () => {
  const restore = withoutResolver();
  try {
    const seen = [];
    resolveMacroName('Macro.dc', (state) => seen.push(state));
    // Synchronous, and NOT `missing`. Reporting "not found" outside a live world would paint
    // every linked macro as broken in every View Lab frame.
    assert.deepEqual(seen, [{ name: 'Macro.dc', missing: false }]);
  } finally {
    restore();
  }
});

test('1036: resolveMacroName reports an EMPTY state for no link, synchronously', async () => {
  const restore = withDocuments({ 'Macro.dc': { name: 'Scaling DC', type: 'script' } });
  try {
    const seen = [];
    resolveMacroName('', (state) => seen.push(state));
    assert.deepEqual(seen, [{ name: '', missing: false }]);
  } finally {
    restore();
  }
});

test('1036: a CANCELLED resolution never reports, so a stale lookup cannot win', async () => {
  let release = null;
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = () =>
    new Promise((resolvePromise) => {
      release = () => resolvePromise({ name: 'Stale', type: 'script' });
    });
  try {
    const seen = [];
    const cancel = resolveMacroName('Macro.old', (state) => seen.push(state));
    cancel();
    release();
    await new Promise((done) => setTimeout(done, 0));

    // Without the latch, a slow lookup of the OLD uuid lands after a fast lookup of the new
    // one and the card ends up naming a macro that is no longer linked.
    assert.deepEqual(seen, [], 'the cancelled lookup reported nothing at all');
  } finally {
    globalThis.fromUuid = previous;
  }
});

test('1036: a cancelled resolution stays silent even when the lookup REJECTS', async () => {
  let fail = null;
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = () =>
    new Promise((_resolvePromise, rejectPromise) => {
      fail = () => rejectPromise(new Error('gone'));
    });
  try {
    const seen = [];
    const cancel = resolveMacroName('Macro.old', (state) => seen.push(state));
    cancel();
    fail();
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(seen, [], 'the catch arm honours the latch too');
  } finally {
    globalThis.fromUuid = previous;
  }
});
