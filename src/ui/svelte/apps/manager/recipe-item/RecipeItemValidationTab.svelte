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
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    recipeItem = null,
    linkedItem = null,
    visibilityMode = 'item',
    validation = null,
    // THE ROW ACTION (issue 1517). `(target, focusTarget)` — the tab the editor switches to, and
    // the `data-validation-target` value of the control that is wrong. The editor owns both
    // moves; this tab only carries the address.
    onSelectIssue = () => {},
  } = $props();

  /**
   * A FAILING CHECK'S TWO ADDRESSES (issue 1517).
   *
   * `target` is the ROUTE — the editor tab that hosts the gap — and `focusTarget` is the
   * CONTROL, the value of the `data-validation-target` attribute the offending control carries
   * in that tab. The four checks this tab renders each name one control, so there is no
   * route-only row here today; the shape still spreads, so a fifth check that names none can be
   * added as `{ target }` alone without changing anything else.
   *
   * The four addresses, and the files that carry them:
   *
   *  - `recipe-item-source`       -> `RecipeItemOverviewTab.svelte`, the Item drop zone
   *  - `recipe-item-link-recipe`  -> `RecipeItemContentsTab.svelte`, the Link recipe trigger
   *  - `recipe-item-uses`         -> `RecipeItemLimitsTab.svelte`, the uses-per-copy stepper
   *  - `recipe-item-learns`       -> `RecipeItemLimitsTab.svelte`, the recipes-allowed stepper
   *
   * Written as literals on both sides rather than shared through an import, for the reason
   * `recipe/recipeReadiness.js` gives: sharing them would put this module in the closure of
   * every suite that mounts one of those three tabs. What holds the two sides together instead
   * is `tests/components/recipe-item-validation-tab-mounted.test.js`, which reads the address
   * this tab hands the row action AND resolves it against the destination files' own source.
   */
  const CHECK_ADDRESSES = {
    itemLinked: { target: 'overview', focusTarget: 'recipe-item-source' },
    recipeLinked: { target: 'contents', focusTarget: 'recipe-item-link-recipe' },
    usesValid: { target: 'limits', focusTarget: 'recipe-item-uses' },
    learnsValid: { target: 'limits', focusTarget: 'recipe-item-learns' },
  };

  /**
   * The address bag for one row, or nothing.
   *
   * A PASSING check gets no address at all, which is what keeps the View button off every row
   * of a healthy recipe item: the action exists to reach a defect, and a tick has none.
   *
   * @param {{id?: string, ok?: boolean}} check
   * @returns {{target?: string, focusTarget?: string}}
   */
  function addressFor(check) {
    if (!check || check.ok) return {};
    return CHECK_ADDRESSES[check.id] ?? {};
  }

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
          title: text('FABRICATE.Admin.Manager.Validation.SummaryAllClear', 'All clear'),
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
      ...addressFor(check),
    }))
  );

  const tabTitle = $derived(
    text('FABRICATE.Admin.Manager.RecipeItem.Validation.Title', 'Validation')
  );

  // THE COUNT WORDS ARE NOT PASSED AT ALL, and the STATUS WORDS ARE PASSED FOR ONE WORD
  // (issue 1517, docs round). `Passing`, `Blocking` and `Pass` were byte-identical copies of the
  // vocabulary `EditorValidationSurface` already defaults to, written into this namespace — the
  // second home the design-system requirement's "lives once" sentence forbids. Two entries
  // rather than three is still what this tab reports, because the surface draws the tiles it is
  // given a COUNT for and this check set has no warning tier (issue 797, decision 1); dropping
  // the labels changes nothing about that.
  //
  // `block` STAYS ITS OWN WORD, and that is the other half of the same rule. The shared default
  // is the ENABLE-gated wording — `Blocks enable` — and a recipe item has no enable gate: it
  // works for players or it does not, which is why its blocked verdict reads `Cannot be used`.
  // So this surface localizes the one word that is genuinely its own and takes the rest.
  const statusLabels = $derived({
    pass: text('FABRICATE.Admin.Manager.Validation.StatusPass', 'Pass'),
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
  {groups}
  {statusLabels}
  rowDataAttr="data-recipe-item-check"
  viewDataAttr="data-recipe-item-validation-view"
  {onSelectIssue}
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
