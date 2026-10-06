import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'svelte/compiler';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return readFileSync(resolve(__dirname, relPath), 'utf8');
}

const rootSource = read('../../src/ui/svelte/apps/FabricateAppRoot.svelte');
const appSource = read('../../src/ui/SvelteFabricateApp.svelte.js');
const viewSource = read('../../src/ui/svelte/apps/gathering/GatheringView.svelte');
const responsiveViewSources = [
  ['inventory', read('../../src/ui/svelte/apps/inventory/InventoryView.svelte'), '220px'],
  ['gathering', viewSource, '220px'],
  ['crafting', read('../../src/ui/svelte/apps/crafting/CraftingView.svelte'), '220px'],
  ['alchemy', read('../../src/ui/svelte/apps/alchemy/AlchemyView.svelte'), '240px'],
];
const journalSource = read('../../src/ui/svelte/apps/journal/JournalView.svelte');
const listSource = read('../../src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
const cardSource = read('../../src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
const cssSource = read('../../styles/fabricate.css');
const cardCss = compile(cardSource, { filename: 'EnvironmentCard.svelte', css: 'external' }).css.code;

/** The compiled declarations of the card rule whose selector starts with `selector`. */
function cardRule(selector) {
  const start = cardCss.indexOf(`${selector}`);
  assert.ok(start >= 0, `no compiled rule for ${selector}`);
  return cardCss.slice(cardCss.indexOf('{', start) + 1, cardCss.indexOf('}', start));
}

describe('Fabricate app wiring for the gathering tab', () => {
  it('exposes listGatheringForActor and passes services down', () => {
    assert.ok(
      appSource.includes('game?.fabricate?.listGatheringForActor?.({') && appSource.includes('presentTools: presentTools(),'),
      'app should add the listGatheringForActor service threading the system-scoped active canvas tool'
    );
    assert.equal(
      appSource.includes('nodeStateOverride'),
      false,
      'the per-attempt node-state override seam is removed; listing reads the env node directly'
    );
    assert.ok(
      appSource.includes('getGatheringDropBreakdown: (opts = {}) => game?.fabricate?.getGatheringDropBreakdown?.(opts) ?? null'),
      'app should add the getGatheringDropBreakdown service'
    );
    assert.ok(appSource.includes('services: this._services'), 'app should pass the services prop');
  });

  it('threads the active canvas tool into the gathering start-attempt service', () => {
    assert.ok(
      appSource.includes('getActiveCanvasTool: () => this._activeCanvasTool ?? null'),
      'app should expose getActiveCanvasTool through the services bag'
    );
    assert.ok(
      appSource.includes('game?.fabricate?.startGatheringAttempt?.({') && appSource.includes('presentTools: presentTools(),'),
      'startGatheringAttempt should carry the derived system-scoped presentTools'
    );
  });

  it('renders GatheringView on the gathering tab (every tab now routes to a real view)', () => {
    assert.ok(rootSource.includes("import GatheringView from './gathering/GatheringView.svelte'"), 'root should import GatheringView');
    assert.ok(rootSource.includes('services = null'), 'root should accept a services prop');
    // `tab.tabId`, not `tab.id`: a rail entry is addressed by its ROUTE KEY since issue 1198
    // and carries the bare tab id separately, so a Core branch reads the bare id.
    assert.ok(rootSource.includes("tab.tabId === 'gathering'"), 'root should branch on the gathering tab');
    assert.ok(rootSource.includes('<GatheringView {services} {scopedEnvironmentId} {scopedTaskId} />'), 'root should render GatheringView with services + the scoped env/task');
    assert.ok(!rootSource.includes('fabricate-app-placeholder'), 'the coming-soon placeholder is gone now the alchemy tab is implemented');
  });
});

describe('GatheringView 3-column layout and states', () => {
  it('renders a 3-column grid with the center column larger', () => {
    assert.ok(
      viewSource.includes('grid-template-columns: minmax(280px, 1fr) minmax(280px, 1.5fr) minmax(280px, 1fr)'),
      'grid should use the planned column template with a non-zero centre-column minimum'
    );
    assert.ok(viewSource.includes('gap: var(--fab-space-4)'), 'grid should use the base spacing token gap');
    assert.ok(viewSource.includes('gathering-view-column-left'), 'left column present');
    assert.ok(viewSource.includes('gathering-view-column-center'), 'center column present');
    assert.ok(viewSource.includes('gathering-view-column-right'), 'right column present');
  });

  it('gives the centre column a non-zero minimum so it cannot collapse ahead of the side columns', () => {
    assert.equal(
      viewSource.includes('minmax(0, 1.5fr)'),
      false,
      'the centre column must not use a 0px minimum (issue 330: it collapsed before the side columns yielded)'
    );
    assert.ok(
      viewSource.includes('minmax(280px, 1.5fr)'),
      'the centre column minimum should match the 280px floor of the side columns so all three scale together'
    );
  });

  it('reflows every player layout at the reachable shared narrow-width breakpoint', () => {
    // Container query, not a viewport media query.
    assert.ok(
      viewSource.includes('container-type: inline-size;'),
      'the grid should establish a size container so the columns reflow against the app width'
    );
    assert.ok(
      viewSource.includes('container-name: fabricate-gathering;'),
      'the grid container should be named for the gathering container query'
    );
    for (const [name, source, minimumHeight] of responsiveViewSources) {
      const marker = `@container fabricate-${name} (max-width: 960px)`;
      assert.ok(source.includes(marker), `${name} should use the shared 960px breakpoint`);
      const narrowQuery = source.slice(source.indexOf(marker));
      assert.ok(
        narrowQuery.includes('grid-template-columns: 1fr;') &&
          narrowQuery.includes('grid-auto-rows: minmax(min-content, max-content);') &&
          narrowQuery.includes('overflow-y: auto;') &&
          narrowQuery.includes(`min-height: ${minimumHeight};`),
        `${name} should retain its one-column, auto-row, scrolling, ${minimumHeight} minimum layout`
      );
      assert.match(
        source.slice(source.lastIndexOf('/*', source.indexOf(marker)), source.indexOf(marker)),
        /1024px.*938px.*960px/s,
        `${name} should explain the 1024px window, approximately 938px content box, and 960px coupling`
      );
    }
  });

  it('stacks Journal browse sections before detail at the shared breakpoint', () => {
    assert.match(journalSource, /container:\s*fabricate-journal\s*\/\s*inline-size;/);
    const marker = '@container fabricate-journal (max-width: 960px)';
    assert.ok(journalSource.includes(marker));
    const narrow = journalSource.slice(journalSource.indexOf(marker));
    assert.match(narrow, /\.journal-view-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*height:\s*auto;/);
    for (const wrapper of ['journal-browse', 'journal-browse-lists']) {
      assert.match(narrow, new RegExp(`\\.${wrapper}\\s*\\{\\s*display: contents;`));
    }
    assert.match(narrow, /journal-list-section\)[^{]*\{[^}]*box-sizing:\s*border-box;[^}]*height:\s*360px;[^}]*min-height:\s*360px;/);
    assert.match(narrow, /\.journal-detail-pane\s*\{[^}]*min-height:\s*220px;[^}]*overflow:\s*visible;/);
    const positions = ['<ActiveRunsList', '<HistoryList', '<RunDetail'].map((tag) => {
      const index = journalSource.indexOf(tag);
      assert.ok(index >= 0, `${tag} remains rendered`);
      return index;
    });
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  });

  it('enforces a minimum window size on the Fabricate app so the columns cannot be clipped', () => {
    // ApplicationV2 V13 has no `position.minWidth`/`minHeight` (the position
    // object is non-extensible, assigning to it throws), so the floor is enforced
    // via a CSS min-size on the app root plus a clamp in `_updatePosition` — the V13
    // position-transform hook applied by BOTH setPosition() and drag-resize. (The
    // pointer-only `_onResize` drag handler does not consume a returned position in
    // V13, so clamping there would be dead code.)
    assert.equal(
      appSource.includes('minWidth: 1024'),
      false,
      'the app must not put minWidth in the non-extensible position option (V13 throws "object is not extensible")'
    );
    assert.ok(appSource.includes('MIN_WINDOW_WIDTH = 1024'), 'the app should define the minimum window width derived from the column minimums');
    assert.ok(appSource.includes('MIN_WINDOW_HEIGHT = 640'), 'the app should define the minimum window height');
    assert.ok(appSource.includes('_updatePosition(position)'), 'the app should clamp the min size in _updatePosition, the V13 hook applied by setPosition and drag-resize');
    assert.ok(appSource.includes('super._updatePosition(position)'), 'the clamp should resolve the base position first, then floor it');
    assert.ok(
      appSource.includes('Math.max(result.width, SvelteFabricateApp.MIN_WINDOW_WIDTH)')
        && appSource.includes('Math.max(result.height, SvelteFabricateApp.MIN_WINDOW_HEIGHT)'),
      'the clamp should floor both width and height at the configured minimum'
    );
    // The drag-resize floor lives on `.fabricate.fabricate-app-window` in the global stylesheet —
    // the PLAYER-ONLY class, not the shared `.fabricate-app` area class the three canvas
    // interactables windows adopted in issue 1520.
    assert.ok(cssSource.includes('min-width: 1024px;'), 'the sheet should floor the player window width');
    assert.ok(cssSource.includes('min-height: 640px;'), 'the sheet should floor the player window height');
  });

  it('localizes the loading, error, and empty states', () => {
    assert.ok(viewSource.includes('FABRICATE.App.Gathering.Loading'), 'loading copy localized');
    assert.ok(viewSource.includes('FABRICATE.App.Gathering.Error'), 'error copy localized');
    assert.ok(viewSource.includes('FABRICATE.App.Gathering.Environments.Empty'), 'empty copy localized');
  });

  it('treats a missing actor or no environments as the empty state', () => {
    assert.ok(viewSource.includes('listing?.selectedActorId'), 'no-actor collapses to empty');
    assert.ok(viewSource.includes('environments.length === 0'), 'no environments collapses to empty');
  });

  it('fetches via the injected service and owns the selection', () => {
    assert.ok(viewSource.includes('services?.listGatheringForActor?.'), 'view fetches via the service');
    assert.ok(viewSource.includes('let selectedId = $state(null)'), 'view owns selectedId');
  });
});

describe('GatheringEnvironmentList labeled region', () => {
  it('is a labeled region (not a tablist) with title and hint', () => {
    assert.ok(listSource.includes('aria-labelledby={titleId}'), 'region labeled by its title');
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.Title'), 'region title localized');
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.Hint'), 'region hint localized');
    assert.equal(listSource.includes('role="tablist"'), false, 'must not be a tablist');
  });

  it('renders a role=list with available-before-locked ordering and clamps width', () => {
    assert.ok(listSource.includes('role="list"'), 'card container is a list');
    assert.ok(listSource.includes("environment?.locked !== true"), 'available environments first');
    assert.ok(listSource.includes("environment?.locked === true"), 'locked environments after');
    assert.ok(listSource.includes('min-width: 0'), 'inner scroll clamps width');
    assert.ok(listSource.includes('overflow: hidden'), 'inner scroll hides horizontal overflow');
  });

  it('reserves a scrollbar gutter with whitespace so the layout does not shift', () => {
    assert.ok(listSource.includes('scrollbar-gutter: stable'), 'scroll reserves a stable scrollbar gutter');
    assert.ok(listSource.includes('padding-right: var(--fab-space-2)'), 'scroll padding-right uses the base spacing token');
    assert.equal(listSource.includes('padding-right: 2px'), false, 'the old 2px padding-right is gone');
  });

  it('renders a base-token search box wired to the localized placeholder/label', () => {
    assert.ok(listSource.includes('gathering-env-search'), 'search box element present');
    assert.ok(listSource.includes('bind:value={searchTerm}'), 'search input binds to searchTerm');
    assert.ok(listSource.includes("let searchTerm = $state('')"), 'searchTerm is rune state');
    assert.ok(
      listSource.includes("const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase())"),
      'normalizedSearchTerm derives the lowercased trimmed term'
    );
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.SearchPlaceholder'), 'placeholder localized');
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.SearchLabel'), 'aria-label localized');
  });

  it('filters the ordered list by a case-insensitive name+description substring match', () => {
    assert.ok(
      /`\$\{environment\?\.name \?\? ''\} \$\{environment\?\.description \?\? ''\}`\s*\.toLowerCase\(\)\s*\.includes\(normalizedSearchTerm\)/.test(listSource),
      'filter matches name + description case-insensitively'
    );
  });

  it('imports and renders the shared Pagination component with the right defaults', () => {
    assert.ok(
      listSource.includes("import Pagination from '../../components/Pagination.svelte'"),
      'list imports the shared Pagination component'
    );
    assert.ok(listSource.includes('let pageSize = $state(6)'), 'pageSize defaults to 6');
    assert.ok(listSource.includes('const pageSizeOptions = [6, 9, 12]'), 'pageSizeOptions are [6, 9, 12]');
    assert.ok(listSource.includes('let pageIndex = $state(0)'), 'pageIndex defaults to 0');
    assert.ok(listSource.includes('totalCount={visible.length}'), 'pagination total is the post-toggle visible count');
    assert.ok(
      listSource.includes('paginated = $derived(visible.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize))'),
      'paginated slices the post-toggle visible list by page'
    );
    assert.ok(
      listSource.includes('if (pageIndex > 0 && pageIndex * pageSize >= visible.length) pageIndex = 0'),
      'page resets to 0 when the visible set shrinks'
    );
  });

  it('renders a no-match message', () => {
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.NoMatches'), 'no-match copy localized');
  });

  // Issue 1518: the shared pager paints itself, so no gathering column re-themes its markup.
  it('declares nothing for the shared pager’s own markup in any gathering column', () => {
    for (const file of ['GatheringEnvironmentList', 'GatheringTasksPanel', 'GatheringEventsPanel']) {
      const path = `src/ui/svelte/apps/gathering/${file}.svelte`;
      const { css } = compile(read(`../../${path}`), { filename: path, css: 'external' });
      assert.doesNotMatch(css?.code ?? '', /manager-(?:pagination|icon-button)/u, file);
    }
  });
});

describe('EnvironmentCard markup contracts', () => {
  it('exposes stable smoke/test hooks', () => {
    assert.ok(cardSource.includes('data-environment-id={id}'), 'environment id hook');
    assert.ok(cardSource.includes('data-locked='), 'locked hook');
    assert.ok(cardSource.includes('data-selection-mode={selectionMode}'), 'selection-mode hook');
    assert.ok(cardSource.includes("'data-selected':"), 'selection marker hook, on the row’s button');
  });

  it('guards the (x/y) discovered suffix behind blind && revealPolicy !== never', () => {
    assert.ok(
      cardSource.includes("blind && revealPolicy !== 'never'"),
      'discovered suffix is gated by blind + reveal policy'
    );
    assert.ok(cardSource.includes('FABRICATE.App.Gathering.Environments.Discovered'), 'discovered label localized');
    assert.ok(cardSource.includes('aria-label={discoveredLabel}'), 'discovered suffix has an accessible label');
  });

  it('renders biome chips with per-chip color tokens and color-mix base styling', () => {
    // The per-chip --fab-chip-color declaration now comes from the shared
    // gatheringFormat.biomeChipStyle helper rather than an inline copy.
    assert.ok(
      cardSource.includes("import { riskClass, riskLabel, biomeChipStyle } from '../../util/gatheringFormat.js'"),
      'card imports the shared biomeChipStyle helper'
    );
    assert.ok(cardSource.includes('style={biomeChipStyle(tag)}'), 'each chip sets its style via biomeChipStyle');
    assert.ok(
      cardSource.includes('color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised))'),
      'chip background uses color-mix'
    );
    assert.ok(
      cardSource.includes('color-mix(in srgb, var(--fab-chip-color) 50%, transparent)'),
      'chip border uses color-mix'
    );
  });

  it('shows the blind mask icon + chip and the lock icon + label', () => {
    assert.ok(cardSource.includes('fas fa-mask'), 'blind mask icon');
    assert.ok(cardSource.includes('FABRICATE.App.Gathering.Environments.BlindChip'), 'blind chip localized');
    assert.ok(cardSource.includes('fas fa-lock'), 'lock icon');
    assert.ok(cardSource.includes('FABRICATE.App.Gathering.Environments.LockedAria'), 'locked accessible label');
  });

  // Issue 1778: the card is the selectable list row; a locked teaser is that row with no control.
  it('draws both shapes as list-row listitems, only the available one opening through its button', () => {
    assert.ok(cardSource.includes("import ListRow from '../../components/ListRow.svelte'"));
    assert.equal(cardSource.match(/role="listitem"/gu)?.length, 2, 'the locked and the available row');
    assert.equal(cardSource.match(/onOpen=/gu)?.length, 1, 'only the available row opens');
    assert.ok(!cardSource.includes('<button'), 'the only button is the list row’s own');
  });

  it('leaves the selected look to the list row’s accent edge, and keeps the locked desaturation', () => {
    assert.doesNotMatch(cardCss, /success-soft|is-selected|:hover|--fab-accent/u, 'no selection paint of its own');
    assert.match(
      cardRule('.gathering-env-card.is-locked .gathering-env-card-thumb'),
      /filter: saturate\(0\.65\) brightness\(0\.85\);/u,
      'image-only desaturation on locked'
    );
  });

  it('renders the lock as an overlay over the thumbnail, not a separate chip', () => {
    assert.ok(cardSource.includes('gathering-env-card-thumb-wrap'), 'thumb has a relative wrapper');
    assert.ok(cardSource.includes('gathering-env-card-lock-overlay'), 'lock overlay element present');
    assert.ok(
      cardSource.includes('background: var(--fab-overlay-dark-48)'),
      'lock overlay scrim uses the theme-aware dark overlay token'
    );
    assert.equal(
      cardSource.includes('gathering-env-card-lock'),
      cardSource.includes('gathering-env-card-lock-overlay'),
      'the only lock-prefixed class is the overlay (the old chip is removed)'
    );
    assert.equal(
      cardSource.includes('gathering-env-card-lock-label'),
      false,
      'the removed lock chip label element is gone'
    );
  });

  it('clamps the description, a span, to two lines', () => {
    assert.ok(cardSource.includes('<span class="gathering-env-card-description">'), 'phrasing content');
    assert.ok(cardSource.includes("description !== ''"), 'description omitted when empty');
    assert.match(cardRule('.gathering-env-card-description'), /-webkit-line-clamp: 2;/u);
  });

  it('puts the discovered count, the selection-mode summary, the realm alert and the danger pill in that order among the badges', () => {
    const start = cardSource.indexOf('{#snippet badges()}');
    const badges = cardSource.slice(start, cardSource.indexOf('{/snippet}', start));
    const order = [
      'gathering-env-card-discovered',
      'gathering-env-card-blind"',
      'gathering-env-card-realm-alert',
      'gathering-env-card-event ',
    ].map((name) => badges.indexOf(name));
    assert.ok(order.every((index) => index >= 0), 'each is a badge');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in reading order');
    assert.ok(cardSource.includes('gathering-env-card-event-label'), 'the danger pill names its level');
  });

  it('uses base tokens only (no area-scoped --fab-manager-* properties)', () => {
    // `--fab-manager-*` is the prefix for an area-scoped custom property.
    assert.equal(cardSource.includes('--fab-manager-'), false, 'no area-scoped properties in the player card');
    assert.equal(listSource.includes('--fab-manager-'), false, 'no area-scoped properties in the list');
    assert.equal(viewSource.includes('--fab-manager-'), false, 'no area-scoped properties in the view');
  });

  it('pins each row so the bottom card is not squashed by flex-shrink, and keeps its 76px floor', () => {
    const slot = cardRule('.gathering-env-card-slot');
    assert.match(slot, /flex: 0 0 auto;/u, 'the row keeps its natural height');
    assert.match(slot, /min-height: 76px;/u, 'never under the card’s floor');
    assert.equal(cardSource.match(/gathering-env-card-slot"/gu)?.length, 2, 'on both rows');
  });

  it('uses a decorative empty alt on the thumbnail, and the row draws the titled name', () => {
    assert.ok(cardSource.includes('alt=""'), 'thumbnail is decorative');
    assert.ok(cardSource.includes('nameClass="gathering-env-card-name"'), 'the list row’s name keeps the card’s class');
  });
});
