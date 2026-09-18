/** `FillBar`, the product's ONE horizontal fill bar (issue 1096). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
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
    for (const tone of ['success', 'warning', 'danger', 'info', 'accent', 'neutral']) {
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
    const root = await harness.mount({ value: 50, tone: 'chartreuse' });
    assert.ok(fillOf(root).classList.contains('is-neutral'));
    assert.equal(root.querySelector('.fab-fill-bar').dataset.fillBarTone, 'neutral');
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
    const compact = await harness.mount({ value: 10, size: 'sm', dataAttr: 'data-odds-bar' });
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
