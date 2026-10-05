/**
 * The smoke's second Foundry client (issue 2192): it joins over HTTP with the canvas off, and its
 * browser context never outlives a failed join to starve the GM page for the rest of the walk.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  disableCanvasBeforeLoad,
  openJoinedClient,
} from '../scripts/foundry-smoke/pageOps/joinedClient.mjs';

/** A GM page whose browser hands out one recording context; `failAt` names the step that throws. */
function fakeGmPage({ failAt = null, users = [{ id: 'u-player', name: 'Player' }] } = {}) {
  const log = [];
  const step = (name, value) => {
    log.push(name);
    if (name === failAt) throw new Error(`${name} failed`);
    return value;
  };
  const clientPage = {
    goto: async (url, options) => step(`goto ${url} ${options.timeout}`),
    waitForFunction: async (_fn, arg) => step(`ready ${arg}`),
  };
  const response = { ok: () => true, json: async () => ({ redirect: '/game' }) };
  const context = {
    request: {
      get: async (url) => step(`get ${url}`),
      post: async (url, { data }) => step(`post ${url} ${JSON.stringify(data)}`, response),
    },
    addInitScript: async (script) => step(`init ${script.name}`),
    newPage: async () => step('newPage', clientPage),
    close: async () => step('close'),
  };
  const page = {
    url: () => 'http://localhost:30000/game',
    evaluate: async (fn, name) => users.find((user) => user.name === name)?.id ?? null,
    context: () => ({ browser: () => ({ newContext: async () => step('newContext', context) }) }),
  };
  return { page, log, clientPage };
}

describe('the joined smoke client', () => {
  it('turns the canvas off before its first page and joins over HTTP straight into /game', async () => {
    const { page, log, clientPage } = fakeGmPage();
    const client = await openJoinedClient(page, 'Player');
    assert.equal(client.clientPage, clientPage);
    assert.deepStrictEqual(log, [
      'newContext',
      'init disableCanvasBeforeLoad',
      'newPage',
      'get http://localhost:30000/join',
      'post http://localhost:30000/join {"userid":"u-player","password":"","action":"join"}',
      'goto http://localhost:30000/game 120000',
      'ready u-player',
    ]);
  });

  for (const failAt of [
    'newPage',
    'get http://localhost:30000/join',
    'goto http://localhost:30000/game 120000',
    'ready u-player',
  ]) {
    it(`closes its context when "${failAt.split(' ')[0]}" fails`, async () => {
      const { page, log } = fakeGmPage({ failAt });
      await assert.rejects(() => openJoinedClient(page, 'Player'), /never joined/);
      assert.equal(log.at(-1), 'close', 'a failed join leaves no client loading beside the GM');
    });
  }

  it('refuses an unknown user before it opens anything', async () => {
    const { page, log } = fakeGmPage({ users: [] });
    await assert.rejects(() => openJoinedClient(page, 'Player'), /no user is named "Player"/);
    assert.deepStrictEqual(log, []);
  });

  it('stores noCanvas as the JSON Foundry reads its client settings from', () => {
    const stored = new Map();
    const previous = globalThis.localStorage;
    globalThis.localStorage = { setItem: (key, value) => stored.set(key, value) };
    try {
      disableCanvasBeforeLoad();
    } finally {
      globalThis.localStorage = previous;
    }
    assert.equal(JSON.parse(stored.get('core.noCanvas')), true);
  });
});
