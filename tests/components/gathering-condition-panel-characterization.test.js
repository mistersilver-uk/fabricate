/**
 * The Gathering Settings tab's two condition panels, Times of day and Weather conditions, as a GM
 * drives them: the toggle, the current-value select, the add form, the value pills, and the add
 * forms a crafting-system switch clears (issue 2431).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';

import { chooseSelectOption } from '../helpers/select-control.js';

import { disposeManagerSuite, managerComponent } from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte';

const conditions = (timeOfDayValues = 3) => ({
  timeOfDay: {
    enabled: true,
    current: 'day',
    values: [
      { id: 'dawn', label: 'Dawn', icon: 'fas fa-cloud-sun' },
      { id: 'day', label: 'Day', icon: 'fas fa-sun' },
      { id: 'night', label: 'Night', icon: 'fas fa-moon' },
    ].slice(0, timeOfDayValues),
  },
  weather: {
    enabled: true,
    current: 'clear',
    values: [
      { id: 'clear', label: 'Clear', icon: 'fas fa-sun' },
      { id: 'rain', label: 'Rain', icon: 'fas fa-cloud-rain' },
    ],
  },
});

let View;
let mounted;
let target;
let calls;

function mountSettings({ selectedSystemId = 'alchemy', timeOfDayValues = 3 } = {}) {
  calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
    };
  const props = {
    activeGatheringTab: 'settings',
    selectedSystemId,
    gatheringConfig: {
      systems: {
        alchemy: { conditions: conditions(timeOfDayValues) },
        tidewrack: { conditions: conditions(timeOfDayValues) },
      },
    },
    onUpdateGatheringConditions: record('current'),
    onToggleGatheringConditionEnabled: record('toggle'),
    onAddGatheringConditionValue: record('add'),
    onUpdateGatheringConditionValue: record('update'),
    onDeleteGatheringConditionValue: record('delete'),
  };
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = createClassComponent({ component: View, target, props });
  flushSync();
  return mounted;
}

const panel = (kind) => target.querySelector(`[data-gathering-condition-panel="${kind}"]`);
const addInput = (kind) =>
  panel(kind).querySelector(':scope .manager-condition-add input[placeholder]');
const addIcon = (kind) =>
  panel(kind)
    .querySelector(':scope .manager-condition-add .essence-icon-picker-preview i')
    .getAttribute('class');

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

async function pickAnotherAddIcon(kind) {
  const before = addIcon(kind);
  panel(kind).querySelector(':scope .manager-condition-add .essence-icon-picker-trigger').click();
  flushSync();
  await tick();
  const option = [...document.querySelectorAll('.essence-icon-picker-option')].find(
    (row) => row.querySelector('i')?.getAttribute('class') !== before
  );
  assert.ok(Boolean(option), `the ${kind} add icon picker offers another icon`);
  option.click();
  flushSync();
  await tick();
  assert.notEqual(addIcon(kind), before, `the ${kind} add icon changed`);
}

describe('the Gathering Settings condition panels (issue 2431 characterization)', () => {
  before(async () => {
    View = await managerComponent(VIEW);
  });

  afterEach(async () => {
    mounted?.$destroy();
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((settled) => setImmediate(settled));
  });

  after(disposeManagerSuite);

  it('renders the time-of-day panel before the weather panel, each named by its title', () => {
    mountSettings();
    const panels = [...target.querySelectorAll('[data-gathering-condition-panel]')];
    assert.deepEqual(
      panels.map((node) => [node.dataset.gatheringConditionPanel, node.getAttribute('aria-label')]),
      [
        ['timeOfDay', 'Times of day'],
        ['weather', 'Weather conditions'],
      ]
    );
  });

  for (const kind of ['timeOfDay', 'weather']) {
    it(`toggles ${kind} matching for the selected system`, () => {
      mountSettings();
      panel(kind).querySelector(':scope .manager-condition-panel-header button').click();
      flushSync();
      assert.deepEqual(calls, [['toggle', kind, false, 'alchemy']]);
    });

    it(`sets the current ${kind} value through its select`, async () => {
      mountSettings();
      const trigger = `[data-gathering-condition-panel="${kind}"] .manager-condition-current .fabricate-select-trigger`;
      const value = kind === 'timeOfDay' ? 'night' : 'rain';
      chooseSelectOption(target, trigger, value);
      await tick();
      assert.deepEqual(calls, [['current', { [kind]: value, systemId: 'alchemy' }]]);
    });

    it(`adds a ${kind} value with its label and icon, then clears the name`, () => {
      mountSettings();
      type(addInput(kind), '  Ashfall  ');
      panel(kind)
        .querySelector('.manager-condition-add')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      flushSync();
      assert.equal(calls.length, 1);
      const [name, addedKind, payload, systemId] = calls[0];
      assert.deepEqual([name, addedKind, systemId], ['add', kind, 'alchemy']);
      assert.equal(payload.label, 'Ashfall');
      assert.equal(payload.icon, kind === 'timeOfDay' ? 'fas fa-clock' : 'fas fa-cloud-sun');
      assert.equal(addInput(kind).value, '');
    });

    it(`adds nothing for a blank ${kind} name`, () => {
      mountSettings();
      type(addInput(kind), ' '.repeat(3));
      panel(kind)
        .querySelector('.manager-condition-add')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      flushSync();
      assert.deepEqual(calls, []);
    });

    it(`relabels and removes a ${kind} pill by its id`, () => {
      mountSettings();
      const id = kind === 'timeOfDay' ? 'dawn' : 'rain';
      const pill = panel(kind).querySelector(`[data-gathering-condition-value="${id}"]`);
      const label = pill.querySelector('.manager-condition-label-input');
      label.value = 'Renamed';
      label.dispatchEvent(new Event('blur'));
      pill.querySelector('.manager-condition-remove').click();
      flushSync();
      assert.deepEqual(calls, [
        ['update', kind, id, { label: 'Renamed' }, 'alchemy'],
        ['delete', kind, id, 'alchemy'],
      ]);
    });
  }

  it('keeps the last enabled time of day from being removed', () => {
    mountSettings({ timeOfDayValues: 1 });
    const remove = panel('timeOfDay').querySelector('.manager-condition-remove');
    assert.equal(remove.disabled, true);
    assert.equal(remove.getAttribute('aria-label'), 'Remove Dawn');
  });

  it('clears both add forms, name and icon, when the crafting system switches', async () => {
    const view = mountSettings();
    for (const kind of ['timeOfDay', 'weather']) {
      type(addInput(kind), `Half-typed ${kind}`);
      await pickAnotherAddIcon(kind);
    }

    view.$set({ selectedSystemId: 'tidewrack' });
    flushSync();
    await tick();

    for (const kind of ['timeOfDay', 'weather']) {
      assert.equal(addInput(kind).value, '', `${kind}: the half-typed name is cleared`);
    }
    assert.equal(addIcon('timeOfDay'), 'fas fa-clock');
    assert.equal(addIcon('weather'), 'fas fa-cloud-sun');
  });
});
