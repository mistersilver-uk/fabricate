/**
 * A BROWSE ROW'S OVERFLOW MENU ROUTES BY EXPLICIT ID, AND DELETE IS NEVER THE CATCH-ALL
 * (issue 1515).
 *
 * The four browse views converted in this change each render one `<ActionMenu>` per row and
 * routed its `onSelect` as `if (action === '<verb>') …; else <delete>(id)`. That trailing bare
 * `else` makes DELETE the branch every id the view was not told about falls into — a renamed id,
 * an item added to `rowMenuItems()` without a matching branch, or a stale `items` array — and the
 * record is destroyed rather than nothing happening. `environment/CompositionList.svelte`'s
 * `runMenuAction` is the shipped precedent and routes seven verbs with no terminal `else` at all.
 *
 * ── WHY THIS IS READ RATHER THAN DISPATCHED ────────────────────────────────────────────────
 * The obvious gate is a mounted one: open a row's menu, send a third id through `onSelect`, and
 * assert neither handler ran. It is NOT WRITABLE against these components, and the reason is
 * worth stating so nobody spends the afternoon rediscovering it. `onSelect` is a closure the view
 * hands `<ActionMenu>` as a prop; the menu invokes it from `choose(item.id)`, where `item` comes
 * from the view's own `rowMenuItems()`. Nothing in the rendered DOM exposes either the closure or
 * an item's id — the `menuitem` buttons carry a label, an icon and their `data` map, and their
 * click handlers close over the id they were built with — so a mount can dispatch exactly the ids
 * the view already declares and no others. Reaching a third id would mean forking the component
 * or adding a production prop that exists only for this test, and both are worse than reading the
 * routing the view actually writes.
 *
 * The mounted suites keep the other half: `manager-mounted.test.js` proves each DECLARED id
 * reaches its own handler, and that two rows' triggers announce different names. This file proves
 * the shape that makes an UNDECLARED id inert.
 *
 * ── WHAT MAKES IT NOT VACUOUS ──────────────────────────────────────────────────────────────
 * A "no bare else" check over a block it failed to find passes forever, so every step is
 * asserted to have found something: the file is read (a rename throws), the `<ActionMenu>` call
 * is located, `rowMenuItems()` is located and asserted to declare at least two ids including
 * `delete`, the `onSelect` body is extracted and asserted non-empty, and the routed ids are
 * asserted to be EXACTLY the declared ones — so a branch deleted along with its `else` fails
 * here rather than passing as tidier code.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const managerDir = 'src/ui/svelte/apps/manager';

/** The four converted browse views, and the handler each view's Delete branch must call. */
const VIEWS = [
  { file: 'SystemsBrowserView.svelte', deleteHandler: 'onDeleteSystem' },
  { file: 'EnvironmentsBrowserView.svelte', deleteHandler: 'onDeleteEnvironment' },
  { file: 'GatheringTasksBrowserView.svelte', deleteHandler: 'onDeleteTask' },
  { file: 'GatheringEventsBrowserView.svelte', deleteHandler: 'onDeleteEvent' },
];

const read = (file) => readFileSync(resolve(repoRoot, managerDir, file), 'utf8');

/**
 * The ids `rowMenuItems()` declares, in source order. The function is a flat array literal of
 * `{ id: '…', label: …, … }` objects in all four views, so the ids are read from it directly
 * rather than from the whole file — a `data-*` map or a filter option elsewhere in the view
 * would otherwise be counted as a menu id.
 */
function declaredItemIds(source) {
  const start = source.indexOf('function rowMenuItems()');
  assert.notEqual(start, -1, 'rowMenuItems() was not found, so no id below was read from it');
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start, 'rowMenuItems() has no closing brace at the expected indent');
  return [...source.slice(start, end).matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
}

/**
 * The body of the row `<ActionMenu>`'s `onSelect` arrow, brace-matched from its opening `{` so a
 * nested block cannot end the slice early.
 */
function onSelectBody(source) {
  const menuAt = source.indexOf('<ActionMenu');
  assert.notEqual(menuAt, -1, 'the view renders no <ActionMenu>, so this gate reads nothing');
  const arrowAt = source.indexOf('onSelect={(action) => {', menuAt);
  assert.notEqual(arrowAt, -1, 'the row menu declares no onSelect={(action) => { … }} handler');

  let depth = 0;
  const open = source.indexOf('{', source.indexOf('=> ', arrowAt));
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error('the onSelect body never closed');
}

describe('a browse row menu routes by explicit id', () => {
  for (const view of VIEWS) {
    it(`${view.file} has no catch-all branch, so an unknown id deletes nothing`, () => {
      const source = read(view.file);
      const ids = declaredItemIds(source);

      assert.ok(
        ids.length >= 2,
        `${view.file}'s rowMenuItems() declares ${ids.length} id(s); the gate is written for a ` +
          'menu with a Delete plus at least one other verb, and a shorter list would make the ' +
          'comparisons below vacuous'
      );
      assert.ok(
        ids.includes('delete'),
        `${view.file}'s row menu declares no 'delete' id, so the branch this gate exists to keep ` +
          'off the catch-all is not the one being read'
      );

      const body = onSelectBody(source);
      assert.ok(
        body.trim().length > 0,
        `${view.file}'s onSelect body is empty, so its rows offer a menu that does nothing`
      );

      const routed = [...body.matchAll(/action === '([^']+)'/g)].map((match) => match[1]);
      assert.deepEqual(
        [...routed].sort(),
        [...ids].sort(),
        `${view.file} routes ${JSON.stringify(routed)} but its menu offers ${JSON.stringify(ids)}. ` +
          'Every offered id needs its own guarded branch and no branch may exist for an id the ' +
          'menu does not offer.'
      );

      // The whole point: an `else` that is not an `else if` is the catch-all. `onDelete…` is the
      // last branch in every one of these views, so the catch-all IS the destructive one.
      const bareElse = body.match(/\belse\b(?!\s*if\b)/);
      assert.equal(
        Boolean(bareElse),
        false,
        `${view.file}'s onSelect ends in a bare else, which makes ${view.deleteHandler} the ` +
          'branch every unrecognised id falls into. Route the last verb with ' +
          "`else if (action === 'delete')` and let an unknown id do nothing, as " +
          "`environment/CompositionList.svelte`'s runMenuAction already does."
      );

      assert.ok(
        body.includes(view.deleteHandler),
        `${view.file}'s onSelect never calls ${view.deleteHandler}, so the Delete command this ` +
          'gate is about is not reachable from the row menu at all'
      );
    });
  }
});
