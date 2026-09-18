/**
 * The per-window case factories and the step helpers the case data files build their entries
 * from. Each factory supplies the window, its default geometry and `publish: true`.
 */

import {
  CANVAS_BROWSER,
  CANVAS_CONFIG,
  CANVAS_MANAGER,
  DEFAULT_POSITION,
  MANAGER,
  PLAYER,
} from './caseConstants.js';

/** The inventory grid card for one listing key. */
export const CARD = (key) => `.inventory-card[data-inventory-card="${key}"]`;

/**
 * The button inside that card, which is what a selection gesture actually clicks — the card element
 * itself carries no handler.
 */
export const CARD_BUTTON = (key) => `${CARD(key)} .inventory-card-button`;

/** A shift-click step: the one gesture that both enters and extends a bulk selection. */
export const SHIFT_CLICK = (key) => ({ selector: CARD_BUTTON(key), modifiers: ['Shift'] });

/** Case factories. */
export function managerCase(entry) {
  return {
    app: MANAGER,
    position: DEFAULT_POSITION[MANAGER],
    publish: true,
    ...entry,
  };
}

/** Choose an actor in the Checks rail's "Preview as" picker. */
export function previewAsActor(actorId) {
  return [
    { selector: '[data-checks-preview-actor]' },
    { selector: `[data-popover-option="${actorId}"]` },
  ];
}

/** Choose a value on one of the app's own `<Select>` controls. */
export function chooseSelectOption(trigger, value, host = '') {
  const panel = host ? `${host} > .fabricate-select-popover` : '.fabricate-select-popover';
  return [{ selector: trigger }, { selector: `${panel} [data-popover-option="${value}"]` }];
}

/** The three canvas-window factories. */
export function canvasCaseFactory(app) {
  return (entry) => ({ app, position: DEFAULT_POSITION[app], publish: true, ...entry });
}

export const browserCase = canvasCaseFactory(CANVAS_BROWSER);
export const configCase = canvasCaseFactory(CANVAS_CONFIG);
export const interactablesManagerCase = canvasCaseFactory(CANVAS_MANAGER);

/**
 * @param {object} entry Case fields.
 * @returns {object} A complete case.
 */
export function playerCase(entry) {
  return {
    app: PLAYER,
    position: DEFAULT_POSITION[PLAYER],
    publish: true,
    ...entry,
  };
}

export function responsiveLayout(containerSelector, gridSelector) {
  return { containerSelector, gridSelector, maxContentBoxInlineSize: 960 };
}
