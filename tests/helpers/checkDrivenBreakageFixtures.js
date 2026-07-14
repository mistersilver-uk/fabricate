/**
 * Shared fixtures for check-driven tool-breakage tests (issue 419).
 *
 * Both the runtime-level suite (tests/toolBreakageRuntime.test.js) and the
 * gathering-engine suite (tests/gathering-tool-runtime.test.js) drive the same
 * single shared evaluator seam from a persisted `checkDriven` system, an
 * engine-evaluated check result, and a "natural 1 on the first d20" trigger.
 * Keeping these in one module avoids the SonarCloud new-code duplication gate and
 * guarantees the two surfaces are compared against identical inputs in the drift
 * test.
 */

/**
 * Build an engine-evaluated check result with the fields the breakage seam reads:
 * `value`, `data.total`, `data.diceGroups`, `data.outcomeId`, `outcome`, and the
 * legacy `data.breakTools`. `engineEvaluated: true` so the non-engine-evaluated
 * guard does not short-circuit it.
 */
export function engineCheckResult({
  total = null,
  value = null,
  outcome = null,
  outcomeId = null,
  diceGroups = [],
  breakTools = false,
} = {}) {
  return {
    engineEvaluated: true,
    value,
    outcome,
    data: { total, outcomeId, diceGroups, breakTools },
  };
}

// The default "natural 1 on the first d20" trigger and the matching roll: the
// first dice group rolled a 1, so `anyDie == 1` matches. The trigger opts into
// breakage (`breakTools: true`) — only break-tools triggers force a break.
export const NATURAL_ONE_TRIGGER = Object.freeze({
  triggers: [
    {
      id: 'natural1',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
      outcome: 'none',
      breakTools: true,
    },
  ],
});

export const NATURAL_ONE_RESULT = Object.freeze(
  engineCheckResult({ total: 1, diceGroups: [{ groupId: 0, group: '1d20', sum: 1, results: [1] }] })
);

// A persisted system with check-driven breakage authority.
export const CHECK_DRIVEN_SYSTEM = Object.freeze({ toolBreakage: { authority: 'checkDriven' } });

/**
 * A minimal item double with dot-path getFlag/setFlag storage, mirroring the
 * project's getFabricateFlag/setFabricateFlag conventions, plus delete()/update().
 * Used by both suites to back checkDriven plan/apply runs.
 */
export class BreakageFakeItem {
  constructor(uuid = 'Item.x') {
    this.uuid = uuid;
    this._flags = {};
    this.deleted = false;
    this.parent = { uuid: 'Actor.a', createEmbeddedDocuments: async () => {} };
  }

  getFlag(scope, key) {
    const ns = this._flags[scope];
    if (!ns) return undefined;
    return String(key)
      .split('.')
      .reduce((value, part) => (value == null ? undefined : value[part]), ns);
  }

  async setFlag(scope, key, value) {
    this._flags[scope] = this._flags[scope] || {};
    let target = this._flags[scope];
    const parts = String(key).split('.');
    const last = parts.pop();
    for (const part of parts) {
      if (!target[part] || typeof target[part] !== 'object') target[part] = {};
      target = target[part];
    }
    target[last] = value;
    return value;
  }

  async delete() {
    this.deleted = true;
  }

  async update() {}
}
