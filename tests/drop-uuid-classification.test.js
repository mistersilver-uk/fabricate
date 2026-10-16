/** The pure drop classification the world component and Tool drops ask (issue 1721). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  entryForSourceItem,
  isEmbeddedItemUuid,
} from '../src/ui/svelte/apps/manager/dropUuidClassification.js';

import { parseUuidDouble } from './helpers/manager/parseUuidDouble.js';

describe('isEmbeddedItemUuid', () => {
  it('fails closed without a parser, on a throw and on an unreadable answer', () => {
    assert.equal(isEmbeddedItemUuid('Item.a', undefined), true, 'no parser to ask');
    const v13 = (uuid) => uuid.startsWith('.');
    assert.equal(isEmbeddedItemUuid(42, v13), true, 'the V13 truthy non-string throw');
    assert.equal(isEmbeddedItemUuid('Actor.a.Item', parseUuidDouble), true, 'a null parse');
  });

  it('refuses each embedded shape', () => {
    for (const uuid of [
      'Actor.a.Item.b',
      'Scene.s.Token.t.Actor.a.Item.b',
      'Compendium.p.Actor.a.Item.b',
    ]) {
      assert.equal(isEmbeddedItemUuid(uuid, parseUuidDouble), true, uuid);
    }
  });

  it('accepts a world Item and a compendium Item', () => {
    for (const uuid of ['Item.a', 'Compendium.p.q.Item.b', 'Compendium.p.b']) {
      assert.equal(isEmbeddedItemUuid(uuid, parseUuidDouble), false, uuid);
    }
  });
});

describe('entryForSourceItem', () => {
  const ENTRIES = Object.freeze([
    { id: 'hammer', entity: { originItemUuid: 'Item.hammer', registeredItemUuid: 'Item.hammer' } },
    { id: 'awl', entity: { registeredItemUuid: 'Item.awl', aliasItemUuids: ['Item.old-awl'] } },
  ]);

  it('answers null for a blank needle', () => {
    assert.equal(entryForSourceItem(ENTRIES, ''), null);
    assert.equal(entryForSourceItem(ENTRIES, ' '.repeat(3)), null);
    assert.equal(entryForSourceItem(ENTRIES, undefined), null);
  });

  it('matches the registered uuid and an alias, trimmed', () => {
    assert.equal(entryForSourceItem(ENTRIES, ' Item.hammer ')?.id, 'hammer');
    assert.equal(entryForSourceItem(ENTRIES, 'Item.old-awl')?.id, 'awl');
    assert.equal(entryForSourceItem(ENTRIES, 'Item.other'), null);
  });
});
