import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return readFileSync(resolve(__dirname, relPath), 'utf8');
}

const rootSource = read('../../src/ui/svelte/apps/FabricateAppRoot.svelte');
const appSource = read('../../src/ui/SvelteFabricateApp.svelte.js');
const viewSource = read('../../src/ui/svelte/apps/gathering/GatheringView.svelte');
const listSource = read('../../src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
const cardSource = read('../../src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
const cssSource = read('../../styles/fabricate.css');

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

  it('renders GatheringView on the gathering tab while other tabs keep the placeholder', () => {
    assert.ok(rootSource.includes("import GatheringView from './gathering/GatheringView.svelte'"), 'root should import GatheringView');
    assert.ok(rootSource.includes('services = null'), 'root should accept a services prop');
    assert.ok(rootSource.includes("tab.id === 'gathering'"), 'root should branch on the gathering tab');
    assert.ok(rootSource.includes('<GatheringView {services} {scopedEnvironmentId} {scopedTaskId} />'), 'root should render GatheringView with services + the scoped env/task');
    assert.ok(rootSource.includes('fabricate-app-placeholder'), 'other tabs should keep the placeholder');
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

  it('reflows the columns into a single vertical stack below the narrow-width breakpoint', () => {
    // Container query, not a viewport media query: the app width (not the
    // viewport) is what matters because the window is resizable/dockable.
    assert.ok(
      viewSource.includes('container-type: inline-size;'),
      'the grid should establish a size container so the columns reflow against the app width'
    );
    assert.ok(
      viewSource.includes('container-name: fabricate-gathering;'),
      'the grid container should be named for the gathering container query'
    );
    assert.ok(
      viewSource.includes('@container fabricate-gathering (max-width: 900px)'),
      'a container query should drive the narrow-width stacking breakpoint'
    );
    const narrowQuery = viewSource.slice(
      viewSource.indexOf('@container fabricate-gathering (max-width: 900px)')
    );
    assert.ok(
      narrowQuery.includes('grid-template-columns: 1fr;'),
      'below the breakpoint the grid should collapse to a single column (stacked layout)'
    );
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
    // The drag-resize floor lives on the app root in the global stylesheet.
    assert.ok(cssSource.includes('min-width: 1024px;'), 'the app root CSS should floor the window width');
    assert.ok(cssSource.includes('min-height: 640px;'), 'the app root CSS should floor the window height');
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
    assert.ok(listSource.includes('type="search"'), 'search input uses type=search');
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
      listSource.includes("`${environment?.name ?? ''} ${environment?.description ?? ''}`.toLowerCase().includes(normalizedSearchTerm)"),
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
    assert.ok(listSource.includes('totalCount={filtered.length}'), 'pagination total is the filtered count');
    assert.ok(
      listSource.includes('paginated = $derived(filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize))'),
      'paginated slices the filtered list by page'
    );
    assert.ok(
      listSource.includes('if (pageIndex > 0 && pageIndex * pageSize >= filtered.length) pageIndex = 0'),
      'page resets to 0 when the search shrinks results'
    );
  });

  it('themes the unstyled manager-pagination markup with base tokens and renders a no-match message', () => {
    assert.ok(
      listSource.includes(':global(.manager-pagination)'),
      'list themes the manager-pagination markup in the player scope'
    );
    assert.ok(listSource.includes(':global(.manager-icon-button)'), 'list themes the pagination nav buttons');
    assert.ok(listSource.includes('FABRICATE.App.Gathering.Environments.NoMatches'), 'no-match copy localized');
  });
});

describe('EnvironmentCard markup contracts', () => {
  it('exposes stable smoke/test hooks', () => {
    assert.ok(cardSource.includes('data-environment-id={id}'), 'environment id hook');
    assert.ok(cardSource.includes('data-locked='), 'locked hook');
    assert.ok(cardSource.includes('data-selection-mode={selectionMode}'), 'selection-mode hook');
    assert.ok(cardSource.includes('data-selected='), 'selection marker hook');
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

  it('renders locked cards as non-focusable listitems and available cards as buttons', () => {
    assert.ok(cardSource.includes('role="listitem"'), 'locked card is a listitem');
    assert.ok(cardSource.includes('<button'), 'available card is a button');
    assert.ok(cardSource.includes('filter: saturate(0.65) brightness(0.85)'), 'image-only desaturation on locked');
    assert.ok(cardSource.includes('background: var(--fab-success-soft)'), 'selected look uses success-soft');
  });

  it('gives the selected card a full accent border outline (not a focus-killed box-shadow)', () => {
    assert.ok(
      cardSource.includes('.gathering-env-card.is-selected {'),
      'selected rule exists'
    );
    assert.ok(
      cardSource.includes('border-color: var(--fab-accent)'),
      'selected card gets an accent-coloured border outline'
    );
    // The host rule `.fabricate-app button:focus:not(:focus-visible)` clears
    // box-shadow on mouse-click focus, so selection must not rely on one.
    assert.equal(
      cardSource.includes('box-shadow: inset 3px 0 0 var(--fab-accent)'),
      false,
      'selection no longer uses a box-shadow bar (it would vanish on click focus)'
    );
  });

  it('resets the available <button> so Foundry button chrome cannot crop content or padding', () => {
    assert.ok(cardSource.includes('.gathering-env-card.is-available {'), 'available button rule exists');
    assert.ok(cardSource.includes('height: auto'), 'button height is reset to auto so the description is not cropped');
    assert.ok(cardSource.includes('overflow: visible'), 'button overflow is reset so the description is not clipped');
    assert.ok(cardSource.includes('justify-content: flex-start'), 'button content is top-anchored like the locked div');
  });

  it('scopes the hover background so it does not wipe the selection look', () => {
    assert.ok(
      cardSource.includes('.gathering-env-card.is-available:not(.is-selected):hover'),
      'hover background is scoped to :not(.is-selected)'
    );
    assert.equal(
      cardSource.includes('.gathering-env-card.is-available:hover {'),
      false,
      'the unscoped hover rule (which would override selection) is gone'
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

  it('stacks the card vertically with a main row and a clamped description', () => {
    assert.ok(cardSource.includes('gathering-env-card-main'), 'main row container present');
    assert.ok(cardSource.includes('flex-direction: column'), 'card stacks vertically');
    assert.ok(cardSource.includes('gathering-env-card-description'), 'description element present');
    assert.ok(cardSource.includes("description !== ''"), 'description omitted when empty');
    assert.ok(cardSource.includes('-webkit-line-clamp: 2'), 'description clamps to ~2 lines');
    assert.ok(cardSource.includes('min-height: 76px'), 'min-height kept as a growth floor');
  });

  it('puts the blind/event pills in a header bar above the main row, divided by a soft line', () => {
    // Scope ordering to the markup (the top doc-comment also names these classes).
    const markup = cardSource.slice(cardSource.indexOf('{#snippet identity()}'), cardSource.indexOf('<style>'));
    const headerIdx = markup.indexOf('gathering-env-card-header');
    const mainIdx = markup.indexOf('gathering-env-card-main');
    const blindIdx = markup.indexOf('gathering-env-card-blind"');
    const eventIdx = markup.indexOf('gathering-env-card-event');
    assert.ok(headerIdx > -1, 'header bar present');
    // The header is the FIRST child of the card, before the main row.
    assert.ok(headerIdx < mainIdx, 'header markup precedes the main row');
    assert.ok(blindIdx > headerIdx && blindIdx < mainIdx, 'blind chip lives in the header');
    assert.ok(eventIdx > headerIdx && eventIdx < mainIdx, 'event chip lives in the header');
    assert.ok(blindIdx < eventIdx, 'event chip is to the right of the blind chip');
    // The header is a short, full-bleed bar separated from the body by a divider.
    const headerBlock = cardSource.slice(cardSource.indexOf('.gathering-env-card-header {'));
    assert.ok(/border-bottom:\s*1px solid var\(--fab-border\)/.test(headerBlock), 'header has the soft divider line');
    assert.ok(/margin:\s*-10px -10px 0/.test(headerBlock), 'header is full-bleed (negative margins reach the card edges)');
    // The event chip now shows its level name, not just the icon.
    assert.ok(cardSource.includes('gathering-env-card-event-label'), 'event chip renders a level-name label');
  });

  it('uses base tokens only (no manager-only --fab-mv2-* tokens)', () => {
    assert.equal(cardSource.includes('--fab-mv2-'), false, 'no manager-only tokens in the player card');
    assert.equal(listSource.includes('--fab-mv2-'), false, 'no manager-only tokens in the list');
    assert.equal(viewSource.includes('--fab-mv2-'), false, 'no manager-only tokens in the view');
  });

  it('pins each card slot so the bottom card is not squashed by flex-shrink', () => {
    assert.ok(cardSource.includes('gathering-env-card-slot'), 'shared card-slot class present');
    assert.ok(
      cardSource.includes('.gathering-env-card-slot {\n    flex: 0 0 auto;'),
      'card slot pins flex: 0 0 auto so it keeps its natural height'
    );
    // Both the available wrapper and the locked root carry the slot class.
    assert.ok(
      cardSource.includes('<div class="gathering-env-card-slot" role="listitem">'),
      'available card wrapper carries the slot class'
    );
    assert.ok(
      cardSource.includes('class="gathering-env-card is-locked gathering-env-card-slot"'),
      'locked card root carries the slot class'
    );
  });

  it('uses a decorative empty alt on the thumbnail', () => {
    assert.ok(cardSource.includes('alt=""'), 'thumbnail is decorative');
    assert.ok(cardSource.includes('title={name}'), 'name carries a title for the ellipsis');
  });
});
