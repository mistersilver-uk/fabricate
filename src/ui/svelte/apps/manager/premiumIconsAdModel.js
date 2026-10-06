/**
 * The GM Manager's Premium crafting-icons advert: the routes it may show on, whether it shows, and
 * the Patreon page it links to (`ui-extension-points/spec.md` §Premium Crafting Icons Advert).
 * UI-free, so the header model and the components that draw the advert share one answer.
 */

/** The Patreon call to action every Premium link in the Manager opens. */
export const PREMIUM_PATREON_URL = 'https://www.patreon.com/c/mistersilver';

/** `SETTING_KEYS.PREMIUM_ICONS_AD_DISMISSED`, spelled so the UI tree never loads the registry. */
export const PREMIUM_ICONS_AD_DISMISSED_KEY = 'premiumIconsAdDismissed';

/** The world Component catalogue and the system Component Rules list, and no other route. */
export const PREMIUM_ICONS_AD_ROUTES = Object.freeze(['world-components', 'components']);

/**
 * Whether the advert renders: on one of its two routes, while the experimental gate is open, no
 * Premium surface is registered and no GM has dismissed it.
 */
export function isPremiumIconsAdVisible({
  currentView,
  experimentalFeaturesEnabled,
  premiumInstalled,
  dismissed,
}) {
  return (
    PREMIUM_ICONS_AD_ROUTES.includes(currentView) &&
    experimentalFeaturesEnabled === true &&
    premiumInstalled !== true &&
    dismissed !== true
  );
}
