<!--
  The Component Rules editor's Validation tab: the same `EditorValidationSurface` shape the world
  entry's draws. Its checks are the SYSTEM rules', which is why they come from
  `componentRulesValidation.js` and not `componentScopeValidation.js`, whose subject is the world
  record. `validation` carries the counts and grouped rows; the hero is derived here from the counts.

  Callbacks:
  - `onSelectIssue(target, focusTarget)` — a failing row's route and control; the view owns both.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';

  let { text, format, systemLabel = '', validation, onSelectIssue = () => {} } = $props();

  /** The overall status the validation hero paints, from the counts the rows are grouped by. */
  function worstValidationStatus(counts) {
    if (counts.blocking > 0) return 'block';
    if (counts.warnings > 0) return 'warn';
    return 'pass';
  }

  const HERO_ICONS = {
    pass: 'fas fa-circle-check',
    warn: 'fas fa-triangle-exclamation',
    block: 'fas fa-circle-xmark',
  };

  const summary = $derived.by(() => {
    const status = worstValidationStatus(validation.counts);
    return {
      status,
      icon: HERO_ICONS[status],
      title:
        status === 'pass'
          ? text(
              'FABRICATE.Admin.Manager.Component.Validation.HeadPass',
              'These rules are complete'
            )
          : text(
              'FABRICATE.Admin.Manager.Component.Validation.HeadIssues',
              'These rules have gaps'
            ),
      sub: format(
        'FABRICATE.Admin.Manager.Component.Validation.HeadSub',
        'What {system} needs from this component before it can be crafted with, or broken down.',
        { system: systemLabel }
      ),
    };
  });
</script>

<EditorValidationSurface
  title=""
  {summary}
  counts={validation.counts}
  groups={validation.groups}
  statusLabels={{
    pass: text('FABRICATE.Admin.Manager.Validation.StatusPass', 'Pass'),
    warn: text('FABRICATE.Admin.Manager.Validation.StatusWarn', 'Warning'),
    block: text('FABRICATE.Admin.Manager.Component.Validation.Blocks', 'Blocks'),
  }}
  hookAttrs={{ root: { 'data-component-edit-validation': '' } }}
  rowDataAttr="data-component-validation-check"
  viewDataAttr="data-component-validation-view"
  {onSelectIssue}
/>
