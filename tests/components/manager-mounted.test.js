/** The mounted contract for `CraftingSystemManagerRoot`. */
import { after, describe } from 'node:test';

import { disposeManagerSuite } from './manager-mounted-shared.js';
import { registerRailCases } from './manager-rail-mounted.js';
import { registerHeaderCases } from './manager-header-mounted.js';
import { registerSystemsCases } from './manager-systems-mounted.js';
import { registerRecipesCases } from './manager-recipes-mounted.js';
import { registerComponentsCases } from './manager-components-mounted.js';
import { registerEssencesCases } from './manager-essences-mounted.js';
import { registerToolsCases } from './manager-tools-mounted.js';
import { registerEnvironmentsCases } from './manager-environments-mounted.js';
import { registerGatheringCases } from './manager-gathering-mounted.js';
import { registerDowntimeCases } from './manager-downtime-mounted.js';
import { registerWorldScopeCases } from './manager-world-scope-mounted.js';
import { registerChecksCases } from './manager-checks-mounted.js';
import { registerTagsCases } from './manager-tags-mounted.js';
import { registerBulkCases } from './manager-bulk-mounted.js';

describe('CraftingSystemManager mounted behavior', () => {
  registerRailCases();
  registerHeaderCases();
  registerSystemsCases();
  registerRecipesCases();
  registerComponentsCases();
  registerEssencesCases();
  registerToolsCases();
  registerEnvironmentsCases();
  registerGatheringCases();
  registerDowntimeCases();
  registerWorldScopeCases();
  registerChecksCases();
  registerTagsCases();
  registerBulkCases();

  // Registered last so it runs after every module's own `afterEach`, and once.
  after(disposeManagerSuite);
});
