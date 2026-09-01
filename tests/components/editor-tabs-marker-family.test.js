/**
 * The Rail Marker Family, as a capability of the manager's ONE editor tab strip.
 *
 * `DOMAIN.md`'s **Rail Marker Family** and design-system `spec.md`'s "Near-neighbour
 * primitives are routed by a stated rule" both say the same thing: the family is FOUR marks
 * that MUST NOT be substituted for one another, and which mark a strip draws is decided by
 * what the mark MEANS, never by which strip it sits in. Before issue 1429 `EditorTabs` could
 * draw exactly one of them — the issue-summary chip — so a caller with a record count had two
 * options, both wrong: draw the count as a chip (`KnowledgeTabs` did, and that is the
 * substitution the spec forbids by name) or keep a second hand-rolled strip
 * (`ChecksEditorTabs` did, and it was RIGHT about the marks while the primitive was too
 * narrow to express them).
 *
 * So the vehicle is a property of the MARK and the drawing belongs to the primitive. These
 * assertions are the closure property: a caller names a vehicle, and there is no route by
 * which it can supply a drawing of its own.
 *
 * WHY THE DOT'S ACCESSIBLE NAME IS ASSERTED AS A PRECONDITION OF RENDERING AT ALL
 * ------------------------------------------------------------------------------
 * The dot carries no text. `styles/fabricate.css` states the rule in the rail's own marker
 * block — "Distinguishing 2 from 3 by colour alone would fail every GM who cannot separate
 * them, so the difference is carried by shape and by name and only reinforced by colour" — so
 * a dot with no name is not a degraded mark, it is an unreadable one. The primitive drops it
 * rather than emitting it, on the same rule `Chip` drops an unknown tone.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-editor-tabs-family-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    // The manager's ONE chip (issue 883), which is how the strip draws the ISSUE-SUMMARY
    // vehicle. A `.svelte` the tree renders but the harness omits HANGS the suite
    // (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/EditorTabs.svelte',
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

/**
 * THE PASS MARK IS A LABEL (issue 1372, maintainer parity round 8), and the family takes NO glyph
 * from a caller at all.
 *
 * The scoped entry editors' Validation tab reads `Validation` plus a tick when everything passes,
 * because the other two outcomes are counts and a chip reading `0` states the opposite of what it
 * means. That tick briefly arrived as an `icon` property on the mark, defended as "a property of
 * the chip, not a fourth vehicle" — but a call site passing `fas fa-check` IS a call site choosing
 * a shape, which is the one thing the family's closure forbids.
 *
 * The reference settles it: its tab badge is ONE pill in two states,
 * `badge: iss.block.length ? String(iss.block.length) : '✓'` (`proto:6221`-`6223`), a numeral
 * or a tick CHARACTER in the same box, toned danger or recessive. So the pass mark was never a
 * glyph and never a fourth vehicle — it is the issue chip's own LABEL.
 *
 * WHY THIS FILE PINS IT
 * ---------------------
 * The `icon` property is gone, and an absence is exactly what a mounted render cannot notice on
 * its own: a re-added `icon` would render a glyph and every other assertion in this suite would
 * still pass. So the ban is asserted here, beside the emptiness rules it used to interact with.
 */
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
