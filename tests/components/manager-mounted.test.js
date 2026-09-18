/**
 * The mounted contract for `CraftingSystemManagerRoot` — the one suite that renders the whole
 * manager shell against a store double.
 *
 * The harness it drives lives in `tests/helpers/manager/` (issue 1669) and is shared with every
 * other suite that needs this root: `managerCompile` derives the compiled temp tree from the
 * root's own import closure, `managerStoreFake` is the store double, `managerQueries` is the
 * locator family, and `managerMount` mounts and routes. Those modules sit outside the `npm test`
 * glob, so `tests/helpers-manager.test.js` proves their guarantees from inside it.
 *
 * This file was 26,709 lines. Its cases now live in thirteen per-route modules beside it, and
 * this entry is what keeps them ONE suite: `node --test` runs a process per `*.test.js`, so
 * thirteen suites named `*.test.js` would be thirteen compiles of the manager root. Each module
 * exports a `register…()` the describe below calls, rather than registering at module scope as
 * `manager-layout.test.js`'s surfaces do, because that is what keeps the suite name, the hooks
 * and the reported test tree exactly what they were (issue 1690).
 */
import { after, describe } from 'node:test';

import { disposeManagerSuite } from './manager-mounted-shared.js';
import { registerRailCases } from './manager-rail-mounted.js';
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

  // Registered last so it runs after every module's own `afterEach`, and once: the compiled tree
  // and the DOM are shared, so a per-module teardown would pull them out from under the rest.
  after(disposeManagerSuite);
});
