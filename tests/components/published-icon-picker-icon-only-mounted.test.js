/**
 * The published `IconPicker`'s `iconOnly` and its trigger's composed name (issues 2899, 2905), on
 * Fabricate's real Svelte runtime through a fresh seam under a Fabricate window root: literal
 * `true` draws the glyph with no caption, named and titled by `ariaLabel` alone and described by
 * the chosen glyph's caption, and any other value draws the captioned trigger, nothing coerced; the
 * captioned trigger's name and title are `ariaLabel`, its trailing punctuation dropped, a comma
 * and the caption it draws, unless `ariaLabel` already holds the caption as whole words, so its name always holds its visible label, a stored glyph outside the
 * vocabulary included, and an `ariaLabel` the seam passes that is not a string is drawn as written;
 * an `update` recomposes the name on the same trigger.
 * Limit: happy-dom computes no accessible name, so the name read here is the `aria-label`
 * Chromium's tree reads in `icon-picker-icon-only-rendered`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, mountEntry } = publishedEntrySeam('fabricate-published-icon-picker-icon-only-');
const BASE = Object.freeze({
  value: 'fas fa-flask',
  onChange() {},
  ariaLabel: 'Reagent icon',
  listLabel: 'Reagent icons',
  searchLabel: 'Search reagent icons',
  noMatchesText: 'No icon matches.',
});

/** A picker mounted with `props` over `BASE`: its handle and a reader for its trigger. */
async function mountPicker(props = {}) {
  const { target, handle } = mountEntry('IconPicker', { ...BASE, ...props });
  await settle();
  const trigger = () => target.querySelector('button.essence-icon-picker-trigger');
  return { target, handle, trigger };
}

/** What the trigger draws and how it is named. */
function drawn(trigger) {
  const caption = trigger.querySelector('.essence-icon-picker-trigger-label');
  return {
    iconOnly: trigger.classList.contains('icon-only'),
    caption: caption ? caption.textContent.trim() : null,
    name: trigger.getAttribute('aria-label'),
    title: trigger.getAttribute('title'),
    described: (trigger.getAttribute('aria-describedby') ?? '')
      .split(/\s+/u)
      .filter(Boolean)
      .map((id) => trigger.querySelector(`:scope [id="${id}"]`)?.textContent.trim() ?? `#${id}?`),
    glyph: trigger.querySelector(':scope .essence-icon-picker-preview i')?.className ?? null,
  };
}

describe('the published IconPicker describes iconOnly', () => {
  it('lists iconOnly as optional data, after tint', () => {
    const { props } = ui().describe('IconPicker');
    assert.deepEqual(Object.keys(props).slice(-2), ['tint', 'iconOnly']);
    assert.deepEqual(props.iconOnly, { kind: 'data', required: false });
  });
});

describe('the published IconPicker iconOnly trigger', () => {
  it('draws the glyph with no caption, named and titled by ariaLabel alone and described by its caption', async () => {
    const { handle, trigger } = await mountPicker({ iconOnly: true });
    assert.deepEqual(drawn(trigger()), {
      iconOnly: true,
      caption: null,
      name: 'Reagent icon',
      title: 'Reagent icon',
      described: ['Flask'],
      glyph: 'fas fa-flask',
    });
    assert.equal(trigger().getAttribute('aria-haspopup'), 'dialog');
    assert.equal(trigger().getAttribute('aria-expanded'), 'false');
    handle.destroy();
  });

  for (const iconOnly of ['true', 1, 'yes', 'iconOnly', false, null]) {
    it(`draws the captioned trigger for ${JSON.stringify(iconOnly)}`, async () => {
      const { handle, trigger } = await mountPicker({ iconOnly });
      const { iconOnly: glyphOnly, caption } = drawn(trigger());
      assert.deepEqual([glyphOnly, caption], [false, 'Flask'], 'nothing is coerced');
      handle.destroy();
    });
  }

  it('follows the choice in its description, and describes no choice when value holds no glyph', async () => {
    const { handle, trigger } = await mountPicker({ iconOnly: true });
    assert.equal(handle.update({ ...BASE, iconOnly: true, value: 'fas fa-gear' }), true);
    await settle();
    const [after] = drawn(trigger()).described;
    assert.ok(after && after !== 'Flask', 'the description names the new glyph');
    assert.equal(handle.update({ ...BASE, iconOnly: true, value: '' }), true);
    await settle();
    assert.deepEqual(drawn(trigger()).described, []);
    handle.destroy();
  });

  it('turns the same trigger icon-only and back on an update', async () => {
    const { handle, trigger } = await mountPicker();
    const button = trigger();
    assert.equal(handle.update({ ...BASE, iconOnly: true }), true);
    await settle();
    assert.ok(trigger() === button, 'the same trigger');
    assert.deepEqual([drawn(button).iconOnly, drawn(button).name], [true, 'Reagent icon']);
    assert.equal(handle.update({ ...BASE }), true);
    await settle();
    assert.deepEqual([drawn(button).caption, drawn(button).name], ['Flask', 'Reagent icon, Flask']);
    handle.destroy();
  });
});

describe('the published IconPicker captioned trigger name', () => {
  const NAMES = [
    ['adds the caption after a comma', 'fas fa-flask', 'Reagent icon', 'Reagent icon, Flask'],
    ['keeps a name that holds it', 'fas fa-flask', 'Reagent icon: Flask', 'Reagent icon: Flask'],
    ['matches it case-folded', 'fas fa-flask', 'flask for reagents', 'flask for reagents'],
    ['matches whole words only', 'fas fa-flask', 'Flasks', 'Flasks, Flask'],
    [
      'matches every word of the caption, in order',
      'fas fa-wand-magic-sparkles',
      'Magic wand',
      'Magic wand, Wand Magic Sparkles',
    ],
    [
      'holds the caption it makes for a stored glyph outside the vocabulary',
      'fas fa-premium-sigil-glyph',
      'Icon',
      'Icon, Premium Sigil Glyph',
    ],
  ];
  for (const [title, value, ariaLabel, name] of NAMES) {
    it(title, async () => {
      const { handle, trigger } = await mountPicker({ value, ariaLabel });
      const shown = drawn(trigger());
      assert.equal(shown.name, name);
      assert.equal(shown.title, name, 'its native tooltip is its name');
      assert.ok(
        name.toLowerCase().includes(shown.caption.toLowerCase()),
        `"${shown.caption}" is the caption it draws`
      );
      assert.deepEqual(shown.described, [], 'a captioned trigger describes nothing');
      handle.destroy();
    });
  }

  it('drops the punctuation that ends ariaLabel before the comma', async () => {
    for (const ariaLabel of ['Reagent icon:', 'Reagent icon - ', 'Reagent icon;,. ']) {
      const { handle, trigger } = await mountPicker({ ariaLabel });
      assert.equal(drawn(trigger()).name, 'Reagent icon, Flask', JSON.stringify(ariaLabel));
      handle.destroy();
    }
  });

  // `ariaLabel` is `required` and names the control, so M9 refuses any non-string (issue 2924); the
  // trigger never composes `42, Flask` or `true, Flask` from a value the seam lets through.
  for (const ariaLabel of [42, true, {}, ['a']]) {
    it(`refuses an ariaLabel of ${JSON.stringify(ariaLabel)} at the seam`, () => {
      assert.throws(
        () => mountEntry('IconPicker', { ...BASE, ariaLabel }),
        /IconPicker requires a non-blank string "ariaLabel"/
      );
    });
  }

  it('recomposes on an update of ariaLabel or value', async () => {
    const { handle, trigger } = await mountPicker();
    assert.equal(handle.update({ ...BASE, ariaLabel: 'Tool icon' }), true);
    await settle();
    assert.equal(drawn(trigger()).name, 'Tool icon, Flask');
    assert.equal(handle.update({ ...BASE, value: 'fas fa-gear' }), true);
    await settle();
    assert.equal(drawn(trigger()).name, `Reagent icon, ${drawn(trigger()).caption}`);
    handle.destroy();
  });
});
