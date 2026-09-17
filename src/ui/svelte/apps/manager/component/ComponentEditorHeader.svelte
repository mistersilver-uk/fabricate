<!--
  The component editor's header actions: the unsaved marker, Back, and Save.

  SAVE SUBMITS VIA THE HTML `form` ATTRIBUTE. The button lives OUTSIDE the `<form>` and submits it
  by id, so `<button type="submit" form=…>` and `<form id=…>` in `ComponentEditView` must BOTH
  survive verbatim: drop either and Save silently stops working, with no unit test asserting
  submission. `formId` is a prop rather than a literal so the pairing is assertable from one place.

  BACK IS A RENAMED CANCEL, routed through the same guarded tri-state path and never assigning a
  view directly. Because the guard is tri-state, SAVE MUST STAY REACHABLE from the dialog — which
  it is, since Back only initiates the guarded exit.

  THE THREE DATA HOOKS ARE PROPS defaulting to the component strings, so the shipped call site
  renders byte-identical markup while a second studio passes its own and the hooks never lie about
  which editor they are on. The idiom is `BulkEditPanelShell`'s `panelAttr`.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    dirty = false,
    saving = false,
    canSave = false,
    formId = 'manager-component-edit-form',
    dirtyLabel = '',
    backLabel = '',
    saveLabel = '',
    dirtyAttr = 'data-component-edit-dirty',
    backAttr = 'data-component-edit-back',
    saveAttr = 'data-component-edit-save',
    onBack = () => {},
  } = $props();

  // Spread, because a Svelte attribute name cannot be an expression and emitting both hooks would
  // leave two selectors matching one control. The value is `''`, not `true`: a bare attribute
  // renders as `=""` and `true` would render `="true"`, losing the byte-identical markup.
  const dirtyHook = $derived({ [dirtyAttr]: '' });
  const backHook = $derived({ [backAttr]: '' });
  const saveHook = $derived({ [saveAttr]: '' });
</script>

{#if dirty}
  <Chip tone="warning" {...dirtyHook}>{dirtyLabel}</Chip>
{/if}
<!-- Ghost, matching the recipe editor's Back: it is not a peer of Save. -->
<ManagerButton role="ghost" {...backHook} onclick={() => onBack()} disabled={saving}>
  <i class="fas fa-arrow-left" aria-hidden="true"></i>
  <span>{backLabel}</span>
</ManagerButton>
<ManagerButton role="primary" type="submit" form={formId} {...saveHook} disabled={!canSave}>
  <i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
  <span>{saveLabel}</span>
</ManagerButton>
