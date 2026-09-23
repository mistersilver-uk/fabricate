<!--
  Always-editable party-name field on a World > Parties card: a local draft seeded from the upstream
  name, committed on blur or Enter, reverted on Escape, and reverted rather than persisted when
  empty. The visible label is deliberately gone (issue 1182) — on a card it would be a third line of
  chrome — and `aria-label` carries the accessible name instead. -->
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

  // Reseed on an upstream change; it does not fire while typing, because `name` is stable then.
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
  /* Theme-ROOT tokens only, and written as `input.manager-party-name-input` so the scoped selector
     computes to (0,2,1), TIES with the manager's free-text baseline and wins on source order; at a
     bare class it would be (0,2,0) and silently lose its height and radius. */
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
