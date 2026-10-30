/** `FillBar`, the product's ONE horizontal fill bar (issue 1096), and its shares (issue 2182). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { SEMANTIC_TONES, TAG_TONES } from '../fixtures/published-components/fillBarTones.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-fill-bar-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/components/FillBar.svelte'],
  componentPath: 'src/ui/svelte/components/FillBar.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const fillOf = (root) => root.querySelector('.fab-fill-bar-fill');
const widthOf = (root) => /width:\s*([\d.]+)%/.exec(fillOf(root).getAttribute('style'))[1];

describe('FillBar (mounted)', () => {
  it('sets the fill width from the value, as a percentage of the track', async () => {
    const root = await harness.mount({ value: 37.5 });
    assert.equal(widthOf(root), '37.5');
  });

  it('CLAMPS out-of-range and non-finite input rather than painting past the track', async () => {
    // The failure this prevents is not cosmetic.
    for (const [value, expected] of [
      [-20, '0'],
      [0, '0'],
      [140, '100'],
      [Number.NaN, '0'],
      [Number.POSITIVE_INFINITY, '100'],
    ]) {
      const root = await harness.mount({ value });
      assert.equal(widthOf(root), expected, `${value} should clamp to ${expected}%`);
      harness.remount();
    }
    const text = await harness.mount({ value: 'not a number' });
    assert.equal(widthOf(text), '0');
  });

  it('paints each semantic tone through a class, never an inline literal', async () => {
    for (const tone of [...SEMANTIC_TONES, ...TAG_TONES]) {
      const root = await harness.mount({ value: 50, tone });
      assert.ok(fillOf(root).classList.contains(`is-${tone}`), `${tone} selects its own rule`);
      assert.doesNotMatch(
        fillOf(root).getAttribute('style') || '',
        /background/,
        'a semantic tone is a CLASS; only a caller-owned colour lands inline'
      );
      harness.remount();
    }
  });

  it('falls back to neutral for an unknown tone rather than rendering an unpainted fill', async () => {
    for (const tone of ['chartreuse', 'sage', 'gold']) {
      const root = await harness.mount({ value: 50, tone });
      assert.ok(fillOf(root).classList.contains('is-neutral'), tone);
      assert.equal(root.querySelector('.fab-fill-bar').dataset.fillBarTone, 'neutral');
      harness.remount();
    }
  });

  it('applies a caller-owned colour inline, and it overrides the tone', async () => {
    const root = await harness.mount({
      value: 50,
      tone: 'success',
      color: 'var(--fab-danger)',
    });
    assert.match(fillOf(root).getAttribute('style'), /background:\s*var\(--fab-danger\)/);
  });

  it('renders NO role or aria of its own, so a caller cannot double-announce', async () => {
    const root = await harness.mount({ value: 50 });
    const track = root.querySelector('.fab-fill-bar');
    for (const attribute of ['role', 'aria-valuenow', 'aria-valuemin', 'aria-label']) {
      assert.ok(!track.hasAttribute(attribute), `the leaf must not declare ${attribute}`);
    }
  });

  it('offers a compact track and an optional test hook', async () => {
    const compact = await harness.mount({ value: 10, density: 'compact', 'data-odds-bar': true });
    const track = compact.querySelector('.fab-fill-bar');
    assert.ok(track.classList.contains('is-sm'));
    assert.ok(track.hasAttribute('data-odds-bar'));
    harness.remount();
    // Spread, so an unset hook is genuinely ABSENT rather than an empty attribute a
    // `[data-odds-bar]` selector would still match.
    const plain = await harness.mount({ value: 10 });
    assert.ok(!plain.querySelector('.fab-fill-bar').hasAttribute('data-odds-bar'));
  });
});

const sharesOf = (root) => [...root.querySelectorAll('.fab-fill-bar-share')];
const authored = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
/** Every element under the root, as its tag, authored classes and other attributes. */
const shapeOf = (root) =>
  [...root.querySelectorAll('*')].map((node) => [
    node.tagName,
    authored(node),
    node
      .getAttributeNames()
      .filter((name) => name !== 'class')
      .map((name) => [name, node.getAttribute(name)]),
  ]);

describe('FillBar shares (mounted)', () => {
  it('draws the single fill for one share or none, exactly as without shares', async () => {
    const plain = shapeOf(await harness.mount({ value: 50, tone: 'accent' }));
    harness.remount();
    for (const shares of [[], [{ weight: 1, tone: 'danger', color: 'var(--fab-tag-aqua)' }]]) {
      const root = await harness.mount({ value: 50, tone: 'accent', shares });
      assert.equal(sharesOf(root).length, 0, `${shares.length} share draws no share element`);
      assert.deepEqual(shapeOf(root), plain, `${shares.length} share draws the single fill`);
      harness.remount();
    }
  });

  it('draws two or more shares in proportion inside the value-wide fill', async () => {
    const root = await harness.mount({
      value: 40,
      shares: [
        { weight: 1, tone: 'accent' },
        { weight: 3, tone: 'neutral' },
      ],
    });
    assert.equal(widthOf(root), '40');
    assert.deepEqual(
      sharesOf(root).map((share) => Number(share.style.flexGrow)),
      [25, 75],
      'the grow factors are each weight over the total, out of 100'
    );
    assert.deepEqual(
      sharesOf(root).map((share) => authored(share)),
      [
        ['fab-fill-bar-share', 'is-accent'],
        ['fab-fill-bar-share', 'is-neutral'],
      ]
    );
  });

  it('paints an unknown or null share tone neutral and an absent one success', async () => {
    const root = await harness.mount({
      value: 60,
      shares: [{ weight: 1, tone: 'chartreuse' }, { weight: 1, tone: null }, { weight: 1 }],
    });
    assert.deepEqual(
      sharesOf(root).map((share) => authored(share)[1]),
      ['is-neutral', 'is-neutral', 'is-success']
    );
  });

  it("lands a share's caller-owned colour inline, and only that share's", async () => {
    const root = await harness.mount({
      value: 60,
      shares: [
        { weight: 1, tone: 'accent', color: 'var(--fab-tag-aqua)' },
        { weight: 1, tone: 'accent' },
      ],
    });
    const [painted, toned] = sharesOf(root);
    assert.match(painted.getAttribute('style'), /background: var\(--fab-tag-aqua\)/u);
    assert.doesNotMatch(toned.getAttribute('style'), /background/u);
  });

  it('gives a stacked fill no tone class and its track no tone attribute', async () => {
    const root = await harness.mount({
      value: 60,
      tone: 'danger',
      shares: [{ weight: 1 }, { weight: 1 }],
    });
    assert.deepEqual(authored(fillOf(root)), ['fab-fill-bar-fill', 'is-stacked']);
    assert.ok(!root.querySelector('.fab-fill-bar').hasAttribute('data-fill-bar-tone'));
  });

  it('reads a non-finite or negative weight as 0', async () => {
    const root = await harness.mount({
      value: 60,
      shares: [
        { weight: -2 },
        { weight: NaN },
        { weight: Infinity },
        { weight: '3' },
        { weight: 2 },
        { weight: 2 },
      ],
    });
    assert.deepEqual(
      sharesOf(root).map((share) => Number(share.style.flexGrow)),
      [0, 0, 0, 0, 50, 50]
    );
  });

  it('reads shares that all weigh nothing as a grow of 0 each, never NaN', async () => {
    const root = await harness.mount({ value: 60, shares: [{ weight: 0 }, { weight: NaN }] });
    assert.deepEqual(
      sharesOf(root).map((share) => share.style.flexGrow),
      ['0', '0'],
      'a NaN grow would be dropped as an invalid declaration, leaving none'
    );
  });
});
