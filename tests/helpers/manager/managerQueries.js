/**
 * The manager root's locators, and the settle sequences around them (issue 1669, extracted from
 * `tests/components/manager-mounted.test.js`).
 */
import assert from 'node:assert/strict';
import { flushSync, tick } from 'svelte';

import { ANNOUNCE_AFTER_FOCUS_MS } from '../../../src/ui/svelte/util/announceAfterFocus.js';
import { shippedString } from './managerLocalization.js';

/**
 * Press one control and settle the DOM: the click, the microtask its handler may await, then the
 * synchronous effect flush that renders the result.
 *
 * @param {Element} element The control to press.
 */
export async function act(element) {
  element.click();
  await tick();
  flushSync();
}

// Every recorded store call EXCEPT the route-scoped search clear (issue 1462).
function callsWithoutRouteScopedClear(calls) {
  return calls.filter((call) => call[0] !== 'clearLibrarySearches');
}

// Set a control's value and fire the input event Svelte's bind:value listens for.
function setInputValue(element, value) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settleDowntimeProvider() {
  await Promise.resolve();
  await tick();
  await tick();
  flushSync();
}

/** Wait for a sentence that is QUEUED BEHIND A FOCUS UTTERANCE (issue 1157). */
async function waitForQueuedAnnouncement() {
  await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
  await tick();
  flushSync();
}


function headerSaveButton(target) {
  return Array.from(target.querySelectorAll('.manager-header-actions .manager-button')).find(
    (button) => button.textContent.includes('Save')
  );
}

function editRecipeName(target, value) {
  const nameInput = target.querySelector('.manager-main [data-recipe-field="name"]');
  nameInput.value = value;
  nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
}

// Shared assertion for a resolution-mode RadioCardGroup's option list: the rows render in the
// expected order, each wraps a real radio in the named group, and each has a non-empty description.
function assertResolutionCard(card, { optionAttr, groupName, expectedValues }) {
  assert.ok(card, 'resolution-mode card should render');
  const rows = [...card.querySelectorAll(`[${optionAttr}]`)];
  assert.deepEqual(
    rows.map((row) => row.getAttribute(optionAttr)),
    expectedValues,
    'card lists its options in order'
  );
  assert.ok(
    rows.every((row) => row.querySelector(`input[type="radio"][name="${groupName}"]`)),
    'each row wraps a real radio in the group'
  );
  assert.ok(
    rows.every(
      (row) => row.querySelector('.manager-resolution-option-desc')?.textContent.trim().length > 0
    ),
    'each row has a non-empty description'
  );
  return rows;
}

export {
  assertResolutionCard,
  callsWithoutRouteScopedClear,
  editRecipeName,
  headerSaveButton,
  setInputValue,
  settleDowntimeProvider,
  waitForQueuedAnnouncement,
};

/**
 * The target-bound half of the family, closed over the LIVE mount target.
 *
 * @param {() => HTMLElement} getTarget Reads the element the suite last mounted into.
 * @returns {object} The locators, under the names the suites already use.
 */
export function createManagerQueries(getTarget) {
  // AN EXACT LABEL MATCH, SCOPED TO ONE RAIL SECTION (issue 1362).
  function railButton(labelText, { world }) {
    const selector = world
      ? '.manager-nav-button.manager-world-nav-item'
      : '.manager-nav-button:not(.manager-world-nav-item)';
    const matches = Array.from(getTarget().querySelectorAll(selector)).filter(
      (button) => button.querySelector('.manager-nav-label')?.textContent.trim() === labelText
    );
    assert.ok(
      matches.length <= 1,
      `${matches.length} rail buttons are labelled "${labelText}" in the ` +
        `${world ? 'world' : 'system'} scope; the lookup is ambiguous`
    );
    return matches[0];
  }

  function navButton(labelText) {
    return railButton(labelText, { world: false });
  }

  function worldNavButton(labelText) {
    return railButton(labelText, { world: true });
  }

  // Checks Studio navigation (issue 1096). The four activities stopped being TABS inside one view
  // and became rail ROUTES, and the five SECTIONS of each route are what the strip across the pane
  // switches now.
  async function openChecksActivity(activity) {
    const child = getTarget().querySelector(`[data-checks-nav-item="${activity}"]`);
    assert.ok(child, `the Checks rail should offer a ${activity} child`);
    await act(child);
  }

  async function openChecksSection(section) {
    const button = getTarget().querySelector(`#checks-section-${section}`);
    assert.ok(button, `the section strip should offer "${section}"`);
    await act(button);
  }

  function gatheringSubitem(labelText) {
    return Array.from(getTarget().querySelectorAll('.manager-nav-subitem')).find((button) =>
      button.textContent.includes(labelText)
    );
  }

  function gatheringToggle() {
    // Target the Gathering group's toggle specifically: the Crafting group (unconditional
    // as of issue 745) also renders a `.manager-nav-toggle`, ahead of Gathering in the rail.
    return getTarget().querySelector('#manager-nav-gathering + .manager-nav-toggle');
  }

  function worldNavItem(id) {
    return getTarget().querySelector(`#manager-world-nav-${id}`);
  }

  /** Run one browse row's overflow command (issue 1515). */
  async function openRowMenu(rowSelector) {
    const trigger = getTarget().querySelector(`${rowSelector} .manager-icon-button[aria-haspopup="menu"]`);
    assert.ok(Boolean(trigger), `${rowSelector} renders no overflow menu trigger`);
    await act(trigger);

    const panels = getTarget().querySelectorAll('[role="menu"]');
    assert.equal(panels.length, 1, 'exactly one row menu is open at a time');
    return panels[0];
  }

  /** The commands one row's overflow menu offers, read and then closed again. */
  async function rowMenuCommands(rowSelector) {
    const panel = await openRowMenu(rowSelector);
    const labels = Array.from(panel.querySelectorAll('[role="menuitem"]')).map((item) =>
      item.textContent.trim()
    );
    getTarget().querySelector(`${rowSelector} .manager-icon-button[aria-haspopup="menu"]`).click();
    await tick();
    flushSync();
    return labels;
  }

  async function runRowMenuCommand(rowSelector, itemLabel) {
    const panel = await openRowMenu(rowSelector);
    const item = Array.from(panel.querySelectorAll('[role="menuitem"]')).find(
      (candidate) => candidate.textContent.trim() === itemLabel
    );
    assert.ok(Boolean(item), `${rowSelector}'s menu offers no "${itemLabel}" command`);
    await act(item);
  }

  // The three reads every Downtime seam case makes, named once. `downtimeTabIds` is CORE-FALLBACK
  // ONLY (issue 1213).
  function downtimeTabIds() {
    return Array.from(getTarget().querySelectorAll('[data-downtime-tab]')).map(
      (tab) => tab.dataset.downtimeTab
    );
  }

  function downtimeRailIds() {
    return Array.from(getTarget().querySelectorAll('[data-world-downtime-item]')).map(
      (item) => item.dataset.worldDowntimeItem
    );
  }

  function activeCompanionPanel() {
    return getTarget().querySelector('[data-downtime-extension-panel]');
  }

  const railBodyCollapsed = () =>
    getTarget().querySelector('.manager-body').classList.contains('is-rail-collapsed');
  const railToggleControl = () => getTarget().querySelector('[data-manager-rail-toggle]');

  /**
   * Every claim the Downtime rail lock makes about the collapse control, in one place (issue 1213).
   *
   * @param {() => Array<Array<unknown>>} railWrites reads the `managerRailCollapsed` writes so far.
   */
  function assertRailLockedOpen(railWrites) {
    const toggle = railToggleControl();
    assert.ok(!railBodyCollapsed(), 'arriving on the companion surface displays the rail expanded');
    assert.ok(
      Boolean(getTarget().querySelector('[data-world-downtime-submenu]')),
      'which is the whole point — the sub-items are the only way to the other screens'
    );
    assert.equal(toggle.disabled, true, 'and the collapse control is genuinely disabled');
    assert.equal(toggle.getAttribute('aria-disabled'), 'true');
    assert.equal(
      toggle.getAttribute('aria-pressed'),
      'false',
      'every attribute reads the DISPLAYED state, not the stored one'
    );
    assert.equal(
      toggle.getAttribute('aria-label'),
      shippedString('FABRICATE.Admin.Manager.Nav.CollapseRail')
    );
    assert.equal(
      toggle.getAttribute('title'),
      shippedString('FABRICATE.Admin.Manager.Nav.RailLockedOpen'),
      'the title explains the lock, and it is sidebar-worded rather than the section string'
    );
    assert.ok(
      Boolean(toggle.querySelector('.fa-angles-left')),
      'the chevron points the way the control would actually move'
    );
    assert.deepEqual(railWrites(), [], 'and nothing about the lock writes a client preference');
  }

  /**
   * Prove the lock is a rule about STATE rather than one control's attribute. The first press only
   * proves the attribute: happy-dom suppresses handlers on a `disabled` button, so
   * `toggleManagerRail`'s own `if (railLockedOpen) return;` is never reached.
   *
   * @param {() => Array<Array<unknown>>} railWrites reads the `managerRailCollapsed` writes so far.
   */
  async function assertRailLockSurvivesPresses(railWrites) {
    await act(railToggleControl());
    assert.ok(!railBodyCollapsed(), 'the disabled control does not collapse the rail');

    const toggle = railToggleControl();
    toggle.removeAttribute('disabled');
    await act(toggle);
    assert.ok(
      !railBodyCollapsed(),
      'and the handler refuses too, so the lock is inert rather than merely styled'
    );
    assert.deepEqual(railWrites(), [], 'neither press writes the stored collapse preference');
  }


  function managerTitle() {
    return getTarget().querySelector('.manager-header .manager-title').textContent.trim();
  }

  function managerSubtitle() {
    return getTarget().querySelector('.manager-header .manager-subtitle').textContent.trim();
  }

  // World > Travel's rail group (issue 1282). The parent moved into the World section; the two
  // destination sub-items kept their ids, because neither ever named a crafting system.
  function worldTravelItem(id) {
    return getTarget().querySelector(
      id === 'travel' ? '#manager-world-nav-travel' : `#manager-travel-nav-${id}`
    );
  }

  // The gated Crafting nav group (issue 511) nests Recipes as a sub-route.
  function craftingParent() {
    return navButton('Crafting');
  }

  function craftingSubitem(labelText) {
    return Array.from(getTarget().querySelectorAll('#manager-crafting-submenu .manager-nav-subitem')).find(
      (button) => button.textContent.includes(labelText)
    );
  }

  // The Crafting sub-entries currently carrying BOTH halves of the active treatment (issue 1151).
  function activeCraftingSubitemIds() {
    return Array.from(getTarget().querySelectorAll('#manager-crafting-submenu .manager-nav-subitem'))
      .filter(
        (button) =>
          button.classList.contains('is-active') && button.getAttribute('aria-current') === 'page'
      )
      .map((button) => button.id.replace('manager-crafting-nav-', ''));
  }

  // The ONE scope-switch driver for the route-reconciliation cases (issue 1151): set the select,
  // dispatch a real bubbling `change`, settle, and report the rendered route.
  async function switchScopeSystemTo(systemId) {
    const scopeSelect = getTarget().querySelector('[data-manager-scope-select]');
    assert.ok(scopeSelect, 'the rail card exposes a system scope select');
    scopeSelect.value = systemId;
    scopeSelect.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await tick();
    flushSync();
    return getTarget().querySelector('.fabricate-manager').dataset.managerView;
  }

  /**
   * The three numbers one vocabulary is counted by since issue 1915 retired the tabs: the nav
   * rail's badge, which is the WHOLE screen's vocabulary; the panel's own entry chip; and the rows
   * it actually renders, reserved row included. The rail badge is deliberately not per-kind - it
   * is the sum, and a per-panel assertion that quoted it would be asserting a different number.
   *
   * @param {string} kind `recipeCategories` | `componentCategories` | `componentTags`
   * @param {string} rowAttr that panel's own row hook
   */
  function vocabularyCounters(kind, rowAttr) {
    const panel = getTarget().querySelector(`[data-vocabulary-panel="${kind}"]`);
    assert.ok(Boolean(panel), `the ${kind} panel is not mounted, so its counters read nothing`);
    return {
      railBadge: getTarget().querySelector('#manager-nav-tags .manager-nav-count').textContent.trim(),
      entryChip: panel.querySelector('[data-vocabulary-shown-count] span').textContent.trim(),
      rowCount: panel.querySelectorAll(`[${rowAttr}]`).length,
    };
  }

  /**
   * The manager's Back verb, asserted on the route that renders it (issue 1118).
   *
   * @param {string} hook the control's own `data-*` attribute selector
   * @param {string} route the `currentView` it renders on, named in the failure message
   */
  function assertHeaderBackIsGhost(hook, route) {
    const back = getTarget().querySelector(`.manager-header-actions ${hook}`);
    assert.ok(Boolean(back), `${route} should render its header Back control at ${hook}`);
    assert.ok(
      back.classList.contains('fab-manager-button'),
      `${route}'s Back should render through the ManagerButton primitive, not a hand-written class`
    );
    assert.ok(
      back.classList.contains('is-ghost'),
      `${route}'s Back should carry the ghost role, as every other Back in this container does`
    );
  }

  return {
      activeCompanionPanel,
      activeCraftingSubitemIds,
      assertHeaderBackIsGhost,
      assertRailLockSurvivesPresses,
      assertRailLockedOpen,
      craftingParent,
      craftingSubitem,
      downtimeRailIds,
      downtimeTabIds,
      gatheringSubitem,
      gatheringToggle,
      managerSubtitle,
      managerTitle,
      navButton,
      openChecksActivity,
      openChecksSection,
      openRowMenu,
      railBodyCollapsed,
      railButton,
      railToggleControl,
      rowMenuCommands,
      runRowMenuCommand,
      switchScopeSystemTo,
      vocabularyCounters,
      worldNavButton,
      worldNavItem,
      worldTravelItem,
  };
}
