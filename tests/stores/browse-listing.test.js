/**
 * The shared browse-listing composable (issue 1673). The listing source is a reactive `SvelteSet`
 * because the composable's deriveds must be invalidated by the thunk's own source, as a store's
 * `$derived` filtered list is; a plain array would be read once and then cached forever.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SvelteSet } from 'svelte/reactivity';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const MODULE_PATH = 'src/ui/svelte/stores/browseListing.svelte.js';

/** `count` rows as `{ id: 'i<n>' }`, in index order. */
function rows(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `i${index}` }));
}

const ids = (list) => list.map((row) => row.id);

/** A reactive listing source: the thunk a store passes, plus the handles a test resizes it with. */
function listSource(count) {
  const bag = new SvelteSet(rows(count));
  return {
    items: () => [...bag],
    shrinkTo(size) {
      for (const row of [...bag].slice(size)) bag.delete(row);
    },
    growTo(size) {
      for (const row of rows(size).slice(bag.size)) bag.add(row);
    },
  };
}

/**
 * The rune-to-rune closure `loadWithClosure` walks from the first adopting store on: an entry
 * importing the composable and a second rune module that itself imports a plain leaf. It lives under
 * `tmp/`, gitignored and outside every corpus-scan root, so a parallel ratchet suite cannot see it.
 */
function writeRuneImportFixture() {
  mkdirSync(join(repoRoot, 'tmp'), { recursive: true });
  const root = mkdtempSync(join(repoRoot, 'tmp', 'browse-listing-seam-'));
  const posix = (path) => relative(repoRoot, path).replaceAll('\\', '/');
  writeFileSync(
    join(root, 'dep.svelte.js'),
    [
      "import { trimString } from '../../src/utils/scalars.js';",
      'export function probe() {',
      '  let count = $state(2);',
      "  return `${trimString('  ok  ')}:${count}`;",
      '}',
      '',
    ].join('\n')
  );
  writeFileSync(
    join(root, 'entry.svelte.js'),
    [
      "import { probe } from './dep.svelte.js';",
      `import { firstVisible } from '../../${MODULE_PATH}';`,
      "export const seam = () => `${probe()}:${firstVisible({ all: ['a'], visible: ['a'] })}`;",
      '',
    ].join('\n')
  );
  writeFileSync(
    join(root, 'componentEntry.svelte.js'),
    [
      "import Medallion from '../../src/ui/svelte/components/Medallion.svelte';",
      'export const used = Medallion;',
      '',
    ].join('\n')
  );
  return {
    root,
    entry: posix(join(root, 'entry.svelte.js')),
    componentEntry: posix(join(root, 'componentEntry.svelte.js')),
  };
}

describe('browseListing', () => {
  let compiler;
  let createListingLoad;
  let createPageWindow;
  let firstVisible;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-browse-listing-');
    ({ createListingLoad, createPageWindow, firstVisible } = await compiler.load(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  describe('createListingLoad', () => {
    it('raises loading for a loud pass and commits the listing', async () => {
      const log = [];
      const load = createListingLoad({
        fetch: async () => {
          log.push(`fetch loading=${load.loading}`);
          return { id: 'first' };
        },
      });

      assert.equal(load.loading, false);
      await load.refresh();
      flushSync();

      assert.deepEqual(log, ['fetch loading=true']);
      assert.deepEqual(load.listing, { id: 'first' });
      assert.equal(load.loadedOnce, true);
      assert.equal(load.loading, false);
      assert.equal(load.error, null);
    });

    it('leaves loading alone on a quiet pass', async () => {
      const log = [];
      const load = createListingLoad({
        fetch: async () => {
          log.push(`fetch loading=${load.loading}`);
          return { id: 'quiet' };
        },
      });

      await load.refresh(true);
      flushSync();

      assert.deepEqual(log, ['fetch loading=false']);
      assert.equal(load.loading, false);
      assert.equal(load.loadedOnce, true);
      assert.deepEqual(load.listing, { id: 'quiet' });
    });

    it('captures the thrown message and does not set loadedOnce', async () => {
      const load = createListingLoad({
        fetch: async () => {
          throw new Error('boom');
        },
      });

      await load.refresh();
      flushSync();

      assert.equal(load.error, 'boom');
      assert.equal(load.loadedOnce, false, 'a failed pass has committed nothing to read');
      assert.equal(load.loading, false);
      assert.equal(load.listing, null);
    });

    it('falls back to the stringified rejection when it carries no message', async () => {
      const load = createListingLoad({ fetch: () => Promise.reject('nope') });

      await load.refresh();
      flushSync();

      assert.equal(load.error, 'nope');
    });

    it('runs onResult against the new listing before loadedOnce, with no await between', async () => {
      const log = [];
      const load = createListingLoad({
        fetch: async () => {
          log.push('fetch');
          return { id: 'next' };
        },
        onResult: () =>
          log.push(`onResult listing=${load.listing?.id} loadedOnce=${load.loadedOnce}`),
        afterCommit: async (quiet) =>
          log.push(`afterCommit loadedOnce=${load.loadedOnce} quiet=${quiet}`),
      });

      await load.refresh();
      flushSync();

      assert.deepEqual(log, [
        'fetch',
        'onResult listing=next loadedOnce=false',
        'afterCommit loadedOnce=true quiet=false',
      ]);
    });

    it('hands afterCommit the quiet flag of its own pass', async () => {
      const seen = [];
      const load = createListingLoad({
        fetch: async () => ({ id: 'next' }),
        afterCommit: async (quiet) => seen.push(`quiet=${quiet}`),
      });

      await load.refresh(true);
      flushSync();

      assert.deepEqual(seen, ['quiet=true']);
    });

    it('awaits afterCommit inside the try, so its failure lands in error', async () => {
      const load = createListingLoad({
        fetch: async () => ({ id: 'committed' }),
        afterCommit: async () => {
          throw new Error('auto-enter failed');
        },
      });

      await load.refresh();
      flushSync();

      assert.equal(load.error, 'auto-enter failed');
      assert.equal(load.loadedOnce, true, 'the commit happened before afterCommit ran');
      assert.equal(load.loading, false);
    });

    it('clears a previous error on a quiet reload', async () => {
      let failing = true;
      const load = createListingLoad({
        fetch: async () => {
          if (failing) throw new Error('boom');
          return { id: 'recovered' };
        },
      });

      await load.refresh();
      flushSync();
      assert.equal(load.error, 'boom');

      failing = false;
      await load.refresh(true);
      flushSync();

      assert.equal(load.error, null, 'a quiet pass resets the error even though it hides loading');
      assert.equal(load.loadedOnce, true);
    });

    it('commits null when the fetch resolves nothing', async () => {
      const load = createListingLoad({ fetch: async () => undefined });

      await load.refresh();
      flushSync();

      assert.equal(load.listing, null);
      assert.equal(load.loadedOnce, true);
    });
  });

  describe('createPageWindow in read mode', () => {
    const openWindow = (count, defaultPageSize = 12) => {
      const source = listSource(count);
      return { source, pages: createPageWindow({ items: source.items, defaultPageSize }) };
    };

    it('slices the list by page and counts the pages', () => {
      const { pages } = openWindow(40);

      assert.equal(pages.pageSize, 12);
      assert.equal(pages.page, 0);
      assert.equal(pages.pageCount, 4);
      assert.deepEqual(ids(pages.pageItems).slice(0, 2), ['i0', 'i1']);
      assert.equal(pages.pageItems.length, 12);

      pages.setPage(3);
      flushSync();

      assert.deepEqual(ids(pages.pageItems), ['i36', 'i37', 'i38', 'i39']);
    });

    it('stores a raw page index and clamps it at read, so a shrunk list returns the last page', () => {
      const { source, pages } = openWindow(40);

      pages.setPage(3);
      flushSync();
      assert.equal(pages.pageItems.length, 4);

      source.shrinkTo(5);
      flushSync();

      assert.equal(pages.page, 3, 'the raw index is stored, never rewritten by the shrink');
      assert.equal(pages.pageCount, 1);
      assert.deepEqual(ids(pages.pageItems), ['i0', 'i1', 'i2', 'i3', 'i4']);
    });

    it('ignores a negative page and stores one past the end', () => {
      const { pages } = openWindow(40);

      pages.setPage(-1);
      flushSync();
      assert.equal(pages.page, 0);

      pages.setPage(99);
      flushSync();
      assert.equal(pages.page, 99, 'read mode guards the lower bound only');
      assert.deepEqual(
        ids(pages.pageItems),
        ['i36', 'i37', 'i38', 'i39'],
        'the stored index is past the end, so the read clamp hands back the last page'
      );

      pages.setPage('nonsense');
      flushSync();
      assert.equal(pages.page, 0);
    });

    it('falls back to the default page size for a size at or below zero, resetting the page', () => {
      const { pages } = openWindow(40);

      pages.setPageSize(7);
      pages.setPage(2);
      flushSync();
      assert.equal(pages.pageSize, 7, 'without an allowlist any finite size above zero is taken');
      assert.equal(pages.page, 2);

      pages.setPageSize(0);
      flushSync();

      assert.equal(pages.pageSize, 12);
      assert.equal(pages.page, 0, 'a size change returns the reader to the first page');
    });

    it('shows everything in one page while pageCount divides a non-positive size by one', () => {
      const { pages } = openWindow(3, 0);

      assert.equal(pages.pageSize, 0);
      assert.equal(pages.pageCount, 3, 'pageCount divides by 1');
      assert.deepEqual(ids(pages.pageItems), ['i0', 'i1', 'i2'], 'the slice shows everything');
    });

    it('re-derives from the thunk when the list grows, with no page write', () => {
      const { source, pages } = openWindow(3, 2);

      assert.equal(pages.pageCount, 2);
      assert.deepEqual(ids(pages.pageItems), ['i0', 'i1']);

      source.growTo(9);
      flushSync();

      assert.equal(pages.pageCount, 5, 'the thunk is read inside the derive, not captured');
      assert.deepEqual(ids(pages.pageItems), ['i0', 'i1']);
    });

    it('resets the page for a filter setter tail', () => {
      const { pages } = openWindow(40);

      pages.setPage(2);
      pages.resetPage();
      flushSync();

      assert.equal(pages.page, 0);
    });
  });

  describe('createPageWindow in write mode', () => {
    const openWindow = (count) => {
      const source = listSource(count);
      return {
        source,
        pages: createPageWindow({
          items: source.items,
          defaultPageSize: 4,
          pageSizes: [4, 6, 12, 25],
          clamp: 'write',
        }),
      };
    };

    it('clamps the requested page against the live count and slices raw', () => {
      const { source, pages } = openWindow(20);

      pages.setPage(99);
      flushSync();
      assert.equal(pages.page, 4, 'the write clamp stores the last page, not the request');
      assert.deepEqual(ids(pages.pageItems), ['i16', 'i17', 'i18', 'i19']);

      source.shrinkTo(6);
      pages.setPage(99);
      flushSync();

      assert.equal(pages.page, 1, 'the bound is the live count, not the count at construction');
      assert.deepEqual(ids(pages.pageItems), ['i4', 'i5']);
    });

    it('re-clamps a stored page against the live count and resets it on demand', () => {
      const { source, pages } = openWindow(20);

      pages.setPage(4);
      source.shrinkTo(5);
      pages.clampPage();
      flushSync();
      assert.equal(pages.page, 1);

      pages.resetPage();
      flushSync();
      assert.equal(pages.page, 0);
    });

    it('ignores a page size outside the allowlist, leaving the page alone', () => {
      const { pages } = openWindow(20);

      pages.setPage(1);
      pages.setPageSize(7);
      flushSync();

      assert.equal(pages.pageSize, 4, 'an allowlist rejects every other size outright');
      assert.equal(pages.page, 1, 'a rejected size must not reset the page');

      pages.setPageSize(6);
      flushSync();

      assert.equal(pages.pageSize, 6);
      assert.equal(pages.page, 0);
    });
  });

  describe('firstVisible', () => {
    it('pins the empty-listing guard the crafting and inventory tails ship today', () => {
      assert.equal(firstVisible({ all: [], visible: [{ id: 'i0' }] }), null);
    });

    it('answers nothing when the filters leave no row visible', () => {
      assert.equal(firstVisible({ all: rows(3), visible: [] }), null);
    });

    it('answers the first visible row when the selected id has gone', () => {
      const all = rows(3);
      const visible = [all[2]];
      const found = all.find((row) => row.id === 'absent') ?? firstVisible({ all, visible });

      assert.equal(found.id, 'i2');
    });

    it('is only a fallback: a row found in the full listing but filtered out still wins', () => {
      const all = rows(3);
      const visible = [all[2]];
      const found = all.find((row) => row.id === 'i0') ?? firstVisible({ all, visible });

      assert.equal(found.id, 'i0', 'the selection does not follow the filter off its own row');
    });
  });

  /** The seam the adopting stores need: `loadWithClosure` threw on any `.svelte.js` import before. */
  describe('loadWithClosure over a rune-to-rune import', () => {
    let fixture;

    before(() => {
      fixture = writeRuneImportFixture();
    });

    after(() => {
      rmSync(fixture.root, { recursive: true, force: true });
    });

    it('compiles an imported rune module and copies that module’s own plain leaf', async () => {
      const loaded = await compiler.loadWithClosure(fixture.entry);

      assert.equal(
        loaded.seam(),
        'ok:2:a',
        'a copied rune module would throw on `$state`, and an unwalked one would not resolve its leaf'
      );
    });

    it('still refuses a component import', async () => {
      await assert.rejects(
        () => compiler.loadWithClosure(fixture.componentEntry),
        /handles modules only/
      );
    });
  });
});
