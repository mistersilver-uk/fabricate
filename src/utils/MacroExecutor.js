/**
 * Executes Foundry script macros as return-value functions.
 * Macros are expected to return a plain object.
 */
export class MacroExecutor {
  /**
   * Run a script macro by UUID and return its result.
   * @param {string|null} macroUuid
   * @param {Object} context
   * @returns {Promise<any>}
   */
  static async run(macroUuid, context = {}) {
    if (!macroUuid) return null;

    let macro = null;
    try {
      macro = await fromUuid(macroUuid);
    } catch (err) {
      macro = null;
    }
    if (!macro || typeof macro.command !== 'string') {
      throw new Error(`Macro not found or invalid: ${macroUuid}`);
    }

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'context',
      'args',
      'game',
      'foundry',
      'ui',
      'fromUuid',
      `"use strict";\n${macro.command}`
    );

    return await fn(context, context, game, foundry, ui, fromUuid);
  }
}

