/**
 * Mounts published `RadioCardGroup`s through the page-session seam, as a companion does, in a frame
 * with no Fabricate root, and exposes `__radioCards` to the suite: each group's `onChange` calls,
 * the submits its form heard, and a `reset` that draws a group's `value` again (issue 2889). Each
 * group accepts a choice by passing it back in its own `update`, inside `onChange`.
 */
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
import '../../../src/ui/publishedComponents.svelte.js';

Object.assign(globalThis, { game: { fabricate: { ready: true } } });

const OPTIONS = Object.freeze([
  { value: 'hold', label: 'Hold', description: 'Keep the step pending.' },
  { value: 'queue', label: 'Queue' },
  { value: 'limited', label: 'Limited' },
  { value: 'drop', label: 'Drop' },
]);
/** Each group's own props beside `options`, `legend` and `onChange`. */
const CASES = Object.freeze({
  manual: { activation: 'manual', value: 'hold' },
  automatic: { value: 'hold' },
  rtl: { activation: 'manual', value: 'hold' },
  unchosen: { activation: 'manual', value: '' },
});

const edge = (name) => {
  const button = Object.assign(document.createElement('button'), { type: 'button' });
  button.dataset[name] = '';
  button.textContent = name;
  return button;
};

const calls = Object.fromEntries(Object.keys(CASES).map((key) => [key, []]));
const submits = Object.fromEntries(Object.keys(CASES).map((key) => [key, 0]));
const handles = {};
const values = {};
const propsOf = (key) => ({
  options: OPTIONS,
  legend: `Pending step, ${key}`,
  disabledOptions: [{ value: 'limited', reason: 'Coming soon' }],
  ...CASES[key],
  value: values[key],
  onChange: (next) => {
    calls[key].push(next);
    values[key] = next;
    handles[key].update(propsOf(key));
  },
});

for (const [key, own] of Object.entries(CASES)) {
  const form = document.createElement('form');
  form.dataset.case = key;
  form.style.width = '420px';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submits[key] += 1;
  });
  const target = document.createElement('div');
  if (key === 'rtl') target.dir = 'rtl';
  form.append(edge('before'), target, edge('after'));
  document.body.append(form);
  values[key] = own.value;
  handles[key] = publishedComponentSeam.publicApi.mount('RadioCardGroup', {
    target,
    props: propsOf(key),
  });
}

Object.assign(globalThis, {
  __radioCards: {
    calls,
    submits,
    reset: (key) => {
      calls[key].length = 0;
      submits[key] = 0;
      values[key] = CASES[key].value;
      handles[key].update(propsOf(key));
    },
  },
  __radioCardsReady: true,
});
