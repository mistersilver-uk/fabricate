/** Issue 1778 — what the ListRow tests share: the converted sites and the content its button refuses. */

/** Each site converted to the selectable form so far, and the View Lab frame that draws it. */
export const LIST_ROW_ADOPTERS = Object.freeze([
  Object.freeze({ file: 'src/ui/svelte/apps/journal/RunCard.svelte', frame: 'fabricate-journal' }),
  Object.freeze({
    file: 'src/ui/svelte/apps/gathering/EnvironmentCard.svelte',
    frame: 'player-gathering-environments',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
    frame: 'player-gathering-task-ready',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/gathering/GatheringEventRow.svelte',
    frame: 'player-gathering-events',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
    frame: 'player-crafting-check-unrollable-status',
  }),
]);

/** Content a native button may not hold: flow and grouping elements, and widget roles. */
export const NON_PHRASING_CONTENT = [
  'div, p, ul, ol, li, section, table, h1, h2, h3, h4, h5, h6, meter, progress',
  '[role="meter"], [role="group"], [role="progressbar"], [role="list"]',
].join(', ');
