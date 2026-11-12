/**
 * The View Lab's canvas station (issue 2277): the stations a `canvasStation` query can name, that
 * each supplies a Tool the lab actor lacks and its frames' recipe and task name, and that every
 * case that sets one names a station that exists.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';

import { LAB_CANVAS_STATIONS, labCanvasStation } from './view-lab/labCanvasStation.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';

const content = buildLabContent();
const stationCases = VIEW_LAB_CASES.filter((viewCase) => viewCase.query?.canvasStation);

const [actor] = buildLabActors(content);
const learned = Object.keys(actor.flags.fabricate.fabricate.learnedRecipes);

test('a station names a Tool of the herbalism system that the lab actor does not hold', () => {
  for (const [name, station] of Object.entries(LAB_CANVAS_STATIONS)) {
    assert.equal(station.systemId, LAB_SYSTEM_IDS.HERBALISM, name);
    const tool = content.tools.find((entry) => entry.id === station.toolId);
    assert.ok(tool, `${name} names a seeded Tool`);
    assert.ok(
      actor.items.every((item) => item.uuid !== tool.registeredItemUuid),
      `${name}: the lab actor holds no ${tool.name}, so only the station supplies it`
    );
  }
});

test("each crafting station frame's recipe is listed for the actor and needs the Tool its station supplies", () => {
  const crafting = stationCases.filter((viewCase) => viewCase.query.tab === 'crafting');
  assert.equal(crafting.length, 3);
  for (const viewCase of crafting) {
    const [, rowStep] = viewCase.steps;
    const id = /data-recipe-id="([^"]+)"/.exec(rowStep.selector)[1];
    const recipe = content.recipes.find((entry) => entry.id === id);
    assert.ok(recipe, `${viewCase.id}: ${id} is seeded`);
    assert.ok(learned.includes(id), `${viewCase.id}: the actor knows ${id}, so its row is listed`);
    assert.equal(viewCase.steps[0].fill, recipe.name.slice(0, viewCase.steps[0].fill.length));
    const station = labCanvasStation(viewCase.query.canvasStation);
    assert.ok(recipe.toolIds.includes(station?.toolId ?? LAB_CANVAS_STATIONS.named.toolId), id);
  }
});

test('the Journal station frame names a Tool of the task its run is seeded on', () => {
  const task = content.gatheringConfig.tasks.find((entry) => entry.id === 'hb-task-icecap');
  assert.ok(task.toolIds.includes(LAB_CANVAS_STATIONS.alembic.toolId));
  const journal = stationCases.find((viewCase) => viewCase.query.tab === 'journal');
  assert.equal(journal.query.canvasStation, 'alembic');
});

test('the station names differ by their label alone, so the chip shows both of its faces', () => {
  const { label: named, ...namedRest } = LAB_CANVAS_STATIONS.named;
  const { label: unnamed, ...unnamedRest } = LAB_CANVAS_STATIONS.unnamed;
  assert.deepEqual(namedRest, unnamedRest);
  assert.ok(named.trim() && !unnamed.trim());
});

test('a query names a station, and an unknown or absent one names none', () => {
  assert.deepEqual(labCanvasStation('named'), LAB_CANVAS_STATIONS.named);
  assert.notEqual(labCanvasStation('named'), LAB_CANVAS_STATIONS.named, 'a fresh object each time');
  for (const name of [null, undefined, '', 'missing', 'toString']) {
    assert.equal(labCanvasStation(name), null, String(name));
  }
});

test('every case that opens a station names one, and the frames cover both chip faces and the gate', () => {
  assert.ok(stationCases.length >= 3);
  for (const viewCase of stationCases) {
    const { canvasStation } = viewCase.query;
    assert.ok(canvasStation === 'none' || labCanvasStation(canvasStation), viewCase.id);
    assert.equal(viewCase.app, 'fabricate-app', `${viewCase.id} mounts the player window`);
  }
  assert.deepEqual(
    [...new Set(stationCases.map((viewCase) => viewCase.query.canvasStation))].sort((a, b) =>
      a.localeCompare(b)
    ),
    ['alembic', 'named', 'none', 'unnamed']
  );
  assert.ok(stationCases.some((viewCase) => viewCase.query.tab === 'journal'));
});
