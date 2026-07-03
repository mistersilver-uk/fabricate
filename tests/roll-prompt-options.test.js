import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildInteractiveRollOptions } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

/**
 * `buildInteractiveRollOptions` threads the subject `name`/`activity`/`img` into
 * the options bag so the prompt can render its icon-first header. Guard that the
 * header inputs actually survive into the bag (the image fix depends on it).
 */
describe('buildInteractiveRollOptions', () => {
  it('threads name, activity, and img into the options bag', () => {
    const options = buildInteractiveRollOptions({
      interactive: true,
      actor: { id: 'a1' },
      name: 'Forge Iron Rivets',
      activity: 'Crafting',
      img: 'icons/tools/smithing/anvil.webp',
      dc: 12,
    });
    assert.equal(options.interactive, true);
    assert.equal(options.name, 'Forge Iron Rivets');
    assert.equal(options.activity, 'Crafting');
    assert.equal(options.img, 'icons/tools/smithing/anvil.webp');
    assert.equal(options.dc, 12);
    assert.equal(typeof options.prompt, 'function');
  });

  it('carries a false interactive flag through for automated callers', () => {
    const options = buildInteractiveRollOptions({
      interactive: false,
      actor: null,
      name: 'Extract Iron Ore',
      activity: 'Gathering',
    });
    assert.equal(options.interactive, false);
    assert.equal(options.name, 'Extract Iron Ore');
    assert.equal(options.activity, 'Gathering');
  });
});
