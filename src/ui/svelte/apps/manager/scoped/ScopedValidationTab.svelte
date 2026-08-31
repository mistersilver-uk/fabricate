<!-- Svelte 5 runes mode -->
<!--
  The validation tab shared by every scoped-entity editor (issue 1362, epic 1357).

  A GENERALISATION, not a new surface. `essences/EssenceValidationTab` and
  `tools/ToolValidationTab` were already thin shells over `EditorValidationSurface` in exactly
  this shape — a stack wrapper carrying one hook, the surface, and an optional trailing note —
  and both are callers of this component now. Extracting a primitive obliges converting every
  existing site of its shape, and there are exactly TWO: `checks/ChecksValidationTab` is the
  only other `EditorValidationSurface` caller and is deliberately NOT a member, because it is
  a SYSTEM-level route taking sections and dirty-activity state rather than an
  entity-plus-scope shell. Named here so a later reader does not find the third caller and
  ask why it was skipped.

  ── WHAT IT OWNS, AND WHY ───────────────────────────────────────────────────────────────
  The three COUNT labels and the pass / warn STATUS labels are identical at both sites, so
  they are localized here once. Only the BLOCK label differs — an essence always saves, so
  its blocking row reads `INCOMPLETE`, while a Tool refuses to save and reads `BLOCKS ENABLE`
  — so that one is a prop. Anything the sites genuinely disagree about is a prop; nothing
  they agree about is restated at a call site.

  Props:
   - title / intro / summary / counts / groups: forwarded to `EditorValidationSurface`.
   - blockLabel: the block row's status word.
   - stackClass: the site's existing wrapper class, kept so no shipped rule stops matching.
   - rowDataAttr: the per-row hook the site's tests read.
   - hookAttribute / hookValue: the wrapper's own `data-*` hook. `hookValue` may be `true`
     for a bare boolean attribute.
   - focusNonce: ticks to scroll the first BLOCKING row into view. It lives here rather than
     at a call site because "show me the first thing that blocks" is a property of this
     surface, not of one entity type; a site with nothing to focus passes 0.
   - children: an optional trailing snippet, for a site with something below the surface
     (the Tool editor's save-failure alert).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorValidationSurface from '../EditorValidationSurface.svelte';

  let {
    title = '',
    intro = '',
    summary = {},
    counts = { passing: 0, warnings: 0, blocking: 0 },
    groups = [],
    blockLabel = '',
    stackClass = 'manager-scoped-tab-stack',
    rowDataAttr = '',
    hookAttribute = '',
    hookValue = true,
    focusNonce = 0,
    onSelectIssue = () => {},
    children = undefined,
  } = $props();

  function focusFirstFailure(node, nonce) {
    if (nonce > 0) {
      queueMicrotask(() =>
        node.querySelector('.manager-recipe-val-row.is-block')?.scrollIntoView?.({
          block: 'nearest',
        })
      );
    }
  }

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const wrapperAttributes = $derived(hookAttribute ? { [hookAttribute]: hookValue } : {});
  const countLabels = $derived({
    passing: text('FABRICATE.Admin.Manager.Recipe.Validation.CountPassing', 'Passing'),
    warnings: text('FABRICATE.Admin.Manager.Recipe.Validation.CountWarnings', 'Warnings'),
    blocking: text('FABRICATE.Admin.Manager.Recipe.Validation.CountBlocking', 'Blocking'),
  });
  const statusLabels = $derived({
    pass: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusPass', 'PASS'),
    warn: text('FABRICATE.Admin.Manager.Recipe.Validation.StatusWarn', 'WARNING'),
    block: blockLabel,
  });
</script>

<div class={stackClass} {...wrapperAttributes} use:focusFirstFailure={focusNonce}>
  <EditorValidationSurface
    {title}
    {intro}
    {summary}
    {counts}
    {countLabels}
    {groups}
    {rowDataAttr}
    {statusLabels}
    {onSelectIssue}
  />
  {@render children?.()}
</div>

<style>
  /* The one stack rule both converted sites carried. `EssenceValidationTab` kept it in its
     own scoped block and the Tool site takes it from the global sheet's
     `.manager-tool-tab-stack`; each site still passes its own class alongside this one, so
     no shipped rule stops matching. */
  .manager-scoped-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>
