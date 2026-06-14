/**
 * Phase 2 (issue 335) — pure promote-region decision for the GM Manage
 * Interactables panel. Covers source validation, tool + gathering-task promotion,
 * marker vs region-only, and that it routes through the SHARED behaviour-system
 * builder (no second builder).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  decidePromoteRegion,
  validatePromoteSource,
  PROMOTE_MARKER_KINDS,
} from '../../../src/canvas/regions/interactablePromote.js';
import { buildInteractableBehaviorSystem } from '../../../src/canvas/regions/interactableRegionFlags.js';

describe('validatePromoteSource', () => {
  it('rejects an unknown interactable type', () => {
    assert.deepEqual(validatePromoteSource({ interactableType: 'nope', systemId: 's', referenceId: 'r' }), {
      valid: false,
      reason: 'type',
    });
  });

  it('rejects a missing system id', () => {
    assert.deepEqual(validatePromoteSource({ interactableType: 'tool', systemId: '', referenceId: 'r' }), {
      valid: false,
      reason: 'system',
    });
  });

  it('rejects a missing reference id', () => {
    assert.deepEqual(validatePromoteSource({ interactableType: 'tool', systemId: 's', referenceId: '  ' }), {
      valid: false,
      reason: 'reference',
    });
  });

  it('accepts a complete tool / gathering-task pick', () => {
    assert.deepEqual(validatePromoteSource({ interactableType: 'tool', systemId: 's', referenceId: 'r' }), {
      valid: true,
    });
    assert.deepEqual(
      validatePromoteSource({ interactableType: 'gatheringTask', systemId: 's', referenceId: 't' }),
      { valid: true }
    );
  });
});

describe('decidePromoteRegion', () => {
  const build = (spawn) => buildInteractableBehaviorSystem(spawn);

  it('throws without an injected builder', () => {
    assert.throws(() => decidePromoteRegion({ source: {} }), /buildBehaviorSystem/);
  });

  it('returns ok:false for an invalid source (no half-formed behaviour)', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'tool', systemId: '', referenceId: 'r' },
      buildBehaviorSystem: build,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'system');
  });

  it('promotes a tool with a Tile marker over the region centre', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'tool', systemId: 'sys', referenceId: 'tool-1' },
      name: 'Anvil',
      center: { x: 120, y: 240 },
      buildBehaviorSystem: build,
    });
    assert.equal(result.ok, true);
    assert.equal(result.behaviorSystem.interactableType, 'tool');
    assert.equal(result.behaviorSystem.toolId, 'tool-1');
    assert.equal(result.behaviorSystem.sourceUuid, 'Fabricate.sys.tool.tool-1');
    assert.equal(result.behaviorSystem.name, 'Anvil');
    assert.equal(result.behaviorSystem.presentation.hidden, false);
    assert.deepEqual(result.marker, { kind: 'Tile', center: { x: 120, y: 240 } });
  });

  it('promotes a gathering task with a resolved environment + Drawing marker', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'gatheringTask', systemId: 'sys', referenceId: 'task-9' },
      environmentId: 'forest',
      markerKind: 'Drawing',
      center: { x: 0, y: 0 },
      buildBehaviorSystem: build,
    });
    assert.equal(result.ok, true);
    assert.equal(result.behaviorSystem.interactableType, 'gatheringTask');
    assert.equal(result.behaviorSystem.taskId, 'task-9');
    assert.equal(result.behaviorSystem.environmentId, 'forest');
    assert.equal(result.behaviorSystem.sourceUuid, 'Fabricate.sys.gatheringTask.task-9');
    assert.equal(result.marker.kind, 'Drawing');
  });

  it('promotes region-only (no marker) and marks the behaviour hidden', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'tool', systemId: 'sys', referenceId: 'tool-1' },
      visualMode: 'none',
      buildBehaviorSystem: build,
    });
    assert.equal(result.ok, true);
    assert.equal(result.marker, null);
    assert.equal(result.behaviorSystem.presentation.hidden, true);
    assert.equal(result.behaviorSystem.linkedVisual.mode, 'none');
    assert.equal(result.behaviorSystem.linkedVisual.uuid, null);
  });

  it('defaults an unknown marker kind to Tile', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'tool', systemId: 'sys', referenceId: 'tool-1' },
      markerKind: 'Bogus',
      buildBehaviorSystem: build,
    });
    assert.ok(PROMOTE_MARKER_KINDS.includes(result.marker.kind));
    assert.equal(result.marker.kind, 'Tile');
  });

  it('does not carry an environment for a tool', () => {
    const result = decidePromoteRegion({
      source: { interactableType: 'tool', systemId: 'sys', referenceId: 'tool-1' },
      environmentId: 'forest',
      buildBehaviorSystem: build,
    });
    assert.equal(result.behaviorSystem.environmentId, null);
  });
});
