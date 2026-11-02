/**
 * Issue 2895 — the published `Button`'s and `IconButton`'s `description`, read in Chromium's own
 * accessibility tree on the markup the seam draws, under the module sheet and a host rule that sets
 * `display` on every span in a button: the name stays the label or `ariaLabel`, the description is
 * the text, after the caller's own hint on `Button`, at rest, disabled and busy, and the hidden
 * element draws nothing and moves nothing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { publishedAxPage } from '../helpers/publishedAxPage.js';

const LABEL = 'Back 1 day';
const DESCRIPTION = 'Moves the date back 1 day; credits stay';
const HINT = 'Credits are kept in the ledger.';
const BUTTON = { children: LABEL, onclick() {} };
const ICON = { icon: 'fas fa-backward', ariaLabel: LABEL, onclick() {} };
const described = (props) => ({ ...props, description: DESCRIPTION });

/** Each case's id, entry and props. */
const CASES = Object.freeze([
  ['button-plain', 'Button', BUTTON],
  ['button', 'Button', described(BUTTON)],
  ['button-named', 'Button', described({ ...BUTTON, ariaLabel: `${LABEL} for Mira` })],
  ['button-hinted', 'Button', described({ ...BUTTON, 'aria-describedby': 'hint' })],
  ['button-tooltip', 'Button', described({ ...BUTTON, tooltip: 'Rewinds the clock' })],
  ['button-disabled', 'Button', described({ ...BUTTON, disabled: true })],
  ['button-busy', 'Button', described({ ...BUTTON, busy: true })],
  ['icon-plain', 'IconButton', ICON],
  ['icon', 'IconButton', described(ICON)],
  ['icon-disabled', 'IconButton', described({ ...ICON, disabled: true })],
]);

let page;

before(async () => {
  page = await publishedAxPage({
    tmpPrefix: 'fabricate-button-description-rendered-',
    cases: CASES,
    before: `<p id="hint">${HINT}</p>`,
    css: 'button span{display:inline-block}',
  });
});

after(async () => {
  await page?.close();
});

const axOf = (id) => page.axOf(`[data-case="${id}"] button`);

/** The case's button's drawn box, and how many boxes its hidden element draws. */
const boxOf = (id) =>
  page.tab.evaluate((hook) => {
    const button = document.querySelector(`[data-case="${hook}"] button`);
    const { width, height } = button.getBoundingClientRect();
    const hidden = button.querySelector('[hidden]');
    return { width, height, drawn: hidden ? hidden.getClientRects().length : 0 };
  }, id);

describe('the published Button’s and IconButton’s description in Chromium', () => {
  for (const [id, name] of [
    ['button', LABEL],
    ['button-named', `${LABEL} for Mira`],
    ['button-tooltip', LABEL],
    ['button-disabled', LABEL],
    ['button-busy', LABEL],
    ['icon', LABEL],
    ['icon-disabled', LABEL],
  ]) {
    it(`keeps the name and reads the description on ${id}`, async () => {
      assert.deepEqual(await axOf(id), { role: 'button', name, description: DESCRIPTION });
    });
  }

  it('reads the caller’s hint first, then the description', async () => {
    assert.equal((await axOf('button-hinted')).description, `${HINT} ${DESCRIPTION}`);
  });

  it('describes nothing without one, as before', async () => {
    for (const id of ['button-plain', 'icon-plain']) {
      assert.equal((await axOf(id)).description, '', id);
    }
  });

  it('draws nothing and moves nothing, under a host rule that sets display on its spans', async () => {
    for (const [plain, drawn] of [
      ['button-plain', 'button'],
      ['icon-plain', 'icon'],
    ]) {
      const [without, beside] = [await boxOf(plain), await boxOf(drawn)];
      assert.equal(beside.drawn, 0, `${drawn} draws no box`);
      assert.deepEqual([beside.width, beside.height], [without.width, without.height], drawn);
    }
  });
});
