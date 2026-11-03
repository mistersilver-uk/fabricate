/**
 * Mounts published `TintSwatches` strips through the page-session seam, as a companion does, in a
 * frame with no Fabricate root, each holding its own `value` and passing the new one back through
 * `update` from `onChange`, and the View Lab fixture a case drives; exposes `__swatches` to the
 * suite: each strip's `onChange` calls and its `update` (issue 2901).
 */
import { mount } from 'svelte';

import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
import '../../../src/ui/publishedComponents.svelte.js';
import PublishedTintSwatches from '../../view-lab/fixtures/PublishedTintSwatches.svelte';

Object.assign(globalThis, { game: { fabricate: { ready: true } } });

const CASES = Object.freeze({
  ltr: { value: 'rose', ariaLabel: 'Activity colour' },
  rtl: { value: 'rose', ariaLabel: 'Activity colour, right to left' },
  none: { value: '', ariaLabel: 'Camp colour' },
  subset: {
    value: 'azure',
    ariaLabel: 'Faction colour',
    tints: ['sage', 'rose', 'butter', 'azure'],
    labels: { sage: 'Moss', rose: 'Blush', butter: 'Straw', azure: 'Sky' },
  },
});

const before = Object.assign(document.createElement('button'), { type: 'button' });
before.dataset.before = '';
before.textContent = 'Before';
document.body.append(before);

const calls = Object.fromEntries(Object.keys(CASES).map((key) => [key, []]));
const handles = {};
const values = {};
const propsOf = (key) => ({
  ...CASES[key],
  value: values[key],
  onChange: (next) => {
    calls[key].push(next);
    values[key] = next;
    handles[key].update(propsOf(key));
  },
});

for (const [key, props] of Object.entries(CASES)) {
  values[key] = props.value;
  const target = document.createElement('div');
  target.dataset.case = key;
  target.style.width = '360px';
  if (key === 'rtl') target.dir = 'rtl';
  document.body.append(target);
  handles[key] = publishedComponentSeam.publicApi.mount('TintSwatches', {
    target,
    props: propsOf(key),
  });
}

const after = Object.assign(document.createElement('button'), { type: 'button' });
after.dataset.after = '';
after.textContent = 'After';
document.body.append(after);

const lab = document.createElement('div');
lab.dataset.lab = '';
document.body.append(lab);
mount(PublishedTintSwatches, { target: lab });

Object.assign(globalThis, {
  __swatches: {
    calls,
    set: (key, value) => {
      values[key] = value;
      handles[key].update(propsOf(key));
    },
  },
  __swatchesReady: true,
});
