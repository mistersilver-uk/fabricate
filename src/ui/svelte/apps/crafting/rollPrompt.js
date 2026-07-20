/**
 * System-agnostic interactive roll-prompt dialog for Fabricate checks.
 *
 * Fabricate supports many game systems (dnd5e / pf2e / …) and has no
 * system-specific roll API, so this dialog is deliberately generic. Styled to
 * resemble the dnd5e roll-configuration dialog: a die glyph on its own row above
 * an icon-first header (subject icon then name), the (optionally @-resolved)
 * formula with a "Formula" label, a DC chip, a free-form "Situational Bonus?"
 * input, and a
 * Configuration section with a Roll Mode picker. When the check formula has a
 * plain `1d20`, the footer offers Advantage / Normal / Disadvantage; otherwise a
 * single Roll button. The actual rolling + chat posting happens in
 * `evaluateCheckRoll` (`src/systems/checkRoll.js`); this module only gathers the
 * player's confirm/cancel choice, modifier, roll mode, and advantage selection.
 *
 * Built on Foundry V13 `foundry.applications.api.DialogV2` (matching the
 * `DialogV2.wait` button-callback style used elsewhere in the repo — see
 * `src/config/repairItemData.js`). When DialogV2 is unavailable
 * (headless/tests) it resolves `{ confirmed: true }` so nothing blocks.
 */

/**
 * Fabricate's roll modes with i18n keys + English fallbacks, in the order the
 * Roll Mode picker lists them (mirrors Foundry core's `CONFIG.Dice.rollModes`).
 */
const ROLL_MODE_CHOICES = Object.freeze([
  ['publicroll', 'CHAT.RollPublic', 'Public Roll'],
  ['gmroll', 'CHAT.RollPrivate', 'Private GM Roll'],
  ['blindroll', 'CHAT.RollBlind', 'Blind GM Roll'],
  ['selfroll', 'CHAT.RollSelf', 'Self Roll'],
]);

/**
 * Localize a Foundry i18n key, falling back to an English default when the
 * runtime (or a test harness) cannot resolve it (echoes the key or is absent).
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function localize(key, fallback) {
  const resolved = globalThis.game?.i18n?.localize?.(key);
  return typeof resolved === 'string' && resolved && resolved !== key ? resolved : fallback;
}

/**
 * Prompt the player to confirm an interactive check roll.
 *
 * @param {object} args
 * @param {string} [args.formula] The authored roll formula (with `@` placeholders).
 * @param {string|null} [args.resolvedFormula] The `@`-resolved formula for display
 *   (preferred over `formula` when present).
 * @param {number} [args.dc] The check DC; only shown when finite.
 * @param {string} [args.name] The subject name (recipe/component/task), shown as
 *   the header title (icon-first); the frame title is "<Activity> check".
 * @param {string} [args.activity] Activity label ("Crafting"/"Salvage"/"Gathering").
 * @param {string} [args.img] Optional subject icon shown in the header.
 * @param {boolean} [args.allowAdvantage] When true, offer Advantage/Normal/
 *   Disadvantage buttons (the formula has a plain `1d20`); else a single Roll.
 * @returns {Promise<{confirmed: true, bonus: string|null, rollMode: string|undefined,
 *   advantage: 'advantage'|'normal'|'disadvantage'} | {confirmed: false}>}
 *   `{ confirmed: true, … }` when the player rolls; `{ confirmed: false }` on
 *   Cancel (window close / Escape) or dismissal.
 */
export async function promptCheckRoll({
  formula,
  resolvedFormula,
  dc,
  name,
  activity,
  img,
  allowAdvantage,
} = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  // Headless / no dialog API (tests): do not block the roll.
  if (!DialogV2?.wait) return { confirmed: true };

  const defaultRollMode = globalThis.game?.settings?.get?.('core', 'rollMode');
  const displayFormula = resolvedFormula || formula || '';
  const activityLabel = activity || 'Roll';

  // Header: the subject icon FIRST, then the subject name as the title. The
  // activity ("<Activity> check") is the dialog window (frame) title, so it is
  // not repeated in the body. Falls back to the activity title when unnamed.
  const iconHtml = img
    ? `<img class="fabricate-roll-prompt__icon" src="${escapeHtml(img)}" alt="" />`
    : '';
  const titleText = name ? escapeHtml(name) : `${escapeHtml(activityLabel)} check`;
  const headerHtml =
    `<div class="fabricate-roll-prompt__header">${iconHtml}` +
    `<div class="fabricate-roll-prompt__titles">` +
    `<h2 class="fabricate-roll-prompt__title">${titleText}</h2>` +
    `</div></div>`;

  // Die glyph: a d20 for an advantage-eligible check, else a generic die.
  // Decorative — hidden from assistive tech (the formula/DC carry the meaning).
  const dieIcon = allowAdvantage ? 'fa-dice-d20' : 'fa-dice';
  const dieHtml = `<div class="fabricate-roll-prompt__die"><i class="fa-solid ${dieIcon}" aria-hidden="true"></i></div>`;

  // The DC chip sits with the formula (right side) rather than floating alone.
  const dcChip = Number.isFinite(dc)
    ? `<span class="fabricate-roll-prompt__dc">DC ${escapeHtml(String(dc))}</span>`
    : '';
  let formulaHtml = '';
  if (displayFormula) {
    formulaHtml =
      `<div class="fabricate-roll-prompt__formula"><code>${escapeHtml(displayFormula)}</code>` +
      `<div class="fabricate-roll-prompt__formula-meta">${dcChip}` +
      `<span class="fabricate-roll-prompt__formula-label">Formula</span></div></div>`;
  } else if (dcChip) {
    formulaHtml = `<div class="fabricate-roll-prompt__formula fabricate-roll-prompt__formula--dc-only">${dcChip}</div>`;
  }

  const bonusHtml =
    `<input class="fabricate-roll-prompt__bonus" type="text" name="situationalBonus" ` +
    `inputmode="text" aria-label="Situational Bonus" placeholder="Situational Bonus?" autofocus />`;

  const rollModeOptions = ROLL_MODE_CHOICES.map(([value, key, fallback]) => {
    const selected = value === defaultRollMode ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(localize(key, fallback))}</option>`;
  }).join('');
  const configHtml =
    `<div class="fabricate-roll-prompt__config">` +
    `<p class="fabricate-roll-prompt__config-heading">Configuration</p>` +
    `<label>Roll Mode <select name="rollMode">${rollModeOptions}</select></label>` +
    `</div>`;

  // Die glyph on its own row ABOVE the icon + name row, then the formula/DC,
  // situational bonus, and configuration.
  const content =
    `<div class="fabricate-roll-prompt">` +
    `${dieHtml}${headerHtml}${formulaHtml}${bonusHtml}${configHtml}</div>`;

  // Read the form on a button click: normalize the situational bonus (strip one
  // leading `+`, trim, empty → null), read the chosen roll mode, and tag the
  // advantage disposition the button represents.
  const readChoice = (button, advantage) => {
    const rawBonus = button?.form?.elements?.situationalBonus?.value ?? '';
    const bonus = String(rawBonus)
      .replace(/^\s*\+/, '')
      .trim();
    const rollModeValue = button?.form?.elements?.rollMode?.value;
    return {
      confirmed: true,
      bonus: bonus === '' ? null : bonus,
      rollMode: rollModeValue || defaultRollMode || undefined,
      advantage,
    };
  };

  const buttons =
    allowAdvantage === true
      ? [
          {
            action: 'advantage',
            label: 'Advantage',
            callback: (_event, button) => readChoice(button, 'advantage'),
          },
          {
            action: 'normal',
            default: true,
            label: 'Normal',
            callback: (_event, button) => readChoice(button, 'normal'),
          },
          {
            action: 'disadvantage',
            label: 'Disadvantage',
            callback: (_event, button) => readChoice(button, 'disadvantage'),
          },
        ]
      : [
          {
            action: 'roll',
            default: true,
            label: 'Roll',
            callback: (_event, button) => readChoice(button, 'normal'),
          },
        ];

  const result = await DialogV2.wait({
    window: { title: `${activityLabel} check` },
    classes: ['fabricate', 'fabricate-dialog', 'fabricate-roll-prompt-dialog'],
    content,
    rejectClose: false,
    buttons,
  }).catch(() => ({ confirmed: false }));

  // A dismissed dialog (rejectClose:false) resolves to null → treat as cancel.
  if (!result || result.confirmed !== true) return { confirmed: false };
  return result;
}

/**
 * Build the interactive `rollOptions` bag threaded into a `runFormula*` check so a
 * UI-triggered crafting / salvage / gathering roll prompts the player (confirm +
 * optional situational modifier) and posts the evaluated roll to chat (Dice So
 * Nice). With `interactive` false — the default for automated/headless callers —
 * the returned bag carries a false `interactive` flag and `evaluateCheckRoll`
 * skips both the prompt and the chat post, preserving the original silent
 * behaviour. Shared by `CraftingEngine` and `GatheringEngine` (kept in one place
 * to avoid a duplicated builder).
 *
 * @param {object} args
 * @param {boolean} args.interactive
 * @param {object|null} args.actor The rolling actor (for the chat speaker).
 * @param {string} [args.name] The recipe/component/task name (chat flavor + dialog subtitle).
 * @param {string} args.activity Human-readable activity label ("Crafting" / "Salvage" / "Gathering").
 * @param {number} [args.dc] The DC surfaced to the prompt + flavor when finite.
 * @param {string} [args.img] The subject icon shown in the dialog header.
 * @returns {object} rollOptions for `evaluateCheckRoll`.
 */
export function buildInteractiveRollOptions({ interactive, actor, name, activity, dc, img }) {
  const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
  const flavor = `${name ? `${name} — ` : ''}${activity} check${dcLabel}`;
  return {
    interactive: interactive === true,
    prompt: promptCheckRoll,
    rollMode: globalThis.game?.settings?.get?.('core', 'rollMode'),
    flavor,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
    dc,
    name,
    activity,
    img,
  };
}

/**
 * Minimal HTML escaper for interpolated user/authored content (recipe names,
 * formulas). Mirrors the helper in `src/canvas/environmentDialog.js`.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
