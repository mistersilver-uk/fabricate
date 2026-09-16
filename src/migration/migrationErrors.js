/**
 * `FatalMigrationError` signals that a migration produced unusable documents, which aborts the
 * startup pass and rolls back — see `destructive-changes-and-migrations/spec.md`
 * § Per-Migration Error Handling and § Migration Abort Recovery Guidance.
 */

export class FatalMigrationError extends Error {
  constructor(message, { documents = [], downgradeTo = null } = {}) {
    super(message);
    this.name = 'FatalMigrationError';
    this.fatal = true;
    this.documents = Array.isArray(documents) ? documents : [];
    this.downgradeTo = downgradeTo;
  }
}

export function isFatalMigrationError(error) {
  return error?.fatal === true;
}
