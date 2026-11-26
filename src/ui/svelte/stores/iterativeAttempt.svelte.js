/**
 * The Journal's Iterative Attempt store (issue 3011, D-3): the press that takes one Crafting Action
 * through `takeAction`, the answer it leaves in the pane, and what an unknown or stale answer keeps.
 * It shares the journal's one busy key, so no other command runs while a press saves. It holds
 * rendered copy and ids only: the ledger of a result comes from the reloaded session row.
 */
import { arrayOrEmpty } from '../../../utils/scalars.js';
import { iterativeFocusTarget } from '../../presenters/iterative/iterativeFocusTarget.js';
import {
  busyNotice,
  checkNotice,
  errorNotice,
  leadingNotice,
  refusalNotice,
  resultNotice,
  resumeNotice,
  staleNotice,
  startedNotice,
  unansweredNotice,
  verdictNotice,
} from '../../presenters/iterative/iterativeNotice.js';
import { iterativeStepEndVerdict } from '../../presenters/iterative/iterativeVerdict.js';

import { attemptCountOf, createAttemptMemory, rowsOf } from './iterativeAttemptMemory.svelte.js';

const ID_LIMIT = 64;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
/** The stored notices that outrank a boundary's verdict; the rest sit beneath it. */
const ABOVE_VERDICT = ['stale', 'refusal', 'check', 'error'];

/** A revision as the command carries it: a non-negative safe integer, else 0. */
export function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

/** The reply's check, as the result notice's reason names it. */
function classifyReply(reply) {
  const check = reply?.iterative?.attempt?.check;
  if (reply?.secret === true) return 'private';
  if (!check) return 'no-check';
  return check.success === true ? 'check-passed' : 'check-failed';
}

function classifyRow(row) {
  if (row.check?.private) return 'private';
  if (row.check?.outcome == null) return 'no-check';
  return row.check.success === true ? 'check-passed' : 'check-failed';
}

/** The pressed run's visible counters with the entry's paid and changed deltas applied. */
function finalCounters(iterative, attempt) {
  const moved = new Map();
  for (const { counterId, delta } of [
    ...arrayOrEmpty(attempt?.paid),
    ...arrayOrEmpty(attempt?.changed),
  ]) {
    moved.set(counterId, (moved.get(counterId) ?? 0) + Number(delta));
  }
  return arrayOrEmpty(iterative?.counters).map(({ counterId, label, value, min, max }) => ({
    counterId,
    label,
    value: Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, Number(value) + (moved.get(counterId) ?? 0))
    ),
  }));
}

function mintedId(newAttemptId) {
  try {
    const id = newAttemptId?.();
    return typeof id === 'string' && id.length > 0 && id.length <= ID_LIMIT ? id : null;
  } catch {
    return null;
  }
}

/** The reply as the store acts on it: `cancelled`, `unanswered`, `stale`, `check`, `refusal` or `result`. */
function classify(reply, thrown) {
  if (thrown) return { kind: 'unanswered', reason: 'thrown' };
  if (reply?.cancelled === true) return { kind: 'cancelled' };
  if (reply?.success === true) return { kind: 'result' };
  if (reply?.reason === 'command-timeout') return { kind: 'unanswered', reason: 'command-timeout' };
  if (reply?.reason === 'stale-run') return { kind: 'stale' };
  const entry = reply?.detail?.entryId;
  if (reply?.reason === 'roll-unavailable' && !(typeof entry === 'string' && entry)) {
    return { kind: 'check' };
  }
  return { kind: 'refusal' };
}

/** What a press records of itself: the card it pressed, the session it takes, the state it was drawn from. */
function pressOf(run, key, card) {
  return {
    runKey: key,
    actionId: card.actionId,
    name: card.name,
    free: card.free === true,
    sessionNumber: card.free === true ? null : (run.iterative.nextSession ?? null),
    runRevision: normalizeRevision(run.runRevision),
    attemptCount: attemptCountOf(run),
  };
}

class IterativeAttemptStore {
  pressed = $state.raw(null);
  pending = $state.raw(null);
  settled = $state.raw(null);
  #o;
  #memory;
  #listing = null;
  #serial = 0;

  /**
   * @param {object} options
   * @param {object} options.services the player services: `executeJournalRunCommand`, `localize`,
   *   `craftErrorMessage` and `newAttemptId`
   * @param {() => Promise<void>} options.reload loads the Journal again, which calls `reconcile`
   * @param {(run: object) => string} options.runKeyOf
   * @param {(runKey: string, runId: string) => (() => void) | null} options.claimBusy the journal's
   *   shared busy key: a release function, or `null` while any other command holds it
   * @param {(runKey: string) => void} options.markResolved keeps a run that ended on screen
   * @param {(run: object) => Promise<object|undefined>} options.beginStep the journal's `beginStep`
   * @param {() => string} [options.newAttemptId]
   */
  constructor(options) {
    this.#o = { ...options, newAttemptId: options.newAttemptId ?? options.services?.newAttemptId };
    this.#memory = createAttemptMemory(this.#localize);
  }

  #localize = (key, data) => this.#o.services?.localize?.(key, data) ?? key;
  #listed = (key) =>
    [...arrayOrEmpty(this.#listing?.activeRuns), ...arrayOrEmpty(this.#listing?.history)].find(
      (run) => this.#o.runKeyOf(run) === key
    ) ?? null;
  #active = (key) =>
    arrayOrEmpty(this.#listing?.activeRuns).find((run) => this.#o.runKeyOf(run) === key) ?? null;

  verdictFor = (run) => this.#memory.verdictOf(this.#o.runKeyOf(run));
  focusTarget = (run, actionId) => iterativeFocusTarget(run, actionId);
  onSelect = (key) => this.#memory.select(key);
  isOtherWindow = (run, row) => this.#memory.isOtherWindow(this.#o.runKeyOf(run), run, row);

  /** The one notice this workpiece shows: the highest-ranked state it is in, or `null`. */
  noticeFor = (run) => {
    const key = this.#o.runKeyOf(run);
    if (!run?.iterative || TERMINAL.has(run.status) || !this.#active(key)) return null;
    const stored = this.#memory.noteOf(key);
    const localize = this.#localize;
    const verdict = run.iterative.boundary?.verdict;
    return leadingNotice([
      this.pressed?.runKey === key ? busyNotice(this.pressed, localize) : null,
      this.pending?.runKey === key ? unansweredNotice(this.pending.reason, localize) : null,
      ABOVE_VERDICT.includes(stored?.kind) ? stored : null,
      verdict ? verdictNotice(verdict) : null,
      ['started', 'result'].includes(stored?.kind) ? stored : null,
      this.#memory.resumed(key) ? resumeNotice(run.iterative, localize) : null,
    ]);
  };

  /** Reads a fresh listing: first sights, then what an unanswered press left pending. */
  reconcile = (next) => {
    this.#listing = next;
    if (!next) return;
    const active = new Map();
    for (const run of arrayOrEmpty(next.activeRuns)) {
      if (run?.iterative) active.set(this.#o.runKeyOf(run), run);
    }
    for (const [key, run] of active) this.#memory.observe(key, run);
    if (this.pending) this.#settlePending(active);
  };

  #settlePending(active) {
    const wanted = this.pending;
    const run = active.get(wanted.runKey);
    const row = run && rowsOf(run).find((entry) => entry.requestId === wanted.attemptId);
    if (row) {
      const fallback = { action: row.action, session: row.sessionNumber };
      const reason = classifyRow(row);
      this.#memory.note(
        wanted.runKey,
        resultNotice({ reason, row, fallback, replayed: false, localize: this.#localize })
      );
    } else if (run && normalizeRevision(run.runRevision) > wanted.expectedRevision) {
      const other = this.#memory.otherActions(wanted.runKey, run, wanted.attemptCount);
      this.#memory.note(
        wanted.runKey,
        staleNotice({ action: wanted.name, other, result: null, localize: this.#localize })
      );
    } else if (run) return;
    this.pending = null;
  }

  /** Reloads once, and once more when the listing is older than the reply it was loaded for. */
  async #reloadPast(key, revision) {
    await this.#o.reload();
    const run = this.#listed(key);
    if (!run || normalizeRevision(run.runRevision) < normalizeRevision(revision)) {
      await this.#o.reload();
    }
  }

  async #send(run, press, attemptId) {
    const command = {
      actorUuid: run.actorUuid ?? this.#listing?.selectedActorUuid ?? null,
      runType: 'crafting',
      runId: run.id,
      action: 'takeAction',
      expectedRevision: press.runRevision,
      payload: { actionId: press.actionId, attemptId },
    };
    try {
      return { reply: await this.#o.services?.executeJournalRunCommand?.(command), thrown: false };
    } catch (error) {
      console.error('Fabricate | Error taking an Iterative Attempt:', error);
      return { reply: null, thrown: true };
    }
  }

  /** A reply that committed: freezes a step end's verdict, reloads, then states what it wrote. */
  async #commit(run, press, attemptId, reply) {
    const key = press.runKey;
    const { attempt, stepEnd, replayed } = reply.iterative ?? {};
    if (stepEnd) {
      const counters = finalCounters(run.iterative, attempt);
      const verdict = iterativeStepEndVerdict(run.iterative, { stepEnd, counters }, this.#localize);
      this.#memory.freeze(key, verdict);
      this.#o.markResolved(key);
    }
    this.pending = null;
    await this.#reloadPast(key, reply.runRevision);
    const row = rowsOf(this.#active(key)).find((entry) => entry.requestId === attemptId) ?? null;
    this.#memory.note(
      key,
      resultNotice({
        reason: classifyReply(reply),
        row,
        fallback: { action: press.name, session: press.sessionNumber },
        replayed: reply.replayed === true || replayed === true,
        localize: this.#localize,
      })
    );
  }

  /** A reply that did not commit: keeps an unknown outcome pending, or states why nothing changed. */
  async #refused(run, press, attemptId, outcome, reply) {
    const key = press.runKey;
    const localize = this.#localize;
    if (outcome.kind === 'unanswered') {
      const { actionId, name, attemptCount, runRevision } = press;
      const { reason } = outcome;
      const expectedRevision = runRevision;
      this.pending = {
        runKey: key,
        actionId,
        name,
        attemptId,
        attemptCount,
        expectedRevision,
        reason,
      };
      return this.#o.reload();
    }
    if (this.pending?.attemptId === attemptId) this.pending = null;
    await this.#o.reload();
    if (outcome.kind === 'stale') {
      const other = this.#memory.otherActions(key, this.#active(key), press.attemptCount);
      return this.#memory.note(
        key,
        staleNotice({ action: press.name, other, result: reply, localize })
      );
    }
    if (outcome.kind === 'check') return this.#memory.note(key, checkNotice(reply, localize));
    const cards = arrayOrEmpty(run.iterative.cards);
    const context = {
      card: cards.find((entry) => entry.actionId === press.actionId) ?? null,
      counters: run.iterative.counterLabels,
      localize,
      generic: this.#o.services?.craftErrorMessage?.() ?? '',
    };
    return this.#memory.note(key, refusalNotice(reply, context));
  }

  /** The id this press sends: the pending one it resends, else a freshly minted one (or `null`). */
  #attemptIdFor(press) {
    const held = this.pending;
    const resend =
      held?.runKey === press.runKey &&
      held.actionId === press.actionId &&
      held.expectedRevision === press.runRevision;
    if (resend) return held.attemptId;
    this.pending = null;
    return mintedId(this.#o.newAttemptId);
  }

  /** Takes one Iterative Attempt of the card `actionId`, and states its result until the next press. */
  takeAction = async (run, actionId) => {
    const card = arrayOrEmpty(run?.iterative?.cards).find((entry) => entry.actionId === actionId);
    const offered =
      run?.id && run.lifecycleContract === 'current' && run.actions?.takeAction === true;
    if (!offered || !card?.enabled) return;
    const key = this.#o.runKeyOf(run);
    const release = this.#o.claimBusy(key, run.id);
    if (!release) return;
    this.#memory.forget(key);
    const press = pressOf(run, key, card);
    this.pressed = press;
    try {
      const attemptId = this.#attemptIdFor(press);
      if (!attemptId) {
        const generic = this.#o.services?.craftErrorMessage?.() ?? '';
        this.#memory.note(key, errorNotice(generic, this.#localize));
        return;
      }
      this.#memory.mint(key, attemptId);
      const { reply, thrown } = await this.#send(run, press, attemptId);
      const outcome = classify(reply, thrown);
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'result') await this.#commit(run, press, attemptId, reply);
      else await this.#refused(run, press, attemptId, outcome, reply);
    } finally {
      this.pressed = null;
      this.settled = { runKey: key, actionId, serial: (this.#serial += 1) };
      release();
    }
  };

  /** The journal's `beginStep`, and "Step N started" once it commits. */
  beginStep = async (run) => {
    const key = this.#o.runKeyOf(run);
    this.#memory.forget(key);
    const result = await this.#o.beginStep(run);
    if (result?.success !== true) return result;
    const next = this.#active(key);
    if (next?.iterative) this.#memory.note(key, startedNotice(next.iterative, this.#localize));
    return result;
  };
}

/** @param {ConstructorParameters<typeof IterativeAttemptStore>[0]} options */
export function createIterativeAttemptStore(options) {
  return new IterativeAttemptStore(options);
}
