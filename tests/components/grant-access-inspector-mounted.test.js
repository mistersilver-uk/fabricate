import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness
} from '../helpers/svelte-component-harness.js';
import { itResolvesTheRecipesOwnImage } from '../helpers/recipeOwnImageCases.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-grant-access-',
  rawModules: [
    // Issue 1513: the shared `<Pagination>` imports `<Select>`, which reaches
    // `SearchablePopover`'s whole raw closure whether or not `showPageSize={false}`
    // ever renders one. A raw module missing from a manifest does not fail the suite —
    // the harness throws in `before()` and every subtest reports `# cancelled`.
    // It already carries `foundryBridge.js` and `listReorderAnnouncement.js`, so this list does
    // not restate them: a duplicate entry is not an error the harness reports, it is a
    // hand-maintained mirror that quietly disagrees with its source.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/utils/recipeCategories.js',
    // The inspector's lifted roster view-state (issue 1438).
    'src/utils/managerBrowserViewState.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    // Issue 1513: the roster pager is the shared primitive now, and `SELECT_COMPILED_MODULES`
    // is the compiled closure it reaches through — which also covers the manager's ONE chip
    // (issue 883) and the shared no-state primitive (issue 785) this tree already rendered.
    'src/ui/svelte/components/Pagination.svelte',
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/apps/manager/RosterRow.svelte',
    'src/ui/svelte/apps/manager/GrantAccessInspector.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/GrantAccessInspector.svelte'
});

function makeRecipe(access = { characterIds: [], playerIds: [] }) {
  return {
    id: 'alloy',
    name: 'Alloy Bronze',
    img: 'icons/svg/book.svg',
    category: 'smithing',
    access,
    accessSummary: {
      characterCount: access.characterIds.length,
      playerCount: access.playerIds.length
    }
  };
}

function makeCharacters(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, name: `Char ${i + 1}`, img: '' }));
}

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    role: i === 0 ? 'Game Master' : 'Player',
    color: '#3366cc'
  }));
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('GrantAccessInspector (mounted)', () => {
  it('renders both rosters with the character and player rows', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(2),
      players: makePlayers(2)
    });

    assert.ok(root.querySelector('[data-access-roster="characters"]'));
    assert.ok(root.querySelector('[data-access-roster="players"]'));
    assert.equal(root.querySelectorAll('[data-access-character-row]').length, 2);
    assert.equal(root.querySelectorAll('[data-access-player-row]').length, 2);
    // Players show the user's human-readable role as the subtitle and tint the
    // leading icon with the user's colour.
    assert.equal(
      root.querySelector('[data-access-roster="players"] .manager-roster-subtitle').textContent.trim(),
      'Game Master'
    );
    const playerIcon = root.querySelector('[data-access-roster="players"] .manager-roster-icon i');
    assert.ok(playerIcon.getAttribute('style')?.includes('#3366cc'), 'player icon tinted with the user colour');
  });

  it('shows the "no one has access yet" summary when nothing is granted', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(1),
      players: makePlayers(1)
    });
    const summary = root.querySelector('[data-access-summary]');
    assert.equal(summary.querySelector('span').textContent.trim(), 'No one has access yet');
    assert.ok(summary.classList.contains('is-danger'));
  });

  it('toggling a character grants it independently with the full snapshot', async () => {
    const calls = [];
    const root = await harness.mount({
      recipe: makeRecipe({ characterIds: [], playerIds: ['p2'] }),
      characters: makeCharacters(2),
      players: makePlayers(2),
      onSaveAccess: (recipeId, access) => calls.push({ recipeId, access })
    });

    // Toggle the first character on; the existing player grant must be preserved.
    const charToggle = root.querySelector('[data-access-character-row] .manager-status-toggle');
    charToggle.click();
    flushSync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].recipeId, 'alloy');
    assert.deepEqual(calls[0].access, { characterIds: ['c1'], playerIds: ['p2'] });
  });

  it('toggling a player grants it independently with the full snapshot', async () => {
    const calls = [];
    const root = await harness.mount({
      recipe: makeRecipe({ characterIds: ['c1'], playerIds: [] }),
      characters: makeCharacters(2),
      players: makePlayers(2),
      onSaveAccess: (recipeId, access) => calls.push({ recipeId, access })
    });

    const playerToggle = root.querySelector('[data-access-player-row] .manager-status-toggle');
    playerToggle.click();
    flushSync();

    assert.deepEqual(calls[0].access, { characterIds: ['c1'], playerIds: ['p1'] });
  });

  // ── THE PAGER IS THE SHARED PRIMITIVE (issue 1513) ─────────────────────────────────────
  // The hand-rolled label-plus-two-arrows bar carried `data-access-roster-next="characters"`,
  // a hook that named its own roster. `Pagination` stamps a bare `data-pagination-next` with
  // no per-instance key, and this screen draws TWO of them — so every query below goes through
  // `[data-access-roster="…"]`, which is the only thing that tells the character bar from the
  // player one. A query written without that ancestor resolves to whichever bar is first in
  // document order and passes for the wrong reason.
  it('paginates each roster at page size 6 and keeps grant state across pages', async () => {
    const calls = [];
    // c7 is on page 2 and already granted — paging must not drop it.
    const root = await harness.mount({
      recipe: makeRecipe({ characterIds: ['c7'], playerIds: [] }),
      characters: makeCharacters(8),
      players: makePlayers(2),
      onSaveAccess: (recipeId, access) => calls.push({ recipeId, access })
    });

    // Page 1 shows 6 of 8 characters.
    assert.equal(root.querySelectorAll('[data-access-character-row]').length, 6);

    // The retired bar is gone entirely rather than merely unused.
    assert.equal(root.querySelectorAll('[data-access-roster-pager]').length, 0);
    assert.equal(root.querySelectorAll('[data-access-roster-next]').length, 0);

    // THE RANGE LINE, which the hand-rolled bar never drew. It is what the shared primitive
    // adds here, and it is UNPHOTOGRAPHABLE by this change's View Lab fixtures — the lab world
    // seeds three characters and two users against a threshold of seven — so this assertion is
    // what holds it.
    const summary = () =>
      root
        .querySelector('[data-access-roster="characters"] [data-pagination-summary]')
        .textContent.trim();
    assert.equal(summary(), 'Showing 1–6 of 8');

    // The PLAYER roster has two rows and therefore no bar at all, which is what makes the
    // ancestor-scoped query above a real discriminator rather than a longer way to write the
    // same thing.
    assert.ok(
      !root.querySelector('[data-access-roster="players"] [data-pagination-next]'),
      'a two-row roster draws no pager'
    );

    const next = root.querySelector('[data-access-roster="characters"] [data-pagination-next]');
    next.click();
    flushSync();

    assert.equal(summary(), 'Showing 7–8 of 8');

    // Page 2 shows the remaining 2 characters.
    assert.equal(root.querySelectorAll('[data-access-character-row]').length, 2);
    // c7 (granted) is on page 2 and its toggle reflects the granted state.
    const toggles = root.querySelectorAll('[data-access-character-row] .manager-status-toggle');
    const grantedToggle = Array.from(toggles).find((t) => t.getAttribute('aria-pressed') === 'true');
    assert.ok(grantedToggle, 'the granted character on page 2 keeps its on state');

    // Granting c8 on page 2 sends the full snapshot including the pre-existing c7 grant.
    const ungranted = Array.from(toggles).find((t) => t.getAttribute('aria-pressed') === 'false');
    ungranted.click();
    flushSync();
    assert.deepEqual(calls[0].access.characterIds.sort(), ['c7', 'c8']);
  });

  // ── TWO PAGERS AT ONCE, WHICH IS THE STATE NO FIXTURE HELD (issue 1513, review r1) ─────
  // Every pager assertion above mounts a roster long enough to page and a second roster of two,
  // so exactly ONE bar renders and `[data-access-roster="…"]` discriminates nothing. Measured:
  // re-pointing the PLAYERS section's `onPageChange` at `ui.characterPageIndex` shipped GREEN
  // against the whole suite, because the crossed write moved a page index no rendered bar read.
  // The fix is a fixture, not another assertion: both rosters over the page size at once.
  it('draws a pager per roster and each one pages only its own rows', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(8),
      players: makePlayers(8)
    });

    const summaryOf = (key) =>
      root.querySelector(`[data-access-roster="${key}"] [data-pagination-summary]`).textContent.trim();

    assert.equal(
      root.querySelectorAll('[data-pagination-next]').length,
      2,
      'eight rows in each roster draws both bars, which is the only fixture that can tell them apart'
    );
    assert.equal(summaryOf('characters'), 'Showing 1–6 of 8');
    assert.equal(summaryOf('players'), 'Showing 1–6 of 8');

    root.querySelector('[data-access-roster="players"] [data-pagination-next]').click();
    flushSync();

    assert.equal(summaryOf('players'), 'Showing 7–8 of 8', 'the players bar advanced its own roster');
    assert.equal(
      summaryOf('characters'),
      'Showing 1–6 of 8',
      'and the characters bar did NOT move: a crossed onPageChange is exactly what this reads'
    );
    assert.equal(root.querySelectorAll('[data-access-player-row]').length, 2);
    assert.equal(root.querySelectorAll('[data-access-character-row]').length, 6);
  });

  // ── THE TWO BARS ARE TWO NAMED LANDMARKS (issue 1513, review r1) ───────────────────────
  // `Pagination` emits a `<section aria-label>` (a REGION) around a `<nav aria-label>`, and with
  // the primitive's defaults this screen published two regions called "Pagination" and two
  // navigations called "Page navigation". A landmark list is navigated BY NAME, so identical
  // names there make the two bars indistinguishable in the one place the distinction is needed —
  // and `[data-access-roster]`, which every assertion above leans on, is not reachable from it.
  it('names each roster pager after its own roster', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(8),
      players: makePlayers(8)
    });

    const regionName = (key) =>
      root.querySelector(`[data-access-roster="${key}"] .fabricate-pagination`).getAttribute('aria-label');
    const navName = (key) =>
      root.querySelector(`[data-access-roster="${key}"] .manager-pagination-nav`).getAttribute('aria-label');

    assert.equal(regionName('characters'), 'Characters pagination');
    assert.equal(regionName('players'), 'Players pagination');
    assert.notEqual(
      regionName('characters'),
      regionName('players'),
      'two regions with one name are one landmark as far as a landmark list is concerned'
    );
    assert.equal(navName('characters'), 'Characters page navigation');
    assert.equal(navName('players'), 'Players page navigation');
    assert.notEqual(navName('characters'), navName('players'));
  });

  // ── THE SEARCH FIELD IS UNCONDITIONAL (issue 1513) ─────────────────────────────────────
  // It used to render only where the roster exceeded the page size, so a world with six
  // characters — the common case — drew no way to find one by name. THREE and TWO is the row
  // count that proves the threshold is gone: under the old build neither field existed here,
  // and it is also the shape the View Lab world seeds, so the published frame and this
  // assertion are about the same state.
  it('renders both rosters\' search fields below the page size', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(3),
      players: makePlayers(2)
    });

    assert.ok(
      Boolean(root.querySelector('[data-access-roster-search="characters"]')),
      'a three-character roster draws its search field'
    );
    assert.ok(
      Boolean(root.querySelector('[data-access-roster-search="players"]')),
      'a two-player roster draws its search field'
    );
    // Both fields are inside their OWN roster section, so the two queries stay independent.
    assert.ok(
      Boolean(
        root.querySelector('[data-access-roster="players"] [data-access-roster-search="players"]')
      ),
      'the player search field is inside the player roster section'
    );
  });

  // ── THE PAGER'S THRESHOLD, ON BOTH SIDES OF IT (issue 1513) ────────────────────────────
  // `Pagination` renders only past one page here: with `showPageSize={false}` and a page size
  // of six its own `totalCount > minPageSize` gate is `> 6`, the same number the hand-rolled
  // bar tested. Asserting only the seven-row half would pass against a bar that always renders,
  // which is the regression the shared primitive's `persistent` mode is one flag away from.
  it('draws the roster pager past one page and not at exactly one page', async () => {
    const charactersBar = (root) =>
      root.querySelector('[data-access-roster="characters"] [data-pagination-summary]');

    const seven = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(7),
      players: makePlayers(2)
    });
    assert.ok(Boolean(charactersBar(seven)), 'seven rows over a page of six draws the pager');
    assert.equal(charactersBar(seven).textContent.trim(), 'Showing 1–6 of 7');

    harness.remount();

    const six = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(6),
      players: makePlayers(2)
    });
    assert.equal(six.querySelectorAll('[data-access-character-row]').length, 6);
    assert.ok(!charactersBar(six), 'six rows are one page, so no pager renders');
    assert.ok(
      !six.querySelector('[data-access-roster="characters"] [data-pagination-next]'),
      'six rows are one page, so no next arrow renders'
    );
  });

  it('filters a roster by its own search box and resets to page 1', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(8),
      players: makePlayers(2)
    });

    const search = root.querySelector('[data-access-roster-search="characters"]');
    assert.ok(search);
    search.value = 'Char 8';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    const rows = root.querySelectorAll('[data-access-character-row]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.manager-roster-name').textContent.trim(), 'Char 8');
  });

  // ── AND IT IS A SEARCH OVER SOMETHING (issue 1513, review r1) ──────────────────────────
  // The threshold that came off was the PAGE SIZE. A roster holding no rows at all is a
  // different fact: a query box over it can only ever produce the empty line the screen already
  // shows. The gate reads the UNFILTERED roster, so a query that matches nothing still keeps the
  // field the GM typed into — asserted here, because a gate on `slice.filtered` would pass every
  // other clause in this file and trap the GM with no way to clear their own term.
  it('withholds a roster search field only where that roster is empty', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(3),
      players: []
    });

    assert.ok(
      Boolean(root.querySelector('[data-access-roster-search="characters"]')),
      'a three-character roster draws its search field'
    );
    assert.ok(
      !root.querySelector('[data-access-roster-search="players"]'),
      'an empty player roster draws no field, because there is nothing to find by typing'
    );

    const search = root.querySelector('[data-access-roster-search="characters"]');
    search.value = 'nothing matches this';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    assert.equal(root.querySelectorAll('[data-access-character-row]').length, 0);
    assert.ok(
      Boolean(root.querySelector('[data-access-roster-search="characters"]')),
      'a query that matched nothing keeps its own field, or the term cannot be cleared'
    );
  });

  it('renders the no-selection empty state when no recipe is selected', async () => {
    const root = await harness.mount({ recipe: null, characters: [], players: [] });
    assert.ok(root.querySelector('.manager-empty'));
    assert.equal(root.querySelectorAll('[data-access-roster]').length, 0);
  });

  // Issue 884 — the header thumbnail is the recipe's own icon, resolved through the
  // shared helper. It used to prefer the first containing book's artwork.
  itResolvesTheRecipesOwnImage({
    harness,
    mountProps: (imageOverrides) => ({
      recipe: { ...makeRecipe(), ...imageOverrides },
      characters: makeCharacters(1),
      players: makePlayers(1)
    }),
    // Issue 1506 converted this header's raw `<img>` into the shared tile, so the query is
    // the primitive's own image rather than the retired sheet class it used to carry.
    selectImg: (root) =>
      root.querySelector('.manager-inspector-icon [data-medallion] img').getAttribute('src')
  });
});
