/**
 * The published `Typeahead`'s `openOnEmpty` in Chromium (issue 2885), mounted live through a fresh
 * seam by `tests/fixtures/published-typeahead/`, whose companion yields the whole set for a blank
 * query under `openOnEmpty`: the list opening on Tab and on a press into the empty field with no
 * row active, read off the accessibility tree; the lit border; the Escape sequence and ArrowDown
 * reopening the list; an outside press; the string `'true'` opening nothing; reduced motion; and
 * the list and its cursor under forced colours.
 * Limit: Chromium only, and no screen reader runs, so what one says on opening is not heard.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixtureServer = createViteFixtureServer({
  styleMountPrefix: '/@published-typeahead-styles/',
});
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const WIDE = Object.freeze({ width: 600, height: 420 });
const WHOLE = 15;

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

async function within(props, body, options = {}) {
  const page = await fixtureServer.newPage({ viewport: VIEWPORT, ...options });
  try {
    await page.goto(fixtureServer.url('/tests/fixtures/published-typeahead/index.html'));
    await page.waitForFunction(() => globalThis.__typeaheadReady === true);
    await page.evaluate((given) => globalThis.__typeahead.open(given), {
      kind: 'app',
      box: WIDE,
      props,
    });
    await page.waitForSelector('input[role="combobox"]');
    return await body(page);
  } finally {
    await page.close();
  }
}

const settled = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

async function press(page, key) {
  await page.keyboard.press(key);
  await settled(page);
}

/** The field's state, its list's rows, and what its lit border and the cursor paint. */
function state() {
  const input = document.querySelector('input');
  const list = document.querySelector('[role="listbox"]');
  const active = document.querySelector('[role="option"][aria-selected="true"]');
  const probe = (colour) => {
    const node = document.createElement('i');
    node.style.color = colour;
    input.closest('.application').append(node);
    const value = getComputedStyle(node).color;
    node.remove();
    return value;
  };
  return {
    focused: document.activeElement === input,
    expanded: input.getAttribute('aria-expanded'),
    controls: input.getAttribute('aria-controls') === list?.id && Boolean(list),
    activeDescendant: input.getAttribute('aria-activedescendant'),
    rows: document.querySelectorAll('[role="option"]').length,
    edge: getComputedStyle(document.querySelector('.fabricate-search')).borderTopColor,
    accent: probe('var(--fab-accent)'),
    ring:
      active && `${getComputedStyle(active).outlineStyle} ${getComputedStyle(active).outlineWidth}`,
    ringColour: active && getComputedStyle(active).outlineColor,
    highlight: probe('Highlight'),
    listEdge: list && getComputedStyle(list).borderTopStyle,
    motion: [list, ...document.querySelectorAll('[role="option"]')]
      .filter(Boolean)
      .map((node) => [node.getAnimations().length, getComputedStyle(node).transitionDuration]),
  };
}

describe('the published Typeahead openOnEmpty, in Chromium', () => {
  it('opens the whole set on Tab into the empty field, no row active, a named expanded combobox owning a listbox', async () => {
    await within({ openOnEmpty: true }, async (page) => {
      await press(page, 'Tab');
      const opened = await page.evaluate(state);
      assert.deepEqual(
        [opened.focused, opened.expanded, opened.controls, opened.activeDescendant, opened.rows],
        [true, 'true', true, null, WHOLE]
      );
      assert.equal(opened.edge, opened.accent, 'the shell’s border is lit while focused');
      const snapshot = await page.locator('body').ariaSnapshot();
      assert.match(snapshot, /- combobox "Find a reward" \[expanded\]/u);
      assert.match(snapshot, /- listbox "Find a reward":/u);
      assert.doesNotMatch(snapshot, /\[selected\]/u, 'no option is selected on opening');
      assert.equal(await page.getByRole('option').count(), WHOLE);
      await press(page, 'ArrowDown');
      const moved = await page.evaluate(state);
      assert.equal(moved.ring, 'solid 2px', 'the first ArrowDown rings the first row');
      assert.equal(moved.ringColour, moved.accent);
      assert.match(
        await page.locator('body').ariaSnapshot(),
        /- option "Iron ingot Metal · 3 in stock" \[selected\]/u
      );
    });
  });

  it('opens on a press into the field, closes on Escape and stops it, lets a second through, and reopens on ArrowDown', async () => {
    await within({ openOnEmpty: true }, async (page) => {
      await page.evaluate(() => {
        document.body.dataset.heard = '';
        document.addEventListener('keydown', (event) => {
          document.body.dataset.heard += `${event.key} `;
        });
      });
      const heard = () => page.evaluate(() => document.body.dataset.heard.trim());
      await page.locator('input').click();
      await settled(page);
      assert.equal((await page.evaluate(state)).expanded, 'true', 'a press opens the list');
      await press(page, 'Escape');
      const closed = await page.evaluate(state);
      assert.deepEqual([closed.expanded, closed.rows, closed.focused], ['false', 0, true]);
      await page.locator('input').click();
      await settled(page);
      assert.equal(
        (await page.evaluate(state)).expanded,
        'false',
        'a press on the focused field does not reopen it'
      );
      await press(page, 'Escape');
      assert.equal(await heard(), 'Escape', 'only the second Escape reaches the document');
      await press(page, 'ArrowDown');
      const reopened = await page.evaluate(state);
      assert.deepEqual([reopened.expanded, reopened.activeDescendant], ['true', null]);
      await page.mouse.click(1200, 760);
      await settled(page);
      assert.equal((await page.evaluate(state)).expanded, 'false', 'an outside press closes it');
      assert.deepEqual(await page.evaluate(() => globalThis.__typeahead.calls), {
        change: [],
        free: [],
        query: [],
      });
    });
  });

  it('keeps a typed query’s list closed once the second Escape empties it, and lets a third through', async () => {
    await within({ openOnEmpty: true }, async (page) => {
      await page.evaluate(() => {
        document.body.dataset.heard = '';
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') document.body.dataset.heard += 'Escape ';
        });
      });
      await page.locator('input').focus();
      await page.keyboard.type('cop');
      await settled(page);
      assert.equal((await page.evaluate(state)).rows, 1, 'the typed query lists its match');
      await press(page, 'Escape');
      await press(page, 'Escape');
      const cleared = await page.evaluate(state);
      assert.deepEqual([cleared.expanded, cleared.rows, cleared.focused], ['false', 0, true]);
      assert.equal(await page.locator('input').inputValue(), '', 'the field is emptied');
      assert.equal(await page.evaluate(() => document.body.dataset.heard), '', 'both stopped');
      await press(page, 'Escape');
      assert.equal(await page.evaluate(() => document.body.dataset.heard.trim()), 'Escape');
      assert.deepEqual(await page.evaluate(() => globalThis.__typeahead.calls.query), [
        'c',
        'co',
        'cop',
        '',
      ]);
    });
  });

  it('lists nothing on the empty field for the string true, which is not coerced', async () => {
    await within({ openOnEmpty: 'true' }, async (page) => {
      await press(page, 'Tab');
      await press(page, 'ArrowDown');
      const rest = await page.evaluate(state);
      assert.deepEqual([rest.focused, rest.expanded, rest.rows], [true, 'false', 0]);
    });
  });

  it('runs no animation or transition on the opened list or its rows under reduced motion', async () => {
    await within(
      { openOnEmpty: true },
      async (page) => {
        await press(page, 'Tab');
        await press(page, 'ArrowDown');
        const { motion } = await page.evaluate(state);
        assert.equal(motion.length, WHOLE + 1);
        for (const [animations, duration] of motion) {
          assert.equal(animations, 0);
          assert.equal(duration, '0s');
        }
      },
      { reducedMotion: 'reduce' }
    );
  });

  it('keeps the list’s edge and rings the cursor in the system highlight under forced colours', async () => {
    await within(
      { openOnEmpty: true },
      async (page) => {
        await press(page, 'Tab');
        await press(page, 'ArrowDown');
        const forced = await page.evaluate(state);
        assert.deepEqual([forced.expanded, forced.rows, forced.listEdge], ['true', WHOLE, 'solid']);
        assert.equal(forced.ring, 'solid 2px');
        assert.equal(forced.ringColour, forced.highlight);
      },
      { forcedColors: 'active' }
    );
  });
});
