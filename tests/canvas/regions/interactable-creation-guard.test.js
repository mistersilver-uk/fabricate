import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
} from '../../../src/canvas/regions/interactableCreationGuard.js';

const INTERACTABLE = 'fabricate.interactable';

test('evaluateInteractableCreate cancels a fabricate.interactable with empty sourceUuid', () => {
  // The native "+ Add Behavior" path instantiates with empty system data.
  const emptySystem = { type: INTERACTABLE, system: {} };
  assert.deepEqual(evaluateInteractableCreate(emptySystem), {
    allow: false,
    reason: 'no-source',
  });

  // A blank/whitespace-only sourceUuid is also treated as no source.
  const blankSource = { type: INTERACTABLE, system: { sourceUuid: '   ' } };
  assert.deepEqual(evaluateInteractableCreate(blankSource), {
    allow: false,
    reason: 'no-source',
  });

  // A missing system object entirely.
  assert.deepEqual(evaluateInteractableCreate({ type: INTERACTABLE }), {
    allow: false,
    reason: 'no-source',
  });
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
});
