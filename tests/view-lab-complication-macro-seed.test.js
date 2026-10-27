/** The lab's Choking dust macro seeds, each behind its own query flag (issues 2446, 2466). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildLabContent } from './view-lab/world/labContent.js';
import { LAB_MACRO_UUIDS } from './view-lab/world/labMacros.js';
import { seedComplicationMacros } from './view-lab/world/labWorld.js';

/** Choking dust's `macroUuid` on every copy of Mortar dust the seeded content carries. */
function dustCloudMacros(flags) {
  const content = buildLabContent();
  seedComplicationMacros(content, flags);
  const copies = [
    ...content.systems.flatMap((system) => system.components ?? []),
    ...content.components,
  ].filter((component) => component.id === 'hb-mortar-dust');
  assert.ok(copies.length > 1, 'the lab authors Mortar dust in its system and its world list');
  return copies.map(
    (component) => component.complications.find(({ id }) => id === 'hb-comp-dust-cloud').macroUuid
  );
}

describe('Choking dust macro seeds', () => {
  it('links no macro with neither flag', () => {
    for (const macroUuid of dustCloudMacros({})) assert.equal(macroUuid, undefined);
  });

  it('links the lab script macro only behind namedComplicationMacro', () => {
    for (const macroUuid of dustCloudMacros({ namedComplicationMacro: true })) {
      assert.equal(macroUuid, LAB_MACRO_UUIDS.readMomentum);
    }
  });

  it('keeps the missing-macro seed on its own flag', () => {
    for (const macroUuid of dustCloudMacros({ missingComplicationMacro: true })) {
      assert.equal(macroUuid, 'Macro.lab-retired');
    }
  });
});
