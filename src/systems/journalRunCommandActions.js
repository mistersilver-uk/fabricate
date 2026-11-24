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
]);
