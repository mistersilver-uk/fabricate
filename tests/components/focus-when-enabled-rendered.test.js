/* A CONTROL KEEPS ITS FOCUS ACROSS A PENDING COMMAND (issue 1644), in a real browser. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
// ratchet-exempt(source-pin): the leaf is executed in Chromium, which imports no module from disk; never asserted
const helper = readFileSync(resolve(repoRoot, 'src/ui/svelte/util/focusWhenEnabled.js'), 'utf8');

/** Disable then re-enable `a` the way a pending command does, a frame apart, reading focus. */
async function cycle(page, { focusElsewhere = false, focusFirst = false } = {}) {
  return page.evaluate(
    async ({ focusElsewhere: moved, focusFirst: early }) => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 20)));
      const [a, b] = ['#a', '#b'].map((id) => document.querySelector(id));
      a.disabled = false;
      document.body.focus();
      globalThis.focusWhenEnabled(a);
      if (early) {
        b.focus();
        b.blur();
      }
      a.disabled = true;
      await frame();
      const during = document.activeElement.id || document.activeElement.tagName;
      if (moved) b.focus();
      a.disabled = false;
      await frame();
      return { during, after: document.activeElement.id || document.activeElement.tagName };
    },
    { focusElsewhere, focusFirst }
  );
}

describe('focusWhenEnabled in Chromium', () => {
  let browser;
  let page;

  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent('<button id="a">a</button><button id="b">b</button>');
    await page.addScriptTag({
      type: 'module',
      content: `${helper}\nglobalThis.focusWhenEnabled = focusWhenEnabled;`,
    });
    await page.waitForFunction(() => typeof globalThis.focusWhenEnabled === 'function');
  });

  after(async () => {
    await browser?.close();
  });

  it('takes focus back once the control is enabled again', async () => {
    assert.deepEqual(
      await cycle(page),
      { during: 'BODY', after: 'a' },
      'disabling drops it to the body'
    );
  });

  it('leaves focus where the player moved it while the control was disabled', async () => {
    assert.deepEqual(await cycle(page, { focusElsewhere: true }), { during: 'BODY', after: 'b' });
  });

  it('lets go once focus has moved to another control', async () => {
    assert.deepEqual(await cycle(page, { focusFirst: true }), { during: 'BODY', after: 'BODY' });
  });
});
