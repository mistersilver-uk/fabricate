/**
 * The GM-facing picker for the additional player-character actor types (issue 1024): a
 * `registerMenu` button opening a DialogV2 over the types the world declares. Enumeration is LAZY
 * because `CONFIG.Actor.typeLabels` is seeded after `init`, and types come from the merged
 * `game.documentTypes.Actor`, never the manifest field. The markup is bounded by `cleanHTML` and by
 * DialogV2 injecting it into its own `<form>`: no nested `<form>`, no `<fieldset disabled>`, NO
 * `name` on the locked `character` row — a named one persists `'character'` into a setting that
 * holds ADDITIONAL types only — inline `style` rather than a `styles/` rule, and an explicit
 * numeric width so the auto-size clamp engages.
 */

import {
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  BASE_DOCUMENT_TYPE_FALLBACK,
  buildActorTypeOptions,
  normalizeAdditionalPlayerCharacterTypes,
  readAdditionalPlayerCharacterActorTypes,
} from './playerCharacterTypes.js';
import { registerDialogSettingsMenu } from './settingsMenu.js';

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a settings <-> menu
// import cycle.
const NAMESPACE = 'fabricate';

const MENU_KEY = 'playerCharacterActorTypes';

/** The shared `name` every EDITABLE checkbox carries. */
export const ACTOR_TYPE_FIELD_NAME = 'fabricateAdditionalActorType';

/** The read-back selector, built ONCE from the fixed field name above. */
const CHECKED_ACTOR_TYPE_SELECTOR = `input[name="${ACTOR_TYPE_FIELD_NAME}"]:checked`;

const ROW_ID_PREFIX = 'fabricate-actor-type-';

/** The dialog's width in pixels. */
export const DIALOG_WIDTH = 480;

/** Inline presentation, keyed by the element it dresses. */
const STYLES = Object.freeze({
  row: 'display:flex;align-items:center;flex-wrap:wrap;gap:0.4em;padding:0.15rem 0',
  label: 'font-weight:600',
  id:
    'font-family:var(--fab-font-mono, ui-monospace, monospace);' +
    'font-size:0.85em;' +
    'padding:0.05em 0.4em;' +
    'border:1px solid rgb(127 127 127 / 45%);' +
    'border-radius:3px;' +
    'background:rgb(127 127 127 / 12%);' +
    'opacity:0.85',
  note: 'font-size:0.9em;font-style:italic;opacity:0.7',
});

function localize(key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (data) return i18n?.format?.(key, data) ?? key;
  return i18n?.localize?.(key) ?? key;
}

/** Escape a value for interpolation into the dialog's HTML string. */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** The actor types the active world declares, minus `base`. */
export function enumerateActorTypes() {
  return normalizeAdditionalPlayerCharacterTypes(
    globalThis.game?.documentTypes?.Actor ?? []
  ).filter((type) => type !== baseDocumentType());
}

/** The world's abstract base document type, or the fallback spelling. */
function baseDocumentType() {
  return globalThis.CONST?.BASE_DOCUMENT_TYPE ?? BASE_DOCUMENT_TYPE_FALLBACK;
}

/** Resolve a display label for one actor type through `CONFIG.Actor.typeLabels`. */
export function actorTypeLabel(type) {
  const key = globalThis.CONFIG?.Actor?.typeLabels?.[type];
  if (typeof key !== 'string' || key === '') return type;
  const i18n = globalThis.game?.i18n;
  if (typeof i18n?.has === 'function' && !i18n.has(key)) return type;
  const localized = i18n?.localize?.(key);
  return typeof localized === 'string' && localized.trim() !== '' && localized !== key
    ? localized
    : type;
}

/** Build one checkbox row. */
function buildRow(option, index) {
  const rowId = `${ROW_ID_PREFIX}${index}`;
  const attributes = [`id="${rowId}"`, 'type="checkbox"'];
  if (option.locked) {
    // Checked + disabled + NO name: display, not input.
    attributes.push('checked', 'disabled');
  } else {
    attributes.push(`name="${ACTOR_TYPE_FIELD_NAME}"`, `value="${escapeHtml(option.id)}"`);
    if (option.checked) attributes.push('checked');
  }

  const suffixes = [];
  if (option.locked) {
    suffixes.push(localize('FABRICATE.Settings.PlayerCharacterActorTypes.AlwaysIncluded'));
  }
  if (!option.known) {
    suffixes.push(localize('FABRICATE.Settings.PlayerCharacterActorTypes.UnknownType'));
  }
  const suffixMarkup = suffixes
    .map((suffix) => ` <span class="notes" style="${STYLES.note}">${escapeHtml(suffix)}</span>`)
    .join('');

  // The raw id is shown only when it differs from the label — a module subtype's `mod-id.subtype`
  // is otherwise unidentifiable from a friendly label alone, while an unknown stored id already
  // RENDERS as its own label and would read twice.
  const idMarkup = ` <span class="fabricate-actor-type-id" style="${STYLES.id}">${escapeHtml(option.id)}</span>`;
  const nameMarkup =
    option.label === option.id
      ? idMarkup
      : ` <span class="fabricate-actor-type-label" style="${STYLES.label}">${escapeHtml(option.label)}</span>${idMarkup}`;

  // The single spaces between the spans are load-bearing for the ACCESSIBLE NAME, not for layout: a
  // whitespace-only text node between flex items is not rendered, so the `gap` is the only visible
  // separation, but the label's text content is what a screen reader announces, so the spaces stay.
  return (
    `<label class="checkbox" for="${rowId}" style="${STYLES.row}">` +
    `<input ${attributes.join(' ')}>` +
    nameMarkup +
    suffixMarkup +
    '</label>'
  );
}

/** Build the dialog's `content` string. */
export function buildActorTypeDialogContent({ options = [] } = {}) {
  const rows = options.map((option, index) => buildRow(option, index)).join('');
  return (
    `<p>${escapeHtml(localize('FABRICATE.Settings.PlayerCharacterActorTypes.Body'))}</p>` +
    '<fieldset id="fabricate-player-character-actor-types"' +
    ' class="fabricate-actor-type-picker"' +
    ' style="max-height:18rem;overflow:auto">' +
    `<legend>${escapeHtml(localize('FABRICATE.Settings.PlayerCharacterActorTypes.Legend'))}</legend>` +
    rows +
    '</fieldset>'
  );
}

/** Read the ticked additional types back out of the dialog's form. */
export function readSelectedActorTypes(form) {
  if (typeof form?.querySelectorAll !== 'function') return [];
  const checked = [...form.querySelectorAll(CHECKED_ACTOR_TYPE_SELECTOR)];
  return normalizeAdditionalPlayerCharacterTypes(checked.map((input) => input?.value));
}

/** Open the picker and persist the result. */
export async function openPlayerCharacterTypesDialog() {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== 'function') return null;

  const options = buildActorTypeOptions({
    declaredTypes: enumerateActorTypes(),
    selectedTypes: readAdditionalPlayerCharacterActorTypes(),
    labelFor: actorTypeLabel,
    baseDocumentType: baseDocumentType(),
  });

  const result = await DialogV2.wait({
    window: { title: localize('FABRICATE.Settings.PlayerCharacterActorTypes.Title') },
    // Without this the inherited `width: "auto"` sizes the window to the intro paragraph's one-line
    // max-content width.
    position: { width: DIALOG_WIDTH },
    content: buildActorTypeDialogContent({ options }),
    rejectClose: false,
    buttons: [
      {
        action: 'save',
        default: true,
        label: localize('FABRICATE.Settings.PlayerCharacterActorTypes.Save'),
        // Core's documented pattern: read state off `button.form` in the callback.
        callback: (_event, button) => readSelectedActorTypes(button?.form),
      },
      {
        action: 'cancel',
        label: localize('FABRICATE.Settings.PlayerCharacterActorTypes.Cancel'),
        callback: () => null,
      },
    ],
  }).catch(() => null);

  if (!Array.isArray(result)) return null;

  await globalThis.game?.settings?.set?.(
    NAMESPACE,
    ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
    result
  );
  return result;
}

/** Register the "Player Character Actor Types" settings-menu button. */
export function registerPlayerCharacterTypesMenu() {
  return registerDialogSettingsMenu({
    key: MENU_KEY,
    name: 'FABRICATE.Settings.PlayerCharacterActorTypes.Name',
    label: 'FABRICATE.Settings.PlayerCharacterActorTypes.Label',
    hint: 'FABRICATE.Settings.PlayerCharacterActorTypes.Hint',
    icon: 'fas fa-users',
    open: () => openPlayerCharacterTypesDialog(),
  });
}
