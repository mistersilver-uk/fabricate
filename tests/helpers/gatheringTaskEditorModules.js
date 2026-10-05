/**
 * What a direct mount of `GatheringTaskEditView` compiles beyond the editor itself (issue 1522):
 * its tab strip and the tabs and cards under `gathering-task/`, its readiness module, and the
 * validation surface and row action its Validation tab reaches.
 */
const PART = (name) => `src/ui/svelte/apps/manager/gathering-task/GatheringTask${name}.svelte`;

/** `.svelte` modules, leaves first; omitting one HANGS a mounted suite (# cancelled). */
export const GATHERING_TASK_EDITOR_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/EditorTabs.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  ...[
    'Card',
    'AvailabilityCard',
    'StaminaCard',
    'CheckOverrideCard',
    'RequiredToolsCard',
    'NodesCard',
    'ComponentBrowserCard',
    'DropRow',
    'DropsCard',
    'OverviewTab',
    'RequirementsTab',
    'ResultsTab',
    'ValidationTab',
    'EditorTabs',
  ].map(PART),
]);

/** Plain modules the parts import. */
export const GATHERING_TASK_EDITOR_RAW_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/gathering-task/taskEditorLookups.js',
  'src/ui/svelte/apps/manager/gathering-task/gatheringTaskReadiness.js',
  'src/ui/svelte/apps/manager/validationFocus.js',
  'src/ui/svelte/apps/manager/validationAnnouncement.js',
  'src/ui/svelte/util/announceAfterFocus.js',
]);
