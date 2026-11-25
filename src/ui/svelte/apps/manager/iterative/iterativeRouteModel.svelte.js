/**
 * The iterative library's route state: which Counter row is open, and the Crafting Action the
 * editor stages with its route-exit guard. Every input is a thunk read at call time, and the model
 * owns no effect.
 */
import { iterativeLibraryVersionUnsupported } from '../../../../../systems/normalize/iterativeLibrary.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';

import { createIterativeActionDraft } from './iterativeActionDraft.svelte.js';

/** Read-only accessors for `reads`, each a thunk, so the model hands out live values. */
const accessors = (reads) =>
  Object.fromEntries(Object.entries(reads).map(([name, get]) => [name, { get, enumerable: true }]));

/** Confirms through `services().confirmDialog`, then deletes the staged action; answers whether it did. */
async function deleteStagedAction({ staged, section, services, text }) {
  if (!staged.draft?.id) return false;
  const { id, label } = staged.draft;
  const title = text('FABRICATE.Admin.Manager.Iterative.DeleteActionTitle', 'Delete {name}?');
  const body = text(
    'FABRICATE.Admin.Manager.Iterative.DeleteActionBody',
    'Steps and rules that name it will need another action.'
  );
  const confirmed = await services().confirmDialog?.({
    title: title.replace('{name}', label),
    content: `<p>${body}</p>`,
    yes: { callback: () => true },
    no: { callback: () => false },
  });
  if (confirmed !== true || !(await section().deleteAction(id))) return false;
  staged.clear();
  return true;
}

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
  let expandedCounterId = $state('');

  const section = () => store()?.iterative;
  const library = $derived(selectedSystem()?.iterative ?? null);
  const unsupported = $derived(iterativeLibraryVersionUnsupported(library));
  const counters = $derived(unsupported ? [] : arrayOrEmpty(library?.counters));
  const actions = $derived(unsupported ? [] : arrayOrEmpty(library?.actions));
  const recipes = $derived.by(() => {
    viewState();
    return section()?.systemRecipes?.() ?? [];
  });
  const staged = createIterativeActionDraft({
    selectedSystem,
    library: () => (unsupported ? null : library),
    actions: () => actions,
    section,
  });

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

  const deleteAction = () => deleteStagedAction({ staged, section, services, text });

  const exitGuard = {
    active: () => currentView() === 'iterative-action-edit',
    isDirty: () => staged.isDirty,
    confirm: () => section()?.confirmDiscardDirtyActionDraft(),
    finish: async (action) => {
      if (action === 'cancel' || action === false) return false;
      if (action === 'save') return (await staged.save()) !== false;
      staged.clear();
      return true;
    },
  };

  const methods = {
    exitGuard,
    openAction,
    duplicateAction,
    deleteAction,
    saveAction: staged.save,
    expandCounter: (id) => {
      expandedCounterId = id;
    },
    openCounter: (id) =>
      setView('iterative-counters', () => {
        expandedCounterId = id;
      }),
    addCounter: async () => {
      const id = await section()?.addCounter();
      if (id) expandedCounterId = id;
      return id;
    },
    startNewAction: () =>
      setView('iterative-action-edit', () => staged.begin(section().newActionDraft())),
    backToActions: () => setView('iterative-actions'),
  };

  return Object.defineProperties(
    methods,
    accessors({
      library: () => library,
      unsupported: () => unsupported,
      counters: () => counters,
      actions: () => actions,
      counterCount: () => counters.length,
      actionCount: () => actions.length,
      recipes: () => recipes,
      expandedCounterId: () => expandedCounterId,
      actionDraft: () => staged.draft,
      actionSaving: () => staged.saving,
      isNewAction: () => staged.isNew,
      isActionDirty: () => staged.isDirty,
      hasEditableAction: () => staged.hasEditable,
      actionIssues: () => staged.issues,
      actionHeading: () => staged.heading,
    })
  );
}
