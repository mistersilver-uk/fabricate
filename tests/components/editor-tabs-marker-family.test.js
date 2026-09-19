/** The Rail Marker Family, as a capability of the manager's ONE editor tab strip. */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-editor-tabs-family-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  compiledModules: [
    // The manager's ONE chip (issue 883).
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EditorTabs.svelte',
  ],
  componentPath: 'src/ui/svelte/components/EditorTabs.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const TABS = [
  { id: 'roll', icon: 'fas fa-dice-d20', labelKey: 'x.Roll', label: 'The roll' },
  { id: 'outcomes', icon: 'fas fa-list', labelKey: 'x.Outcomes', label: 'Outcomes' },
];

function tabButtons(root) {
  return [...root.querySelectorAll('[role="tab"]')];
}

function buttonFor(root, id) {
  return tabButtons(root).find((button) => button.id.endsWith(`-${id}`));
}

/** Every mark a tab button renders, in document order, as `{vehicle, text, name}`. */
function marksOn(button) {
  return [...button.querySelectorAll('.manager-chip, .manager-editor-tab-count, .manager-editor-tab-dot')].map(
    (node) => ({
      chip: node.classList.contains('manager-chip'),
      count: node.classList.contains('manager-editor-tab-count'),
      dot: node.classList.contains('manager-editor-tab-dot'),
      text: node.textContent.trim(),
      name: node.getAttribute('aria-label'),
      role: node.getAttribute('role'),
    })
  );
}

describe('EditorTabs emits the namespace root its rules are anchored on (issue 1509)', () => {
  /* THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE RENDERED ROOT. */
  it('writes `fabricate-tabs` on the tablist, ahead of the caller`s container class', async () => {
    const root = await harness.mount({ tabs: TABS, activeTab: 'roll' });
    const tablist = root.querySelector('[role="tablist"]');
    assert.ok(Boolean(tablist), 'the component must render a tablist at all');
    assert.equal(
      tablist.className,
      'fabricate-tabs manager-editor-tabs',
      'the default render must carry the primitive`s own root and the family`s container class, ' +
        'in that order — the root FIRST, because every re-rooted rule in `styles/fabricate.css` ' +
        'names it as the leading compound'
    );
  });

  it('keeps the root when a caller supplies its own container class', async () => {
    // THE CALLER VOCABULARY IS THE POINT.
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      containerClass: 'manager-environment-tabs manager-checks-sections',
    });
    assert.equal(
      root.querySelector('[role="tablist"]').className,
      'fabricate-tabs manager-environment-tabs manager-checks-sections',
      'a caller`s container class replaces the family default and never the root'
    );
  });

  it('writes the root on the TABLIST and not on the tab buttons', async () => {
    // THE MUTATION CONTROL'S TARGET, stated as an assertion so the control has something to
    // flip. Moving the `fabricate-tabs` literal from the container template onto the button
    // template leaves it in the markup, leaves it in `written`, and leaves the area-scope gate`s
    // `rootless` and `gated` clauses green — only this pair of assertions can see it, because
    // only these read WHICH element carries it.
    const root = await harness.mount({ tabs: TABS, activeTab: 'roll' });
    for (const button of tabButtons(root)) {
      assert.ok(
        !button.classList.contains('fabricate-tabs'),
        `${button.id} carries the family root, which belongs on the tablist: every rule in the ` +
          'sheet roots at it as an ANCESTOR of the button, so a root on the button matches the ' +
          'button`s own rules and nothing else'
      );
    }
  });
});

describe('EditorTabs draws the Rail Marker Family (issue 1429)', () => {
  it('draws a record count as a bare numeral and NOT as a chip', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { outcomes: { vehicle: 'count', label: 3 } },
    });
    const marks = marksOn(buttonFor(root, 'outcomes'));
    assert.deepEqual(
      marks.map((mark) => [mark.count, mark.chip, mark.text]),
      [[true, false, '3']],
      'a record count is a bare mono numeral with no fill and no border, which in this tree ' +
        'means it must not be the chip'
    );
  });

  it('draws an issue summary as the chip, and treats an unnamed mark as one', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        roll: { vehicle: 'issue', label: 2, tone: 'warning' },
        // No vehicle named at all: every shipped caller predates the family and passes a
        // bare value or `{label, tone}`, so the unnamed case must keep drawing the chip.
        outcomes: 4,
      },
    });
    const issue = marksOn(buttonFor(root, 'roll'));
    assert.deepEqual(issue.map((mark) => [mark.chip, mark.text]), [[true, '2']]);
    assert.ok(
      buttonFor(root, 'roll').querySelector('.manager-chip').classList.contains('is-warning'),
      'the issue vehicle carries its tone'
    );
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')).map((mark) => [mark.chip, mark.text]),
      [[true, '4']],
      'an unnamed vehicle stays the chip, so no shipped caller changes what it renders'
    );
  });

  it('draws a dot with a text accessible name and no text of its own', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { roll: { vehicle: 'dot', name: '1 issue' } },
    });
    const marks = marksOn(buttonFor(root, 'roll'));
    assert.deepEqual(marks.map((mark) => [mark.dot, mark.text, mark.name, mark.role]), [
      [true, '', '1 issue', 'img'],
    ]);
  });

  it('drops a dot that has no accessible name rather than drawing a colour-only mark', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { roll: { vehicle: 'dot' } },
    });
    assert.deepEqual(marksOn(buttonFor(root, 'roll')), []);
  });

  it('renders more than one mark on a tab, in the order the caller listed them', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        outcomes: [
          { vehicle: 'count', label: 3 },
          { vehicle: 'dot', name: '1 issue' },
        ],
      },
    });
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')).map((mark) => [mark.count, mark.dot]),
      [
        [true, false],
        [false, true],
      ],
      'a section may wear a count AND a dot at once'
    );
  });

  it('drops a zero count by default and keeps it when the caller says so', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        roll: { vehicle: 'count', label: 0 },
        outcomes: { vehicle: 'count', label: 0, suppressZero: false },
      },
    });
    assert.deepEqual(marksOn(buttonFor(root, 'roll')), [], 'a zero is suppressed by default');
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')).map((mark) => [mark.count, mark.text]),
      [[true, '0']],
      'a caller whose surface states the count unconditionally keeps its zero'
    );
  });

  it('names each vehicle its own data hook', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      countAttribute: 'data-x-count',
      dotAttribute: 'data-x-dot',
      badgeAttribute: 'data-x-badge',
      badges: {
        roll: [
          { vehicle: 'count', label: 2 },
          { vehicle: 'dot', name: '1 issue' },
        ],
        outcomes: { label: 9, tone: 'danger' },
      },
    });
    assert.equal(root.querySelector('[data-x-count="roll"]').textContent.trim(), '2');
    assert.equal(root.querySelector('[data-x-dot="roll"]').getAttribute('aria-label'), '1 issue');
    assert.equal(root.querySelector('[data-x-badge="outcomes"]').getAttribute('data-badge-tone'), 'danger');
  });

  it('emits aria-controls for every tab by default and only for the selected tab in single-panel mode', async () => {
    const every = await harness.mount({ tabs: TABS, activeTab: 'roll', idStem: 'x' });
    assert.deepEqual(
      tabButtons(every).map((button) => [button.id, button.getAttribute('aria-controls')]),
      [
        ['x-tab-roll', 'x-panel-roll'],
        ['x-tab-outcomes', 'x-panel-outcomes'],
      ],
      'one `idStem` still yields BOTH halves of the shipped id pair, which is what every ' +
        'caller predating the split passes'
    );
    harness.remount();
    const one = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      idStem: 'x',
      activePanelOnly: true,
    });
    assert.deepEqual(
      tabButtons(one).map((button) => button.getAttribute('aria-controls')),
      ['x-panel-roll', null],
      'a strip that renders one panel at a time must not point the others at an IDREF that ' +
        'resolves to nothing'
    );
  });

  it('lets a caller keep a button id stem that is not the panel stem', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      buttonIdStem: 'checks-section',
      panelIdStem: 'checks-panel',
    });
    assert.deepEqual(
      tabButtons(root).map((button) => [button.id, button.getAttribute('aria-controls')]),
      [
        ['checks-section-roll', 'checks-panel-roll'],
        ['checks-section-outcomes', 'checks-panel-outcomes'],
      ]
    );
  });

  it('carries the container hook its caller names', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      containerAttribute: 'data-checks-sections',
    });
    assert.ok(
      Boolean(root.querySelector('[role="tablist"][data-checks-sections]')),
      'the strip container keeps the hook the harness and the View Lab select on'
    );
  });

  it('moves focus with Home and End as well as the arrows', async () => {
    const selected = [];
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'outcomes',
      onSelect: (id) => selected.push(id),
    });
    const end = buttonFor(root, 'roll');
    end.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.deepEqual(selected, ['outcomes']);
    buttonFor(root, 'outcomes').dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );
    assert.deepEqual(selected, ['outcomes', 'roll']);
  });
});

/** THE PASS MARK IS A LABEL (issue 1372, maintainer parity round 8). */
describe('EditorTabs takes no glyph from a caller (issue 1372)', () => {
  it('draws a tick as the ISSUE chip label, in the same box a count uses', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { outcomes: { label: '✓', tone: 'neutral', name: 'Everything passes' } },
    });
    const button = buttonFor(root, 'outcomes');
    assert.deepEqual(
      marksOn(button).map((mark) => [mark.chip, mark.text, mark.name]),
      [[true, '✓', 'Everything passes']],
      'the pass state is the issue chip carrying a tick character and an accessible name'
    );
    assert.ok(
      !button.querySelector('.manager-chip > i'),
      'and it draws no glyph, because the primitive emits none for any mark'
    );
  });

  it('ignores an `icon` on every vehicle, so no caller can choose a shape', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        roll: { vehicle: 'count', label: 7, icon: 'fas fa-check' },
        outcomes: { label: '2', tone: 'danger', icon: 'fas fa-check' },
      },
    });
    assert.ok(
      Boolean(buttonFor(root, 'outcomes').querySelector('.manager-chip')),
      'NON-VACUITY: the issue chip is drawn, so its glyph-free rendering is a measurement'
    );
    for (const tab of ['roll', 'outcomes']) {
      assert.ok(
        !buttonFor(root, tab).querySelector('i.fa-check'),
        `${tab}: the mark's class is its drawing, and a caller cannot add to it`
      );
    }
  });

  it('still suppresses a chip that carries no label', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { outcomes: { label: '', tone: 'success' } },
    });
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')),
      [],
      'an empty mark is dropped rather than drawn as an empty box'
    );
  });

  it('keeps the dot judged on its NAME, which is the only thing it renders', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { outcomes: { vehicle: 'dot', name: '1 issue' } },
    });
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')).map((mark) => mark.name),
      ['1 issue'],
      'a named dot draws; a nameless one is dropped by the rule above it'
    );
  });
});
