/**
 * Shared weather and time-of-day icon/label helpers for gathering condition
 * surfaces.
 *
 * Extracted (with no behavior change) from the non-exported icon maps that lived
 * inline in `adminStore.js` so both the admin condition editor and the player
 * actor-selection top bar resolve the same icons.
 */

/**
 * Font Awesome icon classes for each known time-of-day tag.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TIME_OF_DAY_ICONS = Object.freeze({
  dawn: 'fas fa-cloud-sun',
  day: 'fas fa-sun',
  dusk: 'fas fa-cloud-moon',
  night: 'fas fa-moon'
});

/**
 * Fallback icon used when a time-of-day tag is unknown/absent.
 *
 * @type {string}
 */
export const TIME_OF_DAY_FALLBACK_ICON = 'fas fa-clock';

/**
 * Resolve the Font Awesome icon class for a time-of-day tag.
 *
 * @param {string} id Time-of-day tag (e.g. `dawn`, `day`, `dusk`, `night`).
 * @returns {string} The mapped icon class, or {@link TIME_OF_DAY_FALLBACK_ICON}.
 */
export function getTimeOfDayIcon(id) {
  return TIME_OF_DAY_ICONS[id] || TIME_OF_DAY_FALLBACK_ICON;
}

/**
 * Resolve the i18n label key for a time-of-day tag.
 *
 * @param {string} id Time-of-day tag (e.g. `dawn`, `day`, `dusk`, `night`).
 * @returns {string} The `FABRICATE.App.ActorBar.TimeOfDay.*` key, falling back
 *   to the `Unknown` key for an unmapped/absent tag.
 */
export function getTimeOfDayLabelKey(id) {
  const key = Object.prototype.hasOwnProperty.call(TIME_OF_DAY_ICONS, id) ? id : 'Unknown';
  return `FABRICATE.App.ActorBar.TimeOfDay.${key}`;
}

/**
 * Font Awesome icon classes for each known weather tag.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const WEATHER_ICONS = Object.freeze({
  clear: 'fas fa-sun',
  cloudy: 'fas fa-cloud',
  rain: 'fas fa-cloud-rain',
  storm: 'fas fa-bolt',
  snow: 'fas fa-snowflake',
  fog: 'fas fa-smog',
  wind: 'fas fa-wind'
});

/**
 * Fallback icon used when a weather tag is unknown/absent.
 *
 * @type {string}
 */
export const WEATHER_FALLBACK_ICON = 'fas fa-cloud-sun';

/**
 * Resolve the Font Awesome icon class for a weather tag.
 *
 * @param {string} id Weather tag (e.g. `clear`, `rain`, `storm`).
 * @returns {string} The mapped icon class, or {@link WEATHER_FALLBACK_ICON}.
 */
export function getWeatherIcon(id) {
  return WEATHER_ICONS[id] || WEATHER_FALLBACK_ICON;
}

/**
 * Resolve the i18n label key for a weather tag.
 *
 * @param {string} id Weather tag (e.g. `clear`, `rain`, `storm`).
 * @returns {string} The `FABRICATE.App.ActorBar.Weather.*` key, falling back to
 *   the `Unknown` key for an unmapped/absent tag.
 */
export function getWeatherLabelKey(id) {
  const key = Object.prototype.hasOwnProperty.call(WEATHER_ICONS, id) ? id : 'Unknown';
  return `FABRICATE.App.ActorBar.Weather.${key}`;
}
