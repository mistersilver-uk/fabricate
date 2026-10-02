/**
 * Issue 2008 — a counting pool's additional-dice group, driven through its real controls in the
 * simple, routed and progressive editors. Every write is asserted on that editor's own persisted
 * evaluation, with every other key of the record and of the pool kept (AD48, AD49).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { tick } from 'svelte';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import { previewCharacter } from '../../src/ui/svelte/apps/manager/checks/checkPreview.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], en);

const PATH = 'system.resources.momentum.value';

/** A stored record off every default, so a control that drops or rewrites a key shows. */
const STORED = Object.freeze({
  enabled: false,
  source: 'path',
  path: PATH,
  readMacroUuid: 'Macro.read',
  spendMacroUuid: 'Macro.spend',
  max: 3,
  label: 'Momentum',
});

const counting = (additionalDice = STORED) =>
  normalizeCheckEvaluation({
    product: 'count',
    direction: 'under',
    pool: { die: 20, base: '2', threshold: '10', additionalDice },
  });

const base = (additionalDice) => ({
  rollFormula: '',
  checkBreakage: { triggers: [] },
  offerSituationalBonus: true,
  evaluation: counting(additionalDice),
});

const editorHarness = (name, file) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-check-additional-dice-${name}-`,
    rawModules: CHECK_EDITOR_RAW_MODULES,
    compiledModules: CHECK_EDITOR_COMPILED_MODULES,
    componentPath: `src/ui/svelte/apps/manager/checks/${file}.svelte`,
  });

const EDITORS = [
  {
    name: 'simple',
    harness: editorHarness('simple', 'SimpleCraftingCheckEditor'),
    value: (record) => ({
      ...base(record),
      dc: 12,
      thresholdMode: 'meet',
      dcMode: 'static',
      tiers: [],
      macroUuid: null,
    }),
  },
  {
    name: 'routed',
    harness: editorHarness('routed', 'CraftingCheckEditor'),
    value: (record) => ({
      ...base(record),
      type: 'relative',
      dc: 12,
      thresholdMode: 'meet',
      dcMode: 'static',
      macroUuid: null,
      tiers: [],
      relativeOutcomes: [
        { id: 'hit', name: 'Hit', success: true, breakTools: false, dc: 0, adjustment: 1 },
        { id: 'miss', name: 'Miss', success: false, breakTools: false, dc: -4, adjustment: null },
      ],
      fixedOutcomes: [],
    }),
  },
  {
    name: 'progressive',
    harness: editorHarness('progressive', 'ProgressiveCraftingCheckEditor'),
    value: (record) => ({ ...base(record), awardMode: 'equal' }),
  },
];

// Core's `foundry.utils` walks: the whole key first, then one segment at a time.
function walk(object, key) {
  if (!key || !object) return { found: false };
  if (key in object) return { found: true, value: object[key] };
  let target = object;
  for (const segment of key.split('.')) {
    if (!target || typeof target !== 'object' || !(segment in target)) return { found: false };
    target = target[segment];
  }
  return { found: true, value: target };
}

/** A Preview-as actor whose prepared data disagrees with its stored source. */
const actor = (stored, overrides = {}) => ({
  name: 'Brenna',
  _source: { system: { resources: { momentum: { value: stored } } } },
  system: { resources: { momentum: { value: 9 } } },
  overrides,
  getRollData: () => ({ resources: { momentum: { value: 9 } } }),
});

const MACROS = {
  'Macro.read': { name: 'Read Momentum', type: 'script' },
  'Macro.spend': { name: 'Spend Momentum', type: 'script' },
  'Macro.other': { name: 'Spend Focus', type: 'script' },
  'Macro.chat': { name: 'Announce', type: 'chat' },
};

const saved = {};
const notices = { warn: [], info: [], error: [] };
const copied = [];

const record = (list) => (entry) => {
  list.push(entry);
};

function installFoundryUtils() {
  saved.foundry = globalThis.foundry;
  Object.assign(globalThis, {
    foundry: {
      utils: {
        getProperty: (object, key) => walk(object, key).value,
        hasProperty: (object, key) => walk(object, key).found,
      },
    },
  });
}

function installGlobals() {
  installFoundryUtils();
  saved.fromUuid = globalThis.fromUuid;
  saved.ui = globalThis.ui;
  Object.assign(globalThis, {
    fromUuid: async (uuid) => MACROS[uuid] ?? null,
    ui: {
      notifications: Object.fromEntries(
        Object.entries(notices).map(([level, list]) => [level, record(list)])
      ),
    },
  });
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => record(copied)(text) },
  });
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
}

function restoreGlobals() {
  Object.assign(globalThis, saved);
}

/** The macro lookups and clipboard writes resolve in microtasks; `tick` flushes what they set. */
const settle = () => tick();

/** A controlled mount: every emission is fed back as the next `value`, as the route model does. */
async function mountControlled(harness, value, props = {}) {
  const state = { value };
  const root = await harness.mount({
    value,
    section: 'roll',
    ...props,
    onChange: (next) => {
      state.value = next;
    },
  });
  await settle();
  await harness.setProps({ value: state.value });
  state.root = root;
  state.act = async (fn) => {
    await fn(root);
    await settle();
    await harness.setProps({ value: state.value });
  };
  state.query = (selector) => root.querySelector(selector);
  state.text = (selector) => root.querySelector(selector)?.textContent.trim() ?? '';
  state.record = () => state.value.evaluation.pool.additionalDice;
  return state;
}

function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(Boolean(radio), `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

function type(input, text) {
  assert.ok(Boolean(input), 'the input exists');
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

function fireDrop(node, data) {
  const event = new globalThis.Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { getData: () => JSON.stringify(data) };
  node.dispatchEvent(event);
}

const adjunct = (state, which) =>
  state
    .query('[data-check-additional-dice-max]')
    .closest('.fab-stepper')
    .querySelector(`[data-stepper-${which}]`);

const withoutRecord = (pool) => ({ ...pool, additionalDice: null });

for (const editor of EDITORS) {
  describe(`the ${editor.name} editor authors additional dice on its own record (AD48, AD49)`, () => {
    before(async () => {
      await editor.harness.setup();
      installGlobals();
    });
    after(() => {
      restoreGlobals();
      editor.harness.teardown();
    });
    afterEach(() => editor.harness.remount());

    it('turns the group on and off and switches its source, keeping every key', async () => {
      const state = await mountControlled(editor.harness, editor.value());
      const pool = state.value.evaluation.pool;
      const toggle = () => state.query('[data-check-additional-dice]');
      assert.equal(toggle().getAttribute('aria-pressed'), 'false');
      assert.ok(!toggle().hasAttribute('aria-controls'), 'nothing to control while off');
      assert.ok(!state.query('[data-check-additional-dice-fields]'), 'no nested region while off');
      assert.ok(
        Boolean(
          state.query('[data-check-additional-dice-group] > .fab-well [data-check-additional-dice]')
        ),
        'the group draws its frame through the shared well, toggle at its head'
      );

      await state.act(() => toggle().click());
      assert.deepEqual(state.record(), { ...STORED, enabled: true });
      assert.deepEqual(withoutRecord(state.value.evaluation.pool), withoutRecord(pool));
      const region = state.query('[data-check-additional-dice-fields]');
      assert.ok(Boolean(region), 'the nested region renders once on');
      assert.equal(toggle().getAttribute('aria-controls'), region.id);

      await state.act((root) => choose(root, 'data-check-additional-dice-source-option', 'macro'));
      assert.deepEqual(state.record(), { ...STORED, enabled: true, source: 'macro' });
      assert.ok(
        !state.query('[data-check-additional-dice-path]'),
        'the path leaves with its source'
      );
      assert.ok(Boolean(state.query('[data-check-additional-dice-read-macro]')));
      assert.ok(Boolean(state.query('[data-check-additional-dice-spend-macro]')));

      await state.act((root) => choose(root, 'data-check-additional-dice-source-option', 'path'));
      assert.equal(state.query('[data-check-additional-dice-path]').value, PATH);

      await state.act(() => toggle().click());
      assert.deepEqual(state.record(), STORED, 'toggling off clears nothing');
      assert.ok(!state.query('[data-check-additional-dice-fields]'));
    });
  });
}

describe('the additional-dice group reads, writes and links what pays for the dice', () => {
  const [simple] = EDITORS;
  const enabled = (overrides = {}) => simple.value({ ...STORED, enabled: true, ...overrides });
  const line = (state) => state.query('[data-check-additional-dice-path-line]');

  before(async () => {
    await simple.harness.setup();
    installGlobals();
  });
  after(() => {
    restoreGlobals();
    simple.harness.teardown();
  });
  afterEach(() => {
    simple.harness.remount();
    for (const list of [...Object.values(notices), copied]) list.length = 0;
  });

  it('reads the stored path for the Preview-as character, never its prepared data', async () => {
    const cases = [
      [null, 'muted', 'Choose a character in Preview as to see what this resolves to.'],
      [actor(2), 'resolved', 'Brenna → 2'],
      [
        actor(undefined),
        'warning',
        `Brenna has no number at ${PATH}, so they could not buy additional dice.`,
      ],
      [
        actor('3'),
        'warning',
        `Brenna has no number at ${PATH}, so they could not buy additional dice.`,
      ],
      [
        actor(2, { system: { resources: { momentum: { value: 2 } } } }),
        'warning',
        `An active effect changes Brenna's ${PATH}, so spending it would not lower it. Use a stored value.`,
      ],
    ];
    for (const [document, tone, sentence] of cases) {
      simple.harness.remount();
      const state = await mountControlled(simple.harness, enabled(), {
        previewCharacter: previewCharacter(document),
      });
      const input = state.query('[data-check-additional-dice-path]');
      assert.equal(line(state).getAttribute('data-check-additional-dice-path-line'), tone);
      assert.equal(line(state).textContent.trim(), sentence);
      assert.equal(input.getAttribute('aria-describedby'), line(state).id);
      assert.equal(input.getAttribute('aria-invalid'), tone === 'warning' ? 'true' : 'false');
      assert.equal(input.getAttribute('aria-label'), 'Path on the crafting character');
    }
  });

  it('writes the path, and an empty one is the danger line', async () => {
    const state = await mountControlled(simple.harness, enabled(), {
      previewCharacter: previewCharacter(actor(2)),
    });
    await state.act((root) => type(root.querySelector('[data-check-additional-dice-path]'), ''));
    assert.deepEqual(state.record(), { ...STORED, enabled: true, path: '' });
    assert.equal(line(state).getAttribute('data-check-additional-dice-path-line'), 'danger');
    assert.equal(
      line(state).textContent.trim(),
      'No source set. Players cannot be offered additional dice until one is.'
    );
    assert.equal(
      state.query('[data-check-additional-dice-path]').getAttribute('aria-invalid'),
      'true'
    );

    await state.act((root) =>
      type(root.querySelector('[data-check-additional-dice-path]'), 'system.attributes.ap')
    );
    assert.deepEqual(state.record(), { ...STORED, enabled: true, path: 'system.attributes.ap' });
  });

  it('writes the Resource name and the most dice per roll, one key at a time', async () => {
    const state = await mountControlled(simple.harness, enabled());
    const name = state.query('[data-check-additional-dice-label]');
    assert.equal(name.value, 'Momentum');
    assert.equal(
      state.query(`[id="${name.getAttribute('aria-describedby')}"]`).textContent.trim(),
      'What players see this resource called. Leave it blank to show the amount alone.'
    );
    await state.act(() => type(name, 'Action points'));
    assert.deepEqual(state.record(), { ...STORED, enabled: true, label: 'Action points' });

    const max = state.query('[data-check-additional-dice-max]');
    assert.equal(max.value, '3');
    assert.equal(max.getAttribute('aria-label'), 'Most additional dice per roll');
    assert.equal(
      adjunct(state, 'increment').getAttribute('aria-label'),
      'Increase most additional dice'
    );
    assert.equal(
      adjunct(state, 'decrement').getAttribute('aria-label'),
      'Decrease most additional dice'
    );
    await state.act(() => adjunct(state, 'increment').click());
    assert.deepEqual(state.record(), { ...STORED, enabled: true, label: 'Action points', max: 4 });
  });

  it('links, refuses, unlinks and copies the read and spend macros', async () => {
    const state = await mountControlled(
      simple.harness,
      enabled({ source: 'macro', spendMacroUuid: 'Macro.gone' })
    );
    const zone = (slot) => state.query(`[data-check-additional-dice-${slot}-macro]`);
    assert.equal(zone('read').querySelector('strong').textContent.trim(), 'Read Momentum');
    assert.equal(
      zone('read').querySelector('[data-item-drop-zone-uuid]').textContent,
      'Macro.read'
    );
    assert.equal(zone('spend').getAttribute('data-item-drop-state'), 'missing');
    assert.equal(
      zone('read').closest('[data-validation-target]').getAttribute('data-validation-target'),
      'checks-additional-dice-read-macro'
    );

    await state.act(() => fireDrop(zone('spend'), { type: 'Macro', uuid: 'Macro.chat' }));
    assert.equal(state.record().spendMacroUuid, 'Macro.gone', 'a chat macro is refused');
    assert.deepEqual(notices.warn, [
      'That macro is not a script macro, so Fabricate cannot run it. Change its type to Script and drop it again.',
    ]);

    await state.act(() => fireDrop(zone('spend'), { type: 'Macro', uuid: 'Macro.other' }));
    assert.deepEqual(state.record(), {
      ...STORED,
      enabled: true,
      source: 'macro',
      spendMacroUuid: 'Macro.other',
    });

    await state.act(() =>
      zone('spend').querySelector('[aria-label="Copy spend macro uuid"]').click()
    );
    assert.deepEqual(copied, ['Macro.other']);
    assert.deepEqual(notices.info, ['Copied the macro UUID.']);

    await state.act(() => zone('read').querySelector('[aria-label="Unlink read macro"]').click());
    assert.equal(state.record().readMacroUuid, '');
    assert.equal(zone('read').querySelector('strong').textContent.trim(), 'Drop a macro here');
    assert.equal(
      zone('read').querySelector('small').textContent.trim(),
      'Returns what the character can spend'
    );
  });
});

describe('previewCharacter', () => {
  before(installFoundryUtils);
  after(() => Object.assign(globalThis, { foundry: saved.foundry }));

  it('answers null for no actor and reads a stored path from the source document', () => {
    assert.equal(previewCharacter(null), null);
    const character = previewCharacter(
      actor(2, { system: { resources: { momentum: { value: 5 } } } })
    );
    assert.equal(character.name, 'Brenna');
    assert.deepEqual(character.rollData, { resources: { momentum: { value: 9 } } });
    assert.deepEqual(character.readStored(PATH), { value: 2, overridden: true });
    assert.deepEqual(previewCharacter(actor(2)).readStored(PATH), { value: 2, overridden: false });
  });
});
