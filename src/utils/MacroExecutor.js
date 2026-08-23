/**
 * Executes Foundry script macros as return-value functions.
 *
 * ## Callers, and the disclosure contract this module deliberately does NOT own
 *
 * {@link MacroExecutor.run} THROWS on a miss (`Macro not found or invalid: <uuid>`);
 * there is no `{ok: false}` to read. Its callers do not agree on what that should look
 * like — an essence property macro whose link is broken must stay a silent
 * `console.warn`, while a complication's broken link is a real GM-facing report — so the
 * decision belongs to each of them and never to this module.
 *
 * For the same reason the `type === 'script'` check is a CALL-SITE check and is not, and
 * must not be, centralised here. Centralising it would turn a `chat`-type essence
 * property macro from that silent warn into a per-essence-per-result error notification,
 * which is the regression the essence-property-macro requirement exists to prevent. The
 * resolve-then-gate idiom at those call sites also resolves the uuid a second time on
 * purpose: settling "is the GM's link broken" BEFORE entering the try is the only way to
 * tell that (silent) apart from "the macro itself blew up" (reported).
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
    // WHY THE canUserExecute GATE IS BYPASSED (issue 1286 rewrote this justification).
    //
    // Foundry V13.351 client/documents/macro.mjs gates Macro#execute(scope) through the
    // current user's canUserExecute check, which requires LIMITED permission on the Macro
    // document. Fabricate evaluates the configured command directly so a player-initiated
    // activity can run GM-selected automation the player was never given a document
    // permission for.
    //
    // The justification this comment USED to give — that the script runs as the acting
    // player and gains no authority over the server or over any document from doing so —
    // is now FALSE and must not be restored in any wording. Component complication macros
    // execute on an ELECTED GM's client, and a GM is OWNER of every document in the world,
    // so "the acting player" is no longer a bound on what a run can touch. The executing
    // client may be a GM. `tests/macro-executor.test.js` pins the retired phrasing as
    // absent, because a comment is the only carrier this reasoning has ever had.
    //
    // What bounds it instead is the complication socket's three-part chain, which holds
    // entirely OUTSIDE this module:
    //
    //   1. ADDRESSING ONLY. The socket payload names a crafting system, a component and a
    //      complication id. It carries no macro uuid, no chat content and no speaker. The
    //      elected GM re-reads the macro uuid from its OWN copy of the crafting systems
    //      world setting, so a forged message can do no more than fire a complication that
    //      GM already authored.
    //   2. ATTESTED SENDER. The requesting user is the server-appended second callback
    //      argument of the socket handler, never a value carried in the request. A blank
    //      or absent sender is refused fail-closed.
    //   3. ACTOR AUTHORIZATION. The GM re-authorizes the addressed actor against that
    //      attested sender before anything runs.
    //
    // A caller that reaches this function by any OTHER route has not inherited that chain
    // and is asserting its own equivalent bound; the acting-client callers do so by only
    // ever running macros the GM configured on the record being resolved.
    //
    // MACRO_SCRIPT stays UNCONSULTED, deliberately. It is the world permission governing
    // whether a USER may author and run script macros of their own, and the whole point of
    // this seam is that the script being run is the GM's, not the acting user's — gating
    // on it would make a table's decision to withhold macro authorship from its players
    // silently disable GM-authored crafting automation for exactly those players. On the
    // complication path the executing user is a GM, who holds it regardless, so consulting
    // it there would be theatre rather than a control.
    //
    // Foundry V13.351 client/client.mjs publishes game, foundry, ui, and fromUuid on
    // globalThis, so accepting them again as function parameters is redundant. Macro commands
    // resolve those runtime globals directly. Note this binds only ('context','args','scope'):
    // core's own #executeScript also binds speaker, actor, token and character, so a macro
    // reaching for any of those resolves a GLOBAL on the executing client — which, GM-side,
    // is the GM's assigned character, the GM's viewed canvas and a TRUE game.user.isGM. The
    // socket supplies speaker, actor and token on the payload scope for that reason.
    const fn = new AsyncFunction('context', 'args', 'scope', `"use strict";\n${macro.command}`);

    return await fn(payload, payload, payload);
  },
};
