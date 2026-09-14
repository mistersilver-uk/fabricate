/**
 * THE GM NOTICES for the `1.30.0` world-scope entity migration (issue 1363, epic 1357, PR 3).
 *
 * PURE COMPOSITION, deliberately not inline in `src/main.js`. Nothing in that file can be
 * executed by a unit test, and a source-text grep can pin a DISPATCH but never a SUM — three
 * semantic mutations to the `1.21.0` notice's arithmetic survived a green suite while it lived
 * inline. What stays at the Foundry edge is the GM gate, the localizer and the channel.
 *
 * THREE notices, because the facts arrive at different moments and on different clients'
 * timelines: the migration's own report is available the moment `run()` returns, the
 * identity-flag remap runs later in the same `ready` body and can only report what it found once
 * it has walked every actor, and the world identity DRIFT audit (issue 1370) runs on EVERY
 * session, long after any migration, once the three world-scope stores have loaded.
 *
 * The localizer's fallback semantics live in `src/utils/localizeWithFallback.js` (issue 1565).
 * They were private here, and one copy of that rule is the right number: the deferred-chunk
 * notices compose the same way and must not drift on what an empty string, a returned key or a
 * throwing localizer mean.
 */

import { localizeWith } from '../utils/localizeWithFallback.js';

import { composeFindingsNotice, localizeNoticeClause } from './migrationNoticeDetail.js';

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The one-time notice describing what the `1.30.0` migration did.
 *
 * SEVERITY IS DERIVED, not passed: a pass that merely created world entities is INFORMATIONAL,
 * while a rename, a refusal or a reference that already resolves to nothing is something the GM
 * has to act on and is therefore a PERMANENT warning. Those references are REPORTED, never pruned
 * - the registry's requirement 18 measures ZERO disappearing at `1.30.0` - so the notice says so
 * in its own copy rather than implying a deletion the GM must race. A pass that changed nothing
 * produces NO message at all, because a notice that always fires is a notice nobody reads.
 *
 * The toast COUNTS the renames, refusals and flagged references; the console `detail` names every
 * one of them and carries the merged and transitive-group clauses (issue 1737).
 *
 * @param {object|null} report The transient `_worldScopeEntityReport`.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {{message: string, detail: string, severity: 'info'|'warn'}}
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
        '{count} group(s) spanned more than one crafting system and were merged into one record.',
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
        "{count} definition(s) took another system's identity or a new id, and every reference was rewritten.",
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.RenamesDetail',
      detailFallback:
        "{count} definition(s) took another system's identity or a new id, and every reference to them was rewritten: {renames}.",
    },
    {
      when: transitive.length > 0,
      data: { count: transitive.length },
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.TransitiveGroups',
      detailFallback:
        '{count} group(s) were formed transitively from more than two definitions — check them in case two different things were merged.',
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
      fallback:
        '{count} system/entity pair(s) could not be re-keyed safely and were left unchanged.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.RefusalsDetail',
      detailFallback:
        '{count} system/entity pair(s) could not be re-keyed safely and were left exactly as they were: {refusals}.',
    },
    {
      when: flagged.length > 0,
      data: { count: flagged.length },
      detailData: {
        count: flagged.length,
        references: flagged.map((entry) => `${entry.referenceId} (${entry.systemId})`).join(', '),
      },
      key: 'FABRICATE.Migration.WorldScopeEntities.FlaggedForReview',
      fallback: '{count} reference(s) already point at nothing. Nothing has been removed.',
      detailKey: 'FABRICATE.Migration.WorldScopeEntities.FlaggedForReviewDetail',
      detailFallback:
        '{count} reference(s) already point at nothing, and Fabricate can now tell: {references}. Nothing has been removed - review them when you get a chance.',
    },
  ]);
  const needsAction = renames.length > 0 || refusals.length > 0 || flagged.length > 0;
  return { ...notice, severity: needsAction ? 'warn' : 'info' };
}

/**
 * The one-time notice describing the degradations the identity-flag remap could not repair.
 *
 * SILENT ON A CLEAN PASS. It reports the three facts a GM can act on, and the THIRD is the one
 * that matters most: a crafting system whose id cannot be a flag-path segment, a document that
 * refused its write, and a document the pass FAILED to update at all.
 *
 * THE THIRD IS NOT COSMETIC. `skippedErrors` is a transient failure - a rejected update, a
 * malformed document - that leaves that actor still naming retired ids. It also WITHHOLDS the
 * re-key map clear, so the GM needs to know both that the repair is incomplete and that it will
 * be retried; a notice silent on it would leave a partial repair looking like a complete one.
 * The toast counts; the console `detail` names the unsafe systems and the manual re-run command.
 *
 * @param {object|null} summary The remap pass summary.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {{message: string, detail: string}} both `''` when there is nothing to say.
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
        '{count} crafting system id(s) contain a character Fabricate cannot use in an item flag, so owned copies in them were left to resolve by source item instead: {systems}.',
    },
    {
      when: locked > 0,
      data: { count: locked },
      key: 'FABRICATE.Migration.WorldScopeEntities.LockedSkips',
      fallback:
        '{count} item(s) refused the update — usually because they live in a locked compendium — and will keep resolving by source item.',
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
 * How many drifted records the TOAST names before deferring to the console.
 *
 * A NOTIFICATION IS NOT A REPORT SURFACE, and Foundry's own CSS is why. `.notification` has no
 * `max-height` and no `overflow`, and carries `pointer-events: all`, at roughly 60% viewport
 * width for a `LIFETIME_MS` of 5000. Verified at V14.365. An uncapped join over a bulk edit to a
 * 200-component library is about 18 KB of text in one fixed-position block: it overflows the
 * viewport and swallows pointer events over the canvas and the sidebar for five seconds, and the
 * GM cannot clear the underlying drift because no world scoped-entity editor exists yet.
 *
 * NOTHING IS LOST BY CAPPING, BUT ONLY BECAUSE FABRICATE LOGS THE FULL LIST ITSELF, AT A LEVEL
 * THE CONSOLE SHOWS BY DEFAULT. Two earlier forms of this note each stopped one step short.
 *
 * The first reasoned that `ui.notifications.info` defaults `console: true` and therefore the
 * whole enumeration reached the console anyway. FALSE: core logs `el.textContent` - the message
 * it was handed, which is the CAPPED one - because the cap is applied here, before `notify` is
 * ever called. That holds for every version in the declared range, whatever level core picks.
 *
 * The second added {@link describeWorldIdentityDrift} and logged it from the call site, which is
 * NECESSARY BUT NOT SUFFICIENT. It logged at `console.debug`, and `debug` maps to DevTools'
 * VERBOSE level, which Chromium's default level filter excludes - so a GM following the copy's
 * own "press F12" instruction would still not have seen it. The call site logs at `console.info`
 * for that reason, which is also the level core logs the toast at, so the two lines sit together.
 * The level is therefore not a free choice, and lowering it back to `debug` silently re-breaks
 * the copy; `tests/world-scope-consumer-sweep.test.js` pins it.
 *
 * The count and field total stay exact in the sentence either way.
 * The cap is on the ENUMERATION only - the notice still NAMES records rather than counting them,
 * because a bare count tells a GM something is stale and gives them no way to find it.
 */
const IDENTITY_DRIFT_NOTICE_RECORD_CAP = 5;

/**
 * The drift report, grouped per `(system, entity)` with its fields collected.
 *
 * THE SHARED BODY, and that is the point of it: the toast and the console dump must never
 * disagree about what drifted, so they group once here and differ only in how much of the
 * result each one enumerates.
 *
 * @param {Array<{systemId: string, entityType: string, entityId: string, field: string}>}
 *   driftEntries The detector's report.
 * @returns {{records: Array<object>, fieldCount: number}}
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
 * EVERY drifted record, uncapped - the list the notice's own copy points the GM at.
 *
 * THE NOTIFICATION CANNOT PROVIDE THIS. `ui.notifications.info` defaults `console: true`, but what
 * core logs is `el.textContent` - the message it was HANDED, which is the CAPPED one, because the
 * cap is applied before `notify` is called. So a notice that says "the full list is in the
 * console" is false unless Fabricate logs the full list itself, which is what this exists for.
 *
 * LOGGING IT IS NECESSARY, NOT SUFFICIENT: the LEVEL has to be one the console shows. The call
 * site uses `console.info`, because `console.debug` maps to DevTools' VERBOSE level and
 * Chromium's default filter excludes it - a dump nobody can see is the same failure as no dump.
 * Verified against V14.365.0.
 *
 * @param {Array<{systemId: string, entityType: string, entityId: string, field: string}>}
 *   driftEntries The detector's report.
 * @returns {string} the full enumeration, or `''` when there is nothing to say.
 */
export function describeWorldIdentityDrift(driftEntries) {
  return groupWorldIdentityDrift(driftEntries).records.map(describeDriftRecord).join('; ');
}

/**
 * The per-session notice naming the entities whose world identity snapshot has gone stale.
 *
 * A DISCLOSURE OBLIGATION, NOT A CORRECTION. The read union re-derives identity from the
 * in-system record on every read, so the divergence is already resolved safely by the time this
 * runs; what the GM cannot see without being told is WHICH of their own edits the world snapshot
 * no longer reflects, before the world catalogue editors arrive and start writing that snapshot.
 * Nothing here changes any data, and the copy says so.
 *
 * IT NAMES THE RECORDS AND THE FIELDS, never a bare count. A count tells a GM that something is
 * stale and gives them no way to find it; the detector already reports one row per
 * `(entityId, field)`, and collapsing that to a number throws the whole answer away. Rows are
 * grouped per `(system, entity)` so one record with three stale fields reads as one clause with
 * three fields rather than as three unrelated records. The ENUMERATION is capped at
 * {@link IDENTITY_DRIFT_NOTICE_RECORD_CAP} records with an explicit remainder clause; the counts
 * in the sentence stay exact, and the console keeps the whole list.
 *
 * IDENTITY ONLY, AND IT SAYS SO. `WORLD_IDENTITY_FIELDS` covers names, images, descriptions and
 * source links; the detector is BLIND to `tags`, `category`, `breakage`, `onBreak`,
 * `repairRequirements` and `enabled`, so a notice implying it had checked behaviour would be
 * making a claim the detector cannot support.
 *
 * @param {Array<{systemId: string, entityType: string, entityId: string, field: string}>}
 *   driftEntries The detector's report.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {string} the message, or `''` when there is nothing to say.
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

// ---------------------------------------------------------------------------
// The `1.34.0` equivalent-essence merge notice (issue 1654).
// ---------------------------------------------------------------------------

/**
 * How many essences the toast names before deferring to the console, for the reason
 * {@link IDENTITY_DRIFT_NOTICE_RECORD_CAP} states. The call site must log the full enumeration from
 * {@link describeWorldEssenceMerge}, or "the rest is in the console" is not a true sentence.
 */
const ESSENCE_MERGE_NOTICE_NAME_CAP = 5;

/**
 * The readable name of one merged, refused or declined essence group.
 *
 * A name and never an id pair, unlike the `Renames` clause this is modelled on: an essence id is
 * minted with `crypto.randomUUID()`, so most ids `1.34.0` retires are UUIDs and the channel is a
 * corner toast. The equivalence key case-folds the name, so every group has exactly one.
 *
 * The entry's own `name` is the contract and is always present: `buildWorldEssenceEquivalence`
 * carries one on every `mergedGroups`, `refusals` and `declined` entry, and a nameless essence is
 * declined before it can become a candidate.
 *
 * The rest of the chain is a guard and not a path. The report arrives through a transient
 * `_worldEssenceMergeReport` field no schema validates, so a malformed one must still produce a
 * readable sentence rather than the string `undefined` in a permanent toast.
 *
 * @param {object|null} entry A `mergedGroups`, `refusals` or `declined` entry.
 * @param {object|null} retired The `retired` tombstone map, when the report carries it.
 * @returns {string}
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
 * Every group, by id, uncapped - the enumeration the notice's `detail` ends with.
 *
 * Separate from the toast for the reason {@link describeWorldIdentityDrift} is: core logs the
 * message it was handed, which is the capped one, so Fabricate has to log the full list itself.
 *
 * @param {object|null} report The transient `_worldEssenceMergeReport`.
 * @returns {string} the full enumeration, or `''` when there is nothing to say.
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
    // The only leg that names a change to a GM-authored field's value: a freeze writes a resolved
    // value onto an in-system row that was inheriting it, which changes what that system's essence
    // does. Requirements 8 and 13 of the spec section require it disclosed.
    ...arrayOf(report?.inSystemFreezes).map(
      (freeze) =>
        `froze ${arrayOf(freeze?.sections).join(', ')} on ${freeze?.essenceId} in ${freeze?.systemId}`
    ),
  ].join('; ');
}

/**
 * One merged, refused or declined group's finding: capped names in the toast, every group
 * described in full in the detail, both under the same `token`.
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
 * The one-time notice describing what the `1.34.0` equivalent-essence merge did.
 *
 * Severity is constant-`warn` by construction, so this returns no severity: every case that
 * produces a message is one the GM must act on or know about.
 *
 * Silent when nothing happened. `orphaned` alone produces no message, because a world essence with
 * no live membership record is left exactly as it is.
 *
 * The toast names the groups under a cap. The console `detail` carries each group's explanation and
 * remedy, the item-override scope bound (the remap walks owned actor Items only, so a world Item, a
 * compendium Item or an unlinked token actor keeps a stale override) and every id (issue 1737).
 *
 * @param {object|null} report The transient `_worldEssenceMergeReport`.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {{message: string, detail: string}} both `''` when there is nothing to say.
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
