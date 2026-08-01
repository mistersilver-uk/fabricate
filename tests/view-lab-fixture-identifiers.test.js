/**
 * Every fixture identifier a case names must exist in the lab world.
 *
 * `tests/view-lab-cases.test.js` checks that a selector's HOOKS exist in `src/` — the class names
 * and attribute names — and it deliberately strips attribute VALUES before doing so, because those
 * values are fixture ids and live here rather than in `src/`. Nothing then checked them there. That
 * left the registry's largest hand-maintained mirror unguarded: roughly fifty component, recipe,
 * tool, task, event, environment and actor ids, plus every `query.system`.
 *
 * A renamed fixture id is caught today only by a capture run — which needs harvested Foundry chrome,
 * so it does not run on a fork PR, does not run without credentials, and is not part of `npm test`.
 * Between the rename and the next successful capture, the case silently cannot reach its state.
 *
 * The check is exact-value, not substring: `sm-longsword` must BE an id in the world, not merely
 * appear somewhere in the file. Substring matching is how the sibling guard in `view-lab-cases`
 * passed over six broken selectors before it was tightened.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';
import { buildLabActors } from './view-lab/world/labActors.js';

const content = buildLabContent();
const actors = buildLabActors(content);

/** Attribute name -> the set of values the lab world actually contains. */
const IDENTITY_SOURCES = {
  'data-component-id': new Set(content.components.map((entry) => entry.id)),
  'data-recipe-id': new Set(content.recipes.map((entry) => entry.id)),
  'data-manager-tool-id': new Set(content.tools.map((entry) => entry.id)),
  'data-gathering-task-id': new Set(content.gatheringConfig.tasks.map((entry) => entry.id)),
  'data-task-id': new Set(content.gatheringConfig.tasks.map((entry) => entry.id)),
  'data-gathering-event-id': new Set(content.gatheringConfig.events.map((entry) => entry.id)),
  'data-environment-id': new Set(content.environments.map((entry) => entry.id)),
  'data-knowledge-actor': new Set(actors.map((entry) => entry.id)),
};

/** Every `key="value"` pair in a selector, in source order. */
function attributePairs(selector) {
  return [...selector.matchAll(/\[([a-z][\w-]*)\s*=\s*"([^"]*)"\]/g)].map((match) => ({
    name: match[1],
    value: match[2],
  }));
}

test('every query.system names a real lab crafting system', () => {
  const known = new Set(Object.values(LAB_SYSTEM_IDS));
  const unknown = [];
  for (const viewCase of VIEW_LAB_CASES) {
    const system = viewCase.query?.system;
    if (system && !known.has(system)) unknown.push(`${viewCase.id}: ${system}`);
  }
  assert.deepEqual(
    unknown,
    [],
    'these cases open on a crafting system the lab world does not define, so the manager falls back ' +
      'to whichever system it had and the case photographs the wrong one:\n  ' +
      unknown.join('\n  ')
  );
});

test('every fixture id a selector names exists in the lab world', () => {
  const unknown = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step !== 'object') continue;
      for (const { name, value } of attributePairs(step.selector)) {
        const source = IDENTITY_SOURCES[name];
        if (!source || value === '') continue;
        if (!source.has(value)) {
          unknown.push(`${viewCase.id}: [${name}="${value}"]`);
        }
      }
    }
  }
  assert.deepEqual(
    unknown,
    [],
    'these selectors name a fixture the lab world does not contain, so the step matches nothing and ' +
      'the case cannot reach its state. Either the fixture was renamed or the case was:\n  ' +
      unknown.join('\n  ')
  );
});

test('the identity sources are populated, so the checks above are not vacuous', () => {
  // A builder that returned nothing would make every assertion above pass by matching an empty set
  // against an empty set — the shape of failure this whole file exists to catch, turned on itself.
  for (const [name, values] of Object.entries(IDENTITY_SOURCES)) {
    assert.ok(values.size > 0, `no lab fixture supplies values for ${name}`);
  }
  assert.ok(Object.values(LAB_SYSTEM_IDS).length >= 5, 'expected one system per resolution mode');
});
