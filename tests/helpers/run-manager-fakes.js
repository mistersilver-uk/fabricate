// Shared fakes for the actor-scoped run-manager coherence suites (issues 733 + 739).

import { mergeHistoryFlag } from './journal-fixtures.js';

export class FakeActor {
  /** `ownerIds` hold Foundry OWNER; the default none is `ownership.default: NONE` — GM only. */
  constructor(name = 'Shared', { ownerIds = [] } = {}) {
    this.id = name.replace(/\s+/g, '-').toLowerCase();
    this.name = name;
    this.uuid = `Actor.${this.id}`;
    this._flags = {};
    this._ownerIds = new Set(ownerIds.map((ownerId) => String(ownerId)));
  }

  /**
   * EVERY real Foundry Actor has this, so omitting it sends production down a fallback branch
   * production never reaches — how issue 1648's blind-history leak shipped reading green.
   */
  testUserPermission(user, level) {
    if (!user) return false;
    if (user.isGM === true) return true;
    return level === 'OWNER' && this._ownerIds.has(String(user.id ?? ''));
  }

  /** Foundry's `isOwner` is ownership relative to the AMBIENT user, never a fixed flag. */
  get isOwner() {
    return this.testUserPermission(globalThis.game?.user ?? null, 'OWNER');
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = mergeHistoryFlag(this._flags[namespace][key], value);
    return this;
  }
}

export function setupRunManagerGlobals(worldTime = 1000, actors = []) {
  let id = 0;
  globalThis.foundry = { utils: { randomID: () => `rid-${++id}` } };
  globalThis.game = { user: { id: 'gm-1' }, time: { worldTime }, actors };
}
