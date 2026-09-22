/** The Tool routes: the compact library, the world catalogue and the focused editor. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { createToolsBrowserState } from '../../src/ui/model/managerBrowserViewState.js';
import {
  labCaseSelector,
  managerComponents,
  settleBetweenTests,
} from './manager-mounted-shared.js';

let Component;
let ToolsBrowserViewComponent;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { navButton } = queries;

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerToolsCases() {
  before(async () => {
    ({
      Component,
      ToolsBrowserViewComponent,
    } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  const toolRouteFixture = {
    id: 'tool-catalyst',
    label: 'Artisan Catalyst',
    enabled: true,
    componentId: 'c1',
    requirement: null,
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' },
  };

  it('keeps the compact Tool library hierarchy callback-complete and selects a row once', async () => {
    const selections = [];
    const authorityChanges = [];
    const edits = [];
    const enabledChanges = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [toolRouteFixture],
        managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }],
        onSelectTool: (id) => selections.push(id),
        onSetBreakageAuthority: (authority) => {
          authorityChanges.push(authority);
        },
        onEditTool: (id) => {
          edits.push(id);
        },
        onToggleToolEnabled: (id, enabled) => {
          enabledChanges.push([id, enabled]);
        },
      },
    });
    flushSync();

    // THREE BANDS AND A LIST (issue 1373). The `create` band is GONE.
    assert.deepEqual(
      [...target.querySelector('.manager-tools-main-content').children].map((element) =>
        element.hasAttribute('data-manager-tools-authority')
          ? 'authority'
          : element.hasAttribute('data-manager-tools-search')
            ? 'search'
            : element.hasAttribute('data-manager-tools-sort')
              ? 'sort'
              : 'list'
      ),
      ['authority', 'search', 'sort', 'list']
    );
    const authority = target.querySelector('[data-manager-tools-authority]');
    // THREE, not two (issue 1373): `Inherit`, `Tool-specific`.
    assert.equal(authority.querySelectorAll('[data-tool-authority-segment]').length, 3);
    assert.deepEqual(
      [...authority.children].map((element) =>
        element.classList.contains('manager-tools-authority-heading')
          ? 'heading'
          : element.classList.contains('manager-tools-authority-segments')
            ? 'segments'
            : 'other'
      ),
      ['heading', 'segments']
    );
    assert.ok(
      !authority.querySelector('.manager-tools-authority-caption'),
      'the breakage card is a head and a track, with no caption restating the selected segment'
    );
    // NO GLYPHS on the system card's segments.
    assert.equal(authority.querySelectorAll('[data-tool-authority-segment] i').length, 0);
    authority.querySelector('input[value="checkDriven"]').click();
    assert.deepEqual(authorityChanges, ['checkDriven']);

    assert.ok(
      !target.querySelector('[data-item-drop-zone="tool-create"]'),
      'the system Tool Rules list offers no creation surface at all'
    );
    assert.equal(
      target.querySelector('[data-manager-tools-search] .manager-chip'),
      null,
      'the bare search control does not disguise the result count as a chip'
    );
    assert.match(
      target.querySelector('[data-tool-result-count]').textContent,
      /1 shown .* 1 of 1 in this system/
    );
    // THE THREE MEMBERSHIP SEGMENTS, which are the only route on this screen to a world Tool
    // this system has no rules for.
    assert.deepEqual(
      [...target.querySelectorAll('[data-tool-membership-option]')].map(
        (element) => element.dataset.toolMembershipOption
      ),
      ['in', 'all', 'over']
    );
    // THE BROWSE ARCHETYPE'S FILTER BAR (issue 1515). The search and the membership filter are
    // the screen's two filters and render in one `ManagerToolbar` INSIDE the search card, which
    // is why the band above still reports as `search`: the card is unchanged and the bar nests
    // in it. Identity rather than presence, because two `.manager-toolbar` elements on one
    // screen - a bar per control - is the failure this reads for, and `querySelector` would
    // find the first either way.
    const toolsBar = target.querySelector('[data-manager-tools-search] .manager-toolbar');
    assert.ok(Boolean(toolsBar), 'the Tools search band renders the shared filter bar');
    assert.equal(
      target.querySelectorAll('[data-manager-tools-search] .manager-toolbar').length,
      1,
      'one bar, not one per control'
    );
    assert.ok(
      toolsBar.getAttribute('aria-label')?.length > 0,
      'a `<section>` with no accessible name is not a landmark at all'
    );
    assert.ok(
      Boolean(toolsBar.querySelector('input[type="search"]')),
      'the search field is a control OF the bar'
    );
    assert.ok(
      Boolean(toolsBar.querySelector('[data-tool-membership-filter]')),
      'and so is the membership filter'
    );
    // THE SEGMENTS ARE A SETTING AND STAY OUT OF IT. They author `breakageSource` on the system
    // record rather than narrowing this list, so the bar must not have swept them in.
    assert.ok(
      !toolsBar.querySelector('[data-tool-authority-segment]'),
      'the breakage-source segments are a setting, not a filter'
    );

    // THE ROW SWITCH IS THE SHARED PRIMITIVE (issue 1515, D2).
    const enabledSwitch = target.querySelector('.manager-tools-enabled-toggle');
    assert.ok(Boolean(enabledSwitch), 'the row still writes its enable switch');
    assert.equal(enabledSwitch.tagName, 'BUTTON');
    for (const token of ['fabricate-toggle', 'manager-status-toggle', 'is-on']) {
      assert.ok(
        enabledSwitch.classList.contains(token),
        `the enable switch is the shared control and carries \`${token}\``
      );
    }
    assert.equal(enabledSwitch.getAttribute('aria-pressed'), 'true');
    const switchTrack = enabledSwitch.querySelector('.manager-status-toggle-track');
    assert.ok(Boolean(switchTrack), 'the primitive renders the track');
    assert.ok(
      Boolean(switchTrack.querySelector('.manager-status-toggle-knob')),
      'and the knob INSIDE it - a track with no knob is a switch that cannot show its state'
    );
    // The drop behaviour itself moved WITH the control.

    target.querySelector('.manager-tools-enabled-toggle').click();
    target.querySelector('.manager-tools-library-actions [data-tool-edit-rules]').click();
    assert.deepEqual(enabledChanges, [['tool-catalyst', false]]);
    assert.deepEqual(edits, ['tool-catalyst']);
    assert.deepEqual(
      selections,
      ['tool-catalyst'],
      'the first Tool is selected once while toggle and Edit stay separate'
    );

    const select = target.querySelector('.manager-tools-select-target');
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    select.click();
    assert.deepEqual(selections, ['tool-catalyst', 'tool-catalyst']);
    assert.ok(target.querySelector('[data-tool-library-scroll]'));
    // NO FOOT PAGER ON ONE PAGE (issue 1373). `PROTO-tool-rules.png` draws three rows and no bar
    // under them, and this list shipped a `persistent` one that could only ever read
    // `Showing 1-1 of 1 · Page 1 of 1` beside a result count already saying `1 shown`.
    assert.ok(
      Boolean(target.querySelector('[data-tool-browser-pagination]')),
      'the bottom-pinned pager slot must survive the bar it no longer holds'
    );
    assert.ok(
      !target.querySelector('[data-tool-browser-pagination] .manager-pagination'),
      'a one-page list must draw no foot pager at all'
    );
    // NO ON-BREAK CHIP on a system row. The on-break action is a WORLD default.
    assert.equal(
      [...target.querySelectorAll('.manager-tools-library-chips .manager-chip')].filter((chip) =>
        /Destroys|Marks broken|Replaces/.test(chip.textContent)
      ).length,
      0
    );
  });

  it('clamps a lifted page the library can no longer reach, and leaves a reachable one', () => {
    // Every control in this toolbar resets the page itself, so an out-of-range lifted page is the
    // only way into the clamp from here (issue 1716). The lifted object a test passes is a plain
    // one, which the view reads at first render rather than tracking, so the observation is the
    // write the clamp makes rather than a re-render.
    const twelveTools = Array.from({ length: 12 }, (unused, index) => ({
      ...toolRouteFixture,
      id: `tool-${String(index + 1).padStart(2, '0')}`,
      label: `Tool ${String(index + 1).padStart(2, '0')}`,
    }));

    const unreachable = { ...createToolsBrowserState(), pageIndex: 2 };
    mountToolsBrowser({ tools: twelveTools, browserState: unreachable });
    assert.equal(
      unreachable.pageIndex,
      0,
      'twelve tools over a page of eight is two pages, so page three holds nothing'
    );

    unmount(mounted);
    mounted = null;
    target.remove();

    const reachable = { ...createToolsBrowserState(), pageIndex: 1 };
    mountToolsBrowser({ tools: twelveTools, browserState: reachable });
    assert.equal(
      reachable.pageIndex,
      1,
      'while the last page that still holds rows is left where the GM put it'
    );
  });

  it('draws the foot pager once the rules list runs to a SECOND page', () => {
    // The negative above and this positive are the two halves of one rule.
    const nineTools = Array.from({ length: 9 }, (unused, index) => ({
      ...toolRouteFixture,
      id: `tool-${index}`,
      label: `Tool ${index}`,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: { tools: nineTools, managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }] },
    });
    flushSync();

    assert.equal(
      target.querySelectorAll('.manager-tools-row').length,
      8,
      'the page size the pager is judged against is not the one this list actually pages by'
    );
    const bar = target.querySelector('[data-tool-browser-pagination] .manager-pagination');
    assert.ok(Boolean(bar), 'a two-page list must still draw its foot pager');
    assert.match(bar.querySelector('[data-pagination-summary]').textContent, /of 9/);
    assert.ok(
      Boolean(bar.querySelector('.manager-pagination-nav')),
      'a bar with a second page to reach and no nav would be a summary, not a pager'
    );
  });

  it('does not override a valid Tool selection and emits nothing for an empty library', async () => {
    const selections = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [toolRouteFixture],
        selectedToolId: toolRouteFixture.id,
        onSelectTool: (id) => selections.push(id),
      },
    });
    flushSync();
    await tick();
    flushSync();
    assert.deepEqual(selections, []);

    unmount(mounted);
    target.remove();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [],
        onSelectTool: (id) => selections.push(id),
      },
    });
    flushSync();
    await tick();
    flushSync();
    assert.deepEqual(selections, []);
  });

  it('ends each rules row with the count of THIS system\u2019s recipes that require it', () => {
    // C5 (issue 1373). The design's row ends `[N RECIPES] [Edit rules]`.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [toolRouteFixture],
        managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }],
        systemId: 'sys-forge',
        scope: {
          entityType: 'tool',
          available: true,
          entries: [
            {
              id: 'tool-catalyst',
              entity: { id: 'tool-catalyst', name: 'Artisan Catalyst' },
              systems: [
                { systemId: 'sys-forge', member: true, inherited: {}, recipeCount: 2 },
                { systemId: 'sys-alchemy', member: true, inherited: {}, recipeCount: 9 },
              ],
            },
          ],
        },
      },
    });
    flushSync();

    const cell = target.querySelector('[data-tool-row-recipes="tool-catalyst"]');
    assert.ok(Boolean(cell), 'the row states how much of this system leans on the Tool');
    assert.equal(
      cell.querySelector('strong').textContent,
      '2',
      'the ADDRESSED system\u2019s count, never the other system\u2019s and never their sum'
    );
    assert.match(cell.textContent, /Recipes/);
  });

  it('reads a MISSING per-system count as zero rather than as blank', () => {
    // A world Tool this system has no rules record for cannot be referenced by a recipe here,
    // so `0` is a real answer. Rendering nothing would leave the column ragged and say nothing.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: { tools: [toolRouteFixture], managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }] },
    });
    flushSync();
    assert.equal(
      target.querySelector('[data-tool-row-recipes="tool-catalyst"] strong').textContent,
      '0'
    );
  });

  it('shows canonical validation status on every Tool row and preserves a long label', () => {
    const longLabel =
      'Masterwork Catalyst With An Exceptionally Long Localized Tool Name For Precision Smithing';
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        tools: [
          { ...toolRouteFixture, id: 'valid-tool', label: longLabel },
          { ...toolRouteFixture, id: 'invalid-tool', componentId: null, label: 'Unlinked Tool' },
        ],
        managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }],
      },
    });
    flushSync();

    const validRow = target.querySelector('[data-manager-tool-id="valid-tool"]');
    const invalidRow = target.querySelector('[data-manager-tool-id="invalid-tool"]');
    assert.match(validRow.textContent, new RegExp(longLabel));
    assert.equal(
      validRow.querySelector('[data-tool-validation-status]').dataset.toolValidationStatus,
      'ready'
    );
    assert.match(validRow.querySelector('[data-tool-validation-status]').textContent, /Ready/);
    assert.equal(
      invalidRow.querySelector('[data-tool-validation-status]').dataset.toolValidationStatus,
      'needs-attention'
    );
    assert.match(
      invalidRow.querySelector('[data-tool-validation-status]').textContent,
      /Needs attention/
    );
  });

  async function mountToolRoute({ storeOptions = {}, services = {} } = {}) {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [toolRouteFixture],
          toolDraftValidation: { valid: true, errors: [] },
          ...storeOptions,
        }),
        services: { openCurrentAdmin: () => {}, ...services },
      },
    });
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    navButton('Tool Rules').click();
    await tick();
    flushSync();
    return calls;
  }

  async function openFixtureToolEditor(calls) {
    const row = target.querySelector('[data-manager-tool-id="tool-catalyst"]');
    assert.ok(row, 'the persisted Tool is rendered in the library');
    row.querySelector('.manager-tools-library-actions [data-tool-edit-rules]').click();
    flushSync();
    const openIndex = calls.findIndex((call) => call[0] === 'openToolDraft');
    assert.ok(openIndex >= 0);
    assert.equal(
      calls.slice(openIndex + 1).some((call) => call[0] === 'cancelToolsDraft'),
      false,
      JSON.stringify(calls.slice(openIndex))
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tool-edit');
  }

  it('wires Tool library selection to the shell inspector without restoring an inline editor', async () => {
    const calls = await mountToolRoute();

    // THE TITLE BAND RENDERS HERE NOW (issue 1373). It was suppressed on both Tool routes.
    assert.ok(
      Boolean(target.querySelector('.fabricate-manager > .manager-titlebar')),
      'the Tool library draws the shared title band'
    );
    const contextHeader = target.querySelector(
      '.fabricate-manager > .manager-header[data-tool-library-context]'
    );
    assert.ok(contextHeader, 'the Tool library owns one full-shell context header');
    // THE WHOLE TRAIL, ROOT INCLUDED (issue 1328). This used to be a substring match.
    assert.deepEqual(
      Array.from(contextHeader.querySelectorAll('.manager-breadcrumbs > *'))
        .filter((node) => node.tagName.toLowerCase() !== 'i')
        .map((node) => node.textContent.trim()),
      // 'Tool Rules' is the Tool Studio's screen title since issue 1362 (see the rail
      // relabel). The crumb takes it too: a trail whose leaf disagrees with the heading
      // below it is the WCAG 2.5.3 "Label in Name" hazard the relabel had to avoid.
      // NO `Crafting` CRUMB (issue 1373). It claimed Tool Rules sits inside the Crafting group,
      // and the rail rendered in the same frame shows that group holding Recipes and Settings
      // with Tool Rules a sibling OUTSIDE it. Two navigations one pane apart disagreed about the
      // shape of the app; the rail is the one a GM clicks, and the EDITOR's own trail never had
      // the crumb, so dropping it also makes the two Tool screens agree with each other.
      ['Crafting Systems', 'Alchemy', 'Tool Rules']
    );
    assert.equal(contextHeader.querySelector('.manager-title').textContent, 'Tool Studio');
    assert.match(
      contextHeader.querySelector('.manager-subtitle').textContent,
      /Tools that recipes can require/
    );
    const rail = target.querySelector('.manager-rail');
    assert.equal(
      rail.firstElementChild,
      rail.querySelector('[data-manager-rail-section]'),
      'GM management labels the shared rail before its scope card'
    );
    assert.ok(
      rail.querySelector('[data-manager-scope-select]'),
      'the Tool library retains the shared crafting-system selector'
    );
    const railToggle = rail.querySelector('.manager-scope-card-head [data-manager-rail-toggle]');
    assert.ok(railToggle, 'the Tool library retains the compact in-card rail toggle');
    railToggle.click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('.manager-body').classList.contains('is-rail-collapsed'),
      'the Tool library can collapse the shared rail'
    );
    assert.equal(railToggle.getAttribute('aria-label'), 'Expand navigation rail');
    railToggle.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.manager-body').classList.contains('is-rail-collapsed'),
      false,
      'the compact control remains reachable to expand the Tool library rail'
    );
    assert.equal(
      target.querySelector('#manager-nav-crafting').getAttribute('aria-expanded'),
      'true',
      'the Tool library preserves its Crafting submenu context'
    );
    await tick();
    flushSync();

    const inspector = target.querySelector('[data-tool-browser-inspector]');
    assert.ok(inspector);
    assert.match(inspector.textContent, /Artisan Catalyst/);
    // AN INLINE EDITOR is what this route must not restore.
    // inspector's own route into the tool-edit ROUTE is a different thing and is asserted in
    // its own test below; `[data-manager-tool-editor]` is the inline one.
    assert.equal(target.querySelector('[data-manager-tool-editor]'), null);
    assert.ok(calls.some((call) => call[0] === 'openToolDraft' && call[1] === 'tool-catalyst'));
  });

  // ── THE AUTO-SELECTED ROW IS THE ONE THE GM IS LOOKING AT (issue 1373) ───────────────────
  // The library's auto-selection read `tools[0]` - the raw authored prop - while the list
  // renders `pagedTools`: the membership filter, the search term, the sort key and direction
  // and the page slice, applied in that order. Those two agreed until the design's
  // `SORT BY [Name] [Asc]` control shipped, and the Foundry smoke caught them disagreeing.
  const libraryRowNames = () =>
    [...target.querySelectorAll('.manager-tools-row .manager-tools-select-target strong')].map(
      (node) => node.textContent.trim()
    );
  const selectedLibraryRowNames = () =>
    [
      ...target.querySelectorAll(
        '.manager-tools-row.is-selected .manager-tools-select-target strong'
      ),
    ].map((node) => node.textContent.trim());
  const inspectorSubjectName = () =>
    target.querySelector('[data-tool-browser-inspector] h2')?.textContent.trim() || '';
  const openedToolDraftIds = (calls) => [
    ...new Set(calls.filter((call) => call[0] === 'openToolDraft').map((call) => call[1])),
  ];
  const namedTools = (labels) =>
    labels.map((label, index) => ({ ...toolRouteFixture, id: `tool-order-${index}`, label }));

  /**
   * The world Tool projection this screen widens its list with, built from `[id, name]` pairs.
   *
   * @param {Array<[string, string]>} entries Ordered `[id, name]` pairs.
   * @returns {object} A world tool scope projection.
   */
  const worldToolScope = (entries) => ({
    entityType: 'tool',
    available: true,
    entries: entries.map(([id, name]) => ({ id, entity: { id, name }, systems: [] })),
  });

  /**
   * Mount the Tool rules list on its own.
   *
   * @param {object} props Props overriding the shared defaults.
   * @returns {void}
   */
  function mountToolsBrowser(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ToolsBrowserViewComponent, {
      target,
      props: {
        managedItemOptions: [{ id: 'c1', name: 'Iron Ore' }],
        systemId: 'sys-forge',
        ...props,
      },
    });
    flushSync();
  }

  const libraryRowStates = () =>
    [...target.querySelectorAll('.manager-tools-row')].map(
      (row) => `${row.dataset.managerToolId}:${row.dataset.toolRowMember}`
    );

  /**
   * THE PANE-LEVEL INVARIANT this defect broke, written once (issue 1373).
   *
   * @param {string} why What the pane was doing when the invariant was checked.
   * @returns {void}
   */
  const assertResultCountMatchesRows = (why) => {
    const summary = target.querySelector('[data-tool-result-count]')?.textContent ?? '';
    const drawn = target.querySelectorAll('.manager-tools-row').length;
    assert.equal(
      Number(/^(\d+) shown/.exec(summary)?.[1]),
      drawn,
      `${why}: the result summary reads "${summary}" over ${drawn} drawn row(s)`
    );
  };

  it('auto-selects the row at the top of the SORTED PAGE, not the first authored Tool', async () => {
    // Nine Tools, authored with the alphabetically LAST one first. Name-ascending pages the
    // first eight of them, so the authored-first Tool is not merely further down the list - it
    // is on page two, and selecting it left the inspector describing a Tool the GM could not
    // see at all.
    const calls = await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: namedTools([
          'Zephyr Kiln',
          "Alchemist's Supplies",
          'Arcane Forge',
          'Ley-Line Nexus',
          "Master's Anvil",
          'Moonwell',
          "Smith's Hammer",
          'Volcanic Vent',
          'Woodcarving Tools',
        ]),
      },
    });

    assert.deepEqual(libraryRowNames(), [
      "Alchemist's Supplies",
      'Arcane Forge',
      'Ley-Line Nexus',
      "Master's Anvil",
      'Moonwell',
      "Smith's Hammer",
      'Volcanic Vent',
      'Woodcarving Tools',
    ]);
    assert.equal(
      libraryRowNames().includes('Zephyr Kiln'),
      false,
      'the authored-first Tool sorts onto page two, so nothing on this page can be it'
    );
    assert.deepEqual(
      selectedLibraryRowNames(),
      ["Alchemist's Supplies"],
      'exactly one row is marked, and it is the one drawn at the top of the list'
    );
    assert.equal(
      inspectorSubjectName(),
      "Alchemist's Supplies",
      'the inspector describes the row the GM sees first, not an off-page Tool'
    );
    assert.deepEqual(openedToolDraftIds(calls), ['tool-order-1']);
  });

  it('keeps the auto-selected row marked and on screen when the sort direction flips', async () => {
    const calls = await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: namedTools([
          "Smith's Hammer",
          "Alchemist's Supplies",
          'Arcane Forge',
        ]),
      },
    });
    assert.deepEqual(selectedLibraryRowNames(), ["Alchemist's Supplies"]);

    target.querySelector('[data-tool-sort-direction]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-tool-sort-direction]').dataset.toolSortDirection,
      'desc'
    );
    assert.deepEqual(libraryRowNames(), ["Smith's Hammer", 'Arcane Forge', "Alchemist's Supplies"]);
    // THE SELECTION NEITHER CHASES THE NEW TOP ROW NOR VANISHES. A GM who re-sorts is looking
    // for a Tool, not replacing the one they are inspecting, and the still-valid-selection
    // early return is what keeps the panel still while the list moves under it.
    assert.deepEqual(selectedLibraryRowNames(), ["Alchemist's Supplies"]);
    assert.equal(inspectorSubjectName(), "Alchemist's Supplies");
    assert.deepEqual(
      openedToolDraftIds(calls),
      ['tool-order-1'],
      'a re-sort must not open a second draft'
    );
  });

  it('never auto-selects an UNADOPTED world row through the adopted-Tool callback', async () => {
    // `All world tools` widens the list with `ghostRows` - world Tools this system holds no
    // rules record for. They are inspected through `selectedUnadoptedToolId`, so pushing one
    // through `onSelectTool` would misroute the panel AND latch: an unadopted selection
    // suppresses every later auto-select. The pick therefore skips every non-member row.
    const selections = [];
    mountToolsBrowser({
      tools: [
        { ...toolRouteFixture, id: 'tool-zephyr', label: 'Zephyr Kiln' },
        { ...toolRouteFixture, id: 'tool-basalt', label: 'Basalt Mortar' },
      ],
      scope: worldToolScope([
        ['tool-zephyr', 'Zephyr Kiln'],
        ['tool-basalt', 'Basalt Mortar'],
        ['world-aegis', 'Aegis Crucible'],
      ]),
      onSelectTool: (id) => selections.push(id),
    });
    await tick();
    flushSync();

    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();

    assert.deepEqual(
      libraryRowStates(),
      ['world-aegis:absent', 'tool-basalt:member', 'tool-zephyr:member'],
      'the widened list really does draw an unadopted world row above every member'
    );
    assert.deepEqual(
      selections,
      ['tool-basalt'],
      'the first MEMBER row is selected once, and the unadopted row above it is never pushed through onSelectTool'
    );
  });

  // ── THE COHORT'S ZERO POINT (issue 1373) ────────────────────────────────────────────────
  // The case above mounts TWO adopted Tools, and that is precisely why it could not see the
  // defect these three pin. The list body's three-way branch gated its zero state on the raw
  // `tools` prop — THIS system's adopted Tools — while the counts, the rows, the pager and the
  // result summary were all computed over the widened cohort. With members present the two
  // never disagree; with none adopted, `tools.length === 0` is true and STAYS true whatever the
  // membership segment says, so the zero state won unconditionally and the ghost rows were
  // derived, counted, sorted, paged and then thrown away.
  const THREE_WORLD_TOOLS = [
    ['world-aegis', 'Aegis Crucible'],
    ['world-loom', 'Star Loom'],
    ['world-anvil', 'Deep Anvil'],
  ];
  const WIDENED_GHOST_ROWS = ['world-aegis:absent', 'world-anvil:absent', 'world-loom:absent'];

  it('reaches the world Tools from the zero state BUTTON when the system has adopted none', async () => {
    const selections = [];
    mountToolsBrowser({
      tools: [],
      scope: worldToolScope(THREE_WORLD_TOOLS),
      onSelectTool: (id) => selections.push(id),
    });
    await tick();
    flushSync();

    // THE BUTTON'S OWN PRESENCE IS THE PRECONDITION, so it is asserted rather than assumed.
    const browseWorld = target.querySelector('[data-tool-empty-browse-world]');
    assert.ok(Boolean(browseWorld), 'the zero state offers its near route into the world Tools');
    assert.equal(browseWorld.dataset.toolEmptyBrowseWorld, '3');
    assert.match(browseWorld.textContent, /Show the 3 world Tools you can add/);
    assertResultCountMatchesRows('before the zero state button is pressed');

    browseWorld.click();
    await tick();
    flushSync();

    // PRESSING IT MUST DO SOMETHING, and this is the assertion that did not exist.
    assert.deepEqual(
      libraryRowStates(),
      WIDENED_GHOST_ROWS,
      'the button the panel offers must draw the world Tools it promises'
    );
    assert.ok(
      !target.querySelector('[data-tool-library-empty]'),
      'a list drawing three rows must not also claim there is nothing here'
    );
    // READ FROM THE REGISTRY, NOT RESTATED (issue 1373). This is the exact selector
    // `manager-tool-zero-state-browse-world-1280x720` publishes its frame on, and a restated
    // copy is the drift `labCaseSelector` exists to stop: the copy goes on passing after the
    // case it mirrors changes, and the frame is then published on a state nothing asserts.
    assert.equal(
      target.querySelectorAll(labCaseSelector('manager-tool-zero-state-browse-world-1280x720'))
        .length,
      3,
      'every unadopted row carries the one action it exists for, under the selector the ' +
        'capture case itself waits on'
    );
    assertResultCountMatchesRows('after the zero state button is pressed');
    assert.deepEqual(
      selections,
      [],
      'a page holding no member row selects nothing rather than pushing a ghost id through the adopted-Tool callback'
    );
  });

  it('reaches the world Tools from the membership SEGMENT when the system has adopted none', async () => {
    // THE SECOND SYMPTOM, and it is not inferable from the first.
    mountToolsBrowser({ tools: [], scope: worldToolScope(THREE_WORLD_TOOLS) });
    await tick();
    flushSync();

    // THE COPY AND THE TALLY ARE TWO ELEMENTS SINCE THE CONVERSION (issue 1515). The counts used
    // to be baked into the label string (`All world tools (3)`); `<SegmentedControl>` draws them
    // in its own `count` slot, so the words and the numerals are read separately rather than
    // through one `textContent` that would now report `All world tools3`.
    assert.deepEqual(
      [...target.querySelectorAll('[data-tool-membership-option] .manager-segment-label')].map(
        (label) => label.textContent.trim()
      ),
      ['In this system', 'All world tools', 'Overriding'],
      'the three cohort segments name themselves without their tallies'
    );
    assert.deepEqual(
      [...target.querySelectorAll('[data-tool-membership-option]')].map(
        (option) => option.querySelector('.manager-segment-count')?.textContent.trim() ?? null
      ),
      ['0', '3', null],
      'the segment states a cohort of three against a membership of none, and `Overriding` ' +
        'renders no tally at all rather than a zero it cannot derive'
    );

    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();

    // SELECTION IS READ FROM THE PRIMITIVE'S OWN STATE.
    assert.deepEqual(
      [...target.querySelectorAll('[data-tool-membership-option]')]
        .filter((option) => option.classList.contains('is-active'))
        .map((option) => option.dataset.toolMembershipOption),
      ['all'],
      'exactly one segment is lit, and it is the widened cohort'
    );
    assert.deepEqual(libraryRowStates(), WIDENED_GHOST_ROWS);
    assert.ok(!target.querySelector('[data-tool-library-empty]'));
    assertResultCountMatchesRows('after the membership segment is widened');
    // THE FOOT PAGER SLOT FOLLOWS THE COHORT TOO. It was gated on the same raw prop one layer
    // down, so the slot stayed absent for a zero-member system even once the rows above it drew.
    assert.ok(
      Boolean(target.querySelector('[data-tool-browser-pagination]')),
      'the widened list gets its layout slot back'
    );
    assert.ok(
      !target.querySelector('[data-tool-browser-pagination] .manager-pagination'),
      'a single page still draws no bar inside that slot'
    );
  });

  // TWELVE world Tools, named so name-ascending order is the authored order and a page
  // boundary is readable at a glance. Twelve rather than nine because eight is the page size:
  const TWELVE_WORLD_TOOLS = Array.from({ length: 12 }, (_, index) => [
    `world-page-${String(index + 1).padStart(2, '0')}`,
    `World Tool ${String(index + 1).padStart(2, '0')}`,
  ]);

  it('PAGES a widened ghost-only cohort, which is the state the slot repair exists for', async () => {
    // THE STATE THE PAGER FIX ACTUALLY UNBLOCKS, and until this case nothing asserted it.
    // The two cases above widen to THREE ghosts — one page — so the only thing they can say
    // about the bar is that it is ABSENT, and a predicate that never renders the slot at all
    // satisfies that perfectly. Twelve world Tools at a page size of eight is where the old
    // and new predicates give different answers: gated on `tools.length`, a zero-member system
    // got no slot, the `multiPageOnly` bar had nowhere to draw, and pages 2+ of the widened
    // cohort were unreachable by every control on the screen.
    mountToolsBrowser({ tools: [], scope: worldToolScope(TWELVE_WORLD_TOOLS) });
    await tick();
    flushSync();

    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();

    const bar = target.querySelector('[data-tool-browser-pagination] .manager-pagination');
    assert.ok(
      Boolean(bar),
      'twelve world Tools over eight rows a page is two pages, so the bar must RENDER — ' +
        'asserting only its absence at three rows is satisfied by never rendering the slot'
    );
    assert.equal(
      bar.querySelector('[data-pagination-summary]').textContent.trim(),
      'Showing 1–8 of 12'
    );
    assert.equal(bar.querySelector('[data-pagination-page]').textContent.trim(), 'Page 1 of 2');
    assertResultCountMatchesRows('on page one of a widened ghost-only cohort');

    // AND PAGE TWO IS REACHABLE, which is the half a rendered-but-inert bar would fail. The
    // four remaining ghosts are the tail of the sort, so a slice that silently re-read page one
    // cannot pass here.
    bar.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      libraryRowStates(),
      [
        'world-page-09:absent',
        'world-page-10:absent',
        'world-page-11:absent',
        'world-page-12:absent',
      ],
      'the second page of a cohort this system has adopted none of must be reachable'
    );
    assert.ok(
      !target.querySelector('[data-tool-library-empty]'),
      'page two of a widened cohort is rows, not the zero state'
    );
    assertResultCountMatchesRows('on page two of a widened ghost-only cohort');
  });

  it('LEAVES for the world catalogue when the zero state’s farther route is pressed', async () => {
    // THE TWIN OF THE DEFECT ABOVE, and it sat immediately beside it:
    // BOTH BRANCHES, because the panel renders two different shapes and each has its own View
    // Lab case: the ONE-CTA branch a freshly installed world is in, and the two-button branch
    // where this control is the fallback beside the widening primary.
    const opened = [];
    mountToolsBrowser({
      tools: [],
      scope: worldToolScope([]),
      onOpenWorldCatalogue: () => opened.push('one-cta'),
    });
    await tick();
    flushSync();

    const soleRoute = target.querySelector('[data-tool-empty-open-catalogue]');
    assert.ok(
      Boolean(soleRoute),
      'a world holding no Tools at all offers the catalogue as its only route out'
    );
    assert.ok(
      !target.querySelector('[data-tool-empty-browse-world]'),
      'there is nothing to widen to, so this really is the one-CTA branch'
    );
    soleRoute.click();
    await tick();
    flushSync();
    assert.deepEqual(
      opened,
      ['one-cta'],
      'the only route out of an empty world must actually navigate'
    );

    unmount(mounted);
    mounted = null;
    target.remove();
    mountToolsBrowser({
      tools: [],
      scope: worldToolScope(THREE_WORLD_TOOLS),
      onOpenWorldCatalogue: () => opened.push('two-button'),
    });
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector('[data-tool-empty-browse-world]')),
      'the widening primary renders, so this is the OTHER branch'
    );
    target.querySelector('[data-tool-empty-open-catalogue]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      opened,
      ['one-cta', 'two-button'],
      'the fallback route works in the branch where it is a fallback too'
    );
  });

  it('keeps the zero state for the cohorts that really are empty, and names the filtered one', async () => {
    // THE NEGATIVE HALF, without which the repair above is satisfiable by deleting the zero
    // state outright. Three states must NOT become a row list, and one must become the FILTERED
    // panel rather than the zero state.
    mountToolsBrowser({ tools: [], scope: worldToolScope(THREE_WORLD_TOOLS) });
    await tick();
    flushSync();

    assert.ok(
      Boolean(target.querySelector('[data-tool-library-empty]')),
      '`In this system` on a system holding none is a real zero state'
    );
    assert.ok(
      !target.querySelector('[data-tool-browser-pagination]'),
      'an empty cohort keeps the list card content-sized, exactly as before'
    );

    // `Overriding` WITH NOTHING ADOPTED KEEPS THE ZERO STATE. With nothing adopted the panel's
    // two routes out are the useful answer, and `Nothing matches that filter` is not.
    target.querySelector('[data-tool-membership-option="over"] input').click();
    await tick();
    flushSync();
    assert.ok(Boolean(target.querySelector('[data-tool-library-empty]')));
    assert.ok(Boolean(target.querySelector('[data-tool-empty-browse-world]')));

    // A WORLD HOLDING NO TOOLS EITHER keeps the one-route zero state under every segment.
    unmount(mounted);
    mounted = null;
    target.remove();
    mountToolsBrowser({ tools: [], scope: worldToolScope([]) });
    await tick();
    flushSync();
    assert.ok(Boolean(target.querySelector('[data-tool-library-empty]')));
    assert.ok(
      !target.querySelector('[data-tool-empty-browse-world]'),
      'there is nothing to widen to, so the near route is not offered'
    );
    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();
    assert.ok(Boolean(target.querySelector('[data-tool-library-empty]')));

    // A COHORT NARROWED TO NOTHING BY THE SEARCH IS THE FILTERED STATE.
    unmount(mounted);
    mounted = null;
    target.remove();
    mountToolsBrowser({ tools: [], scope: worldToolScope(THREE_WORLD_TOOLS) });
    await tick();
    flushSync();
    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();
    const search = target.querySelector('[data-manager-tools-search] input[type="search"]');
    search.value = 'quenching trough';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector('[data-tool-library-filtered-empty]')),
      'a cohort that was non-empty before the search term states that, rather than claiming the system holds nothing'
    );
    assert.ok(!target.querySelector('[data-tool-library-empty]'));
    assertResultCountMatchesRows('with the widened cohort searched down to nothing');
  });

  it('never claims more rows in the result summary than the list body draws', async () => {
    // THE PANE-LEVEL INVARIANT, swept across the states that can break it. This is the guard
    // that would have caught the whole CLASS rather than this one instance: a toolbar counting
    // `pagedTools` above a body that draws something else is a contradiction visible without
    // knowing which branch is at fault.
    mountToolsBrowser({
      tools: namedTools([
        'Zephyr Kiln',
        "Alchemist's Supplies",
        'Arcane Forge',
        'Ley-Line Nexus',
        "Master's Anvil",
        'Moonwell',
        "Smith's Hammer",
        'Volcanic Vent',
        'Woodcarving Tools',
      ]),
      scope: worldToolScope(THREE_WORLD_TOOLS),
    });
    await tick();
    flushSync();
    assertResultCountMatchesRows('on a paged single-system list');

    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();
    assertResultCountMatchesRows('on a paged widened list');

    const search = target.querySelector('[data-manager-tools-search] input[type="search"]');
    search.value = 'aegis';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assertResultCountMatchesRows('on a widened list searched down to one world Tool');
    assert.deepEqual(libraryRowStates(), ['world-aegis:absent']);

    // AND AT THE COHORT'S ZERO POINT, which is the state that made the invariant worth writing:
    unmount(mounted);
    mounted = null;
    target.remove();
    mountToolsBrowser({ tools: [], scope: worldToolScope(THREE_WORLD_TOOLS) });
    await tick();
    flushSync();
    assertResultCountMatchesRows('on a system holding no Tools of its own');
    target.querySelector('[data-tool-membership-option="all"] input').click();
    await tick();
    flushSync();
    assertResultCountMatchesRows('on a widened list belonging to a system holding none');
  });

  it('projects configured Tool values into the compact library inspector', async () => {
    await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: [
          {
            ...toolRouteFixture,
            label: "Smith's Hammer",
            description: 'A well-balanced forge hammer.',
            breakage: { mode: 'limitedUses', maxUses: 5 },
            prerequisites: { enabled: true, ids: ['smith'], gateMode: 'usability' },
            bonus: { enabled: true, expression: '@prof' },
          },
        ],
        selectedSystemOverrides: {
          characterPrerequisites: [
            { id: 'smith', name: "Proficient with Smith's Tools", expression: '@skills.smith' },
          ],
        },
      },
    });
    target
      .querySelector('[data-manager-tool-id="tool-catalyst"] .manager-tools-select-target')
      .click();
    await tick();
    flushSync();

    const inspector = target.querySelector('[data-tool-browser-inspector]');
    assert.equal(
      inspector.querySelector('[data-tool-inspector-description]').textContent,
      'A well-balanced forge hammer.'
    );
    // ONE GROUP HEADING, NOT FOUR (issue 1373). Each row used to carry its own kicker —
    // `BREAKAGE` over a row already reading `5 uses` in bold — so the assertions matched the
    // heading and the value together. The heading the panel needs is the one naming the whole
    // group, and it is asserted separately below.
    assert.match(
      inspector.querySelector('[data-tool-inspector-rule="breakage"]').textContent,
      /5 uses/
    );
    assert.match(
      inspector.querySelector('[data-tool-inspector-rule="on-break"]').textContent,
      /destroy the item/i
    );
    assert.match(
      inspector.querySelector('[data-tool-inspector-rule="prerequisites"]').textContent,
      /1 prerequisite/
    );
    assert.match(
      inspector.querySelector('[data-tool-inspector-rule="bonus"]').textContent,
      /Adds @prof/
    );
    // TWO REGIONS, EACH WITH ONE HEADING (issue 1373). This asserted ONE.
    assert.deepEqual(
      Array.from(inspector.querySelectorAll('.manager-tool-inspector-section-kicker')).map((node) =>
        node.textContent.trim()
      ),
      ['Effective rules here', 'Inheritance'],
      'one heading names the resolved rules, a second names where each of them came from'
    );
    const inheritance = inspector.querySelector('[data-tool-inspector-inheritance]');
    assert.ok(Boolean(inheritance), 'the panel states the per-section inherit truth');
    assert.deepEqual(
      Array.from(inheritance.querySelectorAll('[data-tool-inspector-inherit]')).map(
        (row) => `${row.dataset.toolInspectorInherit}:${row.dataset.toolInspectorInheritState}`
      ),
      [
        'breakage:overridden',
        'onBreak:overridden',
        'prerequisites:overridden',
        'bonus:overridden',
      ],
      'all four world-default sections, each with its own state'
    );
    // `overridden` FOUR TIMES IS THE LOAD-BEARING HALF. An absent inherit key reads as
    // INHERITING everywhere in this model, so a region that failed to reach the world join at
    // all would render four `Inherited` pills and look perfectly healthy. This fixture's
    // membership record overrides every section — which is the state every migrated world is in
    // — so the four `overridden` values can only have come from the join.
    assert.equal(
      inheritance.querySelectorAll('[data-tool-inspector-inherit-state="inherited"]').length,
      0
    );
    assert.ok(!inspector.querySelector('[data-tool-inspector-validation]'));
    // Issue 881: the library inspector renders the SAME icon fact row the editor's
    // behavior preview does, from the same behavior-fact projection — one implementation,
    // so the two side panels cannot hold two geometries for one meaning.
    assert.equal(
      inspector.querySelectorAll('.manager-icon-fact-row[data-tool-inspector-rule]').length,
      4
    );
  });

  it('shows canonical validation context in the selected Tool inspector', async () => {
    await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: [
          toolRouteFixture,
          { ...toolRouteFixture, id: 'invalid-tool', componentId: null, label: 'Unlinked Tool' },
        ],
      },
    });
    target
      .querySelector('[data-manager-tool-id="invalid-tool"] .manager-tools-select-target')
      .click();
    await tick();
    flushSync();

    const inspector = target.querySelector('[data-tool-browser-inspector]');
    const status = inspector.querySelector('[data-tool-validation-status]');
    assert.equal(status.dataset.toolValidationStatus, 'needs-attention');
    assert.match(status.textContent, /Needs attention/);
    assert.match(
      inspector.querySelector('[data-tool-inspector-validation]').textContent,
      /1 issue/
    );
  });

  // ── THE INSPECTOR CARRIES A ROUTE INTO THE EDITOR.
  // This test used to assert the opposite — `Edit` on the row and NOTHING in the inspector —
  // on the reasoning that a second pen beside the row's pen is a duplicate affordance. The
  // design says otherwise, and its picture is what settles it: the panel ends in a
  // full-width primary button pinned to the foot of the column, which is where a GM who has
  // just read four resolved rules is looking when they decide to change one.
  it('routes into the Tool editor from the row AND from the foot of the inspector', async () => {
    const calls = await mountToolRoute();
    target
      .querySelector('[data-manager-tool-id="tool-catalyst"] .manager-tools-select-target')
      .click();
    await tick();
    flushSync();

    const inspectorEdit = target.querySelector(
      '[data-tool-browser-inspector] [data-tool-inspector-edit]'
    );
    assert.ok(inspectorEdit, 'the inspector pins its route into the rules editor');
    assert.equal(inspectorEdit.dataset.toolInspectorEdit, 'tool-catalyst');

    target
      .querySelector(
        '[data-manager-tool-id="tool-catalyst"] .manager-tools-library-actions [data-tool-edit-rules]'
      )
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tool-edit');
    assert.ok(calls.some((call) => call[0] === 'openToolDraft' && call[1] === 'tool-catalyst'));
  });

  it('opens the focused Tool editor with header-only actions, three tabs, and preview', async () => {
    const calls = await mountToolRoute();
    await openFixtureToolEditor(calls);

    assert.ok(calls.some((call) => call[0] === 'openToolDraft' && call[1] === 'tool-catalyst'));
    const editor = target.querySelector('[data-tool-edit-view]');
    assert.ok(editor);
    assert.equal(
      target.querySelectorAll('[data-tool-editor-header]').length,
      1,
      'the composed tool-edit route has one identity/action header'
    );
    const editorHeader = target.querySelector('[data-tool-editor-header]');
    assert.equal(
      target.querySelector('.fabricate-manager > .manager-header'),
      null,
      'the editor does not pay for a separate root breadcrumb header'
    );
    // THE TITLE BAND RENDERS HERE TOO (issue 1373). Suppressing it left the Tool editor showing
    // ~18px of empty ground where the reference states the selected system's resolution — and
    // the shared `.manager-header` above IS still suppressed, because this route draws a header
    // of its own; the two gates were never the same decision. `assert.ok(Boolean(...))` rather
    // than an identity comparison: serialising a mounted element for a diff walks its circular
    // tree until the heap dies, so a one-line failure surfaces as an OOM with no message.
    assert.ok(
      Boolean(target.querySelector('.fabricate-manager > .manager-titlebar')),
      'the Tool editor draws the shared title band'
    );
    const editorRail = target.querySelector('.manager-rail');
    assert.equal(
      editorRail.firstElementChild,
      editorRail.querySelector('[data-manager-rail-section]'),
      'the Tool editor shares the GM-management-first rail order'
    );
    assert.ok(
      editorRail.querySelector('[data-manager-scope-select]'),
      'the Tool editor retains the crafting-system selector'
    );
    assert.ok(
      editorRail.querySelector('.manager-scope-card-head [data-manager-rail-toggle]'),
      'the Tool editor retains the compact in-card rail toggle'
    );
    assert.match(
      editorHeader.querySelector('.manager-breadcrumbs').textContent,
      /Crafting Systems.*Alchemy.*Tool Rules.*Artisan Catalyst/
    );
    assert.ok(editorHeader.querySelector('[data-tool-editor-open-systems]'));
    assert.ok(editorHeader.querySelector('[data-tool-editor-open-system]'));
    assert.ok(editorHeader.querySelector('[data-tool-editor-open-tools]'));
    assert.equal(
      target.querySelector('.manager-heading > .manager-title'),
      null,
      'the manager shell must not restore its generic Edit Tool heading above the editor'
    );
    assert.equal(
      target.querySelector('.manager-heading > .manager-subtitle'),
      null,
      'the manager shell must not restore its generic Tool subtitle above the editor'
    );
    // THREE TABS AND NO `Delete` (issue 1373). Identity is world scope's.
    assert.equal(editor.querySelectorAll('[role="tab"]').length, 3);
    assert.ok(editor.querySelector('[data-tool-editor-back]'));
    assert.ok(!editor.querySelector('[data-tool-editor-delete]'));
    assert.ok(editor.querySelector('[data-tool-editor-save]'));
    assert.ok(editor.querySelector('[data-tool-behavior-preview]'));
    assert.equal(editor.querySelector('footer'), null);
  });

  it('keeps replacement authoring Component-only, with no creation surface on this route', async () => {
    const calls = await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: [
          {
            ...toolRouteFixture,
            onBreak: { mode: 'replaceWith', replacementTarget: null },
          },
        ],
      },
    });

    // NO CREATION SURFACE ON THIS ROUTE (issue 1373).
    assert.ok(!target.querySelector('[data-item-drop-zone="tool-create"]'));

    await openFixtureToolEditor(calls);
    target.querySelector('#tool-tab-breakage').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('input[name="tool-replacement-type"]'), null);
    assert.equal(target.querySelector('[data-item-drop-zone="tool-replacement"]'), null);
    assert.ok(target.querySelector('.manager-tool-replacement-component-trigger'));
    assert.equal(target.querySelector('[data-tool-replacement-target] select'), null);
  });

  it('threads system repair vocabularies and enabled features into the Tool editor', async () => {
    const repairTool = {
      ...toolRouteFixture,
      onBreak: { mode: 'flagBroken' },
      repairRequirements: [
        {
          id: 'repair',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'c1' } }],
        },
      ],
    };
    const calls = await mountToolRoute({
      storeOptions: {
        gatheringLibraryTools: [repairTool],
        selectedCurrency: { enabled: true, units: [{ id: 'gp', label: 'Gold' }] },
      },
    });
    await openFixtureToolEditor(calls);
    target.querySelector('#tool-tab-breakage').click();
    await tick();
    flushSync();

    assert.ok(target.querySelector('[data-recipe-add="essence-requirement"]'));
    assert.ok(target.querySelector('[data-recipe-add="cost"]'));
    target.querySelector('.manager-recipe-or-trigger').click();
    await tick();
    flushSync();
    assert.ok(document.querySelector('[data-recipe-add="alternative-essence"]'));
    assert.ok(document.querySelector('[data-recipe-add="alternative-currency"]'));
  });

  it('offers NO Tool creation on the system Tool Rules route, on any drop target', async () => {
    // RETARGETED, NOT DELETED (issue 1373). This test used to drop an Item on this route's own
    // creation zone and assert a system-scope draft opened. Creation moved to the world Tools
    // Catalogue, so what remains to govern here is the half a regression would quietly undo:
    const calls = await mountToolRoute({
      services: {
        resolveToolSource: async (uuid) => ({
          uuid,
          name: 'Dropped Hammer',
          img: 'icons/tools/hand/hammer-cobbler-steel.webp',
          description: '',
        }),
      },
    });

    assert.ok(!target.querySelector('[data-item-drop-zone="tool-create"]'));
    assert.ok(!target.querySelector('[data-tool-create-drop-prompt]'));
    assert.ok(
      !calls.some((call) => call[0] === 'createToolDraft'),
      'nothing on this route opens a system-scope Tool draft from a drop'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tools');
  });

  it('offers NO source drop zone on the system Tool editor, at any tab', async () => {
    // THE RELOCATION, MEASURED AT THE ROUTE (issue 1373). The system editor used to carry the
    // linked-item card, so a crafting system could re-point which world Item a Tool IS.
    const calls = await mountToolRoute({});
    await openFixtureToolEditor(calls);

    assert.ok(!target.querySelector('[data-item-drop-zone="tool-source"]'));
    assert.ok(!target.querySelector('[data-tool-source-copy-uuid]'));
    assert.ok(!target.querySelector('[data-tool-source-unlink]'));
  });

  it('keeps a dirty Tool mounted when navigation chooses Keep editing', async () => {
    const calls = await mountToolRoute({
      services: {
        confirmDirtyToolsNavigation: () => {
          calls.push(['confirmDirtyToolsNavigation']);
          return false;
        },
      },
    });
    await openFixtureToolEditor(calls);
    const input = target.querySelector('[data-tool-label]');
    input.value = 'Changed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    navButton('Component Rules').click();
    await tick();
    flushSync();

    assert.ok(calls.some((call) => call[0] === 'confirmDirtyToolsNavigation'));
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tool-edit');
    assert.ok(target.querySelector('[data-tool-editor-dirty]'));
  });

  it('discards the focused baseline before navigating away', async () => {
    const calls = await mountToolRoute({
      storeOptions: { trackCancelToolsDraft: true },
      services: { confirmDirtyToolsNavigation: () => 'discard' },
    });
    await openFixtureToolEditor(calls);
    const input = target.querySelector('[data-tool-label]');
    input.value = 'Changed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    navButton('Component Rules').click();
    await tick();
    flushSync();

    const discardIndex = calls.findIndex((call) => call[0] === 'discardToolDraft');
    const cancelIndex = calls.findIndex(
      (call, index) => index > discardIndex && call[0] === 'cancelToolsDraft'
    );
    assert.ok(discardIndex >= 0 && cancelIndex > discardIndex);
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
  });

  it('keeps failed Save mounted and opens the recipe-style Validation surface', async () => {
    const calls = await mountToolRoute({
      storeOptions: {
        saveToolDraftResult: false,
        saveFailureValidation: { valid: false, errors: ['Item source is required'] },
      },
    });
    await openFixtureToolEditor(calls);
    const input = target.querySelector('[data-tool-label]');
    input.value = 'Changed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    target.querySelector('[data-tool-editor-save]').click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tool-edit');
    assert.equal(
      target
        .querySelector('[role="tab"][aria-selected="true"]')
        .textContent.trim()
        .startsWith('Validation'),
      true
    );
    // THE IDENTITY FAILURE IS A ROUTED NOTICE.
    assert.ok(!target.querySelector('[data-tool-validation-check="source"]'), 'no identity check');
    assert.match(
      target.querySelector('[data-tool-identity-notice]').textContent,
      /Its identity is set on the world Tool, not here/
    );
    assert.equal(
      target.querySelector('[data-editor-validation-count="blocking"]').textContent,
      '0'
    );
  });

  it('arms its own removal, takes no second dialog, and returns to the library unprompted', async () => {
    // THE CONFIRMATION IS THE CONTROL.
    const calls = await mountToolRoute({
      services: {
        confirmDeleteTool: () => {
          calls.push(['unexpectedDeleteDialog']);
          return true;
        },
        confirmDirtyToolsNavigation: () => {
          calls.push(['unexpectedDirtyPrompt']);
          return false;
        },
      },
    });
    await openFixtureToolEditor(calls);

    const remove = target.querySelector('[data-tool-remove-from-system] button');
    assert.ok(Boolean(remove), 'the Breakage tab closes with the removal callout');
    remove.click();
    await tick();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'removeToolFromSystem'),
      false,
      'arming must not remove'
    );

    target.querySelector('[data-tool-remove-from-system] button').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'removeToolFromSystem' && call[1] === 'tool-catalyst' && call[2] === 'alchemy'
      ),
      'and confirming removes THIS Tool from THIS system'
    );
    assert.equal(
      calls.some((call) => call[0] === 'unexpectedDeleteDialog'),
      false,
      'without a second confirmation the armed control already gave'
    );
    assert.equal(
      calls.some((call) => call[0] === 'unexpectedDirtyPrompt'),
      false
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tools');
  });

  it('keeps system navigation available from both the Tool header and shared rail', async () => {
    const calls = await mountToolRoute();
    await openFixtureToolEditor(calls);
    assert.ok(target.querySelector('[data-manager-scope-select]'));
    target.querySelector('[data-tool-editor-open-system]').click();
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
  });
}
