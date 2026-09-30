/**
 * Comparing class-1 counts measured at a base commit with the same counts measured at head. A rise
 * is a regression and a fall is reported. A profile whose fixture identity changed cannot be
 * compared, and a removed profile or case is no longer compared, so each is a break the gate
 * fails on as it does on a rise.
 */
import { byCodePoint } from '../../tests/helpers/codePointOrder.js';

/** The fields that decide whether two measurements of a profile saw the same fixture. */
export function fixtureIdentity(payload) {
  const checksums = payload.checksums ?? {};
  const keys = Object.keys(checksums).sort(byCodePoint);
  return JSON.stringify([
    payload.harnessVersion,
    payload.seed,
    keys.map((key) => [key, checksums[key]]),
  ]);
}

function sortedKeys(left, right) {
  return [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].sort(byCodePoint);
}

/** Every rise, fall and added or removed count of one case measured on both sides. */
function compareCase(profile, id, before, after, result) {
  for (const count of sortedKeys(before, after)) {
    const [was, now] = [before[count], after[count]];
    const label = `${profile} ${id}.${count}`;
    if (was === undefined) result.notes.push(`count added: ${label} = ${now}`);
    else if (now === undefined) result.notes.push(`count removed: ${label} (was ${was})`);
    else if (now > was) {
      result.rises.push({
        profile,
        id,
        count,
        was,
        now,
        text: `${label} rose from ${was} to ${now}`,
      });
    } else if (now < was) result.falls.push(`${label} fell from ${was} to ${now}`);
  }
}

function compareProfile(profile, base, head, result) {
  if (fixtureIdentity(base) !== fixtureIdentity(head)) {
    result.breaks.push({
      profile,
      text:
        `incomparable: ${profile} changed its fixture identity (harness version, seed or a ` +
        'fixture checksum), so its counts were not compared',
    });
    return;
  }
  for (const id of sortedKeys(base.cases, head.cases)) {
    const [was, now] = [base.cases[id], head.cases[id]];
    if (was && now) compareCase(profile, id, was.counts ?? {}, now.counts ?? {}, result);
    else if (was) result.breaks.push({ profile, id, text: `case removed: ${profile} ${id}` });
    else result.notes.push(`case added: ${profile} ${id}`);
  }
}

/**
 * Compare two `class1ByProfile` payloads.
 *
 * @returns {{rises: {profile: string, id: string, count: string, was: number, now: number,
 *   text: string}[], breaks: {profile: string, id?: string, text: string}[], falls: string[],
 *   notes: string[]}} `breaks` names every profile left uncompared because its fixture changed and
 *   every removed profile or case; `notes` every added one, and every count on one side only.
 */
export function compareClass1(baseByProfile, headByProfile) {
  const result = { rises: [], breaks: [], falls: [], notes: [] };
  for (const profile of sortedKeys(baseByProfile, headByProfile)) {
    const [base, head] = [baseByProfile[profile], headByProfile[profile]];
    if (base && head) compareProfile(profile, base, head, result);
    else if (base) result.breaks.push({ profile, text: `profile removed: ${profile}` });
    else result.notes.push(`profile added: ${profile}`);
  }
  return result;
}
