/**
 * THE GM NOTICES for the `1.30.0` world-scope entity migration (issue 1363, epic 1357, PR 3).
 *
 * PURE COMPOSITION, deliberately not inline in `src/main.js`. Nothing in that file can be
 * executed by a unit test, and a source-text grep can pin a DISPATCH but never a SUM — three
 * semantic mutations to the `1.21.0` notice's arithmetic survived a green suite while it lived
 * inline. What stays at the Foundry edge is the GM gate, the localizer and the channel.
 *
 * TWO notices, because the two facts arrive at different moments and on different clients'
 * timelines: the migration's own report is available the moment `run()` returns, while the
 * identity-flag remap runs later in the same `ready` body and can only report what it found once
 * it has walked every actor.
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
 * while a rename, a refusal or a newly-prunable reference is something the GM has to act on and
 * is therefore a PERMANENT warning. A pass that changed nothing produces NO message at all,
 * because a notice that always fires is a notice nobody reads.
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
        `${flagged.length} reference(s) already pointed at nothing and will be removed on the next save now that the world scope is seeded: ${named}.`
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
 * SILENT ON A CLEAN PASS. It reports only the two facts a GM can act on: a crafting system whose
 * id cannot be a flag-path segment, and a source document that refused its write.
 *
 * @param {object|null} summary The remap pass summary.
 * @param {(key: string, data?: object) => string|undefined} localize
 * @returns {string} the message, or `''` when there is nothing to say.
 */
export function buildWorldScopeIdentityRemapNotice(summary, localize) {
  const unsafe = arrayOf(summary?.unsafeSystemIdSkips);
  const locked = Number(summary?.lockedSkips) || 0;
  if (unsafe.length === 0 && locked === 0) return '';
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
  return clauses.join(' ');
}
