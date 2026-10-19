/**
 * The single-item salvage action's state, read by the inspector header that draws the button and
 * by the salvage panel whose footer note explains it. Every input is decided builder-side; a
 * salvage in flight is the button's `busy`, not its `disabled` (issue 2540).
 *
 * @param {{salvage: object|null, depleted: boolean, result: object|null}} state
 * @returns {{shown: boolean, labelKey: string, disabled: boolean, toolBlocked: boolean}}
 */
export function salvageAction({ salvage, depleted, result }) {
  const toolsAvailable = salvage?.toolsAvailable !== false;
  const toolsRequired = Array.isArray(salvage?.toolStates) && salvage.toolStates.length > 0;
  return {
    // One-shot: once a result ribbon stands, the ribbon's own reset is the way back.
    shown: result?.state !== 'success',
    labelKey:
      salvage?.checkUsable === true
        ? 'FABRICATE.App.Inventory.Salvage.ActionRoll'
        : 'FABRICATE.App.Inventory.Salvage.Action',
    disabled:
      salvage?.misconfigured === true ||
      result?.state === 'waiting' ||
      depleted === true ||
      !toolsAvailable,
    toolBlocked: toolsRequired && !toolsAvailable,
  };
}
