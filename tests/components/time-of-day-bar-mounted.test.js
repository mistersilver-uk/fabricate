/**
 * The Times of day panel's time-of-day bar, start-hour steppers and rail, mounted (issue 2431):
 * the edge-case matrix the pure model cannot reach, through the controls a GM operates.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';

import { fill } from '../../src/utils/fillPlaceholders.js';
import { identityLocalize, shippedString } from '../helpers/manager/managerLocalization.js';

import { disposeManagerSuite, managerComponent } from './manager-mounted-shared.js';

const PANEL = 'src/ui/svelte/apps/manager/environment/GatheringConditionPanel.svelte';
const VIEW = 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte';

const DEFAULTS = [
  { id: 'dawn', label: 'Dawn', icon: 'fas fa-cloud-sun' },
  { id: 'day', label: 'Day', icon: 'fas fa-sun' },
  { id: 'dusk', label: 'Dusk', icon: 'fas fa-cloud-moon' },
  { id: 'night', label: 'Night', icon: 'fas fa-moon' },
];
const WEATHER = [
  { id: 'clear', label: 'Clear', icon: 'fas fa-sun' },
  { id: 'rain', label: 'Rain', icon: 'fas fa-cloud-rain' },
];

let Panel;
let View;
let mounted;
let target;
let calls;
let hooks;

/** A `Hooks` double with `on`/`off`, so `subscribeWorldTime` has a bus to register on. */
function installHooks() {
  const handlers = new Map();
  let next = 0;
  hooks = {
    on(name, handler) {
      next += 1;
      handlers.set(next, { name, handler });
      return next;
    },
    off(name, id) {
      handlers.delete(id);
    },
    fire(name) {
      for (const entry of handlers.values()) if (entry.name === name) entry.handler();
    },
    count: (name) => [...handlers.values()].filter((entry) => entry.name === name).length,
  };
  Object.assign(globalThis, { Hooks: hooks });
}

const recorder =
  (name) =>
  (...args) => {
    calls.push([name, ...args]);
  };

function mountPanel({
  kind = 'timeOfDay',
  values = DEFAULTS,
  current = 'day',
  services = undefined,
  ...rest
} = {}) {
  calls = [];
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = createClassComponent({
    component: Panel,
    target,
    props: {
      kind,
      icon: kind === 'timeOfDay' ? 'fas fa-clock' : 'fas fa-cloud-sun',
      setting: { enabled: true, current, values },
      selectedSystemId: 'alchemy',
      services,
      onUpdateGatheringConditions: recorder('current'),
      onAddGatheringConditionValue: recorder('add'),
      onUpdateGatheringConditionValue: recorder('update'),
      ...rest,
    },
  });
  flushSync();
  return mounted;
}

/** The whole Environments view on its settings tab, so the panel gets the view's own props. */
function mountView({ services = null, systems = ['alchemy'] } = {}) {
  calls = [];
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  const conditions = { timeOfDay: { enabled: true, current: 'day', values: DEFAULTS } };
  mounted = createClassComponent({
    component: View,
    target,
    props: {
      activeGatheringTab: 'settings',
      selectedSystemId: systems[0],
      services,
      gatheringConfig: {
        systems: Object.fromEntries(systems.map((id) => [id, { conditions }])),
      },
    },
  });
  flushSync();
  return mounted;
}

const q = (selector) => target.querySelector(selector);
const qa = (selector) => [...target.querySelectorAll(selector)];
const bar = () => q('[data-time-of-day-bar]');
const handle = (name) =>
  qa('[data-band-strip-handle]').find(
    (node) => node.getAttribute('aria-label') === `Start of ${name}`
  );
const dot = () => q('[data-band-strip-marker="current"]');
const described = () => qa('[data-band-strip-band-list] li').map((node) => node.textContent.trim());
const addStepper = () => q('.manager-time-of-day-add [role="spinbutton"]');
const addName = () => q('.manager-time-of-day-add input[placeholder]');
const pillStepper = (id) => q(`[data-gathering-condition-value="${id}"] [role="spinbutton"]`);

function key(node, name) {
  node.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  flushSync();
}

function clearAddStepper() {
  addStepper().value = '';
  addStepper().dispatchEvent(new Event('blur'));
  flushSync();
}

function submitAdd() {
  q('.manager-condition-add').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  );
  flushSync();
}

/** A 240px track, so each of the default day's 24 hours is 10px wide from Dawn's 04:00. */
function stubTrack() {
  q('[data-band-strip-track]').getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 240,
    height: 46,
    right: 240,
    bottom: 46,
  });
}

/** One pointer event of `type` at `clientX` on `node`, flushed. */
function pointer(node, type, clientX) {
  node.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
  flushSync();
}

const clockAt = (hour, minute) => ({
  getWorldTimeComponents: () => ({ day: 3, hour, minute, hoursPerDay: 24, minutesPerHour: 60 }),
});

describe('the time-of-day bar in Gathering Settings (issue 2431)', () => {
  before(async () => {
    Panel = await managerComponent(PANEL);
    View = await managerComponent(VIEW);
    globalThis.game.i18n.localize = shippedString;
    globalThis.game.i18n.format = (name, data) => fill(shippedString(name), data);
  });

  afterEach(async () => {
    mounted?.$destroy();
    mounted = null;
    target?.remove();
    target = null;
    delete globalThis.Hooks;
    await new Promise((settled) => setImmediate(settled));
  });

  after(() => {
    globalThis.game.i18n.localize = identityLocalize;
    globalThis.game.i18n.format = (name) => name;
    disposeManagerSuite();
  });

  it('draws the bar between the hint and the current select, with each period`s hours inside it', () => {
    mountPanel({ services: clockAt(14, 34) });
    const children = [...q('[data-gathering-condition-panel="timeOfDay"]').children];
    const order = (node) => children.indexOf(node.closest('[data-gathering-condition-panel] > *'));
    assert.ok(Boolean(bar()), 'the bar renders');
    assert.ok(order(q('.manager-condition-panel-hint')) < order(bar()));
    assert.ok(order(bar()) < order(q('.manager-condition-current')));
    assert.deepEqual(
      qa('[data-band-strip-band]').map((band) => [
        band.querySelector('.fab-band-strip-band-name').textContent.trim(),
        band.querySelector('[data-band-strip-range]').textContent.trim(),
      ]),
      [
        ['Dawn', '04–08'],
        ['Day', '08–17'],
        ['Dusk', '17–21'],
        ['Night', '21–04'],
      ]
    );
    assert.equal(
      q('[data-band-strip-track]').getAttribute('aria-label'),
      'Times of day across one day'
    );
    assert.ok(described().includes('World clock: 14:34'));
    assert.equal(
      qa('[data-band-strip-handle]').length,
      3,
      'the first period`s start has no handle'
    );
    assert.equal(handle('Day').getAttribute('aria-valuetext'), '08:00');
    assert.equal(dot().getAttribute('aria-label'), 'Current time of day');
    assert.equal(dot().getAttribute('aria-valuetext'), 'Day');
    assert.ok(!q('.fab-band-strip-ticks'), 'no tick row');
  });

  it('draws no bar or stepper on the weather panel, whose add forwards exactly label and icon (l)', () => {
    mountPanel({ kind: 'weather', values: WEATHER, current: 'clear' });
    assert.ok(!bar() && !q('[data-band-strip-track]'));
    assert.ok(!q('[role="spinbutton"]'));
    assert.ok(!q('.manager-time-of-day-add'));
    const name = q('.manager-condition-add input[placeholder]');
    name.value = 'Ashfall';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    submitAdd();
    assert.deepEqual(calls, [
      ['add', 'weather', { label: 'Ashfall', icon: 'fas fa-cloud-sun' }, 'alchemy'],
    ]);
  });

  it('gives every pill a Starts at stepper, resolved on read and written as a start hour', () => {
    mountPanel();
    assert.equal(pillStepper('dusk').getAttribute('aria-label'), 'Start hour of Dusk');
    assert.equal(pillStepper('dusk').value, '17:00');
    assert.equal(pillStepper('dusk').getAttribute('aria-valuemax'), '23');
    key(pillStepper('dusk'), 'ArrowUp');
    assert.deepEqual(calls, [['update', 'timeOfDay', 'dusk', { startHour: 18 }, 'alchemy']]);
  });

  it('shows a custom period with no hour as unset, and clears an hour to unset', () => {
    mountPanel({ values: [...DEFAULTS, { id: 'vigil', label: 'Vigil' }] });
    assert.equal(pillStepper('vigil').value, '');
    assert.equal(pillStepper('vigil').getAttribute('placeholder'), '--:--');
    pillStepper('dawn').value = '';
    pillStepper('dawn').dispatchEvent(new Event('blur'));
    flushSync();
    assert.deepEqual(calls, [['update', 'timeOfDay', 'dawn', { startHour: null }, 'alchemy']]);
  });

  it('seeds a plain add with the longest period`s midpoint and resets it after the submit', () => {
    mountPanel();
    assert.equal(addStepper().getAttribute('aria-label'), 'Starts at');
    assert.equal(addStepper().getAttribute('aria-valuenow'), '12');
    key(addStepper(), 'ArrowUp');
    assert.equal(addStepper().getAttribute('aria-valuenow'), '13');
    addName().value = 'Noon';
    addName().dispatchEvent(new Event('input', { bubbles: true }));
    submitAdd();
    assert.deepEqual(calls, [
      ['add', 'timeOfDay', { label: 'Noon', icon: 'fas fa-clock', startHour: 13 }, 'alchemy'],
    ]);
    assert.equal(addStepper().getAttribute('aria-valuenow'), '12', 'reset to the default');
  });

  it('seeds the add form from the rail, focusing its name and creating nothing (f)', () => {
    mountPanel();
    const night = q('[data-band-strip-add="night"]');
    assert.equal(night.getAttribute('aria-label'), 'Add a time of day at 00:00, within Night');
    night.click();
    flushSync();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '0');
    assert.ok(document.activeElement === addName(), 'the name field takes focus');
    assert.deepEqual(calls, [], 'the rail never adds');
    q('[data-band-strip-add="day"]').click();
    flushSync();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '12');
    assert.equal(q('[data-band-strip-rail]').getAttribute('aria-label'), 'Add a time of day');
  });

  it('writes a keyed divider as the start hour of the period beginning there (e)', () => {
    mountPanel();
    key(handle('Day'), 'ArrowRight');
    key(handle('Night'), 'End');
    assert.deepEqual(calls, [
      ['update', 'timeOfDay', 'day', { startHour: 9 }, 'alchemy'],
      ['update', 'timeOfDay', 'night', { startHour: 3 }, 'alchemy'],
    ]);
  });

  it('writes the right ids once a stepper has moved a period past its neighbour (g)', () => {
    mountPanel({
      values: [DEFAULTS[0], { ...DEFAULTS[1], startHour: 22 }, DEFAULTS[2], DEFAULTS[3]],
    });
    assert.deepEqual(
      qa('[data-band-strip-band]').map((band) => band.dataset.bandStripBand),
      ['dawn', 'dusk', 'night', 'day']
    );
    key(handle('Night'), 'ArrowLeft');
    key(handle('Day'), 'ArrowLeft');
    assert.deepEqual(calls, [
      ['update', 'timeOfDay', 'night', { startHour: 20 }, 'alchemy'],
      ['update', 'timeOfDay', 'day', { startHour: 21 }, 'alchemy'],
    ]);
  });

  it('persists a multi-step drag once, at the drop, against a deferred store', async () => {
    mountPanel();
    stubTrack();
    const divider = handle('Day');
    pointer(divider, 'pointerdown', 40);
    pointer(divider, 'pointermove', 60);
    pointer(divider, 'pointermove', 70);
    assert.deepEqual(calls, [], 'a drag writes nothing');
    assert.equal(handle('Day').getAttribute('aria-valuenow'), '11', 'but draws its draft');
    pointer(divider, 'pointerup', 70);
    await tick();
    assert.deepEqual(calls, [['update', 'timeOfDay', 'day', { startHour: 11 }, 'alchemy']]);
  });

  it('writes nothing for a divider dragged back to where it started', () => {
    mountPanel();
    stubTrack();
    const divider = handle('Day');
    pointer(divider, 'pointerdown', 40);
    pointer(divider, 'pointermove', 50);
    pointer(divider, 'pointermove', 40);
    pointer(divider, 'pointerup', 40);
    assert.deepEqual(calls, [], 'Day still starts at its resolved 08:00');
  });

  it('persists a quick keyed reversal of a divider against a deferred store', () => {
    mountPanel();
    key(handle('Day'), 'ArrowRight');
    key(handle('Day'), 'ArrowLeft');
    assert.deepEqual(calls, [
      ['update', 'timeOfDay', 'day', { startHour: 9 }, 'alchemy'],
      ['update', 'timeOfDay', 'day', { startHour: 8 }, 'alchemy'],
    ]);
  });

  it('moves the current marker two bands on two quick keypresses against a deferred store', () => {
    mountPanel();
    key(dot(), 'ArrowRight');
    key(dot(), 'ArrowRight');
    assert.deepEqual(calls, [
      ['current', { timeOfDay: 'dusk', systemId: 'alchemy' }],
      ['current', { timeOfDay: 'night', systemId: 'alchemy' }],
    ]);
    assert.equal(dot().getAttribute('aria-valuetext'), 'Night');
  });

  it('persists a quick reversal of the current marker against a deferred store', () => {
    mountPanel();
    key(dot(), 'ArrowRight');
    key(dot(), 'ArrowLeft');
    assert.deepEqual(calls, [
      ['current', { timeOfDay: 'dusk', systemId: 'alchemy' }],
      ['current', { timeOfDay: 'day', systemId: 'alchemy' }],
    ]);
    assert.equal(dot().getAttribute('aria-valuetext'), 'Day');
  });

  it('draws no current marker for a current id that is not a value (i)', () => {
    mountPanel({ current: 'noon' });
    assert.ok(Boolean(bar()));
    assert.ok(!dot());
  });

  for (const [label, services] of [
    ['no services', null],
    ['no clock method', {}],
    ['a null reading', { getWorldTimeComponents: () => null }],
  ]) {
    it(`draws no clock line with ${label} (j)`, () => {
      mountPanel({ services });
      assert.ok(Boolean(bar()));
      assert.ok(!q('[data-band-strip-marker-line]'));
      assert.ok(described().every((line) => !line.startsWith('World clock')));
    });
  }

  it('moves the clock on updateWorldTime and unsubscribes on unmount (k)', () => {
    installHooks();
    let minute = 34;
    mountPanel({
      services: {
        getWorldTimeComponents: () => ({
          day: 3,
          hour: 14,
          minute,
          hoursPerDay: 24,
          minutesPerHour: 60,
        }),
      },
    });
    assert.equal(hooks.count('updateWorldTime'), 1);
    minute = 50;
    hooks.fire('updateWorldTime');
    flushSync();
    assert.ok(described().includes('World clock: 14:50'));
    mounted.$destroy();
    mounted = null;
    assert.equal(hooks.count('updateWorldTime'), 0);
  });

  it('replaces the bar with a note naming the periods to fix when the hours do not tile (a)', () => {
    mountPanel({ values: [...DEFAULTS.slice(0, 3), { ...DEFAULTS[3], startHour: 8 }] });
    assert.ok(!bar());
    const note = q('[data-time-of-day-fallback]');
    assert.ok(Boolean(note));
    assert.equal(
      note.textContent.trim(),
      'Give every time of day its own start hour below 24 to see the time-of-day bar. Check: Day and Night.'
    );
    assert.equal(addStepper().value, '', 'with no tiling the add form starts empty');
    key(addStepper(), 'ArrowUp');
    assert.notEqual(addStepper().value, '', 'the arrow sets an hour');
    clearAddStepper();
    addName().value = 'Vigil';
    addName().dispatchEvent(new Event('input', { bubbles: true }));
    submitAdd();
    assert.deepEqual(calls, [
      ['add', 'timeOfDay', { label: 'Vigil', icon: 'fas fa-clock', startHour: null }, 'alchemy'],
    ]);
  });

  it('drops a cleared add hour once the day tiles again', () => {
    const panel = mountPanel({ values: [...DEFAULTS.slice(0, 3), { ...DEFAULTS[3], startHour: 8 }] });
    key(addStepper(), 'ArrowUp');
    clearAddStepper();
    panel.$set({ setting: { enabled: true, current: 'day', values: DEFAULTS } });
    flushSync();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '12', 'the longest period`s midpoint');
    addName().value = 'Noon';
    addName().dispatchEvent(new Event('input', { bubbles: true }));
    submitAdd();
    assert.deepEqual(calls, [
      ['add', 'timeOfDay', { label: 'Noon', icon: 'fas fa-clock', startHour: 12 }, 'alchemy'],
    ]);
  });

  it('falls back on a short calendar day without writing anything (c)', () => {
    mountPanel({
      services: {
        getWorldTimeComponents: () => ({ hour: 3, minute: 0, hoursPerDay: 10, minutesPerHour: 60 }),
      },
    });
    assert.ok(Boolean(q('[data-time-of-day-fallback]')));
    assert.equal(pillStepper('dawn').getAttribute('aria-valuemax'), '9');
    assert.deepEqual(calls, []);
  });

  it('draws nothing for no periods, and one band with no dividers for one (o)', () => {
    mountPanel({ values: [], current: '' });
    assert.ok(!bar() && !q('[data-time-of-day-fallback]'));
    mounted.$destroy();
    target.remove();
    mountPanel({ values: [DEFAULTS[1]] });
    assert.equal(qa('[data-band-strip-handle]').length, 0);
    assert.equal(dot().getAttribute('aria-valuemin'), '1');
    assert.equal(dot().getAttribute('aria-valuemax'), '1');
    q('[data-band-strip-add="day"]').click();
    flushSync();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '20');
  });

  it('re-anchors the axis when the first period is deleted (h)', () => {
    const panel = mountPanel();
    panel.$set({ setting: { enabled: true, current: 'day', values: DEFAULTS.slice(1) } });
    flushSync();
    assert.deepEqual(
      qa('[data-band-strip-band]').map((band) => band.dataset.bandStripBand),
      ['day', 'dusk', 'night']
    );
    assert.equal(
      q('[data-band-strip-band="night"] [data-band-strip-range]').textContent.trim(),
      '21–08'
    );
  });

  it('keeps a long label and its hours inside a four-hour band (n)', () => {
    mountPanel({
      values: [
        { ...DEFAULTS[0], label: 'The Long Grey Hour Before the Bells' },
        ...DEFAULTS.slice(1),
      ],
    });
    const dawn = q('[data-band-strip-band="dawn"]');
    assert.equal(
      dawn.querySelector('.fab-band-strip-band-name').textContent.trim(),
      'The Long Grey Hour Before the Bells'
    );
    assert.equal(dawn.querySelector('[data-band-strip-range]').textContent.trim(), '04–08');
  });

  it('clears a rail seed with the half-typed name when the crafting system switches (m)', async () => {
    mountView({ services: clockAt(14, 34), systems: ['alchemy', 'tidewrack'] });
    assert.ok(Boolean(q('[data-band-strip-marker-line="clock"]')), 'the view passes its services');
    q('[data-band-strip-add="night"]').click();
    flushSync();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '0');
    mounted.$set({ selectedSystemId: 'tidewrack' });
    flushSync();
    await tick();
    assert.equal(addStepper().getAttribute('aria-valuenow'), '12');
  });

  it('draws the world clock through the view`s own services', () => {
    mountView({ services: clockAt(14, 34) });
    assert.ok(Boolean(q('[data-time-of-day-bar] [data-band-strip-marker-line="clock"]')));
    assert.ok(described().includes('World clock: 14:34'));
  });

  it('reads the day length through the view`s own services, falling back on a short day', () => {
    mountView({
      services: {
        getWorldTimeComponents: () => ({ hour: 3, minute: 0, hoursPerDay: 10, minutesPerHour: 60 }),
      },
    });
    assert.ok(!bar());
    assert.ok(Boolean(q('[data-time-of-day-fallback]')));
  });
});
