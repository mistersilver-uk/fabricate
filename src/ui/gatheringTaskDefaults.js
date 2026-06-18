/**
 * Shared gathering-task default constants.
 *
 * `DEFAULT_GATHERING_TASK_IMG` is the placeholder image `_normalizeGatheringTask`
 * persists for a task with no custom image. It is the single source of truth for
 * both the admin store (which stamps it) and any consumer that must distinguish a
 * REAL custom image from the placeholder (e.g. the Interactable browser, which
 * shows the leaf icon for the placeholder and the image only for a custom one).
 *
 * The literal lives in the layering-safe `src/gatheringImageDefaults.js` module so
 * `src/systems/` and `src/ui/` share one source of truth; this module re-exports it
 * so existing importers keep working.
 */

export { DEFAULT_GATHERING_TASK_IMG } from '../gatheringImageDefaults.js';
