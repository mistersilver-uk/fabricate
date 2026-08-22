<!-- Svelte 5 runes mode -->
<!--
  Always-editable party-name field on a World > Parties card. Keeps a local draft
  seeded from the upstream name (reseeded when a different party is selected or the
  name changes externally) and commits on blur / Enter; Escape reverts, and an empty
  name reverts rather than persisting a nameless party.

  The visible "Party name" label is deliberately gone (issue 1182): on a card the
  field sits directly beneath the party's own icon tile and above its meta line, so a
  label above it is a third line of chrome saying what the value already says. The
  accessible name is carried by `aria-label` instead, so a screen-reader user loses
  nothing.
-->
<script>
  import { untrack } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';

  let { name = '', disabled = false, label = '', onRename = () => {} } = $props();

  // Seed without subscribing to `name` here; the $effect below keeps it synced.
  // Not a writable $derived: this is a seed-then-resync draft that commits on blur/Enter and
  // reverts on Escape. A writable $derived resyncs synchronously and would clobber the edit
  // in progress.
  // eslint-disable-next-line svelte/prefer-writable-derived
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

  const fieldLabel = $derived(
    label || text('FABRICATE.Admin.Manager.World.Parties.NameLabel', 'Party name')
  );

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

<input
  class="manager-party-name-input"
  data-manager-party-name-field
  type="text"
  bind:value={draft}
  {disabled}
  onblur={commit}
  onkeydown={onKeydown}
  aria-label={fieldLabel}
/>

<style>
  /* Theme-ROOT tokens only. Written as `input.manager-party-name-input` so the scoped
     selector computes to (0,2,1) and TIES with the manager's permanent free-text
     baseline (`.fabricate-manager input[type="text"]`, which pins min-height 34px and
     radius 9px); the tie is then won on source order, because injected component CSS
     lands after the global sheet. At a bare class it would be (0,2,0) and silently lose
     its height and radius to the baseline. */
  input.manager-party-name-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 30px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text);
    background: var(--fab-bg-0);
    font-family: var(--fab-font-serif);
    font-size: 13px;
    font-weight: 600;
  }
</style>
