/**
 * Shared, layering-safe default images for gathering entities.
 *
 * This module has NO imports so it can be consumed from both `src/systems/`
 * and `src/ui/` without a layering violation. It is the single source of truth
 * for the environment, task, and event placeholder images — GM editor, GM
 * browser, player rows/detail, and runtime/chat fallbacks all resolve to the
 * same constants so GM and player surfaces never diverge.
 */

/** Default image for a gathering environment with no custom image. */
export const DEFAULT_GATHERING_ENVIRONMENT_IMG = 'icons/environment/wilderness/terrain-forest-gray.webp';

/** Default image for a gathering task with no custom image. */
export const DEFAULT_GATHERING_TASK_IMG = 'icons/containers/bags/pouch-leather-brown-green.webp';

/** Default image for a gathering event with no custom image. */
export const DEFAULT_GATHERING_EVENT_IMG = 'icons/magic/time/day-night-sunset-sunrise.webp';
