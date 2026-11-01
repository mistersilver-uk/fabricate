/**
 * Mounts published `Disclosure`s through the page-session seam, as a companion does, in a frame
 * with no Fabricate root, and exposes `__disclosure` to the suite: each card's handle and the
 * `onToggle` calls it recorded (issue 2862).
 */
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';
import '../../../src/ui/publishedComponents.svelte.js';

Object.assign(globalThis, { game: { fabricate: { ready: true } } });

const KEYS = Object.freeze(['closed', 'open', 'disabled']);
const PROPS = Object.freeze({
  closed: {},
  open: { open: true },
  disabled: { disabled: true },
});

const before = Object.assign(document.createElement('button'), { type: 'button' });
before.dataset.before = '';
before.textContent = 'Before';
document.body.append(before);

const calls = Object.fromEntries(KEYS.map((key) => [key, []]));
const handles = {};
const propsOf = (key, props) => ({
  head: true,
  body: true,
  ...props,
  onToggle: (next) => {
    calls[key].push(next);
  },
});

for (const key of KEYS) {
  const target = document.createElement('div');
  target.dataset.case = key;
  target.style.width = '360px';
  document.body.append(target);
  handles[key] = publishedComponentSeam.publicApi.mount('Disclosure', {
    target,
    props: propsOf(key, PROPS[key]),
  });
  handles[key].slot('head').append(`Card ${key}`);
  const field = document.createElement('input');
  field.setAttribute('aria-label', `Note for ${key}`);
  handles[key].slot('body').append(field);
}

Object.assign(globalThis, {
  __disclosure: { calls, update: (key, props) => handles[key].update(propsOf(key, props)) },
  __disclosureReady: true,
});
