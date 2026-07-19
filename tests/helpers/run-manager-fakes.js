// Shared fakes for the actor-scoped run-manager coherence suites (issues 733 + 739).
// A minimal actor whose flags stand in for the SYNCED Foundry actor document, plus a
// globals shim wiring foundry.utils.randomID and game.{user,time,actors}.

export class FakeActor {
  constructor(name = 'Shared') {
    this.id = name.replace(/\s+/g, '-').toLowerCase();
    this.name = name;
    this.uuid = `Actor.${this.id}`;
    this._flags = {};
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = value;
    return value;
  }
}

export function setupRunManagerGlobals(worldTime = 1000, actors = []) {
  let id = 0;
  globalThis.foundry = { utils: { randomID: () => `rid-${++id}` } };
  globalThis.game = { user: { id: 'gm-1' }, time: { worldTime }, actors };
}
