/** `RuleRow` and `RuleSentence`: one condition → effect rule and its restatement (issue 1782). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet, flushSync } from 'svelte';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const RAW_MODULES = [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES];

const sentenceHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-rule-sentence-',
  rawModules: RAW_MODULES,
  compiledModules: [component('RuleSentence')],
  componentPath: component('RuleSentence'),
});
const rowHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-rule-row-',
  rawModules: RAW_MODULES,
  compiledModules: [
    component('Button'),
    component('IconButton'),
    component('RuleSentence'),
    component('RuleRow'),
  ],
  componentPath: component('RuleRow'),
});
const harnesses = [sentenceHarness, rowHarness];

/** A translator's table: the mid-sentence key is lower case and the proper noun is not. */
const KEYS = {
  'T.Frame': 'When {condition}, {clauses}.',
  'T.Join': ', then ',
  'T.Condition': 'Roll total is {comparison} {value}',
  'T.ConditionInSentence': 'roll total is {comparison} {value}',
  'T.AtMost': 'at most',
  'T.StepUp': 'the result steps up {steps} tier(s)',
  'T.Becomes': 'the result becomes {tier}',
  'T.Ruined': 'Ruined',
  'FABRICATE.Common.RuleSentence.Missing': 'This rule is not finished.',
  'T.Unfinished': 'This trigger is not finished.',
};

const SENTENCE = {
  frameKey: 'T.Frame',
  clauseKeys: ['T.StepUp', 'T.Becomes'],
  joinKey: 'T.Join',
  params: {
    'T.Frame': {
      condition: {
        key: 'T.ConditionInSentence',
        params: { comparison: { key: 'T.AtMost' }, value: 5 },
      },
    },
    'T.StepUp': { steps: 2 },
    'T.Becomes': { tier: { key: 'T.Ruined' } },
  },
};
const STATED =
  'When roll total is at most 5, the result steps up 2 tier(s), then the result becomes Ruined.';

before(async () => {
  for (const harness of harnesses) await harness.setup();
  globalThis.game.i18n.localize = (key) => KEYS[key] ?? key;
});
afterEach(() => {
  for (const harness of harnesses) harness.remount();
});
after(() => {
  for (const harness of harnesses) harness.teardown();
});

describe('RuleSentence (mounted)', () => {
  it('fills the frame with its clauses, joined by the join key, every fragment from its own key', async () => {
    const root = await sentenceHarness.mount({ sentence: SENTENCE, 'data-probe': '' });
    const node = root.querySelector('[data-probe]');
    assert.equal(node.textContent, STATED);
    assert.ok(node.classList.contains('fabricate-rule-sentence'), 'the root is the sentence');
    assert.ok(!node.classList.contains('is-missing'), 'a whole rule is not marked missing');
  });

  it('keeps the casing its keys state, so a proper noun mid-sentence is never lowered', async () => {
    const root = await sentenceHarness.mount({ sentence: SENTENCE });
    assert.match(root.textContent, /becomes Ruined\.$/u, 'the tier keeps its capital');
    assert.match(root.textContent, /^When roll total/u, 'the condition takes its in-sentence key');
  });

  it('renders the missing sentence, never half a rule, for each way a clause goes missing', async () => {
    const missing = [
      ['no clause at all', { ...SENTENCE, clauseKeys: [] }],
      ['a clause key nothing translates', { ...SENTENCE, clauseKeys: ['T.StepUp', 'T.Gone'] }],
      [
        'a placeholder no param fills',
        { ...SENTENCE, params: { ...SENTENCE.params, 'T.StepUp': {} } },
      ],
      [
        'a nested fragment that resolves nothing',
        {
          ...SENTENCE,
          params: { ...SENTENCE.params, 'T.Becomes': { tier: { key: 'T.Gone' } } },
        },
      ],
      ['no sentence', null],
    ];
    for (const [why, sentence] of missing) {
      const root = await sentenceHarness.mount({ sentence });
      const node = root.querySelector('.fabricate-rule-sentence');
      assert.equal(node.textContent, 'This rule is not finished.', why);
      assert.ok(node.classList.contains('is-missing'), `${why} is marked missing`);
      sentenceHarness.remount();
    }
  });

  it('takes the caller’s own missing-clause key', async () => {
    const root = await sentenceHarness.mount({
      sentence: { ...SENTENCE, clauseKeys: [] },
      missingClauseKey: 'T.Unfinished',
    });
    assert.equal(root.textContent, 'This trigger is not finished.');
  });
});

/** A step whose input writes `amount` through the row's `change`. */
const AMOUNT_STEP = createRawSnippet((rule, change) => ({
  render: () => `<input data-test-amount value="${rule().amount}" />`,
  setup: (input) => {
    input.addEventListener('input', () => change()({ ...rule(), amount: Number(input.value) }));
  },
}));

const SCHEMA = {
  head: (rule) => ({
    glyph: 'fas fa-arrow-up',
    tone: 'info',
    title: `Roll total is at most ${rule.amount}`,
    chip: 'Step up 2',
  }),
  steps: [{ key: 'amount', legend: 'Condition', render: AMOUNT_STEP }],
  sentence: () => SENTENCE,
  labels: { remove: 'Remove rule', expand: 'Show rule', collapse: 'Hide rule' },
};
const RULE = { id: 'r1', amount: 5 };

describe('RuleRow (mounted)', () => {
  it('states the rule in its head: glyph and chip in one tone, title, and the sentence', async () => {
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: RULE,
      collapsible: true,
      onChange() {},
    });
    const row = root.querySelector('.fabricate-rule-row');
    assert.ok(
      row.querySelector(':scope .fabricate-rule-row-glyph.is-info i.fa-arrow-up'),
      'toned glyph'
    );
    assert.equal(row.querySelector('[data-rule-row-title]').textContent, 'Roll total is at most 5');
    assert.ok(
      row.querySelector('[data-rule-row-chip]').classList.contains('is-info'),
      'toned chip'
    );
    assert.equal(row.querySelector('.fabricate-rule-row-lead').textContent, STATED);
    assert.ok(!row.querySelector('[data-rule-row-body]'), 'the chain is hidden until disclosed');
  });

  it('discloses its field chain and the sentence, and scrolls itself into view when it opens', async () => {
    const scrolled = [];
    const original = globalThis.Element.prototype.scrollIntoView;
    globalThis.Element.prototype.scrollIntoView = function record(options) {
      scrolled.push({ node: this, options });
    };
    try {
      const root = await rowHarness.mount({
        schema: SCHEMA,
        value: RULE,
        collapsible: true,
        onChange() {},
      });
      const disclosure = root.querySelector('[data-rule-row-disclosure]');
      assert.equal(disclosure.getAttribute('aria-expanded'), 'false');
      disclosure.click();
      flushSync();
      const body = root.querySelector('[data-rule-row-body]');
      assert.ok(Boolean(body), 'the body opens');
      assert.equal(disclosure.getAttribute('aria-controls'), body.id, 'the head controls the body');
      assert.equal(body.querySelector('.fabricate-rule-row-legend').textContent, 'Condition');
      assert.equal(body.querySelector('[data-test-amount]').value, '5', 'the step draws the rule');
      assert.equal(body.querySelector('[data-rule-row-quote]').textContent.trim(), STATED);
      assert.equal(scrolled.length, 1, 'opening asked for exactly one scroll');
      assert.ok(scrolled[0].node.classList.contains('fabricate-rule-row'), 'of the row itself');
      assert.deepEqual(scrolled[0].options, { block: 'nearest' });
    } finally {
      globalThis.Element.prototype.scrollIntoView = original;
    }
  });

  it('hands every edit to onChange as the whole next rule, and draws the rule it now holds', async () => {
    const emitted = [];
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: RULE,
      collapsible: { open: true, onToggle() {} },
      onChange: (next) => {
        emitted.push(next);
      },
    });
    const input = root.querySelector('[data-test-amount]');
    input.value = '9';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    assert.deepEqual(emitted, [{ id: 'r1', amount: 9 }], 'the whole rule, not a patch');
    assert.equal(
      root.querySelector('[data-rule-row-title]').textContent,
      'Roll total is at most 9',
      'the bound value is the rule the head restates'
    );
  });

  it('asks its caller to remove it with null', async () => {
    const emitted = [];
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: RULE,
      collapsible: true,
      onChange: (next) => {
        emitted.push(next);
      },
    });
    const remove = root.querySelector('[data-rule-row-remove]');
    assert.equal(remove.getAttribute('aria-label'), 'Remove rule', 'the remove names itself');
    remove.click();
    assert.deepEqual(emitted, [null]);
  });

  it('lets a list keep one rule open: the object form is controlled and only reports a toggle', async () => {
    const toggles = [];
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: RULE,
      collapsible: {
        open: false,
        onToggle: (next) => {
          toggles.push(next);
        },
      },
      onChange() {},
    });
    root.querySelector('[data-rule-row-disclosure]').click();
    flushSync();
    assert.deepEqual(toggles, [true], 'the toggle is reported');
    assert.ok(!root.querySelector('[data-rule-row-body]'), 'and the row does not open itself');
    await rowHarness.setProps({ collapsible: { open: true, onToggle() {} } });
    assert.ok(Boolean(root.querySelector('[data-rule-row-body]')), 'the caller opens it');
  });

  it('offers its presets while unauthored, handing each chosen rule over fresh', async () => {
    const emitted = [];
    let built = 0;
    const presets = [
      {
        id: 'high',
        label: 'Natural 20',
        icon: 'fas fa-arrow-up',
        value: () => ({ id: `p${(built += 1)}`, amount: 20 }),
      },
      { id: 'low', label: 'Natural 1', value: { id: 'fixed', amount: 1 } },
    ];
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: null,
      presets,
      class: 'caller-presets',
      onChange: (next) => {
        emitted.push(next);
      },
    });
    const row = root.querySelector('.fabricate-rule-row.caller-presets');
    assert.ok(Boolean(row), 'the caller class lands on the unauthored row');
    assert.ok(!row.querySelector('[data-rule-row-title]'), 'an unauthored rule draws no head');
    const high = row.querySelector('[data-rule-row-preset="high"]');
    assert.equal(high.textContent.trim(), 'Natural 20');
    high.click();
    high.click();
    row.querySelector('[data-rule-row-preset="low"]').click();
    flushSync();
    assert.deepEqual(
      emitted.map((rule) => rule.id),
      ['p1', 'p2', 'fixed'],
      'each choice is fresh'
    );
    assert.equal(row.querySelectorAll('[data-rule-row-preset]').length, 2, 'and stays unauthored');
  });

  it('lays an uncollapsible rule on one line: icon, title, chain and remove, with no sentence', async () => {
    const root = await rowHarness.mount({
      schema: SCHEMA,
      value: RULE,
      'data-test-row': 'r1',
      onChange() {},
    });
    const line = root.querySelector(':scope [data-test-row="r1"] > .fabricate-rule-row-line');
    assert.ok(Boolean(line), 'the rest hook lands on the root, and the line is its child');
    assert.deepEqual(
      [...line.children].map((child) => child.className.split(' ', 1)[0] || child.tagName),
      ['fabricate-rule-row-icon', 'fabricate-rule-row-label', 'INPUT', 'fabricate-icon-button']
    );
    assert.ok(!root.querySelector('[data-rule-row-disclosure], .fabricate-rule-sentence'));
  });
});
