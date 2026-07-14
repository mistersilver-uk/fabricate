<!-- Svelte 5 runes mode -->
<!--
  Validation tab of the recipe-item editor. A mode-aware checklist with green-check /
  red-x rows and a summary count pill. Driven by the `validation` prop when the router
  supplies one, otherwise computed here from `recipeItem` + `linkedItem` +
  `visibilityMode` so the tab is self-sufficient.

  Rules:
   - A game-world item is linked (required in both modes).
   - At least one recipe is linked.
   - (item mode)      Uses per copy ≥ 1 when limited-use is on.
   - (knowledge mode) Learns allowed ≥ 1 when learning mode is 'ntimes'.

  Props:
   - recipeItem / linkedItem / visibilityMode: inputs for the fallback computation.
   - validation: `{ checks: [{ id, ok, label? }], criticalCount? }` — when present its
     `checks` win over the local computation (labels still come from this tab's copy).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    recipeItem = null,
    linkedItem = null,
    visibilityMode = 'item',
    validation = null
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const CHECK_LABELS = {
    itemLinked: ['ItemLinked', 'A game-world item is linked'],
    recipeLinked: ['RecipeLinked', 'At least one recipe is linked'],
    usesValid: ['UsesValid', 'Use count is valid'],
    learnsValid: ['LearnsValid', 'Learning limit is valid']
  };

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.RecipeItem.Validation.${meta[0]}`, meta[1]);
  }

  // Local fallback computation (shared shape with the host badge derivation): a list
  // of `{ id, ok }` mode-aware checks.
  const computedChecks = $derived.by(() => {
    const item = recipeItem?.caps?.item || {};
    const learn = recipeItem?.caps?.learn || {};
    const recipeCount = Array.isArray(recipeItem?.linkedRecipeIds)
      ? recipeItem.linkedRecipeIds.length
      : (Number.isFinite(recipeItem?.recipeCount) ? recipeItem.recipeCount : 0);
    const hasItem = Boolean(linkedItem?.uuid || recipeItem?.originItemUuid);
    const checks = [
      { id: 'itemLinked', ok: hasItem },
      { id: 'recipeLinked', ok: recipeCount > 0 }
    ];
    if (visibilityMode === 'item') {
      checks.push({ id: 'usesValid', ok: item.limitUses !== true || (Number.isFinite(item.maxUses) && item.maxUses >= 1) });
    }
    if (visibilityMode === 'knowledge') {
      const limited = learn.limitLearning === true;
      checks.push({ id: 'learnsValid', ok: !limited || (Number.isFinite(learn.learnsAllowed) && learn.learnsAllowed >= 1) });
    }
    return checks;
  });

  // The provided `validation.checks` (if any) win; otherwise the local computation.
  const checks = $derived(Array.isArray(validation?.checks) && validation.checks.length > 0
    ? validation.checks
    : computedChecks);
  const criticalCount = $derived(checks.filter(check => !check.ok).length);
</script>

<section class="manager-recipe-item-tab manager-recipe-item-validation" data-recipe-item-tab="validation" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')}>
  <div class="manager-recipe-item-validation-heading">
    <i class="fas fa-clipboard-check" aria-hidden="true"></i>
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')}</h3>
  </div>

  <div class="manager-recipe-item-validation-summary">
    <span
      class={`manager-chip ${criticalCount > 0 ? 'is-danger' : 'is-active'}`}
      data-recipe-item-validation-pill
      data-critical-count={criticalCount}
    >
      {criticalCount > 0
        ? text('FABRICATE.Admin.Manager.RecipeItem.Validation.CriticalCount', '{count} Critical').replace('{count}', String(criticalCount))
        : text('FABRICATE.Admin.Manager.RecipeItem.Validation.AllPass', 'All checks pass')}
    </span>
  </div>

  <ul class="manager-recipe-item-validation-list" data-recipe-item-validation-list>
    {#each checks as check (check.id)}
      <li class={`manager-recipe-item-validation-check ${check.ok ? 'is-satisfied' : 'is-unsatisfied'}`} data-recipe-item-check={check.id} data-ok={check.ok}>
        <i class={check.ok ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
        <span>{check.label || checkLabel(check.id)}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .manager-recipe-item-validation {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .manager-recipe-item-validation-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-accent);
  }

  .manager-recipe-item-validation-heading .manager-card-title {
    margin: 0;
  }

  .manager-recipe-item-validation-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-validation-check {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 0.78rem;
    color: var(--fab-text-muted);
  }

  .manager-recipe-item-validation-check.is-satisfied > i {
    color: var(--fab-success);
  }

  .manager-recipe-item-validation-check.is-unsatisfied {
    color: var(--fab-danger-text);
  }

  .manager-recipe-item-validation-check.is-unsatisfied > i {
    color: var(--fab-danger-text);
  }
</style>
