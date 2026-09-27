/**
 * The roll-prompt surface and `game.i18n` stubs the prompt suites drive, plus the whole interactive
 * ROLL environment the engine suites drive (`tests/crafting-engine-modifier-choice.test.js`).
 */
import { overrideRollPromptSurface } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';

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
 * Replace the modal surface: record every prepared view and answer with `respond(view)`, which
 * may return the raw answer the modal would (`{ confirmed: true, bonus, rollMode, advantage,
 * chosenModifierIds }`), a dismissal (`null`), or throw.
 *
 * @returns {{views: object[], readonly view: object, restore: () => void}}
 */
export function stubPromptSurface(respond = () => ({ confirmed: true })) {
  const views = [];
  const restore = overrideRollPromptSurface(async (view) => {
    views.push(view);
    return respond(view);
  });
  return {
    views,
    get view() {
      return views.at(-1);
    },
    restore,
  };
}

/**
 * Install a `game.i18n.localize` backed by `table` (and an optional `core.rollMode` client
 * default), returning a restore function.
 *
 * @param {string} [options.rollMode] The client's `core.rollMode` setting value. Absent installs no
 * settings seam at all, which is the "unregistered / headless" read the prompt normalizes.
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
 * Install the interactive roll environment an engine check runner needs: a `Roll` that RECORDS
 * every rolled formula, and a prompt surface that either answers with a selection or dismisses.
 *
 * @param {string|null} [options.pickedId] The single pick the player submits; `null` submits no
 * selection, so the prompt falls back to the descriptor's defaults.
 * @param {{checkedIds: string[]}} [options.multiPick] A MULTI-pick answer. Wins over `pickedId`.
 * @param {boolean} [options.dismiss] Dismiss the prompt instead of confirming.
 */
export function stubInteractiveRollEnvironment({
  pickedId = null,
  multiPick = null,
  dismiss = false,
} = {}) {
  const rolled = [];
  const previousRoll = globalThis.Roll;
  const previousFoundry = globalThis.foundry;
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
  globalThis.foundry = { utils: { getProperty } };

  const chosen = multiPick ? multiPick.checkedIds : pickedId ? [pickedId] : undefined;
  const surface = stubPromptSurface(() =>
    dismiss
      ? null
      : {
          confirmed: true,
          bonus: '',
          rollMode: 'publicroll',
          advantage: 'normal',
          chosenModifierIds: chosen,
        }
  );

  return {
    rolled,
    surface,
    restore() {
      globalThis.Roll = previousRoll;
      if (previousFoundry === undefined) delete globalThis.foundry;
      else globalThis.foundry = previousFoundry;
      surface.restore();
    },
  };
}
