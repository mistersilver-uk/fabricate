/**
 * THE FOUR REMAINING `role="table"` BROWSE VIEWS ARE LISTS (issue 1515).
 *
 * Four manager browsers still announced themselves as tables: a `role="table"` container over a
 * `role="row"` head of `role="columnheader"` spans, and one `role="row"` per record whose cells
 * carried `role="cell"`. None of them is a table. The leading column is an identity block, the
 * trailing one a control cluster, and at the stacked breakpoint the whole grid collapses to a
 * single column — so the promise a `table` makes to a screen reader, that the content can be
 * walked cell by cell against its column headers, was never kept.
 *
 * Three sibling surfaces had already been converted one at a time — the recipe library (issue
 * 643), the component directory (issue 676) and the essence catalogue (issue 1036) — and each
 * left its own per-view assertion behind and nothing that spoke for the views still carrying the
 * roles. This is that missing gate, for the last four.
 *
 * ── THE HAYSTACK IS NAMED, AND IT IS NOT THE REPOSITORY ────────────────────────────────────
 * A repo-wide grep for `role="table"` is REFUSED here, and deliberately. It returns
 * `GatheringTaskEditView.svelte`'s drops table — a real column grid inside an editor, ruled out of
 * scope — and it returns comment lines in `LibraryShelf.svelte`, `EssenceBrowserView.svelte` and
 * `EssenceRow.svelte`, which say the roles are GONE. A gate that reported those would be red for
 * prose and for an unrelated surface, and would be turned off rather than obeyed.
 *
 * So the haystack is exactly these four files plus any row child component they render, with
 * comments stripped first: the views' own explanations name `role="table"` and `role="row"` while
 * saying why neither is written any more.
 *
 * ── WHAT MAKES THIS NOT VACUOUS ────────────────────────────────────────────────────────────
 * An absence check over an empty haystack passes forever, and this one is written against a
 * hand-listed corpus, which is the shape that rots quietest. Four controls stand against it:
 *
 *   1. Every path is READ, so a renamed or moved view throws rather than being skipped.
 *   2. Each view is asserted POSITIVELY to emit `role="list"` and `role="listitem"`, so a file
 *      that lost its table roles by losing its rows altogether fails rather than passes.
 *   3. The number of ROWS each view renders is floored at mount, so an emptied `{#each}` or a
 *      renamed row class cannot satisfy clause 2 from a source string alone.
 *   4. The comment strip is asserted to have left real markup behind, so a strip that ate the
 *      template is reported rather than passing on an absence of source.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const managerDir = 'src/ui/svelte/apps/manager';

/** The roles a table promises and a list does not owe. */
const TABLE_ROLES = ['role="table"', 'role="row"', 'role="columnheader"', 'role="cell"'];

/**
 * The four views, each with the row class its records render as and the minimum number of those
 * rows the view's own mounted suite proves it draws. `rowFloor` is what keeps clause 2 honest: a
 * source string saying `role="listitem"` proves nothing if the `{#each}` around it renders none.
 *
 * `children` names any component the row delegates to. All four still write their row inline, so
 * the lists are empty today and the field exists so that the day a row moves into its own
 * `.svelte` — as the component and essence rows already did — the extraction is covered rather
 * than silently exempted.
 */
const VIEWS = [
  {
    file: 'SystemsBrowserView.svelte',
    row: 'manager-system-row',
    identity: 'manager-system-identity',
    children: [],
  },
  {
    file: 'EnvironmentsBrowserView.svelte',
    row: 'manager-environment-row',
    identity: 'manager-environment-identity',
    children: [],
  },
  {
    file: 'GatheringTasksBrowserView.svelte',
    row: 'manager-gathering-task-row',
    identity: 'manager-gathering-task-identity',
    children: [],
  },
  {
    file: 'GatheringEventsBrowserView.svelte',
    row: 'manager-gathering-event-row',
    identity: 'manager-gathering-event-identity',
    children: [],
  },
];

const read = (file) => readFileSync(resolve(repoRoot, managerDir, file), 'utf8');

/**
 * The file's source with every HTML and JavaScript comment removed. Both kinds matter: the views
 * explain the conversion in an HTML comment above the container and in a `//` comment above the
 * menu items, and both name the roles they no longer write.
 */
function markupOf(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the four remaining table-role browse views are lists', () => {
  it('emits role="list" and role="listitem", and none of the table roles', () => {
    const scanned = [];

    for (const view of VIEWS) {
      for (const file of [view.file, ...view.children]) {
        const markup = markupOf(read(file));
        scanned.push(file);

        assert.match(
          markup,
          /class="manager-[a-z-]|class={`manager-[a-z-]/,
          `${file} holds no manager-prefixed class once comments are stripped, so either the ` +
            'strip ate the template or this file is no longer a manager view. Every assertion ' +
            'below would be vacuous.'
        );

        for (const role of TABLE_ROLES) {
          assert.equal(
            markup.includes(role),
            false,
            `${file} still writes ${role}. A table role promises a screen-reader user that the ` +
              'content can be walked cell by cell against its column headers, and this surface ' +
              'has an identity block in the first column, a control cluster in the last and no ' +
              'columns at all below the stacked breakpoint. It is a list: the container takes ' +
              'role="list", each record takes role="listitem", and the column strip above them ' +
              'is aria-hidden.'
          );
        }
      }

      const markup = markupOf(read(view.file));
      assert.ok(
        markup.includes('role="list"'),
        `${view.file} declares no role="list". The absence check above passes for a view that ` +
          'renders nothing at all, so the list role is asserted positively.'
      );
      assert.ok(
        markup.includes('role="listitem"'),
        `${view.file} declares no role="listitem", so its records are anonymous children of a ` +
          'list rather than its items.'
      );
      assert.equal(
        markup.includes('aria-selected'),
        false,
        `${view.file} still writes aria-selected. It is not valid on a listitem outside a ` +
          'listbox; selection is aria-current plus a real identity <button>, as ' +
          'RecipesBrowserView and EssenceRow already do.'
      );
      assert.ok(
        markup.includes('aria-current'),
        `${view.file} conveys selection with neither aria-selected nor aria-current, so a ` +
          'screen-reader user is not told which row is open in the inspector.'
      );
      assert.ok(
        markup.includes(view.identity),
        `${view.file} renders no ${view.identity}. Selection has to route through a real ` +
          'control: a listitem is not operable, and a handler-bearing <div> with tabindex="0" ' +
          'is what this change removed.'
      );
    }

    assert.ok(
      scanned.length >= 4,
      `the gate scanned ${scanned.length} files; it is written against four views, and a ` +
        'shortened list would make every assertion above vacuous'
    );
  });

  it('renders each row class the roles are claimed for, so the claim is not about zero rows', () => {
    // The floor is read from the mounted suites' own fixtures rather than re-mounting here: this
    // file's claim is about SOURCE, and re-mounting the manager for it would duplicate
    // `manager-mounted.test.js`'s whole harness. What it does need is proof that the row class the
    // roles hang off is actually emitted inside an `{#each}`, which the source can answer exactly.
    for (const view of VIEWS) {
      const markup = markupOf(read(view.file));
      const eachIndex = markup.search(/\{#each\s+paginated/);
      assert.notEqual(
        eachIndex,
        -1,
        `${view.file} no longer iterates a paginated set, so it renders no rows and every role ` +
          'assertion above is about markup nothing reaches'
      );

      const body = markup.slice(eachIndex);
      assert.ok(
        body.includes(view.row),
        `${view.file}'s row loop does not render ${view.row}; the row class moved out from under ` +
          'this gate'
      );
      assert.ok(
        body.includes('role="listitem"'),
        `${view.file} writes role="listitem" outside its row loop, so the rows themselves are ` +
          'not the list items'
      );
    }
  });
});
