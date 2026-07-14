/**
 * Error thrown when a recipe cannot be ENABLED because it fails activation
 * validation (issue 550).
 *
 * Historically the manager threw a plain `Error` whose `.message` was a hardcoded
 * English aggregate of raw, un-localized validation strings — some of which
 * leaked internal ids straight into a Foundry error toast. This subclass keeps a
 * headless English `.message` (for `console`/non-UI callers, which read
 * `err.message`) but ALSO carries the structured `activationIssues` so the UI
 * layer can render a localized, id-free toast via
 * {@link module:utils/recipeActivationMessages.localizeRecipeActivationError}.
 *
 * @typedef {{ code: string|null, params?: object, message: string }} ActivationIssue
 */
export class RecipeActivationError extends Error {
  /**
   * @param {string} recipeName - the recipe the user tried to enable
   * @param {ActivationIssue[]} [issues] - structured, coded validation issues
   */
  constructor(recipeName, issues = []) {
    const detail = (Array.isArray(issues) ? issues : [])
      .map((issue) => issue?.message)
      .filter(Boolean)
      .join(', ');
    super(`Cannot enable recipe "${recipeName}": ${detail}`);
    this.name = 'RecipeActivationError';
    this.recipeName = recipeName;
    this.activationIssues = Array.isArray(issues) ? issues : [];
  }
}
