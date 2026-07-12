/**
 * Error thrown when a recipe cannot be PERSISTED (created/updated) because it
 * fails structural / reference-integrity validation (issue 595).
 *
 * Historically the manager threw a plain `Error` whose `.message` was a hardcoded
 * English aggregate of raw validation strings — some of which leaked an internal
 * step / ingredient-set / result-group id straight into a Foundry error toast on an
 * ordinary SAVE (independent of the enable transition). This subclass keeps a
 * headless English `.message` (for `console`/non-UI callers, which read
 * `err.message`, and for the tests that pin the `Invalid recipe` / `Invalid recipe
 * update` prefixes) but ALSO carries the structured, coded `persistenceIssues` so
 * the UI layer can render a localized, id-free toast via
 * {@link module:systems/recipeActivationMessages.localizeRecipePersistenceError}.
 *
 * @typedef {{ code: string|null, params?: object, message: string }} PersistenceIssue
 */
export class RecipePersistenceError extends Error {
  /**
   * @param {'create'|'update'} action - which persistence operation failed; drives
   *   the headless message prefix (`Invalid recipe` vs `Invalid recipe update`).
   * @param {string} recipeName - the recipe the user tried to save
   * @param {PersistenceIssue[]} [issues] - structured, coded validation issues
   */
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
