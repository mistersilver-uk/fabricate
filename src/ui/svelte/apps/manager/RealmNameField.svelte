<!--
  Inline realm-name editor for the Travel > Realms inspector: a local draft seeded from the upstream
  name, committed on blur or Enter, reverted on Escape.
-->
<script>
  import Field from '../../components/Field.svelte';
  import { untrack } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';

  let { name = '', disabled = false, onRename = () => {} } = $props();

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

<Field as="div" class="manager-realm-name-field" data-manager-realm-name-field="">
  <span>{text('FABRICATE.Admin.Manager.Travel.Realms.RenameLabel', 'Realm name')}</span>
  <input
    type="text"
    bind:value={draft}
    {disabled}
    onblur={commit}
    onkeydown={onKeydown}
    aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.RenameLabel', 'Realm name')}
  />
</Field>
