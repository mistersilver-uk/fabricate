/**
 * The shared `DialogV2` / `game.i18n` stubs the roll-prompt suites drive
 * (`tests/roll-prompt-options.test.js` and `tests/roll-prompt-bulk.test.js`), plus the whole
 * interactive ROLL environment the engine suites drive
 * (`tests/crafting-engine-modifier-choice.test.js`) (issue 1055).
 */

/**
 * A dependency-free `foundry.utils.getProperty`: the engine's roll runners walk dotted paths
 * through it, and it is the one Foundry util the interactive path needs.
 */
function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/**
 * Stub `foundry.applications.api.DialogV2.wait`: capture the rendered content and button list, then
 * invoke the DEFAULT button's callback with a fake form so the prompt's own `readChoice` runs
 * against known field values.
 *
 * @param {object} formElements The `button.form.elements` map the prompt reads (`situationalBonus`,
 * `rollMode`, and — for the single-subject prompt — `craftingModifier`). A field omitted here is
 * ABSENT, which is the headless-form case each prompt has its own fallback for.
 * @param {(buttons: Array<object>) => object} [options.pick] Choose which button to click. Defaults
 * to the one marked `default`, else the first. Pass a picker to drive the Advantage / Disadvantage
 * buttons.
 * @returns {{content: string, buttons: Array<object>, result: object, restore: () => void}}
 * Populated once the prompt has been awaited.
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
 * @param {*} [resolved] What `wait` resolves to (`null` is the real shape).
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
 * Install a `game.i18n.localize` backed by `table` (and an optional `core.rollMode` client
 * default), returning a restore function.
 *
 * @param {string} [options.rollMode] The client's `core.rollMode` setting value. Absent installs no
 * settings seam at all, which is the "unregistered / headless" read the prompt normalizes to `''`.
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
 * @param {Array<{id: string}|string>} offered Every option the descriptor offers, in descriptor
 * order.
 * @param {string[]} checkedIds The ids the player ticked.
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
 * Install the interactive roll environment an engine check runner needs: a `Roll` that RECORDS
 * every rolled formula, and a `DialogV2.wait` that either answers with a selection or dismisses.
 *
 * @param {string|null} [options.pickedId] The value a SINGLE-pick prompt's `craftingModifier` radio
 * reports. An id the descriptor does not offer is discarded in production, which is what makes "a
 * descriptor was built at all" observable in the rolled string.
 * @param {{offered: Array<{id: string}|string>, checkedIds: string[]}} [options.multiPick] A
 * MULTI-pick answer, supplied as the real checkbox group's shape (see {@link checkboxGroupField}).
 * Wins over `pickedId` when both are given.
 * @param {boolean} [options.dismiss] Resolve `wait` as a DISMISSAL (`null`, the real `rejectClose:
 * false` shape) instead of confirming.
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
