/**
 * Pre-craft confirmation dialog content builder (issue 61).
 *
 * Crafting a recipe is immediately destructive — the engine consumes the
 * ingredients and mutates Items directly — so the player Crafting tab interposes
 * a confirmation dialog before dispatching the craft. This module builds the
 * dialog BODY as an escaped-HTML string; the store (`craftingStore.svelte.js`)
 * routes it through the `services.confirmDialog` seam onto Foundry V13
 * `DialogV2.confirm`.
 *
 * Deliberately Foundry-free and dependency-light: it reads only the plain view
 * model the recipe detail pane already renders (`craftability` states + the
 * body-appropriate `result`), keeps a LOCAL `escapeHtml` (mirroring
 * `rollPrompt.js`) rather than importing a shared helper, and imports no
 * `models/` module, so it stays off the mounted-component harness graph and is
 * unit-testable in isolation.
 *
 * The "expected results" section is body-dependent and is supplied by the caller
 * (`CraftingView` builds it from the active recipe body):
 *   - simple / progressive → `result = recipe.result`
 *   - ingredient-routed     → `result = <selected set's routed result>`
 *   - check-routed          → `result = null`, `dependsOnRoll = true`, and the
 *                             tier list in `outcomeTiers` (output depends on the
 *                             roll, so no deterministic result is shown).
 */

/**
 * Localize a Foundry i18n key with an English fallback when the runtime (or a
 * headless test harness) cannot resolve it. Mirrors `rollPrompt.js`.
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function localize(key, fallback) {
  const resolved = globalThis.game?.i18n?.localize?.(key);
  return typeof resolved === 'string' && resolved && resolved !== key ? resolved : fallback;
}

/**
 * Minimal HTML escaper for interpolated authored content (recipe/component
 * names). Intentionally omits `'` (all attribute interpolations use double
 * quotes), identical to the helper in `rollPrompt.js`.
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

/**
 * A size-constrained thumbnail for a component/result icon. Width/height are set
 * inline so the icon can never blow out the DialogV2 body even before the scoped
 * stylesheet loads.
 * @param {string|null|undefined} src
 * @returns {string}
 */
function thumbHtml(src) {
  if (!src) return '';
  return (
    `<img class="fabricate-craft-confirm__thumb" src="${escapeHtml(src)}" ` +
    `alt="" width="28" height="28" />`
  );
}

/**
 * Ingredients-consumed section. The SALIENT number is the CONSUMED quantity
 * (`need` / `×N`) rendered as real text; the have/need availability is shown
 * secondarily. Real list semantics; the quantity is not `aria-hidden`.
 * @param {Array<object>} states
 * @returns {string}
 */
function ingredientsSection(states) {
  if (!Array.isArray(states) || states.length === 0) return '';
  const heading = localize('FABRICATE.App.Crafting.Confirm.IngredientsConsumed', 'Ingredients consumed');
  const rows = states
    .map((state) => {
      const name = escapeHtml(state?.name ?? state?.description ?? '');
      const need = Number(state?.need ?? 0);
      const have = Number(state?.have ?? 0);
      const availLabel = localize('FABRICATE.App.Crafting.Io.HaveOfNeed', '{have} of {need} in inventory');
      const availText = escapeHtml(
        availLabel.replace('{have}', String(have)).replace('{need}', String(need))
      );
      return (
        `<li class="fabricate-craft-confirm__item">` +
        thumbHtml(state?.img) +
        `<span class="fabricate-craft-confirm__name">${name}</span>` +
        `<span class="fabricate-craft-confirm__qty">&times;${escapeHtml(String(need))}</span>` +
        `<span class="fabricate-craft-confirm__avail">${availText}</span>` +
        `</li>`
      );
    })
    .join('');
  return (
    `<section class="fabricate-craft-confirm__section" data-confirm-section="ingredients">` +
    `<h4 class="fabricate-craft-confirm__section-title">${escapeHtml(heading)}</h4>` +
    `<ul class="fabricate-craft-confirm__list">${rows}</ul></section>`
  );
}

/**
 * Required-tools section. Tools are a prerequisite (not consumed); the salient
 * text is availability.
 * @param {Array<object>} states
 * @returns {string}
 */
function toolsSection(states) {
  if (!Array.isArray(states) || states.length === 0) return '';
  const heading = localize('FABRICATE.App.Crafting.Confirm.RequiredTools', 'Required tools');
  const availableLabel = localize('FABRICATE.App.Crafting.Io.Available', 'Available');
  const unavailableLabel = localize('FABRICATE.App.Crafting.Io.Unavailable', 'Unavailable');
  const rows = states
    .map((state) => {
      const name = escapeHtml(state?.name ?? '');
      const availText = escapeHtml(state?.available ? availableLabel : unavailableLabel);
      return (
        `<li class="fabricate-craft-confirm__item">` +
        thumbHtml(state?.img) +
        `<span class="fabricate-craft-confirm__name">${name}</span>` +
        `<span class="fabricate-craft-confirm__avail">${availText}</span>` +
        `</li>`
      );
    })
    .join('');
  return (
    `<section class="fabricate-craft-confirm__section" data-confirm-section="tools">` +
    `<h4 class="fabricate-craft-confirm__section-title">${escapeHtml(heading)}</h4>` +
    `<ul class="fabricate-craft-confirm__list">${rows}</ul></section>`
  );
}

/**
 * Required-essences section. Essences are a requirement track distinct from named
 * ingredients (labeled "required", never "consumed"); the salient text is the
 * required amount, with the owned amount secondary.
 * @param {Array<object>} states
 * @returns {string}
 */
function essencesSection(states) {
  if (!Array.isArray(states) || states.length === 0) return '';
  const heading = localize('FABRICATE.App.Crafting.Confirm.RequiredEssences', 'Required essences');
  const needLabel = localize('FABRICATE.App.Crafting.Io.Need', 'Need');
  const haveLabel = localize('FABRICATE.App.Crafting.Io.Have', 'Have');
  const rows = states
    .map((state) => {
      const name = escapeHtml(state?.name ?? state?.label ?? state?.type ?? state?.essenceType ?? '');
      const need = escapeHtml(String(Number(state?.need ?? 0)));
      const have = escapeHtml(String(Number(state?.have ?? 0)));
      return (
        `<li class="fabricate-craft-confirm__item">` +
        `<span class="fabricate-craft-confirm__name">${name}</span>` +
        `<span class="fabricate-craft-confirm__qty">${escapeHtml(needLabel)} ${need}</span>` +
        `<span class="fabricate-craft-confirm__avail">${escapeHtml(haveLabel)} ${have}</span>` +
        `</li>`
      );
    })
    .join('');
  return (
    `<section class="fabricate-craft-confirm__section" data-confirm-section="essences">` +
    `<h4 class="fabricate-craft-confirm__section-title">${escapeHtml(heading)}</h4>` +
    `<ul class="fabricate-craft-confirm__list">${rows}</ul></section>`
  );
}

/**
 * Render one produced-item list from a `result.items[]`-shaped array.
 * @param {Array<object>} items
 * @returns {string}
 */
function resultItemsList(items) {
  return items
    .map((item) => {
      const name = escapeHtml(item?.name ?? '');
      const qty = escapeHtml(String(item?.qty ?? item?.quantity ?? 1));
      return (
        `<li class="fabricate-craft-confirm__item">` +
        thumbHtml(item?.img) +
        `<span class="fabricate-craft-confirm__name">${name}</span>` +
        `<span class="fabricate-craft-confirm__qty">&times;${qty}</span>` +
        `</li>`
      );
    })
    .join('');
}

/**
 * Expected-results section. Body-dependent:
 *   - check-routed (`dependsOnRoll`) → tier list when `outcomeTiers` is supplied,
 *     otherwise an explicit "outcome depends on your roll" note (never a bogus
 *     deterministic result).
 *   - otherwise → the produced items when `result.items` is non-empty; nothing
 *     when there is no result (graceful omission).
 * @param {object} args
 * @returns {string}
 */
function resultsSection({ result, outcomeTiers, dependsOnRoll }) {
  const heading = localize('FABRICATE.App.Crafting.Confirm.ExpectedResults', 'Expected results');
  const open =
    `<section class="fabricate-craft-confirm__section" data-confirm-section="results">` +
    `<h4 class="fabricate-craft-confirm__section-title">${escapeHtml(heading)}</h4>`;

  if (dependsOnRoll === true) {
    const tiers = Array.isArray(outcomeTiers) ? outcomeTiers : [];
    if (tiers.length > 0) {
      const rows = tiers
        .map((tier) => {
          const names = escapeHtml((Array.isArray(tier?.names) ? tier.names : []).join(', '));
          const awards = Array.isArray(tier?.awardedResults) ? tier.awardedResults : [];
          const awardsHtml =
            awards.length > 0
              ? `<ul class="fabricate-craft-confirm__list">${resultItemsList(awards)}</ul>`
              : '';
          return (
            `<li class="fabricate-craft-confirm__tier" data-tier-success="${tier?.success ? 'true' : 'false'}">` +
            `<span class="fabricate-craft-confirm__tier-name">${names}</span>` +
            awardsHtml +
            `</li>`
          );
        })
        .join('');
      return `${open}<ul class="fabricate-craft-confirm__tiers">${rows}</ul></section>`;
    }
    const note = localize(
      'FABRICATE.App.Crafting.Confirm.DependsOnRoll',
      'The outcome depends on your roll.'
    );
    return `${open}<p class="fabricate-craft-confirm__note">${escapeHtml(note)}</p></section>`;
  }

  const items = Array.isArray(result?.items) ? result.items : [];
  if (items.length === 0) return '';
  return `${open}<ul class="fabricate-craft-confirm__list">${resultItemsList(items)}</ul></section>`;
}

/**
 * Build the pre-craft confirmation dialog body (issue 61) as an escaped-HTML
 * string. Leads with an irreversible-consumption warning, then summarizes what
 * the craft consumes and produces, and emits the "don't ask again" skip checkbox
 * as a named input INSIDE the content (DialogV2 wraps content + footer in one
 * `<form>`, so the store reads `button.form.elements.dontAskAgain`).
 *
 * @param {object} args
 * @param {string} [args.recipeName] The recipe being crafted (heading).
 * @param {object|null} [args.craftability] The selected set's craftability view
 *   model: `{ ingredientStates, toolStates, essenceStates }`.
 * @param {object|null} [args.result] The body-appropriate produced result
 *   (`{ items: [{ name, img, qty }] }`), or null for check-routed recipes.
 * @param {Array<object>} [args.outcomeTiers] Check-routed outcome tiers to list.
 * @param {boolean} [args.dependsOnRoll] True for check-routed recipes.
 * @returns {string} Escaped HTML for the DialogV2 body.
 */
export function buildCraftConfirmContent({
  recipeName,
  craftability,
  result,
  outcomeTiers,
  dependsOnRoll,
} = {}) {
  const warning = localize(
    'FABRICATE.App.Crafting.Confirm.ConsumeWarning',
    'Crafting permanently consumes the ingredients below. This cannot be undone.'
  );
  const skipLabel = localize('FABRICATE.App.Crafting.Confirm.DontAskAgain', "Don't ask me again");

  const headingHtml = recipeName
    ? `<h3 class="fabricate-craft-confirm__recipe">${escapeHtml(recipeName)}</h3>`
    : '';

  const warningHtml =
    `<p class="fabricate-craft-confirm__warning" role="note">` +
    `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ` +
    `${escapeHtml(warning)}</p>`;

  const ingredients = ingredientsSection(craftability?.ingredientStates);
  const tools = toolsSection(craftability?.toolStates);
  const essences = essencesSection(craftability?.essenceStates);
  const results = resultsSection({ result, outcomeTiers, dependsOnRoll });

  const skipHtml =
    `<label class="fabricate-craft-confirm__skip" for="fabricate-craft-confirm-skip">` +
    `<input type="checkbox" name="dontAskAgain" id="fabricate-craft-confirm-skip" />` +
    `<span>${escapeHtml(skipLabel)}</span></label>`;

  return (
    `<div class="fabricate-craft-confirm">` +
    headingHtml +
    warningHtml +
    ingredients +
    tools +
    essences +
    results +
    skipHtml +
    `</div>`
  );
}
