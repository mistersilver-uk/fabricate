/**
 * Reads and spends the resource that pays for additional dice (issue 2008). One per-client queue
 * serializes every spend of one actor's resource, and a spend stands once made: nothing refunds.
 */
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { trimString } from '../utils/scalars.js';

import { readStoredResource, spendableAmount } from './additionalDiceReach.js';
import { requireDocumentAcknowledgment } from './runHistoryEvidence.js';

export * from './additionalDiceReach.js';

const refuse = (reason, data = {}) => ({ ok: false, reason, ...data });

function canUpdate(actor, user) {
  try {
    return actor?.canUserModify?.(user, 'update') === true;
  } catch {
    return false;
  }
}

async function scriptMacro(uuid) {
  try {
    return (await fromUuid(uuid))?.type === 'script';
  } catch {
    return false;
  }
}

/** The read macro's amount, or null when it is not a script macro, throws or returns no amount. */
async function readMacroAmount(uuid, payload) {
  if (!(await scriptMacro(uuid))) return null;
  try {
    return spendableAmount(await MacroExecutor.run(uuid, payload));
  } catch {
    return null;
  }
}

function pathBudget(policy, actor, user) {
  const path = trimString(policy.path);
  if (!path) return refuse('sourceMissing');
  const { value, overridden } = readStoredResource(actor, path);
  const available = spendableAmount(value);
  if (available === null) return refuse('resourceUnreadable');
  if (overridden) return refuse('resourceOverridden');
  if (!canUpdate(actor, user)) return refuse('resourceNotWritable');
  return { ok: true, source: 'path', path, available };
}

async function macroBudget(policy, payload) {
  const readMacroUuid = trimString(policy.readMacroUuid);
  const spendMacroUuid = trimString(policy.spendMacroUuid);
  if (!readMacroUuid || !spendMacroUuid) return refuse('sourceMissing');
  const available = await readMacroAmount(readMacroUuid, payload);
  if (available === null) return refuse('resourceMacroFailed');
  return { ok: true, source: 'macro', readMacroUuid, spendMacroUuid, available };
}

/**
 * What `user` can spend for this attempt: `{ ok: true, source, available }` plus the source's
 * path or macro UUIDs, or `{ ok: false, reason }` with an unavailable reason.
 */
export async function resolveAdditionalDiceBudget({
  additionalDice,
  actor,
  user,
  payload = {},
  forcedUnavailable = null,
}) {
  if (forcedUnavailable) return refuse(forcedUnavailable);
  const policy = additionalDice ?? {};
  if (policy.source === 'macro') return macroBudget(policy, payload);
  return pathBudget(policy, actor, user);
}

async function spendStoredPath({ path }, dice, actor, user) {
  const { value: before, overridden } = readStoredResource(actor, path);
  if (overridden) return refuse('resourceOverridden');
  if (!canUpdate(actor, user)) return refuse('resourceNotWritable');
  if (typeof before !== 'number' || !Number.isFinite(before) || before < dice) {
    return refuse('resourceChanged', { available: spendableAmount(before) ?? 0 });
  }
  try {
    requireDocumentAcknowledgment(actor, await actor.update({ [path]: before - dice }));
  } catch {
    return refuse('spendRefused');
  }
  if (readStoredResource(actor, path).value !== before - dice) return refuse('spendUnconfirmed');
  return { ok: true, spent: dice, source: 'path' };
}

async function spendThroughMacro({ readMacroUuid, spendMacroUuid }, dice, payload) {
  const available = await readMacroAmount(readMacroUuid, payload);
  if (available === null) return refuse('resourceMacroFailed');
  if (available < dice) return refuse('resourceChanged', { available });
  if (!(await scriptMacro(spendMacroUuid))) return refuse('spendRefused');
  try {
    const spent = await MacroExecutor.run(spendMacroUuid, { ...payload, dice, delta: -dice });
    return spent ? { ok: true, spent: dice, source: 'macro' } : refuse('spendRefused');
  } catch {
    return refuse('spendRefused');
  }
}

const spendQueue = new Map();

/** Runs `task` once every spend queued earlier under `key` on this client has settled. */
function enqueue(key, task) {
  const run = (spendQueue.get(key) ?? Promise.resolve()).then(task);
  const settled = () => {};
  const tail = run.then(settled, settled);
  spendQueue.set(key, tail);
  tail.then(() => spendQueue.get(key) === tail && spendQueue.delete(key));
  return run;
}

/**
 * Spends `dice` for one roll, immediately before its main dice: `{ ok: true, spent, source }` or
 * `{ ok: false, reason }`. Zero dice touch nothing; whatever a spend macro changed stands.
 */
export async function spendAdditionalDice({ budget, dice, actor, user, payload = {} }) {
  if (!Number.isInteger(dice) || dice < 0) return refuse('choiceInvalid');
  if (dice === 0) return { ok: true, spent: 0, source: budget?.source ?? null };
  if (!budget?.ok) return refuse(budget?.reason ?? 'sourceMissing');
  const macro = budget.source === 'macro';
  const key = JSON.stringify([actor?.uuid ?? '', macro ? budget.spendMacroUuid : budget.path]);
  return enqueue(key, () =>
    macro ? spendThroughMacro(budget, dice, payload) : spendStoredPath(budget, dice, actor, user)
  );
}

/** `result` carrying `source`'s additional-dice refusal, when it has one. */
export function withAdditionalDiceRefusal(result, source) {
  const reason = source?.additionalDiceRefusal;
  return reason ? { ...result, additionalDiceRefusal: reason } : result;
}
