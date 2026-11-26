/**
 * The iterative library's route state: which Counter row is open, the Crafting Action the editor
 * stages with its route-exit guard, and what the recipe and action editors read about the recipe's
 * issues and the active runs. Every input is a thunk read at call time.
 */
import { iterativeLibraryVersionUnsupported } from '../../../../../systems/normalize/iterativeLibrary.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';
import { createActionsBrowserState } from '../../../../model/managerBrowserViewState.js';

import { createIterativeActionDraft } from './iterativeActionDraft.svelte.js';
import { createIterativeCounterRoute } from './iterativeCounterRoute.svelte.js';
import { confirmActionDelete } from './iterativeDeleteConfirm.js';
import { actionIssueCounts, actionUses } from './iterativeLibraryModel.js';
import { createIterativeRecipeReads } from './iterativeRecipeReads.svelte.js';

/** Read-only accessors for `reads`, each a thunk, so the model hands out live values. */
const accessors = (reads) =>
  Object.fromEntries(Object.entries(reads).map(([name, get]) => [name, { get, enumerable: true }]));

/** Confirms with where the staged action is named, then deletes it; answers whether it did. */
async function deleteStagedAction({ staged, section, services, text, uses }) {
  if (!staged.draft?.id) return false;
  const { id, label } = staged.draft;
  const confirmed = await confirmActionDelete({
    confirmDialog: services()?.confirmDialog,
    text,
    action: { id, label },
    uses: uses(id),
  });
  if (!confirmed || !(await section().deleteAction(id))) return false;
  staged.clear();
  return true;
}

/** The route-exit guard of a dirty staged action, in the shape the shell's confirm-discard chain reads. */
const actionExitGuard = ({ staged, section, currentView }) => ({
  active: () => currentView() === 'iterative-action-edit',
  isDirty: () => staged.isDirty,
  confirm: () => section()?.confirmDiscardDirtyActionDraft(),
  finish: async (action) => {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') return (await staged.save()) !== false;
    staged.clear();
    return true;
  },
});

/** Thunks for the staged action's read-only accessors. */
const stagedReads = (staged) => ({
  actionDraft: () => staged.draft,
  actionSaving: () => staged.saving,
  isNewAction: () => staged.isNew,
  isActionDirty: () => staged.isDirty,
  hasEditableAction: () => staged.hasEditable,
  actionIssues: () => staged.issues,
  actionBlockingIssues: () => staged.blockingIssues,
  actionHeading: () => staged.heading,
});

/**
 * @param {object} seams
 * @param {() => object} seams.store The admin store, whose `iterative` member does every write.
 * @param {() => object|null} seams.selectedSystem The projected system.
 * @param {() => string} seams.currentView The routed view token.
 * @param {() => unknown} seams.viewState Read to re-derive when the store republishes.
 * @param {(view: string, onEnter?: () => void) => void} seams.setView Guarded navigation.
 * @param {() => object} seams.services The manager services, of which this reads `confirmDialog`.
 * @param {Function} seams.text `(key, fallback)` localizer.
 */
export function createIterativeRouteModel({
  store,
  selectedSystem,
  currentView,
  viewState,
  setView,
  services,
  text,
}) {
  // The browser's search, filters and page outlive the editor round trip and are never persisted.
  const actionsBrowse = $state(createActionsBrowserState());

  const section = () => store()?.iterative;
  const counterRoute = createIterativeCounterRoute({ section, setView, services, text });
  const library = $derived(selectedSystem()?.iterative ?? null);
  const unsupported = $derived(iterativeLibraryVersionUnsupported(library));
  const counters = $derived(unsupported ? [] : arrayOrEmpty(library?.counters));
  const actions = $derived(unsupported ? [] : arrayOrEmpty(library?.actions));
  const recipes = $derived.by(() => {
    viewState();
    return section()?.systemRecipes?.() ?? [];
  });
  const issueCounts = $derived(
    unsupported || !selectedSystem()
      ? { blocking: new Map(), all: new Map() }
      : actionIssueCounts(selectedSystem(), recipes)
  );
  const staged = createIterativeActionDraft({
    selectedSystem,
    library: () => (unsupported ? null : library),
    actions: () => actions,
    section,
  });

  const recipeReads = createIterativeRecipeReads({ section, selectedSystem, currentView });

  const openAction = (id) => {
    const action = actions.find((entry) => entry.id === id);
    if (action) setView('iterative-action-edit', () => staged.begin(action));
  };

  async function duplicateAction() {
    if (!staged.draft?.id || staged.isDirty) return false;
    const id = await section().duplicateAction(staged.draft.id);
    if (id) openAction(id);
    return Boolean(id);
  }

  const deleteAction = () =>
    deleteStagedAction({
      staged,
      section,
      services,
      text,
      uses: (id) => actionUses(library, recipes, id),
    });

  const methods = {
    exitGuard: actionExitGuard({ staged, section, currentView }),
    openAction,
    duplicateAction,
    deleteAction,
    saveAction: staged.save,
    editAction: staged.edit,
    openChecks: () => setView('checks'),
    openCounters: () => setView('iterative-counters'),
    ...counterRoute.handlers,
    startNewAction: () =>
      setView('iterative-action-edit', () => staged.begin(section().newActionDraft())),
    backToActions: () => setView('iterative-actions'),
    ...recipeReads,
  };

  return Object.defineProperties(
    methods,
    accessors({
      library: () => library,
      system: () => selectedSystem(),
      systemId: () => selectedSystem()?.id ?? '',
      systemName: () => selectedSystem()?.name ?? '',
      unsupported: () => unsupported,
      counters: () => counters,
      actions: () => actions,
      // A library newer than this build lists nothing, so the rail draws no count for it.
      counterCount: () => (unsupported ? null : counters.length),
      actionCount: () => (unsupported ? null : actions.length),
      recipes: () => recipes,
      ...counterRoute.reads,
      actionsBrowse: () => actionsBrowse,
      actionBlocking: () => issueCounts.blocking,
      actionIssueTotals: () => issueCounts.all,
      routedCheck: () => selectedSystem()?.craftingCheck?.routed ?? null,
      ...stagedReads(staged),
    })
  );
}
