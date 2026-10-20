/** The GM notice for the `1.36.0` scoped identity reconciliation (issue 2554): counts in the toast,
 * names in the console detail. Silent when every list is empty, informational when the pass only
 * created, adopted or found links to a deleted system, a permanent warning otherwise. Pure. */
import { composeFindingsNotice } from '../migration/migrationNoticeDetail.js';

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

const inSystem = (entry) => `${entry?.name} (${entry?.systemId})`;

/** Each report list in reading order: how its detail names one entry, what it counts (entries by
 * default) and its English copy, each fallback its `lang/en.json` string verbatim. */
const FINDINGS = Object.freeze([
  {
    list: 'created',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.Created',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.CreatedDetail',
    describe: inSystem,
    fallback: 'Fabricate added {count} essence(s) and tool(s) to the world catalogue.',
    detailFallback:
      'Fabricate added {count} essence(s) and tool(s) to the world catalogue, each linked to the crafting system that holds it: {names}. Every crafting system keeps exactly the behaviour it had.',
  },
  {
    list: 'adopted',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.Adopted',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.AdoptedDetail',
    describe: inSystem,
    fallback:
      'Fabricate linked {count} essence(s) and tool(s) to the world entry they already matched.',
    detailFallback:
      'Fabricate linked {count} essence(s) and tool(s) to the world entry with the same id they already matched: {names}.',
  },
  {
    list: 'conflicting',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.Conflicting',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.ConflictingDetail',
    describe: (entry) => `${entry?.name} (${entry?.systemId}: ${entry?.reason})`,
    fallback:
      '{count} row(s) could not be linked to the world catalogue and keep working in their system only.',
    detailFallback:
      '{count} row(s) could not be linked to the world catalogue because a world entry with the same id or source already describes something else, so they keep working in their system only: {names}. Review them under World › Tools or World › Essences.',
  },
  {
    list: 'ambiguous',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.Ambiguous',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.AmbiguousDetail',
    describe: (entry) =>
      `${entry?.name} (${entry?.systemId}: ${arrayOf(entry?.matchedIds).join(' / ')})`,
    fallback: '{count} tool(s) match more than one world tool and were left unlinked.',
    detailFallback:
      '{count} tool(s) share a source item with more than one world tool, so Fabricate could not tell which one they are and left them working in their system only: {names}. Review them under World › Tools.',
  },
  {
    list: 'unresolvedMemberships',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.UnresolvedMemberships',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.UnresolvedMembershipsDetail',
    describe: inSystem,
    fallback: '{count} world link(s) name a row their crafting system no longer holds.',
    detailFallback:
      '{count} world link(s) name an essence or tool their crafting system no longer holds: {names}. Nothing was removed.',
  },
  {
    list: 'orphanedSystemMemberships',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.OrphanedSystemMemberships',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.OrphanedSystemMembershipsDetail',
    describe: inSystem,
    fallback: '{count} world link(s) name a crafting system that no longer exists.',
    detailFallback:
      '{count} world link(s) name a crafting system that no longer exists: {names}. Nothing was removed.',
  },
  {
    list: 'equivalentEssenceCandidates',
    key: 'FABRICATE.Migration.ScopedIdentityReconcile.EquivalentEssenceCandidates',
    detailKey: 'FABRICATE.Migration.ScopedIdentityReconcile.EquivalentEssenceCandidatesDetail',
    describe: (entry) => `${entry?.name} (${arrayOf(entry?.systemIds).join(', ')})`,
    countOf: (entries) => entries.reduce((sum, entry) => sum + arrayOf(entry?.ids).length, 0),
    fallback:
      '{count} essence(s) look like the same essence in more than one system and were kept separate.',
    detailFallback:
      '{count} essence(s) look like the same essence in more than one system and were kept separate: {names}. Review them under World › Essences.',
  },
]);

/** Lists whose presence alone keeps the notice informational: a link to a deleted system needs no
 * GM action. */
const INFORMATIONAL = new Set(['created', 'adopted', 'orphanedSystemMemberships']);

/** `{ message, detail, severity }`; `message` is empty when the pass found nothing. */
export function buildScopedIdentityReconcileNotice(report, localize) {
  const findings = FINDINGS.map(({ list, describe, countOf, ...copy }) => {
    const entries = arrayOf(report?.[list]);
    const count = countOf ? countOf(entries) : entries.length;
    return {
      ...copy,
      list,
      when: entries.length > 0,
      data: { count },
      detailData: { count, names: entries.map(describe).join(', ') },
    };
  });
  const notice = composeFindingsNotice(localize, findings);
  const needsAction = findings.some((finding) => finding.when && !INFORMATIONAL.has(finding.list));
  return { ...notice, severity: needsAction ? 'warn' : 'info' };
}
