<!--
  The Component Rules editor's Validation tab: the same `EditorValidationSurface` shape the world
  entry's draws. Its checks are the SYSTEM rules', which is why they come from
  `componentRulesValidation.js` and not `componentScopeValidation.js`, whose subject is the world
  record. `summary` is the hero; `validation` carries the counts and grouped rows.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';

  let { text, summary, validation } = $props();
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
/>
