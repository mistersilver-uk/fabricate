/**
 * Thrown when a recipe cannot be enabled because it fails activation validation (issue 550).
 * `.message` stays headless English for non-UI callers; the UI localizes the coded
 * `activationIssues` through `localizeRecipeActivationError`, so no internal id reaches a toast.
 *
 * @typedef {{ code: string|null, params?: object, message: string }} ActivationIssue
 */
export class RecipeActivationError extends Error {
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
