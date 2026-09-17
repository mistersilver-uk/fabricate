<!-- Svelte 5 runes mode -->
<!-- THE WORLD SCOPED-ENTRY EDITOR'S HEADER ACTION PAIR: back before save, per the EDITOR recipe. -->
<!-- The shell renders it, because no page can reach `.manager-header`; Save is `is-primary` and -->
<!-- is disabled with nothing to flush. `danger` is an OPTIONAL snippet between the two verbs. -->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    onBack = () => {},
    onSave = () => {},
    backLabel = '',
    saveLabel = '',
    saveDisabled = false,
    saving = false,
    backAttribute = 'data-scoped-entry-back-action',
    saveAttribute = 'data-scoped-entry-save-action',
    danger = undefined,
  } = $props();

  // A computed attribute name cannot be a literal in markup, so each hook is spread as a one-key
  // object whose VALUE is `''`, which renders as the bare `data-*` attribute the shell wrote.
  const backHook = $derived({ [backAttribute]: '' });
  const saveHook = $derived({ [saveAttribute]: '' });
</script>

<ManagerButton {...backHook} onclick={() => onBack()}>
  <i class="fas fa-arrow-left" aria-hidden="true"></i>
  <span>{backLabel}</span>
</ManagerButton>
{#if danger}{@render danger()}{/if}
<ManagerButton
  role="primary"
  {...saveHook}
  disabled={saveDisabled || saving === true}
  onclick={() => onSave()}
>
  <i class="fas fa-floppy-disk" aria-hidden="true"></i>
  <span>{saveLabel}</span>
</ManagerButton>
