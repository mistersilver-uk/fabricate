import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';

/**
 * The custom `fabricate.interactable` RegionBehavior subtype is only a VALID
 * document type if the module manifest declares it under
 * `documentTypes.RegionBehavior`. Registering `CONFIG.RegionBehavior.dataModels`
 * at runtime is necessary but NOT sufficient — without the manifest declaration
 * Foundry rejects the type ("…is not a valid type for the RegionBehavior Document
 * class") and region-interactable placement fails. This guards that the manifest
 * and the code constant never drift apart.
 */
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../module.json', import.meta.url)), 'utf8')
);

test('module.json declares the interactable RegionBehavior subtype matching the code constant', () => {
  const moduleId = manifest.id;
  assert.equal(moduleId, 'fabricate', 'module id must be the namespace used in the subtype');

  const regionBehaviorTypes = manifest?.documentTypes?.RegionBehavior;
  assert.ok(
    regionBehaviorTypes && typeof regionBehaviorTypes === 'object',
    'manifest must declare documentTypes.RegionBehavior'
  );

  // The manifest key is the bare subtype; Foundry namespaces it as `<moduleId>.<key>`.
  const [namespace, subtype] = INTERACTABLE_BEHAVIOR_SUBTYPE.split('.');
  assert.equal(namespace, moduleId, 'subtype constant must be namespaced with the module id');
  assert.ok(
    Object.prototype.hasOwnProperty.call(regionBehaviorTypes, subtype),
    `manifest documentTypes.RegionBehavior must declare "${subtype}" (for type "${INTERACTABLE_BEHAVIOR_SUBTYPE}")`
  );
});

test('module.json declares socket:true so cross-client emits are relayed', () => {
  // Foundry only relays a module's `game.socket.emit("module.fabricate", …)` to
  // other clients when the manifest opts in with `"socket": true`. Without it the
  // player→active-GM activation round-trip (and node/event routing) silently dies.
  assert.equal(manifest.socket, true, 'manifest must set "socket": true for module socket relay');
});
