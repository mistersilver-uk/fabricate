<!-- Svelte 5 runes mode -->
<!--
  Validation tab of the recipe-item editor. Mirrors the recipe editor's Validation
  tab treatment (issue 797): an aggregate summary card, Passing/Blocking count tiles,
  and a grouped block of bordered rows, each carrying a Pass/Block status pill. Since
  issue 1444 the markup is `EditorValidationSurface`'s rather than a second copy of the
  same classes; this file computes the checks and hands over the surface's props.

  Books & Scrolls validation is strictly TWO-state — a check passes or it blocks —
  so there is no Warnings tile and no warning pill (issue 797, decisions 1 + 5). That is
  expressed by REPORTING two counts: the surface draws the tiles it is given, in its own
  fixed order, so `{ passing, blocking }` yields the two-tile rail this tab has always had.
  Rows are label-only: the check labels are self-describing and the books check-set carries
  no per-check failure message, so there is no detail sub-line.

  Every `data-*` hook this tab shipped is preserved — the root tab hook, the summary-row
  section hook, the summary and counts hooks, both count hooks with the blocking tile's
  second `data-critical-count`, the group hook and both row hooks — through `hookAttrs`,
  `countAttrs`, `rowDataAttr` and each group's and row's own `dataAttrs`.

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
  import EditorValidationSurface from '../EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    recipeItem = null,
    linkedItem = null,
    visibilityMode = 'item',
    validation = null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const CHECK_LABELS = {
    itemLinked: ['ItemLinked', 'A game-world item is linked'],
    recipeLinked: ['RecipeLinked', 'At least one recipe is linked'],
    usesValid: ['UsesValid', 'Use count is valid'],
    learnsValid: ['LearnsValid', 'Learning limit is valid'],
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
      : Number.isFinite(recipeItem?.recipeCount)
        ? recipeItem.recipeCount
        : 0;
    const hasItem = Boolean(linkedItem?.uuid || recipeItem?.originItemUuid);
    const checks = [
      { id: 'itemLinked', ok: hasItem },
      { id: 'recipeLinked', ok: recipeCount > 0 },
    ];
    if (visibilityMode === 'item') {
      checks.push({
        id: 'usesValid',
        ok: item.limitUses !== true || (Number.isFinite(item.maxUses) && item.maxUses >= 1),
      });
    }
    if (visibilityMode === 'knowledge') {
      const limited = learn.limitLearning === true;
      checks.push({
        id: 'learnsValid',
        ok: !limited || (Number.isFinite(learn.learnsAllowed) && learn.learnsAllowed >= 1),
      });
    }
    return checks;
  });

  // The provided `validation.checks` (if any) win; otherwise the local computation.
  const checks = $derived(
    Array.isArray(validation?.checks) && validation.checks.length > 0
      ? validation.checks
      : computedChecks
  );

  // --- The aggregate summary (issue 797) -----------------------------------------
  // A two-state read of the SAME `checks` the rows below render — passing vs blocking,
  // no warning tier — so the aggregate can never disagree with the list.
  const passingCount = $derived(checks.filter((check) => check.ok).length);
  const blockingCount = $derived(checks.filter((check) => !check.ok).length);
  const summaryStatus = $derived(blockingCount > 0 ? 'blocked' : 'clear');
  const summaryMeta = $derived(
    summaryStatus === 'blocked'
      ? {
          icon: 'fas fa-circle-xmark',
          title: text(
            'FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryBlocked',
            'Cannot be used'
          ),
          sub: text(
            'FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryBlockedSub',
            'Clear every blocking check before this recipe item works for players.'
          ),
        }
      : {
          icon: 'fas fa-circle-check',
          title: text('FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryAllClear', 'All clear'),
          sub: text(
            'FABRICATE.Admin.Manager.RecipeItem.Validation.SummaryAllClearSub',
            'Every check passes. This recipe item is ready to use.'
          ),
        }
  );

  const rows = $derived(
    checks.map((check) => ({
      id: check.id,
      status: check.ok ? 'pass' : 'block',
      title: check.label || checkLabel(check.id),
      dataAttrs: { 'data-ok': check.ok },
    }))
  );

  const tabTitle = $derived(
    text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')
  );

  // Two entries, not three: the surface draws the counts it is REPORTED, and this check set
  // has no warning tier at all (issue 797, decision 1).
  const countLabels = $derived({
    passing: text('FABRICATE.Admin.Manager.RecipeItem.Validation.CountPassing', 'Passing'),
    blocking: text('FABRICATE.Admin.Manager.RecipeItem.Validation.CountBlocking', 'Blocking'),
  });

  const statusLabels = $derived({
    pass: text('FABRICATE.Admin.Manager.RecipeItem.Validation.StatusPass', 'Pass'),
    block: text('FABRICATE.Admin.Manager.RecipeItem.Validation.StatusBlock', 'Block'),
  });

  const groups = $derived([
    {
      id: 'requirements',
      icon: 'fas fa-clipboard-check',
      label: text(
        'FABRICATE.Admin.Manager.RecipeItem.Validation.GroupRequirements',
        'Requirements'
      ),
      rows,
      dataAttrs: { 'data-recipe-item-validation-group': 'requirements' },
    },
  ]);
</script>

<EditorValidationSurface
  class="manager-recipe-item-tab manager-recipe-item-validation"
  title={tabTitle}
  intro={text(
    'FABRICATE.Admin.Manager.RecipeItem.Validation.Intro',
    'A recipe item saves while incomplete, but only works for players once every blocking check passes.'
  )}
  summary={{
    status: summaryStatus,
    icon: summaryMeta.icon,
    title: summaryMeta.title,
    sub: summaryMeta.sub,
  }}
  counts={{ passing: passingCount, blocking: blockingCount }}
  {countLabels}
  {groups}
  {statusLabels}
  rowDataAttr="data-recipe-item-check"
  hookAttrs={{
    root: { 'data-recipe-item-tab': 'validation', 'aria-label': tabTitle },
    summaryRow: { 'data-recipe-item-section': 'validation-summary' },
    summary: { 'data-recipe-item-validation-summary': summaryStatus },
    counts: { 'data-recipe-item-validation-counts': '' },
  }}
  countAttrs={{
    passing: { 'data-recipe-item-count-passing': '' },
    blocking: {
      'data-recipe-item-count-blocking': '',
      'data-critical-count': blockingCount,
    },
  }}
/>
