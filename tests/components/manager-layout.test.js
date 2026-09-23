/**
 * The manager's computed-style and geometry parity guards, in ONE process (issue 1670).
 * A surface module also runs on its own — `node --conditions=browser --test
 * tests/components/manager-layout-select.js` — because it registers at module scope rather than
 * behind an exported entry point.
 */
import './manager-layout-tools.js';
import './manager-layout-recipes.js';
import './manager-layout-gathering.js';
import './manager-layout-downtime.js';
import './manager-layout-browsers.js';
import './manager-layout-side-rail.js';
import './manager-layout-primitives.js';
import './manager-layout-select.js';
