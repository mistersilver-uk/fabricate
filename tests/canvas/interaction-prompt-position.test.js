import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_INTERACTION_PROMPT_POSITION,
  INTERACTION_PROMPT_POSITION_CHOICES,
  resolveInteractionPromptPositionStyle,
} from '../../src/ui/interactionPromptPosition.js';

describe('resolveInteractionPromptPositionStyle', () => {
  it('defaults to the historical bottom-center anchor', () => {
    assert.equal(DEFAULT_INTERACTION_PROMPT_POSITION, 'bottom-center');
    // Matches the previously hardcoded inline style exactly so the default is a no-op change.
    assert.deepEqual(resolveInteractionPromptPositionStyle('bottom-center'), [
      'left:50%',
      'bottom:96px',
      'transform:translateX(-50%)',
    ]);
  });

  it('offers the four corners and four edge-centers plus bottom-center', () => {
    assert.deepEqual(Object.keys(INTERACTION_PROMPT_POSITION_CHOICES).sort((a, b) => a.localeCompare(b)), [
      'bottom-center',
      'bottom-left',
      'bottom-right',
      'middle-left',
      'middle-right',
      'top-center',
      'top-left',
      'top-right',
    ]);
  });

  it('maps each anchor to the correct position declarations', () => {
    assert.deepEqual(resolveInteractionPromptPositionStyle('top-left'), ['left:16px', 'top:16px']);
    assert.deepEqual(resolveInteractionPromptPositionStyle('top-right'), ['right:16px', 'top:16px']);
    assert.deepEqual(resolveInteractionPromptPositionStyle('bottom-left'), ['left:16px', 'bottom:96px']);
    assert.deepEqual(resolveInteractionPromptPositionStyle('bottom-right'), ['right:16px', 'bottom:96px']);
    assert.deepEqual(resolveInteractionPromptPositionStyle('top-center'), [
      'left:50%',
      'top:16px',
      'transform:translateX(-50%)',
    ]);
    assert.deepEqual(resolveInteractionPromptPositionStyle('middle-left'), [
      'left:16px',
      'top:50%',
      'transform:translateY(-50%)',
    ]);
    assert.deepEqual(resolveInteractionPromptPositionStyle('middle-right'), [
      'right:16px',
      'top:50%',
      'transform:translateY(-50%)',
    ]);
  });

  it('falls back to bottom-center for unknown, empty, or non-string anchors', () => {
    const expected = resolveInteractionPromptPositionStyle('bottom-center');
    for (const bad of ['middle-center', 'nonsense', '', null, undefined, 42, {}]) {
      assert.deepEqual(resolveInteractionPromptPositionStyle(bad), expected, `fallback for ${JSON.stringify(bad)}`);
    }
  });
});
