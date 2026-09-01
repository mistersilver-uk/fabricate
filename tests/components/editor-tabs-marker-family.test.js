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
 * THE GLYPH CHIP (issue 1372), which is a property of the ISSUE vehicle and not a fourth mark.
 *
 * The scoped entry editors' Validation tab reads `Validation` plus a tick when everything
 * passes, because the other two outcomes are counts and a chip reading `0` states the opposite
 * of what it means. That tick is drawn by `Chip`'s own shipped `icon` prop, so the chip is
 * still the drawing and the caller supplies no markup, class or shape of its own — which is
 * the closure property the family rests on, restated for the one vehicle that takes a glyph.
 *
 * WHY THIS FILE PINS IT
 * ---------------------
 * A glyph chip carries an EMPTY label, so every emptiness rule the strip has ever had is a
 * live threat to it: the mark is drawn only because `isDrawable` judges a chip on its icon
 * when it has one. Nothing else in the suite would notice its removal — the tab would simply
 * render its label and pass — so the capability has to be asserted where the emptiness rules
 * are, beside the dot's own naming precondition above.
 */
describe('EditorTabs draws a glyph chip for a state that is not a count (issue 1372)', () => {
  it('draws an icon-only chip rather than filtering it away as empty', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        outcomes: { label: '', tone: 'success', icon: 'fas fa-check', name: 'Everything passes' },
      },
    });
    const button = buttonFor(root, 'outcomes');
    const marks = marksOn(button);
    assert.deepEqual(
      marks.map((mark) => [mark.chip, mark.text, mark.name]),
      [[true, '', 'Everything passes']],
      'the pass state is a chip carrying no text and an accessible name, not an absent mark'
    );
    assert.ok(
      Boolean(button.querySelector('.manager-chip > i.fas.fa-check')),
      'the glyph is drawn by the chip through its own icon prop'
    );
    assert.ok(
      button.querySelector('.manager-chip').classList.contains('is-active'),
      'a success tone maps onto the chip colour family, which spells success as active'
    );
  });

  it('still suppresses a chip that carries neither a label nor a glyph', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: { outcomes: { label: '', tone: 'success' } },
    });
    assert.deepEqual(
      marksOn(buttonFor(root, 'outcomes')),
      [],
      'the glyph is what rescues an empty chip, so an empty chip without one stays dropped'
    );
  });

  it('keeps the family closed: the count and the dot take no glyph from the caller', async () => {
    const root = await harness.mount({
      tabs: TABS,
      activeTab: 'roll',
      badges: {
        roll: { vehicle: 'count', label: 7, icon: 'fas fa-check' },
        outcomes: { vehicle: 'dot', name: '1 issue', icon: 'fas fa-check' },
      },
    });
    assert.ok(
      !buttonFor(root, 'roll').querySelector('i.fa-check'),
      'a record count is a bare numeral; its class is its drawing and a caller cannot add to it'
    );
    assert.ok(
      !buttonFor(root, 'outcomes').querySelector('i.fa-check'),
      'the dot is a shape, and a glyph inside it would be a mark the family does not name'
    );
  });
});
