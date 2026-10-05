/** The Component Rules editor's cards under `component/` (issue 1522), as repo-relative paths. */
export const COMPONENT_EDITOR_CARD_FILES = Object.freeze(
  [
    'ComponentCategoryTagsCards',
    'ComponentDifficultyCard',
    'ComponentEssencesCard',
    'ComponentSalvageStages',
    'ComponentSalvageCard',
    'ComponentRulesValidationTab',
  ].map((name) => `src/ui/svelte/apps/manager/component/${name}.svelte`)
);
