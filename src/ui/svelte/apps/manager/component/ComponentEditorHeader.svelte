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

  ── THE THREE DATA HOOKS ARE PROPS (issue 1036) ──────────────────────────────────
  `dirtyAttr` / `backAttr` / `saveAttr` default to the component strings, so the ONE shipped
  call site renders byte-identical markup and nothing that selects on those hooks has to
  move. A second studio passes its own, which is what lets this header be reused without its
  hooks lying about which editor they are on. The idiom is `BulkEditPanelShell`'s
  `panelAttr`, not a new invention.

  Shaped so it can be LIFTED later: the header is shared by seven editor kinds
  (recipe, essence, environment, gathering task, gathering event, tools, component),
  and extracting it across all seven now would make a smoke failure ambiguous between
  this rebuild and a six-editor refactor. Its own note said "extract when a second studio
  wants it" — the GM Essence Studio is that studio, and this is that extraction, done by
  parameterizing the hooks rather than by forking the file.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  import Chip from '../Chip.svelte';

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

  // Spread rather than written as literal attributes: a Svelte attribute name cannot be an
  // expression, and emitting BOTH the component hook and a studio one would leave two
  // selectors matching the same control, which is the ambiguity the props exist to remove.
  //
  // The value is `''`, not `true`. A bare `data-component-edit-back` renders as `=""`, and
  // a spread of `true` would render `="true"` — the same selectors still match, but the
  // rendered markup would no longer be byte-identical to what shipped, which is the one
  // thing these defaults exist to guarantee.
  const dirtyHook = $derived({ [dirtyAttr]: '' });
  const backHook = $derived({ [backAttr]: '' });
  const saveHook = $derived({ [saveAttr]: '' });
</script>

{#if dirty}
  <Chip tone="warning" {...dirtyHook}>{dirtyLabel}</Chip>
{/if}
<!-- Ghost, matching the recipe editor's Back (ruling 1): Back is not a peer of Save, and
     at the base `.manager-button` weight it competed with it. -->
<button
  type="button"
  class="manager-button is-ghost"
  {...backHook}
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
  {...saveHook}
  disabled={!canSave}
>
  <i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
  <span>{saveLabel}</span>
</button>
