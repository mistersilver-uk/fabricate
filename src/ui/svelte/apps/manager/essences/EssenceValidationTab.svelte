<!--
  The essence editor's VALIDATION tab, rendering the shared `ScopedValidationTab`. The check SET,
  its order and its severities come from the pure `essenceValidation.js` and the mapping onto copy
  from `essenceStudio.js`, so nothing about which checks exist is decided here. It keeps its
  `manager-essence-tab-stack` class and its `data-essence-tab-panel="validation"` hook.

  AN ESSENCE ALWAYS SAVES: unlike a Tool, a blocking issue neither stops the save nor disables the
  Enabled toggle, so `Blocking` is worded as an issue count rather than a refusal. UNSET COLOUR IS A
  PASS, because an essence with no colour renders in the theme accent by design, so that row is
  informational and its detail line says which of the two states it is.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ScopedValidationTab from '../scoped/ScopedValidationTab.svelte';
  import { essenceIssueAddresses, essenceValidationPresentation } from './essenceStudio.js';

  let {
    essence = null,
    context = {},
    // The tab set the EDITOR is rendering, a prop rather than a constant because this editor has
    // two. An address is attached only for a zone the live set can reach, so a row whose subject
    // is edited on another screen draws no View button rather than one routing to a missing tab.
    tabIds = [],
    onSelectIssue = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const presentation = $derived(essenceValidationPresentation(essence, context, text));
  const counts = $derived(presentation.counts);

  // Attached HERE rather than inside `essenceValidationPresentation`, which is also the world
  // entry page's — a different host with different tabs and no row action, which would gain a View
  // button that changes nothing. `essenceStudio.js` still owns which control a check is about.
  const addresses = $derived(essenceIssueAddresses(tabIds));
  const groups = $derived(
    presentation.groups.map((group) => ({
      ...group,
      // A PASSING row gets no address, which is what keeps the View button off every row of a
      // healthy essence: the action exists to reach a defect, and a tick has none.
      rows: group.rows.map((row) => ({
        ...row,
        ...(row.status === 'pass' ? {} : (addresses[row.id] ?? {})),
      })),
    }))
  );
  const summary = $derived(summaryFor(counts));

  function summaryFor(current) {
    if (current.blocking > 0) {
      return {
        status: 'block',
        icon: 'fas fa-circle-exclamation',
        title: text('FABRICATE.Admin.Manager.Essence.Validation.NeedsAttention', 'Needs attention'),
        sub: text(
          'FABRICATE.Admin.Manager.Essence.Validation.BlockingSub',
          'This essence is missing something every surface that renders it needs.'
        ),
      };
    }
    if (current.warnings > 0) {
      return {
        status: 'warn',
        icon: 'fas fa-triangle-exclamation',
        title: text('FABRICATE.Admin.Manager.Essence.Validation.Warnings', 'Worth a look'),
        sub: text(
          'FABRICATE.Admin.Manager.Essence.Validation.WarningsSub',
          'Nothing here stops this essence working, but each one degrades it somewhere.'
        ),
      };
    }
    return {
      status: 'pass',
      icon: 'fas fa-circle-check',
      title: text('FABRICATE.Admin.Manager.Validation.SummaryAllClear', 'All clear'),
      sub: text(
        'FABRICATE.Admin.Manager.Essence.Validation.AllClearSub',
        'Every structural check passes.'
      ),
    };
  }
</script>

<ScopedValidationTab
  stackClass="manager-scoped-tab-stack manager-essence-tab-stack"
  hookAttribute="data-essence-tab-panel"
  hookValue="validation"
  title={text('FABRICATE.Admin.Manager.Essence.Tabs.Validation', 'Validation')}
  intro={text(
    'FABRICATE.Admin.Manager.Essence.Validation.Intro',
    'An essence always saves. These checks report what is unfinished.'
  )}
  {summary}
  {counts}
  {groups}
  rowDataAttr="data-essence-validation-check"
  viewDataAttr="data-essence-validation-view"
  {onSelectIssue}
  blockLabel={text('FABRICATE.Admin.Manager.Essence.Validation.StatusBlock', 'INCOMPLETE')}
/>
