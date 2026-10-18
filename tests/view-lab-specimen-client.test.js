/**
 * The Primitive Lab's specimen frames load without the Vite client (issue 2515). The drop matches
 * one path, so a renamed specimen page would turn it into a silent no-op until the WebSocket
 * errors return past 254 frames: the plugin and `mount.js` share the path, and the page must exist.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { SPECIMEN_PAGE } from './view-lab/primitives/specimenProtocol.js';
import config from './view-lab/vite.config.js';

const repoRoot = resolve(import.meta.dirname, '..');
const CLIENT_TAG = '<script type="module" src="/@vite/client"></script>';

test('the Vite-client drop targets the specimen page the lab frames, and that page exists', () => {
  assert.ok(existsSync(resolve(repoRoot, `.${SPECIMEN_PAGE}`)), `${SPECIMEN_PAGE} exists`);
  const plugin = config.plugins
    .flat()
    .find((entry) => entry?.name === 'view-lab-specimen-without-vite-client');
  const drop = (path) => plugin.transformIndexHtml.handler(`<head>${CLIENT_TAG}</head>`, { path });
  assert.equal(drop(SPECIMEN_PAGE), '<head></head>', 'the specimen page loses the client');
  assert.equal(
    drop('/tests/view-lab/index.html'),
    `<head>${CLIENT_TAG}</head>`,
    'every other page keeps it'
  );
});
