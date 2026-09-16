/**
 * THE GM NOTICES for the `1.30.0` world-scope entity migration (issue 1363). PURE COMPOSITION,
 * deliberately not inline in `src/main.js`, which no unit test can execute. THREE notices, because
 * the facts arrive at different moments on different clients' timelines.
 */

import { localizeWith } from '../utils/localizeWithFallback.js';

import { composeFindingsNotice, localizeNoticeClause } from './migrationNoticeDetail.js';

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The one-time notice describing what the `1.30.0` migration did. SEVERITY IS DERIVED, not passed:
 * creation is INFORMATIONAL, a rename, refusal or already-dangling reference a PERMANENT warning.
 * Those references are REPORTED, never pruned. A pass that changed nothing produces NO message.
 */
export function buildWorldScopeEntityNotice(report, localize) {
  const created = report?.createdEntities ?? {};
  const counts = {
    components: Number(created.components) || 0,
    essences: Number(created.essences) || 0,
    tools: Number(created.tools) || 0,
  };
  const merged = arrayOf(report?.mergedGroups);
  const renames = arrayOf(report?.renames);
  const refusals = arrayOf(report?.refusals);
  const flagged = arrayOf(report?.flaggedForReview);
  const transitive = arrayOf(report?.transitiveGroups);
  const createdTotal = counts.components + counts.essences + counts.tools;
  if (createdTotal + merged.length + renames.length + refusals.length === 0) {
    return { message: '', detail: '', severity: 'info' };
  }

  const notice = composeFindingsNotice(localize, [
    {
      when: true,
      data: counts,
      // Deliberately NOT the lang wording: an unlocalized copy must miss the View Lab tolerance
      // anchor, which `tests/view-lab-world-migration.test.js` holds it to.
      key: 'FABRICATE.Migration.WorldScopeEntities.Created',
      fallback:
        'Fabricate created {components} world component(s), {essences} world essence(s) and {tools} world tool(s).',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.CreatedDetail',
      detailFallback:
        'Fabricate created {components} world component(s), {essences} world essence(s) and {tools} world tool(s). Every crafting system keeps exactly the behaviour it had.',
    },
    {
      when: merged.length > 0,
      data: { count: merged.length },
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.Merged',
      detailFallback:
        '{count} of them were the same real item in more than one system and are now one record.',
    },
    {
      // EVERY rename, by name, with its two systems. A byte-identical group produces none, so
      // everything listed here actually changed something a GM can see.
      when: renames.length > 0,
      data: { count: renames.length },
      detailData: {
        count: renames.length,
        renames: renames
          .map(
            (entry) =>
              `${entry.oldId} → ${entry.newId} (${entry.systemId} ← ${entry.donorSystemId})`
          )
          .join(', '),
      },
      key: 'FABRICATE.Migration.WorldScopeEntities.Renames',
      fallback:
        '{count} definition(s) took another system’s identity or a new id, and every reference was rewritten.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.RenamesDetail',
      detailFallback:
        '{count} definition(s) took the oldest system’s identity or a new id, and every reference to them was rewritten: {renames}.',
    },
    {
      when: transitive.length > 0,
      data: { count: transitive.length },
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.TransitiveGroups',
      detailFallback:
        '{count} group(s) were merged through a shared source item rather than directly. Check them in case two different things were joined.',
    },
    {
      when: refusals.length > 0,
      data: { count: refusals.length },
      detailData: {
        count: refusals.length,
        refusals: refusals
          .map((entry) => `${entry.systemId} (${entry.entityType}: ${entry.reason})`)
          .join(', '),
      },
      key: 'FABRICATE.Migration.WorldScopeEntities.Refusals',
      fallback: '{count} system(s) could not be re-keyed safely and were left unchanged.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.RefusalsDetail',
      detailFallback:
        '{count} system(s) could not be re-keyed safely, so Fabricate left them exactly as they were and merged nothing there: {refusals}.',
    },
    {
      when: flagged.length > 0,
      data: { count: flagged.length },
      detailData: {
        count: flagged.length,
        references: flagged.map((entry) => `${entry.referenceId} (${entry.systemId})`).join(', '),
      },
      key: 'FABRICATE.Migration.WorldScopeEntities.FlaggedForReview',
      fallback: '{count} reference(s) already point at nothing. Nothing was removed.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.FlaggedForReviewDetail',
      detailFallback:
        '{count} reference(s) already point at nothing, and Fabricate can now tell you which: {references}. Nothing has been removed - review them when you get a chance.',
    },
  ]);
  const needsAction = renames.length > 0 || refusals.length > 0 || flagged.length > 0;
  return { ...notice, severity: needsAction ? 'warn' : 'info' };
}

/**
 * The one-time notice describing what the identity-flag remap could not repair, silent on a clean
 * pass. THE THIRD FACT IS NOT COSMETIC: `skippedErrors` WITHHOLDS the re-key map clear, so the GM
 * must be told both that the repair is incomplete and that it will be retried.
 */
export function buildWorldScopeIdentityRemapNotice(summary, localize) {
  const unsafe = arrayOf(summary?.unsafeSystemIdSkips);
  const locked = Number(summary?.lockedSkips) || 0;
  const failed = Number(summary?.skippedErrors) || 0;
  return composeFindingsNotice(localize, [
    {
      when: unsafe.length > 0,
      data: { count: unsafe.length, systems: unsafe.join(', ') },
      key: 'FABRICATE.Migration.WorldScopeEntities.UnsafeSystemIds',
      fallback:
        '{count} crafting system id(s) cannot be used in an item flag, so their owned items keep resolving by source item.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.UnsafeSystemIdsDetail',
      detailFallback:
        '{count} crafting system id(s) contain a character Fabricate cannot use inside an item flag, so owned copies in them were left to resolve by their source item instead: {systems}.',
    },
    {
      when: locked > 0,
      data: { count: locked },
      key: 'FABRICATE.Migration.WorldScopeEntities.LockedSkips',
      fallback:
        '{count} item(s) refused the update — usually because they live in a locked compendium — and will keep resolving by their source item.',
    },
    {
      when: failed > 0,
      data: { count: failed },
      key: 'FABRICATE.Migration.WorldScopeEntities.SkippedErrors',
      fallback:
        '{count} document(s) could not be updated, so the repair is incomplete. Fabricate will retry on the next reload.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.SkippedErrorsDetail',
      detailFallback:
        '{count} document(s) could not be updated at all, so the repair is INCOMPLETE. Fabricate has kept its record of what to change and will retry on the next reload; you can also run it now from the console with game.fabricate.remapWorldScopeIdentityFlags().',
    },
  ]);
}

/**
 * How many drifted records the TOAST names before deferring to the console. A NOTIFICATION IS NOT A
 * REPORT SURFACE: `.notification` has no `max-height`, no `overflow` and `pointer-events: all` at
 * roughly 60% viewport width for 5000ms (V14.365), so an uncapped join over a bulk edit swallows
 * pointer events for five seconds. NOTHING IS LOST BY CAPPING, BUT ONLY BECAUSE FABRICATE LOGS THE
 * FULL LIST ITSELF AT `console.info` — core logs the CAPPED message, and `console.debug` maps to a
 * VERBOSE level Chromium filters out. The cap is on the ENUMERATION only; the counts stay exact.
 */
const IDENTITY_DRIFT_NOTICE_RECORD_CAP = 5;

/**
 * The drift report, grouped per `(system, entity)` with its fields collected — THE SHARED BODY, so
 * the toast and the console dump can never disagree about what drifted and differ only in how much
 * each enumerates.
 */
function groupWorldIdentityDrift(driftEntries) {
  const byRecord = new Map();
  let fieldCount = 0;
  for (const entry of arrayOf(driftEntries)) {
    if (!entry || typeof entry !== 'object') continue;
    const key = `${entry.systemId}\u{0}${entry.entityType}\u{0}${entry.entityId}`;
    if (!byRecord.has(key)) {
      byRecord.set(key, {
        systemId: entry.systemId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        fields: [],
      });
    }
    const record = byRecord.get(key);
    if (typeof entry.field === 'string' && !record.fields.includes(entry.field)) {
      record.fields.push(entry.field);
      fieldCount += 1;
    }
  }
  return { records: [...byRecord.values()], fieldCount };
}

/** One drifted record, as the toast and the console both name it. */
function describeDriftRecord(record) {
  return `${record.entityId} (${record.entityType}: ${record.fields.join(', ')}) in ${record.systemId}`;
}

/**
 * EVERY drifted record, uncapped — the list the notice's copy points the GM at, which the
 * NOTIFICATION CANNOT PROVIDE because core logs the CAPPED message it was handed (V14.365.0).
 */
export function describeWorldIdentityDrift(driftEntries) {
  return groupWorldIdentityDrift(driftEntries).records.map(describeDriftRecord).join('; ');
}

/**
 * The per-session notice naming the entities whose world identity snapshot has gone stale. A
 * DISCLOSURE OBLIGATION, NOT A CORRECTION: the read union re-derives identity on every read, and
 * nothing here changes data. IT NAMES THE RECORDS AND THE FIELDS, never a bare count, and it says
 * IDENTITY ONLY — the detector is BLIND to `tags`, `category`, `breakage`, `onBreak`,
 * `repairRequirements` and `enabled`.
 */
export function buildWorldIdentityDriftNotice(driftEntries, localize) {
  const { records, fieldCount } = groupWorldIdentityDrift(driftEntries);
  if (records.length === 0) return '';
  const shown = records.slice(0, IDENTITY_DRIFT_NOTICE_RECORD_CAP);
  const withheld = records.length - shown.length;
  let named = shown.map(describeDriftRecord).join('; ');
  if (withheld > 0) {
    named += ` ${localizeWith(
      localize,
      'FABRICATE.Migration.WorldScopeEntities.IdentityDriftOverflow',
      { count: withheld },
      `...and ${withheld} more - the full list is in the console`
    )}`;
  }
  return localizeWith(
    localize,
    'FABRICATE.Migration.WorldScopeEntities.IdentityDrift',
    { records: records.length, fields: fieldCount, entities: named },
    `Fabricate's world catalogue snapshot is out of date for ${records.length} record(s) across ${fieldCount} field(s): ${named}. Each crafting system's own copy is what every reader answers from, so nothing is wrong and nothing has been changed - this is identity only (names, images, descriptions and source links), not behaviour.`
  );
}

// --- The `1.34.0` equivalent-essence merge notice (issue 1654) --------------

/**
 * How many essences the toast names before deferring to the console, for the reason {@link
 * IDENTITY_DRIFT_NOTICE_RECORD_CAP} states. The `detail` ends with the full enumeration.
 */
const ESSENCE_MERGE_NOTICE_NAME_CAP = 5;

/**
 * The readable name of one merged, refused or declined essence group. A NAME and never an id pair,
 * unlike the `Renames` clause this is modelled on: most ids `1.34.0` retires are UUIDs. The entry's
 * own `name` is the contract; the rest of the chain is a GUARD against an unvalidated transient.
 */
function essenceGroupName(entry, retired) {
  if (typeof entry?.name === 'string' && entry.name) return entry.name;
  const tombstones = retired && typeof retired === 'object' ? retired : {};
  for (const loserId of arrayOf(entry?.loserIds)) {
    const name = tombstones[loserId]?.name;
    if (typeof name === 'string' && name) return name;
  }
  const fallbackId = entry?.essenceId ?? entry?.survivorId;
  const tombstoned = tombstones[fallbackId]?.name;
  if (typeof tombstoned === 'string' && tombstoned) return tombstoned;
  return typeof fallbackId === 'string' && fallbackId ? fallbackId : 'an unnamed essence';
}

/** The first {@link ESSENCE_MERGE_NOTICE_NAME_CAP} descriptions, with an explicit remainder. */
function describeCappedEssences(entries, describe, localize) {
  const shown = entries.slice(0, ESSENCE_MERGE_NOTICE_NAME_CAP);
  const withheld = entries.length - shown.length;
  const named = shown.map((entry) => describe(entry)).join(', ');
  if (withheld === 0) return named;
  return `${named} ${localizeNoticeClause(
    localize,
    'FABRICATE.Migration.WorldEssenceMerge.Overflow',
    { count: withheld },
    '…and {count} more'
  )}`;
}

/**
 * Every group, by id, uncapped — the enumeration the notice's `detail` ends with. Separate from the
 * toast for the reason {@link describeWorldIdentityDrift} is: core logs the message it was handed.
 */
export function describeWorldEssenceMerge(report) {
  return [
    ...arrayOf(report?.mergedGroups).map(
      (group) =>
        `merged ${arrayOf(group?.loserIds).join(', ')} into ${group?.survivorId} across ${arrayOf(group?.systemIds).join(', ')}`
    ),
    ...arrayOf(report?.refusals).map(
      (refusal) =>
        `refused ${arrayOf(refusal?.loserIds).join(', ')} -> ${refusal?.survivorId} (${refusal?.reason})`
    ),
    ...arrayOf(report?.declined).map(
      (entry) => `declined ${entry?.essenceId} (${arrayOf(entry?.sections).join(', ')})`
    ),
    ...arrayOf(report?.orphaned).map((entry) => `orphaned ${entry?.essenceId}`),
    // The only leg naming a change to a GM-authored field's VALUE: a freeze writes a resolved value
    // onto an in-system row that was inheriting it. Requirements 8 and 13 require it disclosed.
    ...arrayOf(report?.inSystemFreezes).map(
      (freeze) =>
        `froze ${arrayOf(freeze?.sections).join(', ')} on ${freeze?.essenceId} in ${freeze?.systemId}`
    ),
  ].join('; ');
}

/**
 * One merged, refused or declined group's finding: capped names in the toast, every group described
 * in full in the detail, both under the same `token`.
 */
function essenceGroupFinding(entries, localize, spec) {
  const count = entries.length;
  return {
    ...spec,
    when: count > 0,
    data: { count, [spec.token]: describeCappedEssences(entries, spec.name, localize) },
    detailData: { count, [spec.token]: entries.map(spec.describe).join(', ') },
  };
}

/**
 * The one-time notice describing what the `1.34.0` merge did. Severity is constant-`warn`, so this
 * returns none, and `orphaned` alone produces no message. The `detail` carries each group's remedy
 * and the item-override scope bound: the remap walks OWNED ACTOR ITEMS ONLY.
 */
export function buildWorldEssenceMergeNotice(report, localize) {
  const merged = arrayOf(report?.mergedGroups);
  const refusals = arrayOf(report?.refusals);
  const declined = arrayOf(report?.declined);
  if (merged.length === 0 && refusals.length === 0 && declined.length === 0) {
    return { message: '', detail: '' };
  }

  const retired = report?.retired ?? null;
  const nameOf = (entry) => essenceGroupName(entry, retired);
  const findings = [
    essenceGroupFinding(merged, localize, {
      token: 'names',
      name: nameOf,
      describe: nameOf,
      key: 'FABRICATE.Migration.WorldEssenceMerge.Merged',
      fallback:
        'Fabricate merged {count} set(s) of duplicate essences into one shared essence each: {names}. This cannot be undone.',
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.MergedDetail',
      detailFallback:
        "Fabricate found {count} set(s) of essences that were the same essence in more than one system — same name, same macro and same active-effect source — and made each set one shared essence: {names}. Every reference was updated. This cannot be undone: the other essences in each set are gone, along with their own world icon, colour and description, and the systems that held them now resolve the surviving essence as the shared definition — but each system's own essence row keeps the name, icon and description it was authored with, so what you see inside a system may not change at all.",
    }),
    essenceGroupFinding(refusals, localize, {
      token: 'refusals',
      name: nameOf,
      describe: (entry) => `${nameOf(entry)} (${entry?.reason})`,
      key: 'FABRICATE.Migration.WorldEssenceMerge.Refusals',
      fallback:
        '{count} essence set(s) could not be merged safely and were left unchanged: {refusals}.',
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.RefusalsDetail',
      detailFallback:
        "{count} set(s) could not be merged safely, so Fabricate left them exactly as they were and merged nothing there: {refusals}. This will not be retried — to merge them, delete the duplicate essence from the offending system's Essences tab yourself.",
    }),
    essenceGroupFinding(declined, localize, {
      token: 'essences',
      name: nameOf,
      describe: (entry) =>
        `${nameOf(entry)} (${arrayOf(entry?.sections).join(', ') || entry?.reason})`,
      key: 'FABRICATE.Migration.WorldEssenceMerge.Declined',
      fallback:
        '{count} essence(s) were left alone because their crafting systems disagree about them: {essences}.',
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.DeclinedDetail',
      detailFallback:
        '{count} essence(s) were left alone because the crafting systems using them disagree about their macro or active-effect source, so Fabricate cannot tell whether they are one essence or several: {essences}. Nothing has been changed — review them under World › Essences.',
    }),
    {
      // Only when something merged: only a merge retires an id for a stale override to name.
      when: merged.length > 0,
      detailKey: 'FABRICATE.Migration.WorldEssenceMerge.ItemOverrideScopeDetail',
      detailFallback:
        'Fabricate could only update the per-item essence overrides on items your characters are carrying, so a world item, a compendium item or an unlinked token actor may still name a merged-away essence. Nothing resolves to the wrong essence — a retired id is never reused — but a merged-away id counts for nothing, so those items contribute less essence than they did, or none at all. Fabricate has no screen for these overrides, so whatever set them — a GM, a macro or another module — has to set them again.',
    },
  ];
  return composeFindingsNotice(localize, findings, [describeWorldEssenceMerge(report)]);
}
