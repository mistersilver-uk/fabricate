<!-- Svelte 5 runes mode -->
<!--
  Inline region-name editor for the Travel > Regions inspector. Keeps a local
  draft seeded from the upstream name (reseeded when a different region is
  selected or the name changes externally) and commits on blur / Enter; Escape
  reverts.
-->
<script>
  import { untrack } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';

  let { name = '', disabled = false, onRename = () => {} } = $props();

  // Seed without subscribing to `name` here; the $effect below keeps it synced.
  let draft = $state(untrack(() => name));

  // Reseed the draft whenever the upstream name changes (selection change or
  // external rename). Does not fire while the user is typing (name is stable).
  $effect(() => {
    draft = name;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function commit() {
    const next = String(draft ?? '').trim();
    if (next && next !== name) {
      onRename(next);
    } else {
      draft = name;
    }
  }

  function onKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      draft = name;
      event.currentTarget.blur();
    }
  }
</script>

<div class="manager-field manager-region-name-field" data-manager-region-name-field>
  <span>{text('FABRICATE.Admin.Manager.Travel.Regions.RenameLabel', 'Region name')}</span>
  <input
    type="text"
    bind:value={draft}
    {disabled}
    onblur={commit}
    onkeydown={onKeydown}
    aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.RenameLabel', 'Region name')}
  />
</div>
