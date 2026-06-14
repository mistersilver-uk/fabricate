import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
  buildUnconfiguredSentinelPatch,
} from '../../../src/canvas/regions/interactableCreationGuard.js';
import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  UNCONFIGURED_SOURCE_UUID,
  UNCONFIGURED_SYSTEM_ID,
} from '../../../src/canvas/regions/interactableRegionFlags.js';

// Use the canonical subtype constant rather than a locally-redefined literal so
// this test cannot silently mirror a stale subtype string.
const INTERACTABLE = INTERACTABLE_BEHAVIOR_SUBTYPE;

test('evaluateInteractableCreate ALLOWS a sourceless fabricate.interactable (issue 342)', () => {
  // The native "+ Add Behavior" path instantiates with empty system data. Since
  // issue 342 this is allowed through (born unconfigured + inert), not cancelled.
  const emptySystem = { type: INTERACTABLE, system: {} };
  assert.deepEqual(evaluateInteractableCreate(emptySystem), { allow: true });

  // A blank/whitespace-only sourceUuid is likewise allowed.
  const blankSource = { type: INTERACTABLE, system: { sourceUuid: '   ' } };
  assert.deepEqual(evaluateInteractableCreate(blankSource), { allow: true });

  // A missing system object entirely.
  assert.deepEqual(evaluateInteractableCreate({ type: INTERACTABLE }), { allow: true });
});

test('evaluateInteractableCreate allows a fully-formed interactable (real placement)', () => {
  const complete = {
    type: INTERACTABLE,
    system: {
      interactableType: 'tool',
      sourceUuid: 'Item.abc123',
      systemId: 'system-1',
    },
  };
  assert.deepEqual(evaluateInteractableCreate(complete), { allow: true });
});

test('evaluateInteractableCreate ignores non-interactable behaviours', () => {
  // Other behaviour subtypes must never be interfered with, even with no system.
  assert.deepEqual(evaluateInteractableCreate({ type: 'executeMacro', system: {} }), {
    allow: true,
  });
  assert.deepEqual(evaluateInteractableCreate({ type: 'pauseGame' }), { allow: true });
  assert.deepEqual(evaluateInteractableCreate(null), { allow: true });
  assert.deepEqual(evaluateInteractableCreate(undefined), { allow: true });
});

test('evaluateInteractableCreate never cancels a non-interactable carrying a linkedVisual', () => {
  // A non-interactable behaviour that happens to carry a linkedVisual.uuid must
  // be allowed unchanged — the guard's type discrimination keeps it hands-off.
  assert.deepEqual(
    evaluateInteractableCreate({
      type: 'executeMacro',
      system: { linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' } },
    }),
    { allow: true },
  );
});

test('evaluateInteractableCreate allows any interactable shape (issue 342 allow-through)', () => {
  // Since issue 342 the guard always allows an interactable create — sourceless or
  // not — because a sourceless one is born unconfigured + inert and configured
  // later. The only creation-time mutation is the linked-visual neutralisation.
  assert.deepEqual(
    evaluateInteractableCreate({
      type: INTERACTABLE,
      system: { sourceUuid: 'Item.abc123' },
    }),
    { allow: true },
  );
});

test('neutralizeInheritedLinkedVisual clears an inherited linkedVisual.uuid', () => {
  // The region-duplication case: the copy carries the original's marker link.
  const system = {
    sourceUuid: 'Item.abc123',
    linkedVisual: {
      uuid: 'Scene.s1.Tile.t1',
      documentName: 'Tile',
      mode: 'marker',
      missingPolicy: 'warn',
    },
  };
  const result = neutralizeInheritedLinkedVisual(system);
  assert.equal(result.changed, true);
  // Only uuid/documentName are cleared; mode/missingPolicy are NOT in the patch.
  assert.deepEqual(result.patch, {
    linkedVisual: {
      uuid: null,
      documentName: null,
    },
  });
});

test('neutralizeInheritedLinkedVisual is a no-op when there is nothing to neutralise', () => {
  // Already region-only (no uuid).
  assert.deepEqual(
    neutralizeInheritedLinkedVisual({
      linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
    }),
    { changed: false },
  );

  // Whitespace-only uuid counts as empty.
  assert.deepEqual(
    neutralizeInheritedLinkedVisual({ linkedVisual: { uuid: '   ' } }),
    { changed: false },
  );

  // No linkedVisual at all.
  assert.deepEqual(neutralizeInheritedLinkedVisual({}), { changed: false });
  assert.deepEqual(neutralizeInheritedLinkedVisual(undefined), { changed: false });

  // A null or non-object linkedVisual is tolerated as nothing to neutralise.
  assert.deepEqual(neutralizeInheritedLinkedVisual({ linkedVisual: null }), { changed: false });
  assert.deepEqual(neutralizeInheritedLinkedVisual({ linkedVisual: 42 }), { changed: false });
});

test('buildUnconfiguredSentinelPatch stamps every empty identity field (native empty-system path)', () => {
  // The native "+ Add Behavior" path where the empty-system instantiation left the
  // identity fields blank: all three sentinels are stamped.
  const result = buildUnconfiguredSentinelPatch({});
  assert.equal(result.changed, true);
  assert.deepEqual(result.patch, {
    'system.sourceUuid': UNCONFIGURED_SOURCE_UUID,
    'system.systemId': UNCONFIGURED_SYSTEM_ID,
    'system.interactableType': 'tool',
  });

  // Whitespace-only values count as empty and are stamped too.
  const blank = buildUnconfiguredSentinelPatch({
    sourceUuid: '   ',
    systemId: '',
    interactableType: '  ',
  });
  assert.deepEqual(blank.patch, {
    'system.sourceUuid': UNCONFIGURED_SOURCE_UUID,
    'system.systemId': UNCONFIGURED_SYSTEM_ID,
    'system.interactableType': 'tool',
  });
});

test('buildUnconfiguredSentinelPatch only stamps the fields that are empty', () => {
  // A partially-configured interactable (still unconfigured overall) keeps the
  // populated fields untouched and only fills the empty ones.
  const result = buildUnconfiguredSentinelPatch({
    sourceUuid: 'Item.abc123',
    systemId: '',
    interactableType: 'tool',
  });
  assert.equal(result.changed, true);
  // sourceUuid + interactableType are present, so only systemId is stamped.
  assert.deepEqual(result.patch, {
    'system.systemId': UNCONFIGURED_SYSTEM_ID,
  });
});

test('buildUnconfiguredSentinelPatch is a no-op for a fully-configured interactable', () => {
  // A real placement carries a complete identity; nothing to stamp.
  assert.deepEqual(
    buildUnconfiguredSentinelPatch({
      interactableType: 'tool',
      sourceUuid: 'Item.abc123',
      systemId: 'system-1',
      toolId: 'tool-1',
    }),
    { changed: false },
  );

  // A complete gatheringTask is likewise left alone.
  assert.deepEqual(
    buildUnconfiguredSentinelPatch({
      interactableType: 'gatheringTask',
      sourceUuid: 'Item.def456',
      systemId: 'system-1',
      taskId: 'task-1',
    }),
    { changed: false },
  );
});

test('buildUnconfiguredSentinelPatch tolerates a missing/non-object system', () => {
  // The pure helper never throws on a malformed shape; an unconfigured interactable
  // with no usable system stamps the sentinels.
  assert.equal(buildUnconfiguredSentinelPatch(undefined).changed, true);
  assert.equal(buildUnconfiguredSentinelPatch(null).changed, true);
});
