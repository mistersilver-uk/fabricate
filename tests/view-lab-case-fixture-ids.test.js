/**
 * A case's step selector may address a fixture record by id, and nothing else checks that the id is
 * still in the lab world (issue 1632). A selector that matches nothing does not degrade one frame:
 * one failed case aborts the whole capture and publishes nothing for the run. So the ids are
 * resolved here, against the world the lab builds, and a drift fails this test instead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';
import { settingsKey } from './view-lab/foundry/installFoundryShim.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import { seedSettings } from './view-lab/world/labWorld.js';

const content = buildLabContent();
const parties = seedSettings(content, buildLabActors(content), null, true, false).get(
  settingsKey('fabricate', 'gatheringParties')
);
const ids = (records) => new Set((records ?? []).map((record) => record.id));
const flatIds = (...collections) => new Set(collections.flatMap((collection) => [...collection]));

/** The fixture collection each id-bearing attribute addresses. */
const COLLECTION_BY_ATTRIBUTE = Object.freeze({
  'data-environment-id': ids(content.environments),
  'data-recipe-edit': ids(content.recipes),
  'data-recipe-select': ids(content.recipes),
  'data-recipe-id': ids(content.recipes),
  'data-books-scrolls-edit': ids(content.recipeItems),
  'data-books-scrolls-select': ids(content.recipeItems),
  'data-component-id': ids(content.components),
  'data-component-select': ids(content.components),
  'data-essence-id': ids(content.systems.flatMap((system) => system.essenceDefinitions ?? [])),
  'data-essence-select': ids(content.systems.flatMap((system) => system.essenceDefinitions ?? [])),
  'data-manager-tool-id': ids(content.tools),
  'data-manager-travel-party-id': ids(parties),
  'data-manager-travel-realm-id': ids(content.realms),
  'data-gathering-task-id': ids(content.gatheringConfig.tasks),
  'data-gathering-event-id': ids(content.gatheringConfig.events),
});

const SELECTOR_ID = /\[(data-[\w-]+)=(?:"([^"]*)"|'([^']*)')\]/g;

/** Every `[attribute="id"]` a case addresses with a mapped attribute, from its steps and expectation. */
function addressedIds(viewCase) {
  const selectors = [
    ...(viewCase.steps ?? []).flatMap((step) =>
      typeof step === 'object' && typeof step.selector === 'string' ? [step.selector] : []
    ),
    ...(typeof viewCase.expectSelector === 'string' ? [viewCase.expectSelector] : []),
  ];
  const found = [];
  for (const selector of selectors) {
    for (const [, attribute, double, single] of selector.matchAll(SELECTOR_ID)) {
      if (Object.hasOwn(COLLECTION_BY_ATTRIBUTE, attribute)) {
        found.push({ attribute, id: double ?? single });
      }
    }
  }
  return found;
}

/** The addressed ids of the given cases that the lab world does not hold. */
const drifted = (cases) =>
  cases.flatMap((viewCase) =>
    addressedIds(viewCase)
      .filter(({ attribute, id }) => !COLLECTION_BY_ATTRIBUTE[attribute].has(id))
      .map(({ attribute, id }) => `${viewCase.id}: [${attribute}="${id}"]`)
  );

test('every fixture id a case selector names is in the lab world', () => {
  const examined = VIEW_LAB_CASES.flatMap(addressedIds);
  assert.ok(examined.length > 100, 'the sweep must look at the selectors, not pass on none');
  assert.deepEqual(
    drifted(VIEW_LAB_CASES),
    [],
    'these selectors address a record the lab world no longer builds, so the case fails and the ' +
      'whole capture aborts'
  );
});

test('every mapped attribute is addressed by some case, and its collection is not empty', () => {
  const addressed = new Set(VIEW_LAB_CASES.flatMap(addressedIds).map(({ attribute }) => attribute));
  for (const [attribute, collection] of Object.entries(COLLECTION_BY_ATTRIBUTE)) {
    assert.ok(collection.size > 0, `${attribute} maps to an empty collection`);
    assert.ok(addressed.has(attribute), `${attribute} is mapped but no case addresses it`);
  }
});

test('a drifted id in a step or an expectation is reported', () => {
  const steps = { id: 'x', steps: [{ selector: '[data-environment-id="hb-env-gone"] button' }] };
  const expectation = { id: 'y', expectSelector: '[data-recipe-edit="sm-r-gone"]' };
  const real = { id: 'z', steps: [{ selector: '[data-environment-id="hb-env-thicket"]' }] };
  assert.deepEqual(drifted([steps, expectation, real]), [
    'x: [data-environment-id="hb-env-gone"]',
    'y: [data-recipe-edit="sm-r-gone"]',
  ]);
});
