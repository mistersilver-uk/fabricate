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
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
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
