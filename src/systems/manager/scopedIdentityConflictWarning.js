/** The GM warning for rows a save could not link to the world catalogue (issue 2554): one toast
 * per system naming at most five rows, each `(systemId, entityType, rowId)` once per client
 * session, with the full list in the console. Never blocks the save. */
import {
  localizeNoticeClause,
  logMigrationNoticeDetail,
} from '../../migration/migrationNoticeDetail.js';

const NAMED_ROWS = 5;
const CONFLICTING_KEY = 'FABRICATE.Notifications.ScopedIdentity.Conflicting';
const CONFLICTING_MORE_KEY = 'FABRICATE.Notifications.ScopedIdentity.ConflictingMore';
const CONFLICTING_TEMPLATE =
  'Fabricate | Saved. {count} row(s) in {system} could not be linked to the world catalogue ' +
  'because a world entry with the same id or source already describes something else: {names}. ' +
  'They keep working in this system only; review them under World › Tools or World › Essences.';
const CONFLICTING_MORE_TEMPLATE = 'and {more} more';

/** Each warner's session memory, keyed by its owner so two managers never share one. */
const REPORTED = new WeakMap();

function localize(key, data) {
  return globalThis.game?.i18n?.format?.(key, data);
}

function namesClause(rows) {
  const names = rows.slice(0, NAMED_ROWS).map((row) => row.name);
  const more = rows.length - names.length;
  if (more <= 0) return names.join(', ');
  const tail = localizeNoticeClause(
    localize,
    CONFLICTING_MORE_KEY,
    { more },
    CONFLICTING_MORE_TEMPLATE
  );
  return `${names.join(', ')} ${tail}`;
}

/** Warn about each `conflicting` decision not yet reported for `owner`; `systemNameOf` names a
 * system id. */
export function warnScopedIdentityConflicts(owner, conflicts, systemNameOf) {
  const notifications = globalThis.ui?.notifications;
  if (!notifications || !owner || typeof owner !== 'object') return;
  if (!REPORTED.has(owner)) REPORTED.set(owner, new Set());
  const reported = REPORTED.get(owner);
  const bySystem = new Map();
  for (const conflict of conflicts) {
    const key = `${conflict.systemId}|${conflict.entityType}|${conflict.id}`;
    if (reported.has(key)) continue;
    reported.add(key);
    if (!bySystem.has(conflict.systemId)) bySystem.set(conflict.systemId, []);
    bySystem.get(conflict.systemId).push(conflict);
  }
  for (const [systemId, rows] of bySystem) {
    const system = systemNameOf(systemId) || systemId;
    const data = { count: rows.length, system, names: namesClause(rows) };
    notifications.warn?.(
      localizeNoticeClause(localize, CONFLICTING_KEY, data, CONFLICTING_TEMPLATE)
    );
    logMigrationNoticeDetail(
      `Fabricate | unlinked rows in ${system}`,
      rows.map((row) => `${row.entityType} ${row.id} (${row.name}): ${row.reason}`).join('\n')
    );
  }
}
