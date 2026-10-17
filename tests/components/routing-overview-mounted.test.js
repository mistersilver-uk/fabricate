/**
 * `RoutingOverview` (issue 2513): the reserved marker column, the value-based select tone held off
 * read-only and disabled triggers, blocked and gap rows, the badge, the select's name and
 * description, and `onChange(key, value)`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ROUTING_OVERVIEW = 'src/ui/svelte/components/RoutingOverview.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-routing-overview-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [...SELECT_COMPILED_MODULES, ROUTING_OVERVIEW],
  componentPath: ROUTING_OVERVIEW,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const OPTIONS = [
  { value: 'g1', label: 'Fine blade' },
  { value: 'g2', label: 'Plain blade' },
];
const sourceRow = (key, extra = {}) => ({
  key,
  kind: 'source',
  source: key,
  options: OPTIONS,
  placeholder: 'Not routed',
  ...extra,
});
const ROWS = [
  sourceRow('Set A', { summary: 'Steel Ingot ×2', value: 'g1' }),
  sourceRow('Set B', { value: 'g2', fallback: true, shared: 2 }),
  sourceRow('Ruined', { tone: 'danger', value: '', hint: 'only on a forced failure' }),
  {
    key: 'Botch',
    kind: 'blocked',
    blockedReason: 'policy',
    source: 'Botch',
    tone: 'danger',
    blocked: 'routing not permitted by this system',
  },
  {
    key: 'gap:15',
    kind: 'gap',
    source: 'Gap',
    tone: 'warning',
    summary: '15 — no tier claims this value',
    action: true,
  },
];

const rowAction = createRawSnippet((row) => ({
  render: () =>
    `<button type="button" data-probe-action="${row().key}">Edit outcome tiers</button>`,
}));

async function mountOverview(props = {}) {
  const changes = [];
  const root = await harness.mount({
    label: 'Routing',
    rows: ROWS,
    rowAction,
    onChange: (key, value) => {
      changes.push([key, value]);
    },
    ...props,
  });
  const row = (key) => root.querySelector(`[data-routing-overview-row="${key}"]`);
  const trigger = (key) => row(key)?.querySelector('.fabricate-select-trigger');
  return { root, changes, row, trigger };
}

const textOf = (root, ids) =>
  String(ids || '')
    .split(' ')
    .filter(Boolean)
    .map((id) => root.querySelector(`[id="${id}"]`)?.textContent.trim() ?? `<missing ${id}>`);

describe('RoutingOverview rows', () => {
  it('names the list, stamps each row and reserves the marker column on every select row', async () => {
    const { root, row } = await mountOverview();
    const list = root.querySelector('.fabricate-routing-overview-list');
    assert.equal(list.getAttribute('aria-label'), 'Routing');
    assert.deepEqual(
      [...list.children].map((li) => [
        li.dataset.routingOverviewRow,
        li.dataset.routingOverviewKind,
        li.dataset.routingOverviewBlocked ?? null,
      ]),
      [
        ['Set A', 'source', null],
        ['Set B', 'source', null],
        ['Ruined', 'source', null],
        ['Botch', 'blocked', 'policy'],
        ['gap:15', 'gap', null],
      ]
    );
    const markers = (key) =>
      [...row(key).querySelectorAll('.fabricate-routing-overview-marker')].map(
        (m) => m.textContent
      );
    for (const key of ['Set A', 'Set B', 'Ruined', 'gap:15']) {
      assert.ok(Boolean(row(key).querySelector('.fabricate-routing-overview-markers')), key);
    }
    assert.deepEqual(markers('Set A'), []);
    assert.deepEqual(markers('Set B'), ['default', 'shared · 2']);
    assert.deepEqual(markers('Ruined'), ['only on a forced failure']);
  });

  it('draws the source as a truncated row chip titled with its name, struck when blocked', async () => {
    const { row } = await mountOverview();
    const badge = (key) => row(key).querySelector('.fabricate-routing-overview-source');
    assert.equal(badge('Set A').getAttribute('title'), 'Set A');
    assert.ok(badge('Set A').classList.contains('is-row'));
    assert.ok(!badge('Set A').classList.contains('is-struck'));
    assert.ok(badge('Botch').classList.contains('is-struck'), 'a blocked badge is struck');
    assert.ok(badge('Ruined').classList.contains('is-danger'));
  });

  it('draws a blocked row with no connector text and no select, its words in the slot', async () => {
    const { row } = await mountOverview();
    const blocked = row('Botch');
    assert.equal(blocked.querySelector('.fabricate-routing-overview-connector').textContent, '');
    assert.ok(!blocked.querySelector('.fabricate-select-trigger'), 'a blocked row has no select');
    assert.equal(
      blocked.querySelector('.fabricate-routing-overview-blocked').textContent,
      'routing not permitted by this system'
    );
    assert.equal(
      row('Set A').querySelector('.fabricate-routing-overview-connector').textContent,
      'produces'
    );
  });

  it('fills a row’s select slot with rowAction while its action is set', async () => {
    const { row } = await mountOverview();
    const gap = row('gap:15');
    assert.ok(!gap.querySelector('.fabricate-select-trigger'));
    assert.ok(
      Boolean(
        gap
          .querySelector('[data-probe-action="gap:15"]')
          ?.closest('.fabricate-routing-overview-target')
      )
    );
    assert.ok(!gap.querySelector('.fabricate-routing-overview-blocked'));
    assert.equal(gap.querySelector('.fabricate-routing-overview-connector').textContent, '');
  });
});

describe('RoutingOverview selects', () => {
  it('names a select by its badge and connector, and describes it by what holds text', async () => {
    const rows = [
      sourceRow('Set A', { summary: 'Steel Ingot ×2', value: 'g1', describedBy: 'note-1' }),
      sourceRow('Set B', { value: 'g2', fallback: true }),
      sourceRow('Set C', { value: 'g2' }),
    ];
    const { root, trigger } = await mountOverview({ rows });
    assert.deepEqual(textOf(root, trigger('Set A').getAttribute('aria-labelledby')), [
      'Set A',
      'produces',
    ]);
    const described = (key) => trigger(key).getAttribute('aria-describedby') ?? '';
    const [summaryId, ...others] = described('Set A').split(' ');
    assert.deepEqual(textOf(root, summaryId), ['Steel Ingot ×2'], 'the summary first');
    assert.deepEqual(others, ['note-1'], 'then describedBy, with no empty marker column');
    assert.deepEqual(textOf(root, described('Set B')), ['default']);
    assert.equal(
      described('Set C'),
      '',
      'an empty summary and an empty marker column describe nothing'
    );
  });

  it('tones a live select by its value: success when chosen, warning when empty unless danger', async () => {
    const { trigger } = await mountOverview();
    const tone = (key) => trigger(key).getAttribute('data-routing-overview-tone');
    assert.equal(tone('Set A'), 'success');
    assert.equal(tone('Ruined'), null, 'an empty danger row takes no warning');
    const { trigger: other } = await remountWith([sourceRow('Set Z', { value: '' })]);
    assert.equal(other('Set Z').getAttribute('data-routing-overview-tone'), 'warning');
  });

  it('stamps no tone on a read-only or a disabled select', async () => {
    const rows = [
      sourceRow('Set A', { value: 'g1', readonly: true }),
      sourceRow('Set B', { value: '', readonly: true }),
    ];
    const { trigger } = await remountWith(rows);
    assert.equal(
      trigger('Set A').getAttribute('aria-disabled'),
      'true',
      'read-only refuses to open'
    );
    for (const key of ['Set A', 'Set B']) {
      assert.equal(trigger(key).getAttribute('data-routing-overview-tone'), null, key);
    }
    const { trigger: disabledTrigger } = await remountWith(
      rows.map((row) => ({ ...row, readonly: false })),
      {
        disabled: true,
      }
    );
    for (const key of ['Set A', 'Set B']) {
      assert.ok(disabledTrigger(key).disabled, `${key} is disabled`);
      assert.equal(disabledTrigger(key).getAttribute('data-routing-overview-tone'), null, key);
    }
  });

  it('keeps the caller’s trigger hooks beside the tone', async () => {
    const rows = [sourceRow('Set A', { value: 'g1', triggerProps: { 'data-probe-route': 'a' } })];
    const { trigger } = await remountWith(rows);
    assert.equal(trigger('Set A').getAttribute('data-probe-route'), 'a');
    assert.equal(trigger('Set A').getAttribute('data-routing-overview-tone'), 'success');
  });

  it('reports a choice as onChange(key, value)', async () => {
    const { root, changes } = await mountOverview();
    chooseSelectOption(root, '[data-routing-overview-row="Set B"] .fabricate-select-trigger', 'g1');
    assert.deepEqual(changes, [['Set B', 'g1']]);
  });

  it('shows the placeholder for an empty value with no empty option', async () => {
    const { trigger } = await mountOverview();
    assert.equal(trigger('Ruined').textContent.trim(), 'Not routed');
  });
});

describe('RoutingOverview snippets and root', () => {
  it('draws the note above the list and the actions below it, and spreads rest on the root', async () => {
    const note = createRawSnippet(() => ({ render: () => '<p data-probe-note="">Heads up</p>' }));
    const actions = createRawSnippet(() => ({
      render: () => '<button type="button" data-probe-add="">Result set</button>',
    }));
    const { root } = await mountOverview({
      note,
      actions,
      class: 'probe-extra',
      'data-probe-root': 'x',
    });
    const overview = root.querySelector('.fabricate-routing-overview');
    assert.ok(overview.classList.contains('probe-extra'));
    assert.equal(overview.getAttribute('data-probe-root'), 'x');
    const order = [...overview.children].map((child) => child.tagName.toLowerCase());
    assert.deepEqual(order, ['p', 'ul', 'div']);
    assert.ok(
      Boolean(
        overview.querySelector('[data-probe-add]')?.closest('.fabricate-routing-overview-actions')
      )
    );
  });
});

/** A fresh mount over `rows`, for a case that needs a second tree. */
async function remountWith(rows, props = {}) {
  await harness.remount();
  return mountOverview({ rows, ...props });
}
