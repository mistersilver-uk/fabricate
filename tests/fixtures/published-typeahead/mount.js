/**
 * The published `Typeahead` mounted through a fresh seam on the adapter's own runtime (issue 2860).
 * `globalThis.__typeahead.open(scene)` builds one window, `app`, `manager`, `companion` or a
 * `detached` one in a same-origin frame, at `scene.box` with the field `offset` below its top and
 * `inset` from its sides, and mounts a typeahead whose companion filters `REWARDS` by the query it
 * holds; `calls` records what it reported.
 */
import {
  COMPONENTS,
  LOADERS,
  publishedComponentRuntime,
} from '../../../src/ui/publishedComponents.svelte.js';
import { createPublishedComponents } from '../../../src/ui/publishedComponentSeam.js';

const ui = (() => {
  const seam = createPublishedComponents({ isReady: () => true });
  seam.register({ ...publishedComponentRuntime, components: COMPONENTS, loaders: LOADERS });
  return seam.publicApi;
})();

const REWARDS = Object.freeze([
  { value: 'iron-ingot', label: 'Iron ingot', icon: 'fas fa-cube', detail: 'Metal · 3 in stock' },
  { value: 'iron-ore', label: 'Iron ore', icon: 'fas fa-mountain' },
  { value: 7, label: 'Ironwood plank', icon: 'fas fa-tree', detail: 'Timber' },
  ...Array.from({ length: 9 }, (_, index) => ({
    value: `iron-${index}`,
    label: `Iron filing ${index + 1}`,
    icon: 'fas fa-cube',
  })),
  { value: 'copper-wire', label: 'Copper wire', icon: 'fas fa-bolt' },
  {
    value: 'moonpetal-salve',
    label: 'Moonpetal salve steeped with silverleaf and ember salt for the long night watch',
    icon: 'fas fa-flask',
    detail: 'Remedy · brewed at the hearth',
  },
  { value: 'moonstone', label: 'Moonstone', icon: 'fas fa-gem' },
]);

const ROOT_CLASSES = Object.freeze({
  app: 'application fabricate fabricate-app',
  manager: 'application fabricate fabricate-manager',
  companion: 'application',
  detached: 'application',
});

function windowIn(doc, kind, { left, top, width, height, offset = 24, inset = 24 }) {
  const frame = doc.createElement('div');
  frame.className = ROOT_CLASSES[kind];
  Object.assign(frame.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  const content = doc.createElement('section');
  content.className = 'window-content';
  const clip = doc.createElement('div');
  clip.className = 'fixture-clip';
  clip.style.margin = `${offset}px ${inset}px 0`;
  const target = doc.createElement('div');
  target.className = 'fixture-target';
  clip.append(target);
  content.append(clip);
  frame.append(content);
  doc.body.append(frame);
  return target;
}

/** A same-origin frame carrying this page's sheets: the stand-in for a detached window. */
async function detachedDocument({ left, top, width, height }) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(
    `<!doctype html><html><head>${[...document.querySelectorAll('link, style')]
      .map((node) => node.outerHTML)
      .join('')}</head><body></body></html>`
  );
  doc.close();
  // A link loads its sheet, and a style its `@import`s, before the frame is drawn in.
  const loading = [...doc.querySelectorAll('link, style')].filter(
    (sheet) => sheet.localName === 'link' || sheet.textContent.includes('@import')
  );
  await Promise.all(
    loading.map((sheet) => new Promise((done) => sheet.addEventListener('load', done)))
  );
  return doc;
}

function filter(query) {
  const needle = String(query).trim().toLowerCase();
  return needle ? REWARDS.filter(({ label }) => label.toLowerCase().includes(needle)) : [];
}

/**
 * Foundry core's button and input rules in their own layers, then the module sheet in
 * `layer(modules)`, as Foundry loads it, so core's `button` height reaches a row as it does there.
 */
async function loadSheets() {
  const sheets = document.createElement('style');
  sheets.textContent = [
    "@import url('/tests/fixtures/foundry-core-button-min.css');",
    "@import url('/tests/fixtures/foundry-core-input-min.css');",
    "@import url('/@published-typeahead-styles/fabricate.css') layer(modules);",
  ].join('\n');
  const loaded = new Promise((done, fail) => {
    sheets.addEventListener('load', done, { once: true });
    sheets.addEventListener('error', fail, { once: true });
  });
  document.head.append(sheets);
  await loaded;
}

await loadSheets();

const calls = { change: [], free: [], query: [] };
const api = { calls };

async function open({ kind = 'app', box = {}, props = {} } = {}) {
  const frameBox = { left: 40, top: 40, width: 420, height: 160, ...box };
  const doc =
    kind === 'detached'
      ? await detachedDocument({ ...frameBox, left: 0, top: 0, width: 1280, height: 800 })
      : document;
  const target = windowIn(doc, kind, kind === 'detached' ? { ...frameBox } : frameBox);
  let query = '';
  let extra = props;
  const propsNow = () => ({
    ariaLabel: 'Find a reward',
    placeholder: 'Search rewards',
    options: filter(query),
    onChange: (value) => {
      calls.change.push(value);
    },
    onFreeText: (text) => {
      calls.free.push(text);
    },
    onQueryChange: (next) => {
      calls.query.push(next);
      query = next;
      handle.update(propsNow());
    },
    ...extra,
  });
  const handle = ui.mount('Typeahead', { target, props: propsNow() });
  api.update = (next) => {
    extra = { ...extra, ...next };
    handle.update(propsNow());
  };
  return true;
}

api.open = open;
// ratchet-exempt(lint): the Playwright suite reads the fixture's API and readiness off the page.
Object.assign(globalThis, { __typeahead: api, __typeaheadReady: true });
