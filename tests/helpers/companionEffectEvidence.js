/** Valid v1 companion effect evidence for record fixtures, keyed by the effect phase it derives. */

export const TARGET = Object.freeze({ actorUuid: 'Actor.hero', itemUuid: null });
export const INTENT = Object.freeze({ mode: 'create', targetItemUuid: null, stackBefore: 0 });
export const RECEIPT = Object.freeze({ itemUuid: 'Actor.hero.Item.iron', placed: 1, stacked: false });
export const FAILURE = Object.freeze({ detail: 'create returned no document' });

const SUBWRITE_FIELDS = {
  pending: { intent: null, receipt: null, failure: null },
  applying: { intent: INTENT, receipt: null, failure: null },
  applied: { intent: INTENT, receipt: RECEIPT, failure: null },
  knownFailure: { intent: INTENT, receipt: null, failure: FAILURE },
  uncertain: { intent: INTENT, receipt: null, failure: FAILURE },
};

/** One subwrite in `phase`, with every key present. */
export function subwrite(phase, subwriteId = 'r0.a0', overrides = {}) {
  return structuredClone({
    subwriteId,
    target: TARGET,
    phase,
    ...SUBWRITE_FIELDS[phase],
    ...overrides,
  });
}

/** Evidence over the given subwrite phases, as `{ evidenceVersion: 1, ... }`. */
export function evidenceOf(phases, replayClass = 'structuredMarker') {
  return {
    evidenceVersion: 1,
    replayClass,
    failure: null,
    subwrites: phases.map((phase, index) => subwrite(phase, `r0.a${index}`)),
  };
}

const PHASE_SUBWRITES = {
  applying: ['applying'],
  applied: ['applied'],
  knownFailure: ['knownFailure'],
  reviewRequired: ['uncertain'],
};

/** The smallest valid evidence for an effect `phase`, or `null` where the phase carries none. */
export function effectEvidence(phase) {
  const phases = PHASE_SUBWRITES[phase];
  return phases ? evidenceOf(phases) : null;
}
