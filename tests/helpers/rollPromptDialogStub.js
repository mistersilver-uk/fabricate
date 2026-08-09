/**
 * The shared `DialogV2` / `game.i18n` stubs the roll-prompt suites drive
 * (`tests/roll-prompt-options.test.js` and `tests/roll-prompt-bulk.test.js`), plus the
 * whole interactive ROLL environment the engine suites drive
 * (`tests/crafting-engine-modifier-choice.test.js`).
 *
 * Extracted rather than copied: SonarCloud counts `tests/**` for duplication, and
 * `stubDialogCapture` is the exact shape of near-identical block the new-code
 * duplication gate fails on. `promptCheckRoll` and `promptBulkCheckRoll` share
 * `renderDieRow`, `renderBonusInput`, `renderRollModePicker`, `readSharedRollChoice`
 * and `buildRollButtons`, so they also share one test harness by right.
 *
 * {@link stubInteractiveRollEnvironment} lives HERE for the same reason and is
 * deliberately COMPOSED from the two dialog stubs above rather than restating them
 * (issue 1055): its `DialogV2.wait` half was a near-verbatim second copy of
 * `stubDialogCapture`, and re-emitting those lines in a new file would count as new
 * duplicated code against the very gate this module exists to satisfy. Only the `Roll`
 * recorder and `foundry.utils.getProperty` are new here.
 */

/**
 * A dependency-free `foundry.utils.getProperty`: the engine's roll runners walk
 * dotted paths through it, and it is the one Foundry util the interactive path needs.
 * @param {object|null|undefined} object
 * @param {string} path
 * @returns {*}
 */
function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/**
 * Stub `foundry.applications.api.DialogV2.wait`: capture the rendered content and
 * button list, then invoke the DEFAULT button's callback with a fake form so the
 * prompt's own `readChoice` runs against known field values.
 *
 * @param {object} formElements The `button.form.elements` map the prompt reads
 *   (`situationalBonus`, `rollMode`, and — for the single-subject prompt —
 *   `craftingModifier`). A field omitted here is ABSENT, which is the headless-form
 *   case each prompt has its own fallback for.
 * @param {object} [options]
 * @param {(buttons: Array<object>) => object} [options.pick] Choose which button to
 *   click. Defaults to the one marked `default`, else the first. Pass a picker to drive
 *   the Advantage / Disadvantage buttons.
 * @returns {{content: string, buttons: Array<object>, result: object,
 *   restore: () => void}} Populated once the prompt has been awaited.
 */
export function stubDialogCapture(formElements, { pick = null } = {}) {
  const original = globalThis.foundry;
  const captured = {};
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          wait: async (config) => {
            captured.content = config.content;
            captured.buttons = config.buttons;
            captured.config = config;
            const button = { form: { elements: formElements } };
            const chosenButton = pick
              ? pick(config.buttons)
              : (config.buttons.find((entry) => entry.default) ?? config.buttons[0]);
            captured.result = chosenButton.callback({}, button);
            return captured.result;
          },
        },
      },
    },
  };
  captured.restore = () => {
    if (original === undefined) delete globalThis.foundry;
    else globalThis.foundry = original;
  };
  return captured;
}

/**
 * Stub a `DialogV2.wait` that resolves as a DISMISSAL.
 *
 * `rejectClose` defaults to false, so both Escape and the window X resolve
 * `result ?? null` — neither REJECTS. A suite that modelled dismissal as a rejection
 * would be testing a path Foundry does not take, and would pass against a prompt whose
 * only dismissal handling is a `.catch()`.
 *
 * @param {*} [resolved] What `wait` resolves to (`null` is the real shape).
 * @returns {{restore: () => void}}
 */
export function stubDialogDismissal(resolved = null) {
  const original = globalThis.foundry;
  globalThis.foundry = {
    applications: { api: { DialogV2: { wait: async () => resolved } } },
  };
  return {
    restore: () => {
      if (original === undefined) delete globalThis.foundry;
      else globalThis.foundry = original;
    },
  };
}

/**
 * Install a `game.i18n.localize` backed by `table` (and an optional `core.rollMode`
 * client default), returning a restore function.
 *
 * @param {Record<string, string>} table
 * @param {object} [options]
 * @param {string} [options.rollMode] The client's `core.rollMode` setting value. Absent
 *   installs no settings seam at all, which is the "unregistered / headless" read the
 *   prompt normalizes to `''`.
 * @returns {() => void}
 */
export function stubI18n(table, { rollMode } = {}) {
  const original = globalThis.game;
  globalThis.game = {
    i18n: { localize: (key) => table[key] ?? key },
    ...(rollMode === undefined
      ? {}
      : { settings: { get: (namespace, key) => (key === 'rollMode' ? rollMode : undefined) } }),
  };
  return () => {
    if (original === undefined) delete globalThis.game;
    else globalThis.game = original;
  };
}

/**
 * Build the `button.form.elements.craftingModifier` stand-in for a MULTI-PICK selection.
 *
 * A single-pick prompt renders a radio group, and `readSelectedModifierIds` can read a
 * bare `{ value }` off it — which is why the single-pick path below still passes one. A
 * multi-pick prompt renders a CHECKBOX group, and the two are not interchangeable: the
 * field arrives as a `RadioNodeList`, whose `value` is specified to inspect *radio*
 * inputs only and returns `''` for a checkbox group however many boxes are ticked. A
 * `{ value }` stand-in therefore cannot express "these three are checked" at all, and a
 * suite that tried would silently exercise the no-answer fallback instead of a selection.
 *
 * So a multi-pick stand-in is an ARRAY-LIKE of `{ checked, value }` entries — one per
 * OFFERED option, exactly as the real list carries every input in the group — which is
 * the shape `readSelectedModifierIds` walks. It is deliberately array-LIKE rather than a
 * plain array: the production reader keys on `typeof field.length === 'number'` to tell a
 * group from a lone input, and a real `RadioNodeList` is not an `Array`.
 *
 * @param {Array<{id: string}|string>} offered Every option the descriptor offers, in
 *   descriptor order.
 * @param {string[]} checkedIds The ids the player ticked.
 * @returns {{length: number, [Symbol.iterator]: () => Iterator<object>}}
 */
export function checkboxGroupField(offered, checkedIds) {
  const checked = new Set(checkedIds);
  const entries = offered.map((option) => {
    const value = typeof option === 'string' ? option : option.id;
    return { value, checked: checked.has(value) };
  });
  // `RadioNodeList`-shaped: indexed, `length`, iterable — and NOT an `Array`.
  const field = { length: entries.length, [Symbol.iterator]: () => entries[Symbol.iterator]() };
  for (const [index, entry] of entries.entries()) field[index] = entry;
  return field;
}

/**
 * Install the interactive roll environment an engine check runner needs: a `Roll` that
 * RECORDS every rolled formula, and a `DialogV2.wait` that either answers with a
 * selection or dismisses.
 *
 * The rolled formula string is the observable these engine tests assert on, because it
 * is the only place the whole chain — rule resolution, eligible-set resolution, scalar
 * reduction (or deferred interactive choice) and substitution — becomes visible as one
 * value. A resolver-level assertion cannot see a runner that never threads the context
 * at all.
 *
 * @param {object} [options]
 * @param {string|null} [options.pickedId] The value a SINGLE-pick prompt's
 *   `craftingModifier` radio reports. An id the descriptor does not offer is discarded in
 *   production, which is what makes "a descriptor was built at all" observable in the
 *   rolled string.
 * @param {{offered: Array<{id: string}|string>, checkedIds: string[]}} [options.multiPick]
 *   A MULTI-pick answer, supplied as the real checkbox group's shape (see
 *   {@link checkboxGroupField}). Wins over `pickedId` when both are given.
 * @param {boolean} [options.dismiss] Resolve `wait` as a DISMISSAL (`null`, the real
 *   `rejectClose: false` shape) instead of confirming.
 * @returns {{rolled: string[], dialog: object, restore: () => void}}
 */
export function stubInteractiveRollEnvironment({
  pickedId = null,
  multiPick = null,
  dismiss = false,
} = {}) {
  const rolled = [];
  const previousRoll = globalThis.Roll;
  class RollStub {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      rolled.push(this.formula);
      return { total: 12, dice: [] };
    }
  }
  RollStub.replaceFormulaData = (expression, data = {}) =>
    String(expression).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = getProperty(data, path);
      return value === undefined || value === null ? `@${path}` : String(value);
    });
  RollStub.validate = () => true;
  globalThis.Roll = RollStub;

  // Both dialog stubs REPLACE `globalThis.foundry` wholesale and restore the original,
  // so the utils half is attached to whichever object they installed rather than being
  // built alongside a third copy of the DialogV2 stub.
  const dialog = dismiss
    ? stubDialogDismissal()
    : stubDialogCapture({
        situationalBonus: { value: '' },
        rollMode: { value: 'publicroll' },
        craftingModifier: multiPick
          ? checkboxGroupField(multiPick.offered, multiPick.checkedIds)
          : { value: pickedId },
      });
  globalThis.foundry.utils = { getProperty };

  return {
    rolled,
    dialog,
    restore() {
      globalThis.Roll = previousRoll;
      dialog.restore();
    },
  };
}
