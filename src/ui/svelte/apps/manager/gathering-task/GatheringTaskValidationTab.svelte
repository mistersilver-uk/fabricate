<!--
  The gathering task editor's Validation tab (issue 1522): the shared `EditorValidationSurface` over
  the task's readiness rows. `validation` is `gatheringTaskValidation()`'s reading, which the tab
  strip's marks and the Results notices also take; a gathering task is gated by Save, so the
  blocking pill says `Blocks save`.

  Callbacks:
  - `onSelectIssue(target, focusTarget)` — a failing row's tab and control; the view owns both.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';

  let { text, validation, onSelectIssue = () => {} } = $props();
</script>

<EditorValidationSurface
  title=""
  summary={validation.summary}
  counts={validation.counts}
  groups={validation.groups}
  statusLabels={{
    pass: text('FABRICATE.Admin.Manager.Validation.StatusPass', 'Pass'),
    warn: text('FABRICATE.Admin.Manager.Validation.StatusWarn', 'Warning'),
    block: text('FABRICATE.Admin.Manager.Environment.Tasks.Validation.StatusBlock', 'Blocks save'),
  }}
  hookAttrs={{
    root: {
      'data-gathering-task-validation': '',
      'aria-label': text('FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Validation', 'Validation'),
    },
  }}
  rowDataAttr="data-gathering-task-validation-check"
  viewDataAttr="data-gathering-task-validation-view"
  {onSelectIssue}
/>
