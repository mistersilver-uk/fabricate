/** The journal-run command actions the authority mutates a run for. */
export const MUTATING_ACTIONS = new Set([
  'start',
  'beginStep',
  'execute',
  'pause',
  'resume',
  'setCompletionMode',
  'setSelection',
  'cancel',
  'chooseAward',
  'takeAction',
]);

/** The actions that may prepare a check and settle it under a one-use prepare token. */
export const CHECKED_ACTIONS = new Set(['execute', 'takeAction']);

/** The action a `releaseCheck` releases the token of: its payload's `releases`, else `execute`. */
export const releasedAction = (payload) =>
  CHECKED_ACTIONS.has(payload?.releases) ? payload.releases : 'execute';
