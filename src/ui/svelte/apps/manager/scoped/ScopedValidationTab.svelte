<!-- Svelte 5 runes mode -->
<!--
  The validation tab shared by every scoped-entity editor (issue 1362, epic 1357). A
  GENERALISATION, not a new surface: the essence and tool tabs were already this shape, and
  `checks/ChecksValidationTab` is deliberately not a member — it is a SYSTEM-level route.
  The COUNT and pass / warn labels are identical at both sites and localized here once; only the
  BLOCK label differs and is a prop. `onSelectIssue`, `viewDataAttr` and `viewLabel` are
  FORWARDED and NOT defaulted here, so the row action's name lives in exactly one place.
  `verdictSummary` is the reference's second face (`proto:4577-4579`), where the hero states the
  VERDICT derived from the counts; `false` by default, and then `summary` passes through
  byte-identically. The heading-less face needs no prop: `title` and `intro` default to `''`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';

  let {
    title = '',
    intro = '',
    summary = {},
    counts = { passing: 0, warnings: 0, blocking: 0 },
    groups = [],
    // The counts-derived hero of `proto:4577-4579`; `false` keeps `summary` verbatim.
    verdictSummary = false,
    blockLabel = '',
    stackClass = 'manager-scoped-tab-stack',
    rowDataAttr = '',
    // DECLARED WITHOUT DEFAULTS, deliberately: a default here would be a SECOND place the row
    // action's name lives, and an unpassed prop forwards as `undefined`.
    viewDataAttr,
    viewLabel,
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

  /**
   * One localized string with `{token}` substitution applied to WHICHEVER string was taken: a
   * fallback holding a literal `{count}` would render in every test and in the View Lab.
   */
  function phrase(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  /**
   * The verdict the counts add up to. WORST-FIRST, and the order is the meaning; an early-return
   * chain rather than a nested ternary (S3358). No `icon`: the surface owns the per-status glyph.
   */
  function verdictOf(current) {
    const blocking = Number(current?.blocking) || 0;
    const warnings = Number(current?.warnings) || 0;
    if (blocking > 0) {
      return {
        status: 'block',
        title: phrase(
          blocking === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Validation.VerdictBlockingOne'
            : 'FABRICATE.Admin.Manager.Scoped.Validation.VerdictBlocking',
          blocking === 1 ? '{count} blocking issue' : '{count} blocking issues',
          { count: blocking }
        ),
        sub: text(
          'FABRICATE.Admin.Manager.Scoped.Validation.VerdictBlockingSub',
          'Clear these before saving.'
        ),
      };
    }
    if (warnings > 0) {
      return {
        status: 'warn',
        title: text(
          'FABRICATE.Admin.Manager.Scoped.Validation.VerdictWarning',
          'Passing with warnings'
        ),
        sub: phrase(
          warnings === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Validation.VerdictWarningSubOne'
            : 'FABRICATE.Admin.Manager.Scoped.Validation.VerdictWarningSub',
          warnings === 1
            ? '{count} warning will not stop a save.'
            : '{count} warnings will not stop a save.',
          { count: warnings }
        ),
      };
    }
    return {
      status: 'pass',
      title: text('FABRICATE.Admin.Manager.Scoped.Validation.VerdictPass', 'All clear'),
      sub: text(
        'FABRICATE.Admin.Manager.Scoped.Validation.VerdictPassSub',
        'Every check passes. Ready to save.'
      ),
    };
  }

  // The caller's `summary` passes through UNTOUCHED unless the verdict face is asked for.
  const shownSummary = $derived(verdictSummary ? verdictOf(counts) : summary);

  const wrapperAttributes = $derived(hookAttribute ? { [hookAttribute]: hookValue } : {});
  // THE SHARED VOCABULARY, UNDER ITS OWN NAME AND IN ONE CASING (issue 1517): these five words
  // were read from the RECIPE editor's namespace. `block` stays the caller's word.
  const countLabels = $derived({
    passing: text('FABRICATE.Admin.Manager.Validation.CountPassing', 'Passing'),
    warnings: text('FABRICATE.Admin.Manager.Validation.CountWarnings', 'Warnings'),
    blocking: text('FABRICATE.Admin.Manager.Validation.CountBlocking', 'Blocking'),
  });
  const statusLabels = $derived({
    pass: text('FABRICATE.Admin.Manager.Validation.StatusPass', 'Pass'),
    warn: text('FABRICATE.Admin.Manager.Validation.StatusWarn', 'Warning'),
    block: blockLabel,
  });
</script>

<div class={stackClass} {...wrapperAttributes} use:focusFirstFailure={focusNonce}>
  <EditorValidationSurface
    {title}
    {intro}
    summary={shownSummary}
    {counts}
    {countLabels}
    {groups}
    {rowDataAttr}
    {viewDataAttr}
    {viewLabel}
    {statusLabels}
    {onSelectIssue}
  />
  {@render children?.()}
</div>

<style>
  /* The one stack rule both converted sites carried; each still passes its own class alongside
     this one, so no shipped rule stops matching. */
  .manager-scoped-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }
</style>
