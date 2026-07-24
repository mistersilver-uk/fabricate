/**
 * Executes Foundry script macros as return-value functions.
 */
export const MacroExecutor = {
  /**
   * Run a script macro by UUID and return its result.
   * @param {string|null} macroUuid
   * @param {Object} payload
   * @returns {Promise<any>}
   */
  async run(macroUuid, payload = {}) {
    if (!macroUuid) return null;

    let macro;
    try {
      macro = await fromUuid(macroUuid);
    } catch {
      macro = null;
    }
    if (!macro || typeof macro.command !== 'string') {
      throw new Error(`Macro not found or invalid: ${macroUuid}`);
    }

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    // Foundry V13.351 client/documents/macro.mjs gates Macro#execute(scope) through the
    // current user's canUserExecute check, which requires LIMITED permission on the Macro.
    // Fabricate evaluates the configured command directly so player-initiated crafting can
    // run GM-selected automation. This bypasses only that client-side Macro document gate:
    // the script still runs as the current player with no added server or document authority.
    //
    // Foundry V13.351 client/client.mjs publishes game, foundry, ui, and fromUuid on
    // globalThis, so accepting them again as function parameters is redundant. Macro commands
    // resolve those runtime globals directly.
    const fn = new AsyncFunction('context', 'args', 'scope', `"use strict";\n${macro.command}`);

    return await fn(payload, payload, payload);
  },
};
