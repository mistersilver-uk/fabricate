/**
 * Migration error types for fatal-abort / rollback handling.
 *
 * A `FatalMigrationError` signals that a migration produced unusable documents
 * (invalid required fields after transform, unresolved hard references, or
 * malformed macro references required for execution). The MigrationRunner aborts
 * the current startup pass, rolls back to the last known-good checkpoint, persists
 * nothing, leaves `migrationVersion` unchanged, and emits GM recovery guidance.
 *
 * See `openspec/specs/destructive-changes-and-migrations/spec.md`
 * (§ "Per-Migration Error Handling" / "Migration Abort Recovery Guidance").
 */

/**
 * @typedef {object} FailedMigrationDocument
 * @property {'recipe'|'craftingSystem'} type document type that failed
 * @property {string} [id] document ID
 * @property {string} [name] document name
 * @property {string} [error] exact validation or transform error
 * @property {string} [fix] required fix action
 * @property {string} [macroHint] optional macro-oriented remediation suggestion
 */

export class FatalMigrationError extends Error {
  /**
   * @param {string} message
   * @param {{ documents?: FailedMigrationDocument[], downgradeTo?: string|null }} [opts]
   */
  constructor(message, { documents = [], downgradeTo = null } = {}) {
    super(message);
    this.name = 'FatalMigrationError';
    this.fatal = true;
    this.documents = Array.isArray(documents) ? documents : [];
    this.downgradeTo = downgradeTo;
  }
}

/**
 * @param {unknown} error
 * @returns {boolean} true when the error is a fatal migration error
 */
export function isFatalMigrationError(error) {
  return error?.fatal === true;
}
