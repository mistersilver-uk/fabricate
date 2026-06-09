/**
 * Phase 7 — the drag-source payload CONTRACT between the GM browser app and the
 * canvas drop handler.
 *
 * The browser rows are the only NET-NEW drag source in the module. A dragged row
 * must emit a `dropCanvasData`-compatible payload that the real
 * `classifyInteractableDrop` round-trips to the right interactableType + ids.
 * These tests assert the builder against the ACTUAL classifier (not a fake), so
 * the two halves cannot drift.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInteractableDragPayload,
  serializeInteractableDragPayload,
  INTERACTABLE_DRAG_TYPE
} from '../../src/canvas/interactableDragPayload.js';
import { classifyInteractableDrop } from '../../src/canvas/interactableResolution.js';

// Injected library adapters the classifier uses; the entries only need to exist.
const deps = {
  getTool: ({ systemId, toolId }) => (systemId === 'sysA' && toolId === 'tool-1' ? { id: 'tool-1', componentId: 'comp-axe' } : null),
  getTask: ({ systemId, taskId }) => (systemId === 'sysA' && taskId === 'task-9' ? { id: 'task-9', name: 'Chop Wood' } : null)
};

test('buildInteractableDragPayload shapes a Tool payload that round-trips through classifyInteractableDrop', () => {
  const payload = buildInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1' });
  assert.deepEqual(payload, {
    type: INTERACTABLE_DRAG_TYPE,
    fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' }
  });

  const classification = classifyInteractableDrop(payload, deps);
  assert.ok(classification, 'the classifier recognizes the drag payload');
  assert.equal(classification.interactableType, 'tool');
  assert.equal(classification.systemId, 'sysA');
  assert.equal(classification.referenceId, 'tool-1');
  assert.equal(classification.sourceUuid, 'Fabricate.sysA.tool.tool-1');
});

test('buildInteractableDragPayload shapes a Gathering Task payload that round-trips through classifyInteractableDrop', () => {
  const payload = buildInteractableDragPayload({ interactableType: 'gatheringTask', systemId: 'sysA', referenceId: 'task-9' });
  assert.deepEqual(payload, {
    type: INTERACTABLE_DRAG_TYPE,
    fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' }
  });

  const classification = classifyInteractableDrop(payload, deps);
  assert.ok(classification, 'the classifier recognizes the drag payload');
  assert.equal(classification.interactableType, 'gatheringTask');
  assert.equal(classification.systemId, 'sysA');
  assert.equal(classification.referenceId, 'task-9');
  assert.equal(classification.sourceUuid, 'Fabricate.sysA.gatheringTask.task-9');
});

test('the serialized text/plain form parses back to the same payload Foundry hands the drop hook', () => {
  const json = serializeInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1' });
  assert.ok(json, 'a valid row serializes a non-empty string');
  const parsed = JSON.parse(json);
  // Foundry augments this with x/y at drop time; the classifier reads .fabricate.
  const classification = classifyInteractableDrop({ ...parsed, x: 10, y: 20 }, deps);
  assert.equal(classification.interactableType, 'tool');
  assert.equal(classification.referenceId, 'tool-1');
});

test('buildInteractableDragPayload (visualMode none) carries the region-only flag + still classifies', () => {
  const payload = buildInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1', visualMode: 'none' });
  assert.deepEqual(payload, {
    type: INTERACTABLE_DRAG_TYPE,
    fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1', visualMode: 'none' }
  });
  // Classification keys off type + ids only — the extra flag is ignored there.
  const classification = classifyInteractableDrop(payload, deps);
  assert.equal(classification.interactableType, 'tool');
  assert.equal(classification.referenceId, 'tool-1');
});

test('buildInteractableDragPayload defaults to the with-marker variant (no visualMode key)', () => {
  const payload = buildInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1' });
  assert.equal('visualMode' in payload.fabricate, false, 'an ordinary drag payload omits visualMode');
  const explicit = buildInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1', visualMode: 'marker' });
  assert.equal('visualMode' in explicit.fabricate, false, 'explicit marker also omits the key (drop side defaults)');
});

test('buildInteractableDragPayload rejects invalid inputs (null, blank ids, unknown type)', () => {
  assert.equal(buildInteractableDragPayload({ interactableType: 'tool', systemId: '', referenceId: 'tool-1' }), null);
  assert.equal(buildInteractableDragPayload({ interactableType: 'tool', systemId: 'sysA', referenceId: '  ' }), null);
  assert.equal(buildInteractableDragPayload({ interactableType: 'widget', systemId: 'sysA', referenceId: 'x' }), null);
  assert.equal(buildInteractableDragPayload(), null);
  assert.equal(serializeInteractableDragPayload({ interactableType: 'tool', systemId: '', referenceId: '' }), '');
});

test('payloads trim surrounding whitespace on ids', () => {
  const payload = buildInteractableDragPayload({ interactableType: 'gatheringTask', systemId: ' sysA ', referenceId: ' task-9 ' });
  assert.equal(payload.fabricate.systemId, 'sysA');
  assert.equal(payload.fabricate.taskId, 'task-9');
});
