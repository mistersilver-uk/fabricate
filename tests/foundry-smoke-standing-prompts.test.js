/**
 * The smoke's roll-prompt teardown (issue 2192): a prompt a failed case abandoned is one Playwright
 * could not act on, so clearing it must use the DOM's own click and never a locator click.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import {
  abandonCraft,
  clearStandingPrompts,
} from '../scripts/foundry-smoke/pageOps/chatCardCrafts.mjs';

/** A page whose prompts close only through their close control's DOM click, as Playwright runs it. */
function fakePage(standing) {
  const prompts = [];
  const mount = (onClose = () => {}) => {
    const prompt = {
      close: {
        click: () => {
          prompts.splice(prompts.indexOf(prompt), 1);
          onClose();
        },
      },
    };
    prompts.push(prompt);
  };
  for (let index = 0; index < standing; index += 1) mount();
  const document = { querySelectorAll: () => prompts.map((prompt) => prompt.close) };
  const unactionable = () => new Promise(() => {});
  const page = {
    evaluate: async (fn, arg) =>
      runInNewContext(`(${fn})(arg)`, { document, arg, requestAnimationFrame: setImmediate }),
    locator: () => ({
      first: () => ({
        waitFor: async ({ state }) => {
          if (state === 'detached' && prompts.length > 0) throw new Error('still standing');
          while (state === 'visible' && prompts.length === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        },
        click: unactionable,
      }),
      last: () => ({ click: unactionable }),
      count: async () => prompts.length,
    }),
  };
  return { page, prompts, mount };
}

describe('standing roll prompts', () => {
  it('clears every standing prompt without a Playwright click', async () => {
    const { page, prompts } = fakePage(2);
    await clearStandingPrompts(page);
    assert.equal(prompts.length, 0);
  });

  it('dismisses a prompt that mounts late, which is what lets the abandoned craft settle', async () => {
    const { page, prompts, mount } = fakePage(0);
    // Like the real craft, this one settles only once its prompt is answered or dismissed.
    const crafted = new Promise((resolve) => {
      setTimeout(() => mount(() => resolve({ messages: [] })), 20);
    });
    await abandonCraft(page, crafted, 5000);
    assert.equal(prompts.length, 0, 'the late prompt never stands into the next case');
  });
});
