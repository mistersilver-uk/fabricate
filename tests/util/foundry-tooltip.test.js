/**
 * The tooltip facade a Fabricate root hands its tree (issue 2601) reads `game.tooltip` on each
 * call, never at import, so the manager Foundry constructs after `init` is the one it drives.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { foundryTooltips } from '../../src/ui/svelte/util/foundryTooltip.js';
import { createLabTooltipManager } from '../view-lab/foundry/installFoundryShim.js';

const button = { id: 'button' };
const other = { id: 'other' };

/** A call-recording manager over plain objects, which never touches an attribute. */
function manager() {
  const recorded = { element: null, calls: [] };
  return Object.assign(recorded, {
    activate(element, options) {
      recorded.calls.push(['activate', element.id, options]);
      recorded.element = element;
    },
    deactivate() {
      recorded.calls.push(['deactivate', recorded.element?.id]);
      recorded.element = null;
    },
  });
}

/** Stands `game` in for Foundry's global, as `init` would leave it. */
const setGame = (game) => Object.assign(globalThis, { game });

const saved = globalThis.game;
afterEach(() => {
  setGame(saved);
});

describe('foundryTooltips', () => {
  it('shows plain text on the manager `game.tooltip` holds when it is called, not one read earlier', () => {
    const first = manager();
    setGame({ tooltip: first });
    foundryTooltips.show(button, 'Remove Iron ingot');
    const swapped = manager();
    setGame({ tooltip: swapped });
    foundryTooltips.show(button, 'Remove Ember salt');
    assert.deepEqual(first.calls, [['activate', 'button', { text: 'Remove Iron ingot' }]]);
    assert.deepEqual(swapped.calls, [['activate', 'button', { text: 'Remove Ember salt' }]]);
  });

  it('owns and hides the open tooltip only for the element it is open on', () => {
    const tooltip = manager();
    setGame({ tooltip });
    foundryTooltips.show(other, 'Another hint');
    assert.equal(foundryTooltips.owns(button), false);
    foundryTooltips.hide(button);
    assert.ok(tooltip.element === other, 'another element’s tooltip stays open');
    assert.equal(foundryTooltips.owns(other), true);
    foundryTooltips.hide(other);
    assert.deepEqual(tooltip.calls.at(-1), ['deactivate', 'other']);
  });

  it('owns nothing for no element, even while no tooltip is open', () => {
    setGame({ tooltip: manager() });
    assert.equal(foundryTooltips.owns(null), false);
    assert.equal(foundryTooltips.owns(undefined), false);
  });

  it('does nothing before `init`, with no manager or no `game` at all', () => {
    for (const game of [{}, undefined]) {
      setGame(game);
      assert.doesNotThrow(() => foundryTooltips.show(button, 'Remove Iron ingot'));
      assert.doesNotThrow(() => foundryTooltips.hide(button));
      assert.equal(foundryTooltips.owns(button), false);
    }
  });

  it('drives the View Lab’s manager as it drives Foundry’s', () => {
    const tooltip = createLabTooltipManager();
    setGame({ tooltip });
    const element = { setAttribute() {}, removeAttribute() {} };
    foundryTooltips.show(element, 'Link a world item');
    foundryTooltips.hide(element);
    assert.deepEqual(
      tooltip.calls.map(([verb, held, options]) => [verb, held === element, options]),
      [
        ['activate', true, { text: 'Link a world item' }],
        ['deactivate', true, undefined],
      ]
    );
  });
});
