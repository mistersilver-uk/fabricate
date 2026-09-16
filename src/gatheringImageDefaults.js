/**
 * The one source of truth for gathering placeholder images, so GM and player surfaces cannot
 * diverge. Deliberately import-free, so `src/systems/` and `src/ui/` can both consume it.
 */

/** Default image for a gathering environment with no custom image. */
export const DEFAULT_GATHERING_ENVIRONMENT_IMG = 'icons/environment/wilderness/terrain-forest-gray.webp';

/** Default image for a gathering task with no custom image. */
export const DEFAULT_GATHERING_TASK_IMG = 'icons/containers/bags/pouch-leather-brown-green.webp';

/** Default image for a gathering event with no custom image. */
export const DEFAULT_GATHERING_EVENT_IMG = 'icons/magic/time/day-night-sunset-sunrise.webp';
