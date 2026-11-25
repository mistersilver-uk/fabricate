/**
 * The Crafting Action the editor stages: a draft copy of one library action with its saved
 * baseline, its dirty flag, and the issues Validation will report once it is saved, of which only the
 * critical ones block. Every input is a thunk read at call time, and the model owns no effect.
 */
import { evaluateIterativeReadiness } from '../../../../../systems/iterative/iterativeReadiness.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';

/** The id a draft that has not been saved is judged under; it can match no persisted action. */
const UNSAVED_ACTION_ID = '__unsavedAction';
const DEFAULT_ACTION_ICON = 'fas fa-hand-back-fist';

const sameEntry = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** The issues of action `id` in `system` with `entry` standing for it, as Validation reports them. */
function stagedIssues({ system, library, actions, entry, id }) {
  const held = actions.some((action) => action.id === id);
  const next = held
    ? actions.map((action) => (action.id === id ? entry : action))
    : [...actions, entry];
  const staged = { ...system, iterative: { ...library, actions: next } };
  return evaluateIterativeReadiness(staged, []).filter(
    (issue) => issue.entityKind === 'action' && issue.entityId === id
  );
}

/**
 * @param {object} seams
 * @param {() => object|null} seams.selectedSystem The projected system.
 * @param {() => object|null} seams.library Its iterative library.
 * @param {() => object[]} seams.actions The library's Crafting Actions, `[]` when unsupported.
 * @param {() => object|undefined} seams.section The store's `iterative` member.
 */
export function createIterativeActionDraft({ selectedSystem, library, actions, section }) {
  let draft = $state(null);
  let baseline = $state(null);
  let saving = $state(false);

  const snapshot = () => (draft ? $state.snapshot(draft) : null);
  const isNew = $derived(draft !== null && !draft.id);
  const isDirty = $derived(draft !== null && (isNew || !sameEntry(snapshot(), baseline)));
  // A draft stands for its persisted action, or for an action not yet saved; any other is gone.
  const hasEditable = $derived(
    draft !== null && (isNew || actions().some((action) => action.id === draft.id))
  );
  const issues = $derived.by(() => {
    const system = selectedSystem();
    if (!draft || !system) return [];
    const id = draft.id || UNSAVED_ACTION_ID;
    const entry = { ...snapshot(), id };
    return stagedIssues({ system, library: library(), actions: actions(), entry, id });
  });
  const blocking = $derived(issues.filter((issue) => issue.severity === 'critical'));
  const heading = $derived(
    draft && {
      name: draft.label ?? '',
      icon: draft.icon || DEFAULT_ACTION_ICON,
      rollsCheck: draft.check === 'roll',
      effectCount: arrayOrEmpty(draft.effects).length,
      issueCount: blocking.length,
    }
  );

  function begin(action) {
    draft = structuredClone(action);
    baseline = action.id ? structuredClone(action) : null;
    saving = false;
  }

  /** Runs `change(draft)` against the staged copy; the sections write only through here. */
  function edit(change) {
    if (draft) change(draft);
  }

  function clear() {
    draft = null;
    baseline = null;
  }

  async function save() {
    if (!draft || saving) return false;
    saving = true;
    try {
      const saved = snapshot();
      const id = await section().saveAction(saved);
      if (id === false) return false;
      begin({ ...saved, id });
      return true;
    } finally {
      saving = false;
    }
  }

  return {
    get draft() {
      return draft;
    },
    get saving() {
      return saving;
    },
    get isNew() {
      return isNew;
    },
    get isDirty() {
      return isDirty;
    },
    get hasEditable() {
      return hasEditable;
    },
    get issues() {
      return issues;
    },
    get blockingIssues() {
      return blocking;
    },
    get heading() {
      return heading;
    },
    begin,
    edit,
    clear,
    save,
  };
}
