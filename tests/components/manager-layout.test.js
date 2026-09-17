/**
 * The manager's computed-style and geometry parity guards, in ONE process (issue 1670).
 *
 * This file was 13,915 lines and 129 flat tests. They now live in seven per-surface modules
 * beside it, and this entry exists so the seven keep sharing ONE Chromium: `node --test` runs a
 * process per `*.test.js`, so seven suites named `*.test.js` would be seven browser launches.
 * Each module registers its tests on import and reaches the browser only through
 * `tests/helpers/layout-harness.js`, which owns the single launch and the one closing hook.
 *
 * A surface module also runs on its own — `node --conditions=browser --test
 * tests/components/manager-layout-select.js` — because it registers at module scope rather than
 * behind an exported entry point.
 */
import './manager-layout-tools.js';
import './manager-layout-recipes.js';
import './manager-layout-gathering.js';
import './manager-layout-downtime.js';
import './manager-layout-browsers.js';
import './manager-layout-primitives.js';
import './manager-layout-select.js';
