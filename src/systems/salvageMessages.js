/**
 * The salvage engine's undifferentiated fallback text, shared by `salvagePipeline.js` (which
 * returns it as `checkResult.message` when a failed check carries none of its own) and
 * `SalvageRollSummary.svelte` (which swaps it for a "nothing recovered" sentence rather than
 * showing it verbatim). A single, no-import constant so the two never drift apart silently
 * (issue 2092).
 */
export const SALVAGE_CHECK_FAILED_FALLBACK = 'Salvage check failed';
