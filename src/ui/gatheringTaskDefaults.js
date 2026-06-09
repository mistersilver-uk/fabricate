/**
 * Shared gathering-task default constants.
 *
 * `DEFAULT_GATHERING_TASK_IMG` is the placeholder image `_normalizeGatheringTask`
 * persists for a task with no custom image. It is the single source of truth for
 * both the admin store (which stamps it) and any consumer that must distinguish a
 * REAL custom image from the placeholder (e.g. the Interactable browser, which
 * shows the leaf icon for the placeholder and the image only for a custom one).
 */

/** Placeholder image stamped onto a gathering task with no custom image. */
export const DEFAULT_GATHERING_TASK_IMG = 'icons/svg/item-bag.svg';
