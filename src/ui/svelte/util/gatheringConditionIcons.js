// Weather and time-of-day icons and label keys for the gathering condition surfaces, shared so
// the admin condition editor and the player actor-selection top bar resolve the same glyph.
// An unmapped or absent tag takes the fallback icon and the `Unknown` label key.

export const TIME_OF_DAY_ICONS = Object.freeze({
  dawn: 'fas fa-cloud-sun',
  day: 'fas fa-sun',
  dusk: 'fas fa-cloud-moon',
  night: 'fas fa-moon'
});

export const TIME_OF_DAY_FALLBACK_ICON = 'fas fa-clock';

export function getTimeOfDayIcon(id) {
  return TIME_OF_DAY_ICONS[id] || TIME_OF_DAY_FALLBACK_ICON;
}

export function getTimeOfDayLabelKey(id) {
  const key = Object.prototype.hasOwnProperty.call(TIME_OF_DAY_ICONS, id) ? id : 'Unknown';
  return `FABRICATE.App.ActorBar.TimeOfDay.${key}`;
}

export const WEATHER_ICONS = Object.freeze({
  clear: 'fas fa-sun',
  cloudy: 'fas fa-cloud',
  rain: 'fas fa-cloud-rain',
  storm: 'fas fa-bolt',
  snow: 'fas fa-snowflake',
  fog: 'fas fa-smog',
  wind: 'fas fa-wind'
});

export const WEATHER_FALLBACK_ICON = 'fas fa-cloud-sun';

export function getWeatherIcon(id) {
  return WEATHER_ICONS[id] || WEATHER_FALLBACK_ICON;
}

export function getWeatherLabelKey(id) {
  const key = Object.prototype.hasOwnProperty.call(WEATHER_ICONS, id) ? id : 'Unknown';
  return `FABRICATE.App.ActorBar.Weather.${key}`;
}
