<!-- Svelte 5 runes mode -->
<!--
  Validation tab of the recipe-item editor. Mirrors the recipe editor's Validation
  tab treatment (issue 797): an aggregate summary card, Passing/Blocking count tiles,
  and a grouped block of bordered rows, each carrying a Pass/Block status pill. The
  entire visual treatment reuses the GLOBAL recipe-validation CSS classes in
  styles/fabricate.css — this tab renders inside `.fabricate-manager`, so emitting the
  same classes yields the same look with no new component.

  Books & Scrolls validation is strictly TWO-state — a check passes or it blocks —
  so there is no Warnings tile and no warning pill (issue 797, decisions 1 + 5). Rows
  are label-only: the check labels are self-describing and the books check-set carries
  no per-check failure message, so there is no detail sub-line.

  Driven by the `validation` prop when the router supplies one, otherwise computed here
  from `recipeItem` + `linkedItem` + `visibilityMode` so the tab is self-sufficient.

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

  // --- The aggregate summary (issue 797) -----------------------------------------
  // A two-state read of the SAME `checks` the rows below render — passing vs blocking,
  // no warning tier — so the aggregate can never disagree with the list.
  const passingCount = $derived(checks.filter(check => check.ok).length);
  const blockingCount = $derived(checks.filter(check => !check.ok).length);
  const summaryStatus = $derived(blockingCount > 0 ? 'blocked' : 'clear');
  const summaryMeta = $derived(
    summaryStatus === 'blocked'
      ? {
          icon: 'fas fa-circle-xmark',
          title: text('FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryBlocked', 'Cannot be used'),
          sub: text('FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryBlockedSub', 'Clear every blocking check before this recipe item works for players.')
        }
      : {
          icon: 'fas fa-circle-check',
          title: text('FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryAllClear', 'All clear'),
          sub: text('FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryAllClearSub', 'Every check passes. This recipe item is ready to use.')
        }
  );

  const rows = $derived(checks.map(check => ({
    id: check.id,
    ok: check.ok,
    status: check.ok ? 'pass' : 'block',
    title: check.label || checkLabel(check.id)
  })));

  function statusPill(status) {
    return status === 'block'
      ? text('FABRICATE.Admin.Manager.RecipeItem.Validation.StatusBlock', 'Block')
      : text('FABRICATE.Admin.Manager.RecipeItem.Validation.StatusPass', 'Pass');
  }
  function statusIcon(status) {
    return status === 'block' ? 'fas fa-circle-exclamation' : 'fas fa-circle-check';
  }
</script>

<section class="manager-recipe-item-tab manager-recipe-item-validation" data-recipe-item-tab="validation" aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')}</h2>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.RecipeItem.Validation.Intro', 'A recipe item saves while incomplete, but only works for players once every blocking check passes.')}</p>
  </div>

  <!-- The aggregate header: a status medallion + the Passing/Blocking counts, off the
       SAME checks the grouped rows below are built from. Reuses the recipe tab's global
       classes; the counts list is two-state (no Warnings tile — decision 1). -->
  <section class="manager-recipe-validation-summary-row" data-recipe-item-section="validation-summary">
    <div class={`manager-recipe-rail-summary is-${summaryStatus}`} data-recipe-item-validation-summary={summaryStatus}>
      <span class="manager-recipe-rail-summary-medallion" aria-hidden="true">
        <i class={summaryMeta.icon}></i>
      </span>
      <span class="manager-recipe-rail-summary-copy">
        <span class="manager-recipe-rail-summary-title">{summaryMeta.title}</span>
        <span class="manager-recipe-rail-summary-sub manager-muted">{summaryMeta.sub}</span>
      </span>
    </div>
    <ul class="manager-recipe-rail-counts" data-recipe-item-validation-counts>
      <li class="manager-recipe-rail-count is-passing">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span class="manager-recipe-rail-count-label">{text('FABRICATE.Admin.Manager.RecipeItem.Validation.CountPassing', 'Passing')}</span>
        <span class="manager-recipe-rail-count-value" data-recipe-item-count-passing>{passingCount}</span>
      </li>
      <li class="manager-recipe-rail-count is-blocking">
        <i class="fas fa-circle-xmark" aria-hidden="true"></i>
        <span class="manager-recipe-rail-count-label">{text('FABRICATE.Admin.Manager.RecipeItem.Validation.CountBlocking', 'Blocking')}</span>
        <span class="manager-recipe-rail-count-value" data-recipe-item-count-blocking data-critical-count={blockingCount}>{blockingCount}</span>
      </li>
    </ul>
  </section>

  <div class="manager-recipe-val-group" data-recipe-item-validation-group="requirements">
    <p class="manager-recipe-val-group-label">
      <i class="fas fa-clipboard-check" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.RecipeItem.Validation.GroupRequirements', 'Requirements')}</span>
    </p>
    <ul class="manager-recipe-val-rows">
      {#each rows as row (row.id)}
        <li class={`manager-recipe-val-row is-${row.status}`} data-recipe-item-check={row.id} data-ok={row.ok}>
          <i class={`manager-recipe-val-status ${statusIcon(row.status)}`} aria-hidden="true"></i>
          <div class="manager-recipe-val-copy">
            <span class="manager-recipe-val-title">{row.title}</span>
          </div>
          <span class={`manager-chip manager-recipe-val-pill is-${row.status}`}>{statusPill(row.status)}</span>
        </li>
      {/each}
    </ul>
  </div>
</section>
