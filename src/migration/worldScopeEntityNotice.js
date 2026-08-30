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
 */

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/** Localize with a literal-string fallback, so a missing key never renders as a key. */
function localizeWith(localize, key, data, fallback) {
  try {
    const value = typeof localize === 'function' ? localize(key, data) : null;
    return typeof value === 'string' && value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
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
 * @param {object|null} report The transient `_worldScopeEntityReport`.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {{message: string, severity: 'info'|'warn'}}
 */
export function buildWorldScopeEntityNotice(report, localize) {
  const created = report?.createdEntities ?? {};
  const componentCount = Number(created.components) || 0;
  const essenceCount = Number(created.essences) || 0;
  const toolCount = Number(created.tools) || 0;
  const totalCreated = componentCount + essenceCount + toolCount;
  const merged = arrayOf(report?.mergedGroups);
  const renames = arrayOf(report?.renames);
  const refusals = arrayOf(report?.refusals);
  const flagged = arrayOf(report?.flaggedForReview);
  const transitive = arrayOf(report?.transitiveGroups);

  if (totalCreated === 0 && merged.length === 0 && renames.length === 0 && refusals.length === 0) {
    return { message: '', severity: 'info' };
  }

  const clauses = [
    localizeWith(
      localize,
      'FABRICATE.Migration.WorldScopeEntities.Created',
      { components: componentCount, essences: essenceCount, tools: toolCount },
      `Fabricate created ${componentCount} world component(s), ${essenceCount} world essence(s) and ${toolCount} world tool(s).`
    ),
  ];
  if (merged.length > 0) {
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.Merged',
        { count: merged.length },
        `${merged.length} group(s) spanned more than one crafting system and were merged into one record.`
      )
    );
  }
  if (renames.length > 0) {
    // EVERY rename, by name, with its two systems. A byte-identical group produces none, so
    // everything listed here actually changed something a GM can see.
    const named = renames
      .map(
        (entry) => `${entry.oldId} → ${entry.newId} (${entry.systemId} ← ${entry.donorSystemId})`
      )
      .join(', ');
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.Renames',
        { count: renames.length, renames: named },
        `${renames.length} definition(s) took another system's identity or a new id: ${named}.`
      )
    );
  }
  if (transitive.length > 0) {
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.TransitiveGroups',
        { count: transitive.length },
        `${transitive.length} group(s) were formed transitively from more than two definitions — check them in case two different things were merged.`
      )
    );
  }
  if (refusals.length > 0) {
    const named = refusals
      .map((entry) => `${entry.systemId} (${entry.entityType}: ${entry.reason})`)
      .join(', ');
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.Refusals',
        { count: refusals.length, refusals: named },
        `${refusals.length} system/entity pair(s) could not be re-keyed safely and were left exactly as they were: ${named}.`
      )
    );
  }
  if (flagged.length > 0) {
    const named = flagged.map((entry) => `${entry.referenceId} (${entry.systemId})`).join(', ');
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.FlaggedForReview',
        { count: flagged.length, references: named },
        `${flagged.length} reference(s) already point at nothing, and Fabricate can now tell: ${named}. Nothing has been removed - review them when you get a chance.`
      )
    );
  }

  const severity =
    renames.length > 0 || refusals.length > 0 || flagged.length > 0 ? 'warn' : 'info';
  return { message: clauses.join(' '), severity };
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
 *
 * @param {object|null} summary The remap pass summary.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {string} the message, or `''` when there is nothing to say.
 */
export function buildWorldScopeIdentityRemapNotice(summary, localize) {
  const unsafe = arrayOf(summary?.unsafeSystemIdSkips);
  const locked = Number(summary?.lockedSkips) || 0;
  const failed = Number(summary?.skippedErrors) || 0;
  if (unsafe.length === 0 && locked === 0 && failed === 0) return '';
  const clauses = [];
  if (unsafe.length > 0) {
    const named = unsafe.join(', ');
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.UnsafeSystemIds',
        { count: unsafe.length, systems: named },
        `${unsafe.length} crafting system id(s) contain a character Fabricate cannot use in an item flag, so owned copies in them were left to resolve by source item instead: ${named}.`
      )
    );
  }
  if (locked > 0) {
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.LockedSkips',
        { count: locked },
        `${locked} item(s) refused the update — usually because they live in a locked compendium — and will keep resolving by source item.`
      )
    );
  }
  if (failed > 0) {
    clauses.push(
      localizeWith(
        localize,
        'FABRICATE.Migration.WorldScopeEntities.SkippedErrors',
        { count: failed },
        `${failed} document(s) could not be updated at all, so the repair is INCOMPLETE. Fabricate has kept its record of what to change and will retry on the next reload; you can also run it now from the console with game.fabricate.remapWorldScopeIdentityFlags().`
      )
    );
  }
  return clauses.join(' ');
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
 * three fields rather than as three unrelated records.
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
  if (byRecord.size === 0) return '';
  const named = [...byRecord.values()]
    .map(
      (record) =>
        `${record.entityId} (${record.entityType}: ${record.fields.join(', ')}) in ${record.systemId}`
    )
    .join('; ');
  return localizeWith(
    localize,
    'FABRICATE.Migration.WorldScopeEntities.IdentityDrift',
    { records: byRecord.size, fields: fieldCount, entities: named },
    `Fabricate's world catalogue snapshot is out of date for ${byRecord.size} record(s) across ${fieldCount} field(s): ${named}. Each crafting system's own copy is what every reader answers from, so nothing is wrong and nothing has been changed - this is identity only (names, images, descriptions and source links), not behaviour.`
  );
}
