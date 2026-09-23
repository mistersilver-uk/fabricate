/** A BROWSE ROW'S OVERFLOW MENU ROUTES BY EXPLICIT ID. */
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

/** The ids `rowMenuItems()` declares. */
function declaredItemIds(source) {
  const start = source.indexOf('function rowMenuItems()');
  assert.notEqual(start, -1, 'rowMenuItems() was not found, so no id below was read from it');
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start, 'rowMenuItems() has no closing brace at the expected indent');
  return [...source.slice(start, end).matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
}

/** The body of the row `<ActionMenu>`'s `onSelect` arrow. */
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
