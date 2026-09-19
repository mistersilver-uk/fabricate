/**
 * The manager's route-exit guards as one ordered table and its driver (issue 1705). A row answers
 * `true`, `false` or a promise of either, the cascade stops at the first refusal, and it creates no
 * promise while every row is inactive or skipped, because callers read that answer as a boolean.
 */

import { finishScopedEntryExit, isThenable } from './scoped/scopedEntryDraft.js';

/** Every guarded route in cascade order: the navigation each waives, and the action its finisher
 * receives when the store helper is absent — a per-row fact, and not a uniform one. */
export const ROUTE_EXIT_GUARDS = Object.freeze(
  [
    { view: 'world-essence-entry', skip: 'subject', missing: undefined, finish: 'scoped-entry' },
    { view: 'world-tool-entry', skip: 'subject', missing: undefined, finish: 'scoped-entry' },
    { view: 'world-component-entry', skip: 'subject', missing: undefined, finish: 'scoped-entry' },
    { view: 'environment-edit', skip: 'same-view', missing: undefined, finish: 'own' },
    { view: 'essence-edit', skip: 'subject', missing: false, finish: 'own' },
    { view: 'recipe-edit', skip: 'same-view', missing: false, finish: 'own' },
    { view: 'recipe-item-edit', skip: 'same-view', missing: false, finish: 'own' },
    // Issue 676: the component editor waives no navigation, not even a same-view one.
    { view: 'component-edit', skip: 'none', missing: false, finish: 'own' },
    { view: 'gathering-task-edit', skip: 'none', missing: false, finish: 'own' },
    { view: 'gathering-event-edit', skip: 'none', missing: false, finish: 'own' },
    { view: 'tool-edit', skip: 'subject', missing: undefined, finish: 'own' },
    { view: 'checks', skip: 'family', missing: undefined, finish: 'own' },
    { view: 'system-edit', skip: 'same-view', missing: 'cancel', finish: 'own' },
  ].map((guard) => Object.freeze(guard))
);

function skipPredicate({ view, skip }, row) {
  if (skip === 'subject') {
    return (nextView, nextRouteId) =>
      nextView === view && Boolean(nextRouteId) && nextRouteId === row.subject();
  }
  if (skip === 'same-view') return (nextView) => nextView === view;
  if (skip === 'family') return (nextView) => row.family(nextView);
  return;
}

/** The three world-entry rows share one finisher; every other row states its own. */
function finisherFor({ finish }, row) {
  if (finish !== 'scoped-entry') return row.finish;
  return (action) => finishScopedEntryExit(action, { save: row.save, discard: row.discard });
}

/** The table, from a context keyed by the same view tokens: each entry states `active`, `isDirty`,
 * `confirm` and `finish`, plus `whenClean`, `subject` or `family` where its row needs one. */
export function buildRouteExitGuards(context) {
  return ROUTE_EXIT_GUARDS.map((guard) => {
    const row = context?.[guard.view];
    if (!row) throw new Error(`no route-exit guard is wired for \`${guard.view}\``);
    return {
      view: guard.view,
      active: row.active,
      skip: skipPredicate(guard, row),
      isDirty: row.isDirty,
      whenClean: row.whenClean,
      confirm: () => row.confirm() ?? guard.missing,
      finish: finisherFor(guard, row),
    };
  });
}

/** One row's answer: inactive, skipped and clean all answer without raising the prompt. */
export function runRouteExitGuard(row, nextView, nextRouteId = '') {
  if (!row.active()) return true;
  if (row.skip?.(nextView, nextRouteId)) return true;
  if (!row.isDirty()) return row.whenClean ? row.whenClean(nextView) : true;
  const answer = row.confirm();
  if (isThenable(answer)) return answer.then((action) => row.finish(action, nextView));
  return row.finish(answer, nextView);
}

function askRouteExitGuards(rows, first, nextView, nextRouteId, answer) {
  let last = answer;
  for (let index = first; index < rows.length; index += 1) {
    const result = runRouteExitGuard(rows[index], nextView, nextRouteId);
    if (isThenable(result)) {
      const next = index + 1;
      return result.then((value) =>
        value === false ? false : askRouteExitGuards(rows, next, nextView, nextRouteId, value)
      );
    }
    if (result === false) return false;
    last = result;
  }
  return last;
}

/** The whole cascade, answering what the last row it reached said; every row is handed the same
 * `nextRouteId`, so a future `confirmRouteExit('tool-edit', id)` would waive a guard raised now. */
export function confirmRouteExitGuards(rows, nextView, nextRouteId = '') {
  return askRouteExitGuards(rows, 0, nextView, nextRouteId, true);
}
