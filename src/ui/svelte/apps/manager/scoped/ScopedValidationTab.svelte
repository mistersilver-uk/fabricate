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

  ── THE TWO OPT-IN FACES (issue 1371 r11-entry, UX finding F-D) ──────────────────────────
  The world Component entry draws this tab the way the reference does, and the reference's tab
  differs from the four shipped ones in two ways that are NOT a caller's copy decision:

   1. NO HEADING AND NO INTRO. `proto:957-960`: the Validation body's first child is the
      two-column grid — verdict hero on the left, count rows on the right. This needs no prop:
      `title` and `intro` already default to `''` and `EditorValidationSurface` draws no head
      block at all when both are empty, so a caller SUPPRESSES the pair by not passing it.
      Recorded here because "the prop that suppresses the heading" is the first thing a reader
      looks for and there is deliberately none.
   2. THE HERO STATES THE VERDICT, NOT THE SUBJECT. `proto:4577-4578` derives the headline and
      its sub-line from the counts — `{n} blocking issues` / `Passing with warnings` /
      `All clear`, over `Clear these before saving.` / `{n} warnings will not stop a save.` /
      `Every check passes. Ready to save.` — and `proto:4579` derives the glyph with them. A
      site that passes a static `summary` instead heads a record with two blocking rows under a
      sentence describing what the record IS, which is the one thing the tab already says.

  `verdictSummary` is that second face, and it lives HERE rather than at the call site for the
  reason the block label does not: which words state a verdict is a property of this surface's
  vocabulary, not of one entity type, so a second consumer asking for it must get the same
  eight strings rather than its own translation of them. It is `false` by default and, when
  false, `summary` reaches `EditorValidationSurface` byte-identically — which is what keeps the
  four shipped consumers unmoved.

  Props:
   - title / intro / summary / counts / groups: forwarded to `EditorValidationSurface`.
   - verdictSummary: opt in to the counts-derived hero above. The caller's own `summary` is
     then unread, because the two would be two answers to one question.
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
    // The counts-derived hero of `proto:4577-4579`. `false` keeps `summary` verbatim, so every
    // consumer that does not ask for it renders exactly what it rendered before.
    verdictSummary = false,
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

  /**
   * One localized string with `{token}` substitution applied to WHICHEVER string was taken.
   *
   * The fallback is interpolated too, which is not decoration: outside a running world
   * `localize` answers with the key, so every mounted render of this tab reads the fallback —
   * and a fallback left holding a literal `{count}` is a headline that says `{count} blocking
   * issues` in every test and in the View Lab.
   *
   * @param {string} key
   * @param {string} fallback
   * @param {Record<string, unknown>} [data]
   * @returns {string}
   */
  function phrase(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  /**
   * The verdict the counts add up to, in the reference's own three-way vocabulary.
   *
   * WORST-FIRST, and the order is the meaning: a record with two blocking rows and one warning
   * is blocked, and a hero that reported the warning would be reporting the second-worst thing
   * the rows say. It is written as an early-return chain rather than a nested ternary, which
   * SonarCloud reports as S3358.
   *
   * NO `icon` IS STATED. `EditorValidationSurface` owns the per-status glyph and falls back to
   * its own `statusIcons` when `summary.icon` is absent, so naming one here would be this tab
   * inventing a second glyph vocabulary for the three statuses the surface already draws.
   *
   * @param {{passing?: number, warnings?: number, blocking?: number}} current the tile counts.
   * @returns {{status: string, title: string, sub: string}}
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

  // The caller's `summary` is passed through UNTOUCHED unless the verdict face is asked for,
  // which is what makes the default byte-identical rather than merely equivalent.
  const shownSummary = $derived(verdictSummary ? verdictOf(counts) : summary);

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
    summary={shownSummary}
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
