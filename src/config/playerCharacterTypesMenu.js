/**
 * The GM-facing picker for the additional player-character actor types (issue 1024).
 *
 * A `game.settings.registerMenu` button that opens a DialogV2 listing the actor types
 * the active world actually declares.
 *
 * ## Why enumeration is lazy
 *
 * `game.system.id`, `game.model` and `game.documentTypes` are all populated in the
 * `Game` constructor before the `init` hook, so registration timing is not what
 * constrains this. `CONFIG.Actor.typeLabels` is seeded by `Localization#initialize`,
 * which runs AFTER `init` — so building options eagerly at registration time would
 * yield raw type ids for every label. Enumeration and labelling therefore happen at
 * dialog-open time.
 *
 * Types come from `game.documentTypes.Actor`: the server-supplied MERGED truth,
 * including module-added subtypes, and `undefined` before `setupPackages` — hence the
 * optional chaining. `game.system.documentTypes.Actor` is the MANIFEST field: an
 * object, not an array, which validates out core types and never contains module
 * subtypes. `CONST.BASE_DOCUMENT_TYPE` (`'base'`) is always present and is filtered.
 *
 * Labels come from `CONFIG.Actor.typeLabels[type]`, which is an i18n KEY. It is
 * auto-seeded by `Localization#initialize`, which SKIPS any key a system already set,
 * so constructing `TYPES.Actor.<t>` directly would be wrong.
 *
 * ## Why the markup looks like this
 *
 * DialogV2 passes a string `content` through `foundry.utils.cleanHTML`, whose
 * `cleanNode` returns an empty fragment for any non-allowlisted element — the element
 * AND its whole subtree are deleted, not unwrapped. `fieldset`, `legend`, `label`,
 * `input`, `span` and `p` are allowlisted; `input` keeps `checked/disabled/name/value/
 * type`; and the `"*"` attribute bucket includes `id`, `class`, `style` and `aria-*`,
 * so there is no accessibility ceiling here.
 *
 * Specific constraints, each of which is load-bearing:
 *
 *   - **No nested `<form>`.** `form` survives cleaning, but `DialogV2._renderHTML`
 *     injects the cleaned string into its OWN `<form>` via `innerHTML`, and the HTML
 *     parser drops a nested `<form>` start tag. `<fieldset>`/`<legend>` carries the
 *     grouping instead.
 *   - **`disabled` goes on the locked `<input>` only, never on the `<fieldset>`.**
 *     `<fieldset disabled>` disables every descendant control.
 *   - **The locked `character` row carries NO `name` attribute.** It is display, not
 *     input. `querySelectorAll` has no notion of `disabled` and
 *     `HTMLFormControlsCollection` includes disabled controls, so a NAMED locked row
 *     would be read back and persist `['character']` into a setting documented as
 *     holding only ADDITIONAL types — a bug the resolving union would then mask.
 *   - **The suffixes live INSIDE the `<label>`**, so they join the accessible name
 *     rather than being invisible in forms mode.
 *   - **The fieldset is height-capped and scrolls.** `game.documentTypes.Actor` is
 *     unbounded once modules add subtypes, and a string `content` has no scroll
 *     containment, so twenty types would push the dialog buttons off-screen.
 *   - **All editable checkboxes share ONE `name` with the id in `value`.** Module
 *     subtype ids contain a dot, and an unquoted dotted attribute selector throws.
 *   - **Presentation is authored as inline `style` attributes, not as rules in
 *     `styles/fabricate.css`.** `style` is in `cleanHTML`'s `"*"` attribute bucket, so it
 *     survives. The sheet would be the usual home, but `isUiFile` (both in
 *     `scripts/lib/viewLabCases.js` and in `scripts/ui-pr-screenshot-evidence.mjs`) treats
 *     ANY `styles/` path as render-affecting and routes it to the broadest fallback view
 *     set — and no View Lab case can photograph a Foundry settings dialog, so a rule added
 *     there would demand screenshot evidence that cannot exist. The `--fab-*` tokens are
 *     declared on bare `:root` in that globally loaded sheet, so they resolve here
 *     whatever class this dialog carries; the one token `STYLES` consumes still names a
 *     token-free fallback, so the dialog degrades rather than losing the distinction
 *     outright if the sheet is absent.
 *
 * ## Why the dialog is given an explicit width
 *
 * `ApplicationV2.DEFAULT_OPTIONS.position` is `{width: "auto", height: "auto"}` and
 * `DialogV2` does not override it. `_updatePosition` skips its clamp entirely for
 * `"auto"` and writes an empty CSS width, so the `<dialog>` keeps the `fit-content`
 * default and sizes to the CONTENT's max-content width — which, for the intro paragraph,
 * is that whole sentence on one line. The result was a dialog spanning nearly the
 * viewport to hold five short checkbox rows. An explicit numeric width is the only thing
 * that engages the `Math.clamp(targetWidth, minWidth, maxWidth)` branch.
 *
 * Core's `<multi-checkbox>` element would remove two of the read traps by
 * construction, but cannot express the locked row: `#buildOption` hardcodes
 * `checkbox.disabled = this.disabled` for the whole control, wraps each option in a
 * `<label>` with no `for`/`id` pair, and gives every option one shared `name` — so a
 * checked `character` row WOULD be read back and persist `['character']`, precisely
 * the bug the no-`name` rule exists to prevent. Its `select()` also throws for a value
 * absent from `_choices`, which is awkward for the unknown-stored-type row. Recorded
 * so a later reader does not "simplify" into it.
 */

import {
  ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY,
  BASE_DOCUMENT_TYPE_FALLBACK,
  buildActorTypeOptions,
  normalizeAdditionalPlayerCharacterTypes,
  readAdditionalPlayerCharacterActorTypes,
} from './playerCharacterTypes.js';
import { registerDialogSettingsMenu } from './settingsMenu.js';

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded to avoid a
// settings <-> menu import cycle.
const NAMESPACE = 'fabricate';

const MENU_KEY = 'playerCharacterActorTypes';

/**
 * The shared `name` every EDITABLE checkbox carries. The type id lives in `value`,
 * because module subtype ids contain dots and cannot safely be attribute selectors.
 *
 * @type {string}
 */
export const ACTOR_TYPE_FIELD_NAME = 'fabricateAdditionalActorType';

/**
 * The read-back selector, built ONCE from the fixed field name above.
 *
 * No `CSS.escape` is needed and none is wanted: the only interpolated value is this
 * module's own constant identifier. The whole point of putting the type id in `value`
 * rather than in the `name` is that a module subtype id contains a dot, and an
 * unquoted dotted attribute selector throws — so no untrusted id ever reaches a
 * selector at all.
 *
 * @type {string}
 */
const CHECKED_ACTOR_TYPE_SELECTOR = `input[name="${ACTOR_TYPE_FIELD_NAME}"]:checked`;

const ROW_ID_PREFIX = 'fabricate-actor-type-';

/**
 * The dialog's width in pixels.
 *
 * Any number defeats the `width: "auto"` default described in the module docblock. This
 * one is chosen to wrap the intro paragraph to a readable measure while leaving the
 * widest plausible row — a friendly label plus a dotted module-subtype id plus both
 * suffixes — room before it wraps.
 *
 * @type {number}
 */
export const DIALOG_WIDTH = 480;

/**
 * Inline presentation, keyed by the element it dresses. See the module docblock for why
 * this is not a stylesheet.
 *
 * The row is a flex line rather than the default inline flow so the checkbox, the label
 * and the trailing spans share one baseline and the row wraps as a unit; the id chip is
 * monospace and boxed so a RAW TYPE ID is unmistakably not a friendly label, which is the
 * whole point of showing both.
 *
 * Only ONE `--fab-*` token is consumed, and it is a font family. No `--fab-*` COLOUR is
 * read here: those are declared on bare `:root`, unconditionally carrying the dark
 * "fabricate" theme's values, and this dialog is a core-chromed window that follows
 * FOUNDRY's theme — so a parchment-on-dark token would be unreadable against Foundry's
 * light theme. Muting is done with `opacity` and neutral greys, which read on either.
 *
 * @type {Record<string, string>}
 */
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

/**
 * Escape a value for interpolation into the dialog's HTML string.
 *
 * We author the string and escape it ourselves rather than trusting the sanitizer:
 * the client `cleanHTML` compiles each allowlist as `^a|b|c$`, binding the anchors to
 * the first and last alternatives only, so "only allowlisted attributes survive" is
 * not literally true and must not be leaned on as a security property.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * The actor types the active world declares, minus `base`.
 *
 * @returns {string[]}
 */
export function enumerateActorTypes() {
  return normalizeAdditionalPlayerCharacterTypes(
    globalThis.game?.documentTypes?.Actor ?? []
  ).filter((type) => type !== baseDocumentType());
}

/**
 * The world's abstract base document type, or the fallback spelling.
 *
 * `playerCharacterTypes.js` is global-free by design, so it cannot read `CONST` itself and
 * takes the resolved value instead. Resolving it once here keeps the enumeration filter
 * and `buildActorTypeOptions`'s defensive second filter agreeing by construction.
 *
 * @returns {string}
 */
function baseDocumentType() {
  return globalThis.CONST?.BASE_DOCUMENT_TYPE ?? BASE_DOCUMENT_TYPE_FALLBACK;
}

/**
 * Resolve a display label for one actor type through `CONFIG.Actor.typeLabels`.
 *
 * Falls back to the raw type id when there is no entry or the key is untranslated —
 * which is exactly what a stale/unknown stored id gets.
 *
 * @param {string} type
 * @returns {string}
 */
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

/**
 * Build one checkbox row.
 *
 * @param {{id: string, label: string, checked: boolean, locked: boolean, known: boolean}} option
 * @param {number} index Row index, used only for the namespaced DOM id.
 * @returns {string}
 */
function buildRow(option, index) {
  const rowId = `${ROW_ID_PREFIX}${index}`;
  const attributes = [`id="${rowId}"`, 'type="checkbox"'];
  if (option.locked) {
    // Checked + disabled + NO name: display, not input. See the module docblock.
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

  // The raw id is shown only when it differs from the label — a module subtype's
  // `mod-id.subtype` is otherwise unidentifiable from a friendly label alone, while an
  // unknown stored id already RENDERS as its own label and would read twice.
  //
  // When they are equal, `actorTypeLabel` fell back to the id, so the ONE string on the
  // row is a raw id and wears the raw id's treatment. Dressing it as a friendly name
  // instead would make the fallback — the case a GM most needs to recognise, because it
  // marks a type this world does not translate — the one row that lies about what it is.
  const idMarkup = ` <span class="fabricate-actor-type-id" style="${STYLES.id}">${escapeHtml(option.id)}</span>`;
  const nameMarkup =
    option.label === option.id
      ? idMarkup
      : ` <span class="fabricate-actor-type-label" style="${STYLES.label}">${escapeHtml(option.label)}</span>${idMarkup}`;

  // The single spaces between the spans are load-bearing for the ACCESSIBLE NAME, not for
  // layout: a whitespace-only text node between flex items is not rendered, so the `gap`
  // is the only visible separation, but the label's text content is what a screen reader
  // announces and "Player Charactercharacter" is what dropping them yields.
  return (
    `<label class="checkbox" for="${rowId}" style="${STYLES.row}">` +
    `<input ${attributes.join(' ')}>` +
    nameMarkup +
    suffixMarkup +
    '</label>'
  );
}

/**
 * Build the dialog's `content` string.
 *
 * @param {object} [input]
 * @param {Array<object>} [input.options] Rows from `buildActorTypeOptions`.
 * @returns {string}
 */
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

/**
 * Read the ticked additional types back out of the dialog's form.
 *
 * `form.querySelectorAll(... :checked)` rather than `form.elements.<name>`: the latter
 * returns a BARE ELEMENT rather than a `RadioNodeList` when exactly one checkbox
 * carries the name — precisely the single-additional-type world this feature exists
 * for.
 *
 * @param {HTMLFormElement|null|undefined} form
 * @returns {string[]} The ticked type ids (never includes the locked row, which has no
 *   `name`).
 */
export function readSelectedActorTypes(form) {
  if (typeof form?.querySelectorAll !== 'function') return [];
  const checked = [...form.querySelectorAll(CHECKED_ACTOR_TYPE_SELECTOR)];
  return normalizeAdditionalPlayerCharacterTypes(checked.map((input) => input?.value));
}

/**
 * Open the picker and persist the result.
 *
 * Saving tests `Array.isArray(result)` rather than truthiness, so unticking everything
 * persists `[]` instead of being read as a cancel.
 *
 * @returns {Promise<string[]|null>} The saved list, or `null` when cancelled/unavailable.
 */
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
    // Without this the inherited `width: "auto"` sizes the window to the intro
    // paragraph's one-line max-content width. See the module docblock.
    position: { width: DIALOG_WIDTH },
    content: buildActorTypeDialogContent({ options }),
    rejectClose: false,
    buttons: [
      {
        action: 'save',
        default: true,
        label: localize('FABRICATE.Settings.PlayerCharacterActorTypes.Save'),
        // Core's documented pattern: read state off `button.form` in the callback.
        // Inline `on*` handlers are stripped by `cleanHTML` and never run.
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

/**
 * Register the "Player Character Actor Types" settings-menu button.
 *
 * @returns {boolean} `true` when the menu was registered.
 */
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
