/**
 * Shard 2 of 4 of the standalone style root's rendered clause: the share of the specimen table
 * the shard index names, measured in Chromium by `tests/helpers/standaloneRootMeasurement.js`.
 * `published-standalone-root-rendered.test.js` holds the table's own checks, among them that
 * every specimen is measured by exactly one shard.
 */
import { defineStandaloneRootShard } from '../helpers/standaloneRootMeasurement.js';

defineStandaloneRootShard(1);
