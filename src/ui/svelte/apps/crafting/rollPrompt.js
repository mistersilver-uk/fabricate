/**
 * System-agnostic interactive roll-prompt dialog for Fabricate checks.
 *
 * Fabricate supports many game systems (dnd5e / pf2e / …) and has no
 * system-specific roll API, so this dialog is deliberately generic: it confirms
 * the roll, shows the DC and the (optionally @-resolved) formula, and offers a
 * single free-form "Situational bonus" input that is appended to the formula
 * before it is rolled. The actual rolling + chat posting happens in
 * `evaluateCheckRoll` (`src/systems/checkRoll.js`); this module only gathers the
 * player's confirm/cancel choice and their optional modifier.
 *
 * Built on Foundry V13 `foundry.applications.api.DialogV2` (matching the
 * `DialogV2.wait` button-callback style used elsewhere in the repo — see
 * `src/config/repairComponentSources.js`). When DialogV2 is unavailable
 * (headless/tests) it resolves `{ confirmed: true }` so nothing blocks.
 */

/**
 * Prompt the player to confirm an interactive check roll.
 *
 * @param {object} args
 * @param {string} [args.formula] The authored roll formula (with `@` placeholders).
 * @param {string|null} [args.resolvedFormula] The `@`-resolved formula for display
 *   (preferred over `formula` when present).
 * @param {number} [args.dc] The check DC; only shown when finite.
 * @param {string} [args.label] A human-readable label (e.g. "Iron Sword — Crafting check").
 * @returns {Promise<{confirmed: true, bonus: string|null, rollMode: string|undefined}
 *   | {confirmed: false}>}
 *   `{ confirmed: true, … }` when the player clicks Roll (bonus is the trimmed
 *   situational-modifier string, or null when blank), `{ confirmed: false }` on
 *   Cancel or when the dialog is dismissed.
 */
export async function promptCheckRoll({ formula, resolvedFormula, dc, label } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  // Headless / no dialog API (tests): do not block the roll.
  if (!DialogV2?.wait) return { confirmed: true };

  const defaultRollMode = globalThis.game?.settings?.get?.('core', 'rollMode');
  const displayFormula = resolvedFormula || formula || '';

  // The label is the dialog window title (below), so it is not repeated in the
  // body — only the DC, formula, and situational-bonus input live in the content.
  const lines = [];
  if (Number.isFinite(dc)) {
    lines.push(`<p class="fabricate-roll-prompt-dc">DC ${escapeHtml(String(dc))}</p>`);
  }
  if (displayFormula) {
    lines.push(
      `<p class="fabricate-roll-prompt-formula"><code>${escapeHtml(displayFormula)}</code></p>`
    );
  }
  lines.push(
    `<label class="fabricate-roll-prompt-bonus">Situational bonus` +
      `<input type="text" name="situationalBonus" inputmode="text" placeholder="e.g. 2" autofocus /></label>`
  );
  const content = `<div class="fabricate-roll-prompt">${lines.join('')}</div>`;

  const result = await DialogV2.wait({
    window: { title: label || 'Roll check' },
    content,
    rejectClose: false,
    buttons: [
      {
        action: 'roll',
        default: true,
        label: 'Roll',
        callback: (_event, button) => {
          const raw = button?.form?.elements?.situationalBonus?.value ?? '';
          // Normalize: trim, strip a single leading `+` (so "+2" and "2" both mean
          // a +2 modifier appended as `+ (2)`), and treat empty as no bonus.
          const bonus = String(raw)
            .replace(/^\s*\+/, '')
            .trim();
          return {
            confirmed: true,
            bonus: bonus === '' ? null : bonus,
            rollMode: defaultRollMode ?? undefined,
          };
        },
      },
      {
        action: 'cancel',
        label: 'Cancel',
        callback: () => ({ confirmed: false }),
      },
    ],
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
 * @param {string} [args.name] The recipe/component/task name for the chat flavor.
 * @param {string} args.activity Human-readable activity label ("Crafting" / "Salvage" / "Gathering").
 * @param {number} [args.dc] The DC surfaced to the prompt + flavor when finite.
 * @returns {object} rollOptions for `evaluateCheckRoll`.
 */
export function buildInteractiveRollOptions({ interactive, actor, name, activity, dc }) {
  const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
  const flavor = `${name ? `${name} — ` : ''}${activity} check${dcLabel}`;
  return {
    interactive: interactive === true,
    prompt: promptCheckRoll,
    rollMode: globalThis.game?.settings?.get?.('core', 'rollMode'),
    flavor,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
    dc,
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
