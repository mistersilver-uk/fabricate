<!-- Svelte 5 runes mode -->
<!--
  The component editor's header actions: the unsaved marker, Back, and Save (issue 676,
  decision 4 — Back sits BESIDE Save rather than the rail carrying the distinction).

  ── SAVE SUBMITS VIA THE HTML `form` ATTRIBUTE ───────────────────────────────────
  The Save button lives OUTSIDE the `<form>` and submits it by id:
  `<button type="submit" form="manager-component-edit-form">` pairs with
  `<form id="manager-component-edit-form">` in `ComponentEditView`. Both halves must
  survive verbatim. Drop either and Save silently stops working — and NO unit test
  asserts submission, so nothing would catch it. `formId` is a prop rather than a
  literal precisely so the pairing is assertable from one place.

  ── BACK IS A RENAMED CANCEL ─────────────────────────────────────────────────────
  It routes through the same guarded tri-state path (`confirmComponentRouteExit` ->
  `finishComponentRouteExit`, which handles save / cancel / discard). It never assigns
  a view directly. Because the guard is tri-state, SAVE MUST STAY REACHABLE from the
  dialog — which it is, since Back only initiates the guarded exit.

  Shaped so it can be LIFTED later: the header is shared by seven editor kinds
  (recipe, essence, environment, gathering task, gathering event, tools, component),
  and extracting it across all seven now would make a smoke failure ambiguous between
  this rebuild and a six-editor refactor. Extract when a second studio wants it.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  let {
    dirty = false,
    saving = false,
    canSave = false,
    formId = 'manager-component-edit-form',
    dirtyLabel = '',
    backLabel = '',
    saveLabel = '',
    onBack = () => {}
  } = $props();
</script>

{#if dirty}
  <span class="manager-chip is-warning" data-component-edit-dirty>{dirtyLabel}</span>
{/if}
<!-- Ghost, matching the recipe editor's Back (ruling 1): Back is not a peer of Save, and
     at the base `.manager-button` weight it competed with it. -->
<button
  type="button"
  class="manager-button is-ghost"
  data-component-edit-back
  onclick={() => onBack()}
  disabled={saving}
>
  <i class="fas fa-arrow-left" aria-hidden="true"></i>
  <span>{backLabel}</span>
</button>
<button
  type="submit"
  form={formId}
  class="manager-button is-primary"
  data-component-edit-save
  disabled={!canSave}
>
  <i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
  <span>{saveLabel}</span>
</button>
