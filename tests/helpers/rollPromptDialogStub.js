/**
 * The shared `DialogV2` / `game.i18n` stubs both roll-prompt suites drive
 * (`tests/roll-prompt-options.test.js` and `tests/roll-prompt-bulk.test.js`).
 *
 * Extracted rather than copied: SonarCloud counts `tests/**` for duplication, and
 * `stubDialogCapture` is the exact shape of near-identical block the new-code
 * duplication gate fails on. `promptCheckRoll` and `promptBulkCheckRoll` share
 * `renderDieRow`, `renderBonusInput`, `renderRollModePicker`, `readSharedRollChoice`
 * and `buildRollButtons`, so they also share one test harness by right.
 */

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
