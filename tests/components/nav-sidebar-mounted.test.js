/** Issue 1777 — `<NavSidebar>`'s two variants and the ARIA each owes. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const NAV_SIDEBAR = 'src/ui/svelte/components/NavSidebar.svelte';
const ROWS = 'src/ui/svelte/components/NavSidebarRows.svelte';
const HOST = 'tests/fixtures/nav-sidebar/LabelledNavHost.svelte';

const iconHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-nav-sidebar-',
  compiledModules: [ROWS, NAV_SIDEBAR],
  componentPath: NAV_SIDEBAR,
  rootClass: 'fabricate-app',
});
const labelledHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-nav-sidebar-host-',
  compiledModules: [ROWS, NAV_SIDEBAR, HOST],
  componentPath: HOST,
});

/** Four tabs, the third with a tooltip and a count, in the shape `FabricateAppRoot` builds. */
function iconItems(current) {
  return ['crafting', 'gathering', 'journal', 'ext:board'].map((id) => ({
    id,
    domId: `probe-tab-${id}`,
    hooks: { 'data-probe-tab': id },
    icon: 'fas fa-hammer',
    label: id,
    ariaLabel: id === 'ext:board' ? 'Open the board' : undefined,
    tooltip: id === 'journal' ? 'Runs in flight' : undefined,
    tooltipId: `probe-tooltip-${id}`,
    markers:
      id === 'journal' ? [{ kind: 'count', value: 3, hooks: { 'data-probe-count': id } }] : [],
    current: id === current,
  }));
}

/** Mounts the icon variant whose `onSelect` moves `current`, as the player host does. */
async function mountIcon(current = 'crafting') {
  const selected = [];
  const props = { variant: 'icon', label: 'Fabricate sections', panelId: 'probe-panel' };
  const onSelect = (id) => {
    selected.push(id);
    iconHarness.setProps({ items: iconItems(id) });
  };
  const root = await iconHarness.mount({ ...props, items: iconItems(current), onSelect });
  return { root, selected };
}

const tabs = (root) => [...root.querySelectorAll('[role="tab"]')];
const tab = (root, id) => root.querySelector(`[data-probe-tab="${id}"]`);
const focused = (root) => root.ownerDocument.activeElement?.dataset?.probeTab ?? null;

function press(root, id, key) {
  const view = root.ownerDocument.defaultView;
  tab(root, id).dispatchEvent(new view.KeyboardEvent('keydown', { key, bubbles: true }));
}

const lockedReason = 'This section stays open while you are on one of its pages.';

/** One model row, as `managerNavItems.js` builds it. */
const leaf = (id, label, fields = {}) => ({
  id,
  domId: `probe-${id}`,
  hooks: {},
  markers: [],
  icon: 'fas fa-circle',
  label,
  ...fields,
});

/** One model group: its parent, chevron, sub-list and children. */
const group = (
  id,
  { parent, children = [], expanded, locked, toggle, submenuLabel, hooks = {} }
) => ({
  kind: 'group',
  id,
  hooks,
  expanded,
  locked,
  lockedReason: locked ? lockedReason : undefined,
  parent,
  toggle: { hooks: {}, onToggle: () => {}, ...toggle },
  submenu: { domId: `probe-${id}-submenu`, hooks: {}, label: submenuLabel },
  children,
});

/** A group locked open on its current child, a current leaf, and a disabled placeholder. */
function sections() {
  const page = { active: true, current: 'page' };
  return [
    {
      entries: [
        leaf('overview', 'Overview', page),
        group('crafting', {
          expanded: true,
          locked: true,
          toggle: { label: 'Collapse crafting menu' },
          submenuLabel: 'Crafting sections',
          parent: leaf('crafting', 'Crafting', {
            current: 'page',
            markers: [{ kind: 'count', value: 4 }],
          }),
          children: [leaf('recipes', 'Recipes', page), leaf('books', 'Books', { active: false })],
        }),
        leaf('graph', 'Graph', {
          disabled: true,
          disabledReason: 'Graph is planned.',
          markers: [{ kind: 'planned', text: 'Soon' }],
        }),
      ],
    },
    {
      entries: [
        leaf('parties', 'Parties', { ariaLabel: 'Parties', active: false }),
        group('travel', {
          expanded: false,
          locked: false,
          toggle: { domId: 'probe-travel-toggle', label: 'Expand Travel' },
          submenuLabel: 'Travel destinations',
          parent: leaf('travel', 'Travel', { controls: 'probe-travel-submenu', active: false }),
        }),
      ],
      options: { itemClass: 'probe-world-item', groupClasses: { travel: 'probe-travel-group' } },
    },
  ];
}

describe('NavSidebar, icon variant', () => {
  before(() => iconHarness.setup());
  after(() => iconHarness.teardown());
  afterEach(() => iconHarness.remount());

  it('is a named vertical tablist with one roving tab stop on the current tab', async () => {
    const { root } = await mountIcon('journal');
    const list = root.querySelector('[role="tablist"]');
    assert.ok(list.classList.contains('fabricate-nav'), 'the root carries the family root');
    assert.equal(list.getAttribute('aria-orientation'), 'vertical');
    assert.equal(list.getAttribute('aria-label'), 'Fabricate sections');
    assert.deepEqual(
      tabs(root).map((button) => button.getAttribute('tabindex')),
      ['-1', '-1', '0', '-1'],
      'exactly one tab is in the Tab order, and it is the current one'
    );
    assert.deepEqual(
      tabs(root).map((button) => button.getAttribute('aria-selected')),
      ['false', 'false', 'true', 'false'],
      'aria-selected follows `current`'
    );
    for (const button of tabs(root)) {
      assert.equal(button.getAttribute('aria-controls'), 'probe-panel');
      assert.equal(button.dataset.keyboardFocus, 'true', 'a focused tab holds Foundry keybindings');
    }
  });

  it('falls the stop back to the first tab when no tab is current, and selects none', async () => {
    const { root } = await mountIcon('nothing');
    assert.deepEqual(
      tabs(root).map((button) => button.getAttribute('tabindex')),
      ['0', '-1', '-1', '-1']
    );
    assert.ok(tabs(root).every((button) => button.getAttribute('aria-selected') === 'false'));
  });

  it('renders each tooltip as a sibling after the tablist, named by aria-describedby', async () => {
    const { root } = await mountIcon();
    const list = root.querySelector('[role="tablist"]');
    assert.deepEqual(
      [...list.children].map((child) => child.getAttribute('role')),
      ['tab', 'tab', 'tab', 'tab'],
      'a tablist owns only tabs'
    );
    const tooltip = root.querySelector('[id="probe-tooltip-journal"]');
    assert.equal(tooltip?.getAttribute('role'), 'tooltip');
    assert.equal(tooltip.textContent, 'Runs in flight');
    assert.ok(tooltip.previousElementSibling === list, 'it follows the tablist');
    assert.equal(tab(root, 'journal').getAttribute('aria-describedby'), 'probe-tooltip-journal');
    assert.ok(!tab(root, 'crafting').hasAttribute('aria-describedby'), 'no tooltip, no reference');
    assert.equal(tab(root, 'ext:board').getAttribute('aria-label'), 'Open the board');
    assert.ok(!tab(root, 'crafting').hasAttribute('aria-label'), 'a visible label names itself');
    const pip = tab(root, 'journal').querySelector('[data-probe-count]');
    assert.equal(pip?.textContent, '3');
    assert.ok(pip.parentElement.classList.contains('fabricate-app-nav-well'), 'on the well');
  });

  it('moves selection and focus with Up, Down, Home and End, wrapping at both ends', async () => {
    const { root, selected } = await mountIcon('crafting');
    const settle = async () => {
      await tick();
      await tick();
    };
    press(root, 'crafting', 'ArrowUp');
    await settle();
    assert.equal(focused(root), 'ext:board', 'Up from the first tab wraps to the last');
    press(root, 'ext:board', 'ArrowDown');
    await settle();
    assert.equal(focused(root), 'crafting', 'and Down from the last wraps to the first');
    press(root, 'crafting', 'End');
    await settle();
    press(root, 'ext:board', 'Home');
    await settle();
    press(root, 'crafting', 'ArrowDown');
    await settle();
    assert.equal(focused(root), 'gathering');
    assert.deepEqual(selected, ['ext:board', 'crafting', 'ext:board', 'crafting', 'gathering']);
    assert.equal(tab(root, 'gathering').getAttribute('tabindex'), '0', 'the stop moved with it');
    press(root, 'gathering', 'ArrowLeft');
    press(root, 'gathering', 'ArrowRight');
    await settle();
    assert.equal(selected.length, 5, 'the horizontal pair does nothing on a vertical tablist');
  });

  it('selects a clicked tab by its id', async () => {
    const { root, selected } = await mountIcon();
    tab(root, 'ext:board').click();
    assert.deepEqual(selected, ['ext:board']);
  });
});

describe('NavSidebar, labelled variant', () => {
  before(() => labelledHarness.setup());
  after(() => labelledHarness.teardown());
  afterEach(() => labelledHarness.remount());

  const mountLabelled = () => labelledHarness.mount({ sections: sections() });

  it('is one named nav holding every section, its rows marked current by aria-current', async () => {
    const root = await mountLabelled();
    const navs = root.querySelectorAll('nav');
    assert.equal(navs.length, 1, 'the sections share one nav');
    assert.deepEqual([...navs[0].classList], ['fabricate-nav', 'manager-nav']);
    assert.equal(navs[0].getAttribute('aria-label'), 'Manager sections');
    const current = [...root.querySelectorAll('[aria-current]')].map((node) => [
      node.id,
      node.getAttribute('aria-current'),
    ]);
    assert.deepEqual(current, [
      ['probe-overview', 'page'],
      ['probe-crafting', 'page'],
      ['probe-recipes', 'page'],
    ]);
    assert.deepEqual(
      [...root.querySelectorAll('.manager-nav-submenu')].map((list) =>
        list.getAttribute('aria-label')
      ),
      ['Crafting sections'],
      'an open sub-list keeps its name'
    );
  });

  it('composes the pill slot only for a row that carries `active`', async () => {
    const root = await mountLabelled();
    const classOf = (id) => root.querySelector(`#${id}`).getAttribute('class');
    assert.equal(classOf('probe-overview'), 'manager-nav-button is-active');
    assert.equal(classOf('probe-books'), 'manager-nav-subitem ');
    assert.equal(classOf('probe-crafting'), 'manager-nav-button manager-nav-parent');
    assert.equal(classOf('probe-graph'), 'manager-nav-button');
    assert.equal(classOf('probe-parties'), 'manager-nav-button probe-world-item ');
    assert.equal(
      classOf('probe-travel'),
      'manager-nav-button manager-nav-parent probe-world-item '
    );
    assert.equal(
      root.querySelector('#probe-travel').parentElement.getAttribute('class'),
      'manager-nav-group probe-travel-group '
    );
  });

  it('gives a parent a separate chevron that names the list it expands', async () => {
    const root = await mountLabelled();
    const travel = root.querySelector('#probe-travel-toggle');
    assert.equal(travel.getAttribute('aria-controls'), 'probe-travel-submenu');
    assert.equal(travel.getAttribute('aria-expanded'), 'false');
    assert.equal(travel.getAttribute('aria-label'), 'Expand Travel');
    assert.equal(root.querySelector('#probe-travel').getAttribute('aria-expanded'), 'false');
    assert.ok(!travel.disabled && !travel.hasAttribute('aria-describedby'), 'an unlocked chevron');
  });

  it('disables a locked chevron and announces its reason through aria-describedby', async () => {
    const root = await mountLabelled();
    const chevron = root.querySelector(
      '[aria-controls="probe-crafting-submenu"].manager-nav-toggle'
    );
    assert.ok(chevron.disabled, 'locked is genuinely disabled');
    assert.equal(chevron.getAttribute('aria-disabled'), 'true');
    assert.equal(chevron.getAttribute('aria-expanded'), 'true');
    assert.equal(chevron.getAttribute('title'), lockedReason, 'the title is kept');
    const reasonId = chevron.getAttribute('aria-describedby');
    const reason = root.querySelector(`[id="${reasonId}"]`);
    assert.equal(reason?.textContent, lockedReason, 'the description is the reason');
    assert.ok(reason.classList.contains('visually-hidden'), 'and paints nothing');
    assert.ok(
      chevron.parentElement.lastElementChild.classList.contains('manager-nav-submenu'),
      'the reason never displaces the sub-list as the group’s last child'
    );
  });

  it('disables a placeholder row and announces its reason, keeping its title', async () => {
    const root = await mountLabelled();
    const graph = root.querySelector('#probe-graph');
    assert.ok(graph.disabled);
    assert.equal(graph.getAttribute('aria-disabled'), 'true');
    assert.equal(graph.getAttribute('title'), 'Graph is planned.');
    const reason = root.querySelector(`[id="${graph.getAttribute('aria-describedby')}"]`);
    assert.equal(reason?.textContent, 'Graph is planned.');
    assert.ok(reason.classList.contains('visually-hidden'));
    assert.ok(!root.querySelector('#probe-overview').hasAttribute('aria-disabled'));
  });
});
