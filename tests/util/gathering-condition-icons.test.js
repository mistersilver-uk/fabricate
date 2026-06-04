import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_OF_DAY_ICONS,
  TIME_OF_DAY_FALLBACK_ICON,
  getTimeOfDayIcon,
  getTimeOfDayLabelKey,
  WEATHER_ICONS,
  WEATHER_FALLBACK_ICON,
  getWeatherIcon,
  getWeatherLabelKey
} from '../../src/ui/svelte/util/gatheringConditionIcons.js';

test('TIME_OF_DAY_ICONS maps the four known tags (preserved from adminStore)', () => {
  assert.deepEqual({ ...TIME_OF_DAY_ICONS }, {
    dawn: 'fas fa-cloud-sun',
    day: 'fas fa-sun',
    dusk: 'fas fa-cloud-moon',
    night: 'fas fa-moon'
  });
});

test('getTimeOfDayIcon returns the mapped icon for a known tag', () => {
  assert.equal(getTimeOfDayIcon('dawn'), 'fas fa-cloud-sun');
  assert.equal(getTimeOfDayIcon('day'), 'fas fa-sun');
  assert.equal(getTimeOfDayIcon('dusk'), 'fas fa-cloud-moon');
  assert.equal(getTimeOfDayIcon('night'), 'fas fa-moon');
});

test('getTimeOfDayIcon falls back to the clock for unknown/absent tags', () => {
  assert.equal(TIME_OF_DAY_FALLBACK_ICON, 'fas fa-clock');
  assert.equal(getTimeOfDayIcon('noon'), 'fas fa-clock');
  assert.equal(getTimeOfDayIcon(null), 'fas fa-clock');
  assert.equal(getTimeOfDayIcon(undefined), 'fas fa-clock');
  assert.equal(getTimeOfDayIcon(''), 'fas fa-clock');
});

test('getTimeOfDayLabelKey returns the per-tag key for known tags', () => {
  assert.equal(getTimeOfDayLabelKey('dawn'), 'FABRICATE.App.ActorBar.TimeOfDay.dawn');
  assert.equal(getTimeOfDayLabelKey('night'), 'FABRICATE.App.ActorBar.TimeOfDay.night');
});

test('getTimeOfDayLabelKey returns the Unknown key for unknown/absent tags', () => {
  assert.equal(getTimeOfDayLabelKey('noon'), 'FABRICATE.App.ActorBar.TimeOfDay.Unknown');
  assert.equal(getTimeOfDayLabelKey(null), 'FABRICATE.App.ActorBar.TimeOfDay.Unknown');
  assert.equal(getTimeOfDayLabelKey(undefined), 'FABRICATE.App.ActorBar.TimeOfDay.Unknown');
});

test('WEATHER_ICONS maps the known tags (preserved from adminStore)', () => {
  assert.deepEqual({ ...WEATHER_ICONS }, {
    clear: 'fas fa-sun',
    cloudy: 'fas fa-cloud',
    rain: 'fas fa-cloud-rain',
    storm: 'fas fa-bolt',
    snow: 'fas fa-snowflake',
    fog: 'fas fa-smog',
    wind: 'fas fa-wind'
  });
});

test('getWeatherIcon returns the mapped icon or the cloud-sun fallback', () => {
  assert.equal(getWeatherIcon('rain'), 'fas fa-cloud-rain');
  assert.equal(getWeatherIcon('storm'), 'fas fa-bolt');
  assert.equal(WEATHER_FALLBACK_ICON, 'fas fa-cloud-sun');
  assert.equal(getWeatherIcon('hail'), 'fas fa-cloud-sun');
  assert.equal(getWeatherIcon(null), 'fas fa-cloud-sun');
  assert.equal(getWeatherIcon(''), 'fas fa-cloud-sun');
});

test('getWeatherLabelKey returns the per-tag key, Unknown for unmapped tags', () => {
  assert.equal(getWeatherLabelKey('clear'), 'FABRICATE.App.ActorBar.Weather.clear');
  assert.equal(getWeatherLabelKey('storm'), 'FABRICATE.App.ActorBar.Weather.storm');
  assert.equal(getWeatherLabelKey('hail'), 'FABRICATE.App.ActorBar.Weather.Unknown');
  assert.equal(getWeatherLabelKey(null), 'FABRICATE.App.ActorBar.Weather.Unknown');
});
