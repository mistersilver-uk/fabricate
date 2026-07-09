import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-grant-access-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/utils/recipeCategories.js'
  ],
  compiledModules: [
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

    const next = root.querySelector('[data-access-roster-next="characters"]');
    next.click();
    flushSync();

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

  it('filters a roster by its own search box and resets to page 1', async () => {
    const root = await harness.mount({
      recipe: makeRecipe(),
      characters: makeCharacters(8),
      players: makePlayers(2)
    });

    // Search is shown because the roster exceeds the page size.
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
});
