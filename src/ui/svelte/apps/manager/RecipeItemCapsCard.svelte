<!-- Svelte 5 runes mode -->
<!--
  Per-recipe-item caps card (issue 511). Authors ONE recipe item's use/learn
  economy on the Books & Scrolls per-item page: the use cap (craft charges), the
  learn cap, and the consume/destroy behaviour. Each recipe item owns its own caps
  (`recipeItemDefinition.caps`), so two books in one system can differ.

  LIVE-APPLY: every control passes only its own field to `onSaveCaps(patch)` as a
  `{ item }` / `{ learn }` partial; the store merges the rest from the persisted
  definition. There is no dirty draft and no route-exit guard.

  Props:
   - caps: the item's `{ item: { limitUses, maxUses, destroyWhenExhausted },
            learn: { consumeOnLearn, limitRecipes, maxRecipes, destroyWhenSpent } }`.
   - onSaveCaps(patch): live-apply a single-field caps patch.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    caps = {},
    onSaveCaps = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const limitUses = $derived(caps?.item?.limitUses === true);
  const maxUses = $derived(
    Number.isFinite(Number(caps?.item?.maxUses)) ? Number(caps.item.maxUses) : 1
  );
  const destroyWhenExhausted = $derived(caps?.item?.destroyWhenExhausted === true);
  const consumeOnLearn = $derived(caps?.learn?.consumeOnLearn !== false);
  const limitRecipes = $derived(caps?.learn?.limitRecipes === true);
  const maxRecipes = $derived(
    Number.isFinite(Number(caps?.learn?.maxRecipes)) ? Number(caps.learn.maxRecipes) : 1
  );
  const destroyWhenSpent = $derived(caps?.learn?.destroyWhenSpent === true);

  // Enabling a cap commits a concrete max (>= 1) alongside the flag; the runtime
  // treats an undefined max as unlimited, so a flag-only save would show "1" while
  // behaving as uncapped. Disabling clears the cap through the normalizer.
  function setLimitUses(next) {
    onSaveCaps({ item: next ? { limitUses: true, maxUses: Math.max(1, maxUses) } : { limitUses: false } });
  }

  function setLimitRecipes(next) {
    onSaveCaps({
      learn: next ? { limitRecipes: true, maxRecipes: Math.max(1, maxRecipes) } : { limitRecipes: false }
    });
  }

  function adjustMaxUses(delta) {
    onSaveCaps({ item: { maxUses: Math.max(1, maxUses + delta) } });
  }

  function adjustMaxRecipes(delta) {
    onSaveCaps({ learn: { maxRecipes: Math.max(1, maxRecipes + delta) } });
  }
</script>

{#snippet ruleToggle(dataField, ariaKey, ariaFallback, on, onToggle, disabled)}
  <button
    type="button"
    class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}${disabled ? ' is-disabled' : ''}`}
    aria-pressed={on}
    aria-label={text(ariaKey, ariaFallback)}
    disabled={disabled}
    {...{ [dataField]: true }}
    onclick={() => onToggle(!on)}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
    <span class="manager-status-toggle-label">{on
      ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
      : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
  </button>
{/snippet}

{#snippet ruleStepper(dataField, ariaKey, ariaFallback, decAriaKey, decAriaFallback, incAriaKey, incAriaFallback, value, onDec, onInc, onInput, disabled)}
  <div class="manager-recipe-visibility-stepper" {...{ [dataField]: true }}>
    <button type="button" class="manager-icon-button" disabled={disabled} aria-label={text(decAriaKey, decAriaFallback)} onclick={onDec}><i class="fas fa-minus" aria-hidden="true"></i></button>
    <input type="number" min="1" step="1" value={value} disabled={disabled} aria-label={text(ariaKey, ariaFallback)} oninput={onInput} />
    <button type="button" class="manager-icon-button" disabled={disabled} aria-label={text(incAriaKey, incAriaFallback)} onclick={onInc}><i class="fas fa-plus" aria-hidden="true"></i></button>
  </div>
{/snippet}

<section class="manager-inspector-card manager-recipe-item-caps" data-recipe-item-caps aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Rules', 'Recipe item rules')}>
  <div class="manager-inspector-title-row">
    <span class="manager-inspector-icon" aria-hidden="true"><i class="fas fa-sliders"></i></span>
    <div class="manager-inspector-copy">
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.BooksScrolls.RulesKicker', 'This item')}</p>
      <h3 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.BooksScrolls.Rules', 'Recipe item rules')}</h3>
    </div>
  </div>
  <p class="manager-muted">{text('FABRICATE.Admin.Manager.BooksScrolls.RulesHint', 'These rules apply to this recipe item. Changes apply immediately.')}</p>

  <div class="manager-rules-stack">
    <div class="manager-rule-row" data-books-scrolls-limit-uses-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-repeat"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.BooksScrolls.UseCap', 'Limited uses of recipe items')}</strong>
        <span>{text('FABRICATE.Admin.Manager.BooksScrolls.UseCapHint', 'Cap how many times this recipe item grants crafting access.')}</span>
      </span>
      <span class="manager-rule-field">
        {@render ruleToggle('data-books-scrolls-limit-uses', 'FABRICATE.Admin.Manager.BooksScrolls.UseCap', 'Limited uses of recipe items', limitUses, setLimitUses, false)}
      </span>
    </div>
    <div class="manager-rule-row" class:is-disabled={!limitUses} data-books-scrolls-max-uses-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-hashtag"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')}</strong>
      </span>
      <span class="manager-rule-field">
        {@render ruleStepper('data-books-scrolls-max-uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesDecrease', 'Decrease maximum uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesIncrease', 'Increase maximum uses', maxUses, () => adjustMaxUses(-1), () => adjustMaxUses(1), (event) => onSaveCaps({ item: { maxUses: Math.max(1, Number(event.target.value || 1)) } }), !limitUses)}
      </span>
    </div>
    <div class="manager-rule-row" class:is-disabled={!limitUses} data-books-scrolls-destroy-exhausted-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-trash"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted')}</strong>
      </span>
      <span class="manager-rule-field">
        {@render ruleToggle('data-books-scrolls-destroy-exhausted', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted', destroyWhenExhausted, (next) => onSaveCaps({ item: { destroyWhenExhausted: next } }), !limitUses)}
      </span>
    </div>

    <div class="manager-rule-row" data-books-scrolls-limit-recipes-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-graduation-cap"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.BooksScrolls.LearnCap', 'Limited recipes learned per item')}</strong>
        <span>{text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapHint', 'Cap how many recipes a player can learn from this recipe item.')}</span>
      </span>
      <span class="manager-rule-field">
        {@render ruleToggle('data-books-scrolls-limit-recipes', 'FABRICATE.Admin.Manager.BooksScrolls.LearnCap', 'Limited recipes learned per item', limitRecipes, setLimitRecipes, false)}
      </span>
    </div>
    <div class="manager-rule-row" class:is-disabled={!limitRecipes} data-books-scrolls-max-recipes-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-hashtag"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes')}</strong>
      </span>
      <span class="manager-rule-field">
        {@render ruleStepper('data-books-scrolls-max-recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesDecrease', 'Decrease maximum recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesIncrease', 'Increase maximum recipes', maxRecipes, () => adjustMaxRecipes(-1), () => adjustMaxRecipes(1), (event) => onSaveCaps({ learn: { maxRecipes: Math.max(1, Number(event.target.value || 1)) } }), !limitRecipes)}
      </span>
    </div>
    <div class="manager-rule-row" class:is-disabled={!limitRecipes} data-books-scrolls-destroy-spent-row>
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-trash"></i></span>
      <span class="manager-rule-copy">
        <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent')}</strong>
      </span>
      <span class="manager-rule-field">
        {@render ruleToggle('data-books-scrolls-destroy-spent', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent', destroyWhenSpent, (next) => onSaveCaps({ learn: { destroyWhenSpent: next } }), !limitRecipes)}
      </span>
    </div>

    <!-- Consume-on-learn is incompatible with a learn cap (it deletes the item on
         the first learn), so it is hidden while the cap is on — Destroy-when-spent
         replaces it. -->
    {#if !limitRecipes}
      <div class="manager-rule-row" data-books-scrolls-consume-on-learn-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn')}</strong>
          <span>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearnHint', 'Delete the recipe item when a player learns it.')}</span>
        </span>
        <span class="manager-rule-field">
          {@render ruleToggle('data-books-scrolls-consume-on-learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn', consumeOnLearn, (next) => onSaveCaps({ learn: { consumeOnLearn: next } }), false)}
        </span>
      </div>
    {/if}
  </div>
</section>

<style>
  .manager-recipe-item-caps {
    margin: 0;
  }

  .manager-recipe-item-caps .manager-rule-row.is-disabled {
    opacity: 0.55;
  }
</style>
