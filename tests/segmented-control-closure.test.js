/**
 * `SegmentedControl` takes already-localized option labels (issue 2588), so its import closure holds
 * no module outside its own file and `ViewToggle`'s holds only `ViewToggle` and `SegmentedControl`:
 * no localization helper, and no Foundry global, which the published-component seam refuses (rule 5).
 * The negative controls run the same assertions over synthetic sources.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SHIPPED,
  byName,
  closureDependencies,
  importClosure,
  syntheticReader,
} from './helpers/publishedComponentGate.js';

const DIRECTORY = 'src/ui/svelte/components';
const SEGMENTED = `${DIRECTORY}/SegmentedControl.svelte`;
const VIEW_TOGGLE = `${DIRECTORY}/ViewToggle.svelte`;
const TOGGLE_SOURCE = `<script>import SegmentedControl from './SegmentedControl.svelte';</script>`;

const closureOf = (path, reader) => [...importClosure(path, reader)].sort(byName);
const SEGMENTED_HELD = [SEGMENTED];
const VIEW_TOGGLE_HELD = [SEGMENTED, VIEW_TOGGLE].sort(byName);
/** The closure assertion itself, so a control proves the very check the shipped files pass. */
const closureHolds = (path, reader, held) => {
  try {
    assert.deepEqual(closureOf(path, reader), held);
    return true;
  } catch {
    return false;
  }
};

describe('SegmentedControl import closure', () => {
  it('holds only SegmentedControl itself', () => {
    assert.deepEqual(closureOf(SEGMENTED, SHIPPED), SEGMENTED_HELD);
  });

  it('holds only ViewToggle and SegmentedControl for ViewToggle', () => {
    assert.deepEqual(closureOf(VIEW_TOGGLE, SHIPPED), VIEW_TOGGLE_HELD);
  });

  it('reaches no ancestor rule and no Foundry global from either entry', () => {
    for (const path of [SEGMENTED, VIEW_TOGGLE]) {
      assert.deepEqual(closureDependencies(path, SHIPPED, 'any'), [], path);
    }
  });
});

describe('the closure assertions refuse a drifted SegmentedControl', () => {
  it('(a) a localizeOr import widens the closure', () => {
    const reader = syntheticReader({
      [SEGMENTED]: `<script>import { localizeOr } from '../util/localizeOr.js';</script>`,
      'src/ui/svelte/util/localizeOr.js': 'export const localizeOr = (key, fallback) => fallback;',
    });
    assert.ok(!closureHolds(SEGMENTED, reader, SEGMENTED_HELD));
  });

  it('(b) a direct globalThis.game.i18n read with no import fails the dependencies', () => {
    const reader = syntheticReader({
      [SEGMENTED]: '<script>const label = globalThis.game.i18n.localize(option.labelKey);</script>',
    });
    assert.deepEqual(closureOf(SEGMENTED, reader), [SEGMENTED]);
    assert.deepEqual(closureDependencies(SEGMENTED, reader, 'any'), [`${SEGMENTED}: reads game`]);
  });

  it('(c) a literal import() of the bridge widens the closure', () => {
    const reader = syntheticReader({
      [SEGMENTED]: `<script>const bridge = import('../util/foundryBridge.js');</script>`,
      'src/ui/svelte/util/foundryBridge.js': 'export const localize = () => "";',
    });
    assert.ok(!closureHolds(SEGMENTED, reader, SEGMENTED_HELD));
  });

  it('(d) ViewToggle over a SegmentedControl that imports a helper widens its closure', () => {
    const reader = syntheticReader({
      [VIEW_TOGGLE]: TOGGLE_SOURCE,
      [SEGMENTED]: `<script>import { shape } from './shape.js';</script>`,
      [`${DIRECTORY}/shape.js`]: 'export const shape = () => "";',
    });
    assert.ok(!closureHolds(VIEW_TOGGLE, reader, VIEW_TOGGLE_HELD));
  });
});
