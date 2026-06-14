import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
} from '../../../src/canvas/regions/interactableCreationGuard.js';
import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';

// Use the canonical subtype constant rather than a locally-redefined literal so
// this test cannot silently mirror a stale subtype string.
const INTERACTABLE = INTERACTABLE_BEHAVIOR_SUBTYPE;

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

test('evaluateInteractableCreate keys ONLY on sourceUuid (not the other required fields)', () => {
  // Documented design: a resolvable sourceUuid alone distinguishes a real
  // Fabricate placement from the native empty-system path. The guard does NOT
  // require interactableType/systemId to be present to allow creation.
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
