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

test('a station names a Tool of the herbalism system that the lab actor does not hold', () => {
  const [actor] = buildLabActors(content);
  for (const [name, station] of Object.entries(LAB_CANVAS_STATIONS)) {
    assert.equal(station.systemId, LAB_SYSTEM_IDS.HERBALISM, name);
    const tool = content.tools.find((entry) => entry.id === station.toolId);
    assert.ok(tool, `${name} names a seeded Tool`);
    assert.ok(
      actor.items.every((item) => item.uuid !== tool.registeredItemUuid),
      `${name}: the lab actor holds no ${tool.name}, so only the station supplies it`
    );
    const needing = [
      content.recipes.find((recipe) => recipe.id === 'hb-r-antitoxin'),
      content.gatheringConfig.tasks.find((task) => task.id === 'hb-task-icecap'),
    ];
    for (const entry of needing) assert.ok(entry.toolIds.includes(station.toolId), entry.id);
  }
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
    assert.ok(labCanvasStation(viewCase.query.canvasStation), viewCase.id);
    assert.equal(viewCase.app, 'fabricate-app', `${viewCase.id} mounts the player window`);
  }
  assert.deepEqual(
    [...new Set(stationCases.map((viewCase) => viewCase.query.canvasStation))].sort((a, b) =>
      a.localeCompare(b)
    ),
    ['named', 'unnamed']
  );
  assert.ok(stationCases.some((viewCase) => viewCase.query.tab === 'journal'));
});
