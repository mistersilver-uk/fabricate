/**
 * Thrown when a recipe cannot be created or updated because it fails structural or
 * reference-integrity validation (issue 595). `.message` stays headless English under the
 * `Invalid recipe` (or, for `action: 'update'`, `Invalid recipe update`) prefix tests pin; the UI
 * localizes the coded `persistenceIssues` through `localizeRecipePersistenceError`.
 *
 * @typedef {{ code: string|null, params?: object, message: string }} PersistenceIssue
 */
export class RecipePersistenceError extends Error {
  constructor(action, recipeName, issues = []) {
    const detail = (Array.isArray(issues) ? issues : [])
      .map((issue) => issue?.message)
      .filter(Boolean)
      .join(', ');
    const prefix = action === 'update' ? 'Invalid recipe update' : 'Invalid recipe';
    super(`${prefix}: ${detail}`);
    this.name = 'RecipePersistenceError';
    this.action = action;
    this.recipeName = recipeName;
    this.persistenceIssues = Array.isArray(issues) ? issues : [];
  }
}
