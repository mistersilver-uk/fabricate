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
 *
 * ## Two dialogs, one set of shared leaves
 *
 * {@link promptCheckRoll} answers for ONE subject; {@link promptBulkCheckRoll} answers
 * once for a whole batch (issue 859). They are deliberately separate exports rather
 * than one function behind a `bulk` flag: `promptCheckRoll`'s body is already a dense
 * conditional matrix (formula / DC / `playerPicks` / advantage), and a batch has NO
 * single formula and NO single DC to render, so a flag would add a fourth axis whose
 * every branch turns other branches off. What they genuinely share — the die row, the
 * situational-bonus input, the roll-mode picker, the form reader and the footer buttons
 * — is extracted into the leaves below, so the two dialogs cannot drift on the fields
 * `evaluateCheckRoll` reads.
 *
 * ## Everything emitted here passes through Foundry's `cleanHTML`
 *
 * `cleanHTML` is a TAG AND ATTRIBUTE ALLOWLIST, not an escaper: an attribute outside
 * the list is stripped silently, and so is every inline `on*` handler. So these builders
 * emit only allowlisted tags/attributes, and all state is read in the button callback
 * through `button.form.elements` rather than from a handler that would never survive.
 *
 * The one piece of live behaviour here — holding a multi-pick modifier group at its cap
 * ({@link bindModifierPickCap}) — is wired from `DialogV2.wait`'s `render` callback for
 * exactly that reason: it binds listeners to the already-sanitised DOM, so nothing about
 * it depends on an attribute surviving the allowlist.
 */

/**
 * Fabricate's roll modes with i18n keys + English fallbacks, in the order the
 * Roll Mode picker lists them (mirrors Foundry core's `CONFIG.Dice.rollModes`).
 *
 * ## The vocabulary here is deliberately the LEGACY one
 *
 * `publicroll | gmroll | blindroll | selfroll`. Foundry V14 introduces a disjoint
 * message-mode vocabulary (`public | gm | blind | self | ic`), and migrating this picker
 * is its own change with its own V13 verification burden (issue 1043). Keeping the
 * legacy token here is what lets the aggregate bulk card and the N dice messages carry
 * the SAME token on both Foundry versions — the dice through `Roll#toMessage`'s own
 * `_mapLegacyRollMode`, the card through the poster's version edge using the identical
 * map — so card visibility and dice visibility cannot diverge.
 *
 * Do NOT read `core.messageMode` as a fallback: `ClientSettings#assertSetting` THROWS
 * for an unregistered key on V13, and `??` does not catch a throw.
 */
const ROLL_MODE_CHOICES = Object.freeze([
  ['publicroll', 'CHAT.RollPublic', 'Public Roll'],
  ['gmroll', 'CHAT.RollPrivate', 'Private GM Roll'],
  ['blindroll', 'CHAT.RollBlind', 'Blind GM Roll'],
  ['selfroll', 'CHAT.RollSelf', 'Self Roll'],
]);

/**
 * The check-modifier catalogue's own default icon class (mirrors
 * `CraftingModifierCatalogueCard.svelte`'s `DEFAULT_MODIFIER_ICON`). An option whose
 * catalogue entry carries no icon still renders an `<i>` with this class: the modifier
 * row is a flex row, so omitting the element would collapse the icon gutter and start
 * that option's label ~1.1rem left of its siblings.
 */
const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';

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

/* -------------------------------------------------------------------------- */
/* The `playerPicks` modifier choice (issues 770, 1055).                       */
/* -------------------------------------------------------------------------- */

/**
 * The prompt-facing plan for a `modifierChoice` descriptor: the options to render, how
 * many of them the player may take, and which to open pre-selected.
 *
 * `maxPicks` is clamped into `[1, options.length]` and DEFAULTS TO 1 when the descriptor
 * carries no usable cap, so a descriptor built before `playerPicks` became multi-pick
 * still renders the single-select radio group it was written for. `defaultSelectedIds`
 * falls back to the legacy singular `defaultSelectedId` for the same reason, and is
 * truncated to the cap so the dialog can never OPEN in a state it forbids.
 *
 * @param {{modifiers?: Array<object>, maxPicks?: number, defaultSelectedIds?: string[],
 *   defaultSelectedId?: string}|null|undefined} modifierChoice
 * @returns {{options: Array<object>, maxPicks: number, defaultSelectedIds: string[]}}
 */
function planModifierChoice(modifierChoice) {
  const options = Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [];
  const rawCap = Number(modifierChoice?.maxPicks);
  const cap = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1;
  const maxPicks = Math.max(Math.min(cap, options.length), 1);
  const rawDefaults = Array.isArray(modifierChoice?.defaultSelectedIds)
    ? modifierChoice.defaultSelectedIds
    : [modifierChoice?.defaultSelectedId];
  const defaultSelectedIds = rawDefaults
    .filter((id) => typeof id === 'string' && id !== '')
    .slice(0, maxPicks);
  return { options, maxPicks, defaultSelectedIds };
}

/**
 * Read the checked modifier ids off a submitted form field.
 *
 * The field is a same-named group, so it arrives as a `RadioNodeList` — and
 * `RadioNodeList#value` is specified to inspect RADIO inputs only, returning `''` for a
 * checkbox group however many boxes are ticked. Reading `.value` alone would therefore
 * report "nothing picked" for every multi-pick roll, so the entries are walked and their
 * `checked` flags read directly.
 *
 * The return distinguishes two cases a single array cannot:
 *
 * - `[]` — the field was present and the player checked NOTHING. A deliberate empty
 *   selection, which `evaluateCheckRoll` reduces to 0.
 * - `null` — no answer is readable (the field is absent, or it is a bare `{ value }`
 *   stand-in with nothing in it). The caller then opens the descriptor's pre-selection,
 *   which is what the headless/no-form path has always done.
 *
 * @param {object|null|undefined} field `button.form.elements.craftingModifier`.
 * @returns {string[]|null}
 */
function readSelectedModifierIds(field) {
  if (!field) return null;
  const entries = typeof field.length === 'number' ? [...field] : [field];
  const checkable = entries.filter((entry) => typeof entry?.checked === 'boolean');
  if (checkable.length > 0) {
    return checkable.filter((entry) => entry.checked).map((entry) => String(entry.value ?? ''));
  }
  // No `checked` flags to read (a headless form stand-in): fall back to a plain value,
  // and report an empty one as "no answer" rather than as an empty selection.
  const value = field.value;
  return value ? [String(value)] : null;
}

/**
 * Hold a multi-pick modifier fieldset at its cap by disabling the unchecked boxes once
 * `maxPicks` are ticked, and releasing them again when one is cleared.
 *
 * This runs from `DialogV2.wait`'s `render` callback rather than from markup, because
 * everything this module emits passes through `cleanHTML`, which strips every inline
 * `on*` handler — an attribute-based guard would be silently deleted and the cap would
 * read as enforced while doing nothing.
 *
 * It is a UI affordance, not the invariant: `evaluateCheckRoll` re-imposes the same cap
 * on whatever the prompt returns, so a selection that gets past this (an out-of-date
 * client, a scripted submit) is still truncated before it reaches the formula.
 *
 * @param {object|null|undefined} dialog The rendered dialog (or its element).
 * @param {number} maxPicks
 * @returns {void}
 */
function bindModifierPickCap(dialog, maxPicks) {
  const root = dialog?.element ?? dialog;
  const inputs = [...(root?.querySelectorAll?.('input[name="craftingModifier"]') ?? [])];
  if (inputs.length === 0) return;
  const sync = () => {
    const checked = inputs.filter((input) => input.checked).length;
    for (const input of inputs) input.disabled = !input.checked && checked >= maxPicks;
  };
  for (const input of inputs) input.addEventListener('change', sync);
  sync();
}

/**
 * One modifier row: the control, the icon slot, the label and the signed value chip.
 *
 * The icon slot and the chip are ALWAYS emitted (see {@link DEFAULT_MODIFIER_ICON}): the
 * row is a flex row, so an icon-less or value-less catalogue entry that omitted either
 * would collapse its gutter and misalign against its siblings.
 *
 * THE CHIP PREFERS THE DESCRIPTOR'S OWN `display` (issue 1118). A check modifier may roll,
 * and a rolling one's `value` is `null` while its `average` is a number the roll can never
 * produce — a `1d4` chipped as `+2.5` would be a promise the dice cannot keep. The resolver
 * builds `display` (`+1d4`, `+min(max(1d8, -1), 6)`, or the signed number for a flat entry)
 * beside the resolution it describes, so the chip and the appended term are one derivation.
 * {@link formatSigned} remains the fallback for a descriptor built before that field.
 *
 * @param {{id?: string, label?: string, icon?: string, value?: unknown, display?: unknown}} modifier
 * @param {{inputType: 'radio'|'checkbox', preSelected: Set<string>, unnamedLabel: string}} context
 * @returns {string}
 */
function renderModifierOption(modifier, { inputType, preSelected, unnamedLabel }) {
  const id = escapeHtml(modifier?.id ?? '');
  const checked = preSelected.has(modifier?.id) ? ' checked' : '';
  const iconClass = modifier?.icon || DEFAULT_MODIFIER_ICON;
  const iconHtml = `<i class="fabricate-roll-prompt__modifier-icon ${escapeHtml(iconClass)}" aria-hidden="true"></i>`;
  // The catalogue editor creates entries with an empty label and never forces a value,
  // so an unnamed modifier would otherwise render as icon + chip only and announce as
  // bare "+3". Fall back to a localized placeholder name.
  const label = modifier?.label || unnamedLabel;
  const chipText =
    typeof modifier?.display === 'string' && modifier.display !== ''
      ? modifier.display
      : formatSigned(modifier?.value);
  const chip = `<span class="fabricate-roll-prompt__modifier-value">${escapeHtml(chipText)}</span>`;
  return (
    `<label class="fabricate-roll-prompt__modifier-option">` +
    `<input type="${inputType}" name="craftingModifier" value="${id}"${checked} />` +
    `${iconHtml}<span class="fabricate-roll-prompt__modifier-label">${escapeHtml(label)}</span>${chip}</label>`
  );
}

/**
 * The "Check modifier" fieldset: one row per eligible modifier, opened on the
 * descriptor's pre-selection.
 *
 * The control TYPE follows the cap, because the two say different things to the player
 * and a checkbox that behaves like a radio is a lie about the control: at `maxPicks === 1`
 * this is the pick-one radio group it has always been, and above 1 it is a checkbox group
 * whose legend states the bound in words ("Pick up to 3"). The bound is also enforced
 * live by {@link bindModifierPickCap} — and again, authoritatively, in
 * `evaluateCheckRoll`, since a UI control's constraint is never the invariant.
 *
 * @param {{options: Array<object>, maxPicks: number, defaultSelectedIds: string[]}} plan
 * @returns {string} Empty when there is nothing to offer.
 */
function renderModifierFieldset({ options, maxPicks, defaultSelectedIds }) {
  if (options.length === 0) return '';
  const multiPick = maxPicks > 1;
  const context = {
    inputType: multiPick ? 'checkbox' : 'radio',
    preSelected: new Set(defaultSelectedIds),
    unnamedLabel: localize('FABRICATE.App.RollPrompt.UnnamedModifier', 'Unnamed modifier'),
  };
  const optionsHtml = options.map((modifier) => renderModifierOption(modifier, context)).join('');
  const legend = escapeHtml(localize('FABRICATE.App.RollPrompt.CheckModifier', 'Check modifier'));
  // The cap has to be legible BEFORE the player runs into it: a box that silently stops
  // responding reads as a broken dialog, whereas "Pick up to 3" explains the disabling.
  // Single-pick renders no hint — a radio group already says "one" by construction.
  const hint = multiPick
    ? `<span class="fabricate-roll-prompt__modifiers-hint">${escapeHtml(
        localize('FABRICATE.App.RollPrompt.PickUpTo', 'Pick up to {count}').replace(
          '{count}',
          String(maxPicks)
        )
      )}</span>`
    : '';
  return (
    `<fieldset class="fabricate-roll-prompt__modifiers">` +
    `<legend class="fabricate-roll-prompt__modifiers-legend">${legend}${hint}</legend>` +
    `${optionsHtml}</fieldset>`
  );
}

/* -------------------------------------------------------------------------- */
/* Shared leaves — used by BOTH dialogs and by `buildInteractiveRollOptions`.  */
/* -------------------------------------------------------------------------- */

/**
 * The client's configured default roll mode, as a STRING.
 *
 * `?? ''` so this types as a string rather than possibly-undefined: SonarCloud's
 * inference otherwise reads the `value === defaultRollMode` comparison in the picker as
 * always-false (S3403), because the value is reached through optional chaining on an
 * untyped Foundry global.
 *
 * That normalization is now shared with `buildInteractiveRollOptions`, which previously
 * read the same setting WITHOUT the coalesce and could therefore emit `undefined` where
 * this emits `''`. Unifying has to pick one, and `''` is the safe pick because the two
 * are equivalent everywhere downstream: `evaluateCheckRoll` gates on
 * `if (choice.rollMode)` and `Roll#toMessage` gates on `if (rollMode)`, so an empty
 * string and an absent value both mean "use the client default". Recorded here so
 * neither a later editor "restores" the difference nor a reviewer reads it as drift.
 *
 * Never falls back to `core.messageMode` — see {@link ROLL_MODE_CHOICES}.
 *
 * @returns {string}
 */
function readDefaultRollMode() {
  return globalThis.game?.settings?.get?.('core', 'rollMode') ?? '';
}

/**
 * The die glyph row: a d20 for an advantage-eligible check, else a generic die.
 * Decorative — hidden from assistive tech (the formula/DC, or the batch heading, carry
 * the meaning).
 *
 * @param {boolean} allowAdvantage
 * @returns {string}
 */
function renderDieRow(allowAdvantage) {
  const dieIcon = allowAdvantage === true ? 'fa-dice-d20' : 'fa-dice';
  return `<div class="fabricate-roll-prompt__die"><i class="fa-solid ${dieIcon}" aria-hidden="true"></i></div>`;
}

/**
 * The free-form situational-bonus input.
 *
 * No `inputmode` attribute: `cleanHTML`'s `input` allowlist does not carry one, so the
 * `inputmode="text"` this markup used to emit was stripped before it ever reached the
 * DOM. It is dropped rather than kept as decoration.
 *
 * @returns {string}
 */
function renderBonusInput() {
  return (
    `<input class="fabricate-roll-prompt__bonus" type="text" name="situationalBonus" ` +
    `aria-label="Situational Bonus" placeholder="Situational Bonus?" autofocus />`
  );
}

/**
 * The Configuration section with the Roll Mode picker.
 *
 * @param {string} defaultRollMode The client default, pre-selected.
 * @returns {string}
 */
function renderRollModePicker(defaultRollMode) {
  const rollModeOptions = ROLL_MODE_CHOICES.map(([value, key, fallback]) => {
    const selected = value === defaultRollMode ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(localize(key, fallback))}</option>`;
  }).join('');
  return (
    `<div class="fabricate-roll-prompt__config">` +
    `<p class="fabricate-roll-prompt__config-heading">Configuration</p>` +
    `<label>Roll Mode <select name="rollMode">${rollModeOptions}</select></label>` +
    `</div>`
  );
}

/**
 * Read the fields both dialogs share off a clicked button's form: normalize the
 * situational bonus (strip one leading `+`, trim, empty → null), read the chosen roll
 * mode, and tag the advantage disposition the button represents.
 *
 * @param {object} button The DialogV2 button the player clicked.
 * @param {string} defaultRollMode The client default, used when the field is absent.
 * @param {'advantage'|'normal'|'disadvantage'} advantage
 * @returns {{confirmed: true, bonus: string|null, rollMode: string|undefined,
 *   advantage: 'advantage'|'normal'|'disadvantage'}}
 */
function readSharedRollChoice(button, defaultRollMode, advantage) {
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
}

/**
 * The footer: three Advantage / Normal / Disadvantage buttons when the check can honour
 * them, else a single Roll. `readChoice` is the caller's reader so each dialog can
 * decorate the shared choice with its own extra fields.
 *
 * @param {boolean} allowAdvantage
 * @param {(button: object, advantage: string) => object} readChoice
 * @returns {object[]} DialogV2 button descriptors.
 */
function buildRollButtons(allowAdvantage, readChoice) {
  if (allowAdvantage === true) {
    return [
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
    ];
  }
  return [
    {
      action: 'roll',
      default: true,
      label: 'Roll',
      callback: (_event, button) => readChoice(button, 'normal'),
    },
  ];
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
 * @param {{modifiers: Array<{id:string,label:string,icon:string,value:number}>,
 *   maxPicks: number, defaultSelectedIds: string[], defaultSelectedId: string}}
 *   [args.modifierChoice] The interactive `playerPicks` descriptor (issues 770, 1055).
 *   When present, a "Check modifier" fieldset is rendered (icon + label + value chip per
 *   option, `defaultSelectedIds` pre-checked) and `readChoice` returns the selection as
 *   `chosenModifierIds`. The control follows `maxPicks`: a pick-one radio group at 1, a
 *   capped checkbox group above it. Absent → no fieldset renders (byte-identical dialog).
 * @returns {Promise<{confirmed: true, bonus: string|null, rollMode: string|undefined,
 *   advantage: 'advantage'|'normal'|'disadvantage', chosenModifierIds?: string[],
 *   chosenModifierId?: string} | {confirmed: false}>}
 *   `{ confirmed: true, … }` when the player rolls; `{ confirmed: false }` on
 *   Cancel (window close / Escape) or dismissal. `chosenModifierIds` is the selection;
 *   `chosenModifierId` is its first entry, kept so a single-pick consumer's contract is
 *   unchanged — it mirrors the descriptor's own `defaultSelectedId`/`defaultSelectedIds`
 *   pairing and is meaningful only at a cap of 1.
 */
export async function promptCheckRoll({
  formula,
  resolvedFormula,
  dc,
  name,
  activity,
  img,
  allowAdvantage,
  modifierChoice,
} = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  const {
    options: modifierOptions,
    maxPicks,
    defaultSelectedIds,
  } = planModifierChoice(modifierChoice);
  // Headless / no dialog API (tests): do not block the roll. When a `playerPicks`
  // choice was offered, confirm with the pre-selected default so the deferred modifier
  // term still resolves to the value an optimally-playing player would have picked.
  if (!DialogV2?.wait) {
    return modifierChoice
      ? {
          confirmed: true,
          chosenModifierIds: defaultSelectedIds,
          ...(defaultSelectedIds.length > 0 && { chosenModifierId: defaultSelectedIds[0] }),
        }
      : { confirmed: true };
  }

  const defaultRollMode = readDefaultRollMode();
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

  const dieHtml = renderDieRow(allowAdvantage);

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

  // Interactive `playerPicks` (issues 770, 1055): a fieldset of the eligible modifiers
  // (icon + label + signed value chip), opened on the best legal pre-selection. Only
  // rendered when a `modifierChoice` descriptor is supplied — every other roll leaves
  // this empty, so the dialog is byte-identical. The formula line ends in a NEUTRAL
  // trailing `+ (modifier)[Modifiers]` term (appended by `evaluateCheckRoll`), not a
  // default number a non-default pick would contradict; the per-option chips carry each
  // option's value and the posted roll reflects the SUM of the player's final selection.
  const modifierChoiceHtml = renderModifierFieldset({
    options: modifierOptions,
    maxPicks,
    defaultSelectedIds,
  });

  const bonusHtml = renderBonusInput();
  const configHtml = renderRollModePicker(defaultRollMode);

  // Die glyph on its own row ABOVE the icon + name row, then the formula/DC,
  // situational bonus, and configuration.
  const content =
    `<div class="fabricate-roll-prompt">` +
    `${dieHtml}${headerHtml}${formulaHtml}${modifierChoiceHtml}${bonusHtml}${configHtml}</div>`;

  // The shared reader owns bonus/roll-mode/advantage; this path adds the one field
  // that is unique to it.
  const readChoice = (button, advantage) => {
    const choice = readSharedRollChoice(button, defaultRollMode, advantage);
    // Interactive `playerPicks`: the checked controls' values are the chosen modifier
    // ids; fall back to the pre-selection when no answer is readable (headless). Only
    // added when a modifier choice was offered, so the non-`playerPicks` choice object
    // is byte-identical. The cap is re-applied here as well as in the live control
    // binding, so a submit that bypassed the binding cannot over-report.
    if (modifierOptions.length > 0) {
      const selected = readSelectedModifierIds(button?.form?.elements?.craftingModifier);
      const ids = (selected ?? defaultSelectedIds).slice(0, maxPicks);
      choice.chosenModifierIds = ids;
      // The legacy singular field, mirroring the descriptor's own
      // `defaultSelectedId = defaultSelectedIds[0]`. Omitted for an empty selection so
      // it is never present-but-undefined.
      if (ids.length > 0) choice.chosenModifierId = ids[0];
    }
    return choice;
  };

  const buttons = buildRollButtons(allowAdvantage, readChoice);

  const result = await DialogV2.wait({
    window: { title: `${activityLabel} check` },
    classes: ['fabricate', 'fabricate-dialog', 'fabricate-roll-prompt-dialog'],
    content,
    rejectClose: false,
    buttons,
    // Attached only for a multi-pick fieldset, so every other dialog's config stays
    // byte-identical and no `render` hook runs where there is nothing to bound.
    ...(modifierOptions.length > 0 &&
      maxPicks > 1 && {
        render: (_event, dialog) => bindModifierPickCap(dialog, maxPicks),
      }),
  }).catch(() => ({ confirmed: false }));

  // A dismissed dialog (rejectClose:false) resolves to null → treat as cancel.
  if (!result || result.confirmed !== true) return { confirmed: false };
  return result;
}

/**
 * How many subject thumbnails the strip shows before it collapses the rest into a
 * "+K more" chip. Eight is what fits one row at the dialog's shipped width without
 * wrapping; the cap exists so a 25-item batch does not push the bonus input and the
 * roll-mode picker below the fold, where the player would answer a prompt they cannot
 * see the controls for.
 */
const BULK_SUBJECT_STRIP_LIMIT = 8;

/**
 * The thumbnail a subject with no authored image falls back to.
 *
 * Spelled locally rather than imported, matching `BulkSalvageChatCard.js`: this module
 * is a string builder handed to `DialogV2` and deliberately imports nothing, so it does
 * not drag a UI utility graph into every consumer that only wanted a roll prompt.
 */
const BULK_SUBJECT_FALLBACK_IMG = 'icons/svg/item-bag.svg';

/**
 * Prompt the player ONCE for a whole batch of checks (issue 859).
 *
 * ## What it deliberately does NOT show
 *
 * **No formula and no DC.** A batch has no single subject: each item rolls its OWN
 * system's formula against its own DC / tiers / stages, and nothing about a bulk answer
 * is shared across those rolls except the three fields below. Rendering one item's
 * formula would be a claim about the other twenty-four, and rendering all of them would
 * be a wall of text the player cannot act on. The subject strip is what tells them what
 * they are about to roll for.
 *
 * ## What the answer applies to
 *
 * The situational bonus, the roll mode AND the advantage disposition apply to EVERY
 * roll in the batch — an accepted consequence of the one-prompt design, so the note in
 * the body says it in words rather than leaving the player to infer it from a `+2` that
 * lands twenty-five times.
 *
 * `allowAdvantage` is computed by the caller (`BulkSalvageService`) over the AUTHORED
 * formulas, all-or-nothing: offering Advantage that only some rolls could honour would
 * be a lie about half the batch.
 *
 * @param {object} args
 * @param {boolean} [args.allowAdvantage] When true, offer Advantage / Normal /
 *   Disadvantage; else a single Roll.
 * @param {number} [args.count] How many items the batch will roll for. Defaults to the
 *   number of subjects, so a caller that passes only `subjects` still reads correctly.
 * @param {Array<{name?: string, img?: string}>} [args.subjects] The batch's subjects, in
 *   the order the player queued them.
 * @returns {Promise<{confirmed: true, bonus: string|null, rollMode: string|undefined,
 *   advantage: 'advantage'|'normal'|'disadvantage'} | {confirmed: false}>}
 *   `{ confirmed: false }` on dismissal, matching {@link promptCheckRoll}, because
 *   `DialogV2.wait` with the default `rejectClose = false` resolves `result ?? null` on
 *   BOTH Escape and the window X — neither rejects, so a `catch` alone cannot see them.
 */
export async function promptBulkCheckRoll({ allowAdvantage, count, subjects } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  // Headless / no dialog API (tests): do not block the run. `advantage: 'normal'` is
  // supplied so a headless caller threads the same shape a confirmed click produces.
  if (!DialogV2?.wait) {
    return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
  }

  const defaultRollMode = readDefaultRollMode();
  const rows = Array.isArray(subjects) ? subjects : [];
  const total = Number.isFinite(count) ? count : rows.length;

  // The frame title carries no count — the body heading does, and repeating it in the
  // window chrome buys nothing on a dialog this small.
  const title = localize('FABRICATE.App.RollPrompt.BulkTitle', 'Bulk check');
  const heading = escapeHtml(
    localize('FABRICATE.App.RollPrompt.BulkHeading', 'One roll setting for {count} items').replace(
      '{count}',
      String(total)
    )
  );
  const headerHtml =
    `<div class="fabricate-roll-prompt__header">` +
    `<div class="fabricate-roll-prompt__titles">` +
    `<h2 class="fabricate-roll-prompt__title">${heading}</h2>` +
    `</div></div>`;

  // The strip, then the overflow chip. Both branches are single expressions on purpose:
  // a combined `shown.length < rows.length ? … : ''` nested inside the thumb map would
  // be the nested ternary SonarCloud flags in this file, which ESLint does not reach.
  const shown = rows.slice(0, BULK_SUBJECT_STRIP_LIMIT);
  const hidden = rows.length - shown.length;
  const thumbsHtml = shown
    .map((subject) => {
      const src = escapeHtml(subject?.img || BULK_SUBJECT_FALLBACK_IMG);
      // The name is the thumbnail's ALT text rather than a caption: eight captions do
      // not fit the row, but a screen-reader user still needs to know what is queued.
      return `<img class="fabricate-roll-prompt__subject" src="${src}" alt="${escapeHtml(subject?.name || '')}" />`;
    })
    .join('');
  const moreLabel = escapeHtml(
    localize('FABRICATE.App.RollPrompt.BulkMore', '+{count} more').replace(
      '{count}',
      String(hidden)
    )
  );
  const moreHtml =
    hidden > 0 ? `<span class="fabricate-roll-prompt__subjects-more">${moreLabel}</span>` : '';
  const subjectsHtml =
    rows.length > 0
      ? `<div class="fabricate-roll-prompt__subjects">${thumbsHtml}${moreHtml}</div>`
      : '';

  const noteHtml =
    `<p class="fabricate-roll-prompt__bulk-note">` +
    `${escapeHtml(
      localize(
        'FABRICATE.App.RollPrompt.BulkNote',
        'The situational bonus, roll mode and advantage apply to every roll in this batch.'
      )
    )}</p>`;

  const content =
    `<div class="fabricate-roll-prompt">` +
    `${renderDieRow(allowAdvantage)}${headerHtml}${subjectsHtml}` +
    `${renderBonusInput()}${renderRollModePicker(defaultRollMode)}${noteHtml}</div>`;

  const buttons = buildRollButtons(allowAdvantage, (button, advantage) =>
    readSharedRollChoice(button, defaultRollMode, advantage)
  );

  const result = await DialogV2.wait({
    window: { title },
    classes: ['fabricate', 'fabricate-dialog', 'fabricate-roll-prompt-dialog'],
    content,
    rejectClose: false,
    buttons,
  }).catch(() => ({ confirmed: false }));

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
 * @param {{modifiers: Array, maxPicks: number, defaultSelectedIds: string[],
 *   defaultSelectedId: string}} [args.modifierChoice] The deferred interactive
 *   `playerPicks` descriptor (issues 770, 1055); forwarded to `evaluateCheckRoll` → the
 *   prompt. Omitted from the bag when absent, so every non-`playerPicks` path builds a
 *   byte-identical rollOptions object.
 * @returns {object} rollOptions for `evaluateCheckRoll`.
 */
export function buildInteractiveRollOptions({
  interactive,
  actor,
  name,
  activity,
  dc,
  img,
  modifierChoice,
}) {
  const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
  const flavor = `${name ? `${name} — ` : ''}${activity} check${dcLabel}`;
  const rollOptions = {
    interactive: interactive === true,
    prompt: promptCheckRoll,
    // Shared with the dialog since issue 859 — see `readDefaultRollMode` for why this
    // read now normalizes an absent setting to `''` rather than leaving it `undefined`.
    rollMode: readDefaultRollMode(),
    flavor,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
    dc,
    name,
    activity,
    img,
  };
  // Only attach the choice when a `playerPicks` descriptor exists, so a non-playerPicks
  // craft's rollOptions bag stays byte-identical (no stray `modifierChoice` key).
  if (modifierChoice) rollOptions.modifierChoice = modifierChoice;
  return rollOptions;
}

/**
 * Format a modifier value as a signed chip label (`+3`, `+0`, `-2`) — zero renders as
 * `+0`, matching the sign every other non-negative value carries. A missing or
 * non-finite value renders as an unsigned `0`; this is the ONLY fallback for that case
 * (the caller always renders a chip, so the row's icon/label/chip columns stay aligned).
 * @param {unknown} value
 * @returns {string}
 */
function formatSigned(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num >= 0 ? `+${num}` : String(num);
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
