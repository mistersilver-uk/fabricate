<!-- Svelte 5 runes mode -->
<!--
  Inline party-name editor for the Travel > Parties inspector. Keeps a local
  draft seeded from the upstream name (reseeded when a different party is
  selected or the name changes externally) and commits on blur / Enter; Escape
  reverts.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { name = '', disabled = false, onRename = () => {} } = $props();

  let draft = $state(name);

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

<div class="manager-field manager-party-name-field" data-manager-party-name-field>
  <span>{text('FABRICATE.Admin.Manager.Travel.Parties.NameLabel', 'Party name')}</span>
  <input
    type="text"
    bind:value={draft}
    {disabled}
    onblur={commit}
    onkeydown={onKeydown}
    aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.NameLabel', 'Party name')}
  />
</div>
