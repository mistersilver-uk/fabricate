/** THE FOUR REMAINING `role="table"` BROWSE VIEWS ARE LISTS (issue 1515). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const managerDir = 'src/ui/svelte/apps/manager';

/** The roles a table promises and a list does not owe. */
const TABLE_ROLES = ['role="table"', 'role="row"', 'role="columnheader"', 'role="cell"'];

/**
 * The four views, each with the row class its records render as and the identity control that
 * makes a row operable. `row` is what keeps clause 2 honest: a source string saying
 * `role="listitem"` proves nothing about the records unless the role and that class are both
 * inside the view's own `{#each paginated…}` loop, which is what the second test below reads.
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

/** The file's source with every HTML and JavaScript comment removed. Both kinds matter. */
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

  it('writes each row class and the listitem role inside the record loop, not loose in the file', () => {
    // NOTHING IS MOUNTED HERE, and no row count is asserted. This file's claim is about SOURCE,
    // and re-mounting the manager to count rows would duplicate `manager-mounted.test.js`'s whole
    // harness — that suite already drives real rows on all four views. What the source CAN answer
    // exactly, and what the assertion above needs, is WHERE the roles sit: the slice below starts
    // at the view's `{#each paginated…}` and every claim is made against that slice, so a
    // `role="listitem"` written outside the record loop no longer satisfies the gate.
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
