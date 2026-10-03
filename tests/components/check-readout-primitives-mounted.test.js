/**
 * The two shared primitives the Checks simulator's rolled readout extends by prop (issue 2080): the
 * icon fact row's `line` density, row tones and meta hook, and the medallion's glyph ink (R2).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CHIP_PATH = 'src/ui/svelte/components/Chip.svelte';
const ROW_PATH = 'src/ui/svelte/apps/manager/IconFactRow.svelte';
const MEDALLION_PATH = 'src/ui/svelte/components/Medallion.svelte';

const authored = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('IconFactRow: the line density, row tones and meta hook', () => {
  const row = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-icon-fact-row-line-',
    compiledModules: [CHIP_PATH, ROW_PATH],
    componentPath: ROW_PATH,
  });
  before(() => row.setup());
  after(() => row.teardown());

  it('draws one line with the subtitle as the trailing meta, hooked when asked', async () => {
    const target = await row.mount({
      icon: 'fas fa-hammer',
      title: 'Required tools break',
      subtitle: 'by trigger',
      density: 'line',
      tone: 'danger',
      'data-checks-simulator-fact': 'tools',
      metaAttr: 'data-checks-simulator-fact-meta',
    });
    const node = target.querySelector('[data-checks-simulator-fact="tools"]');
    assert.deepEqual(authored(node), ['manager-icon-fact-row', 'is-line', 'is-tone-danger']);
    const meta = node.querySelector('small');
    assert.equal(meta.textContent, 'by trigger');
    assert.ok(meta.hasAttribute('data-checks-simulator-fact-meta'), 'the meta span is hooked');
    row.remount();
  });

  it('adds no line, tone or meta state to a row that asks for none', async () => {
    const target = await row.mount({ icon: 'fas fa-cube', title: 'Title', subtitle: 'Sub' });
    const node = target.querySelector('.manager-icon-fact-row');
    assert.deepEqual(authored(node), ['manager-icon-fact-row']);
    assert.deepEqual(node.querySelector('small').getAttributeNames(), ['class']);
    row.remount();
  });

  it('takes each row tone as its own state, and none for a tone it does not name', async () => {
    for (const tone of ['success', 'danger', 'warning', 'neutral', 'muted']) {
      const target = await row.mount({ icon: 'fas fa-flask', title: 'T', tone });
      const node = target.querySelector('.manager-icon-fact-row');
      assert.deepEqual(authored(node), ['manager-icon-fact-row', `is-tone-${tone}`]);
      row.remount();
    }
    const target = await row.mount({ icon: 'fas fa-flask', title: 'T', tone: 'loud' });
    assert.deepEqual(authored(target.querySelector('.manager-icon-fact-row')), [
      'manager-icon-fact-row',
    ]);
    row.remount();
  });
});

describe('Medallion: the glyph ink (R2)', () => {
  const medallion = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-medallion-ink-',
    compiledModules: [MEDALLION_PATH],
    componentPath: MEDALLION_PATH,
  });
  before(() => medallion.setup());
  after(() => medallion.teardown());

  const classesFor = async (props) => {
    const target = await medallion.mount(props);
    const classes = authored(target.querySelector('.fab-medallion'));
    medallion.remount();
    return classes;
  };

  it('inks the glyph success or danger on the unchanged slate tile, and ignores anything else', async () => {
    const base = { icon: 'fas fa-circle-check', size: 30, variant: 'glyph-chip' };
    assert.deepEqual(await classesFor({ ...base, ink: 'success' }), [
      'fab-medallion',
      'is-glyph-chip',
      'is-ink-success',
    ]);
    assert.deepEqual(await classesFor({ ...base, ink: 'danger' }), [
      'fab-medallion',
      'is-glyph-chip',
      'is-ink-danger',
    ]);
    assert.deepEqual(await classesFor({ ...base, ink: 'accent' }), ['fab-medallion', 'is-glyph-chip']);
  });
});
