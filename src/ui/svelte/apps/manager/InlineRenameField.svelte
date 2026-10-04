<!-- ratchet-exempt(design-system): InlineRenameField is a new manager-only member at target, because it replaces PartyNameField and RealmNameField and so has two callers (issue 1521) -->
<!--
  An always-editable record name: a local draft seeded from the upstream `name`, committed trimmed on
  blur or Enter, and reverted on Escape or when empty.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `labelled` | boolean | `false` | `true` draws the realm inspector's captioned `Field`, `false` the party card's bare input; each branch keeps its own class and hook. |
  | `label` | string | `''` | Already localized: the caption, and the accessible name in both branches. Empty takes the branch's own name. |

  Callbacks:
  - `onRename(name)` — on a commit whose trimmed text is non-empty and differs from `name`.
-->
<script>
  import Field from '../../components/Field.svelte';
  import { untrack } from 'svelte';
  import { localizeOr } from '../../util/localizeOr.js';

  let { name = '', label = '', labelled = false, disabled = false, onRename = () => {} } = $props();

  // Seed without subscribing to `name`; the $effect below keeps it synced.
  // Not a writable $derived: that resyncs synchronously and would clobber the edit in progress.
  // eslint-disable-next-line svelte/prefer-writable-derived
  let draft = $state(untrack(() => name));

  const fieldLabel = $derived(
    label ||
      (labelled
        ? localizeOr('FABRICATE.Admin.Manager.Travel.Realms.RenameLabel', 'Realm name')
        : localizeOr('FABRICATE.Admin.Manager.World.Parties.NameLabel', 'Party name'))
  );

  // Reseed on an upstream change; it does not fire while typing, because `name` is stable then.
  $effect(() => {
    draft = name;
  });

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

{#if labelled}
  <Field as="div" class="manager-realm-name-field" data-manager-realm-name-field="">
    <span>{fieldLabel}</span>
    <input
      type="text"
      bind:value={draft}
      {disabled}
      onblur={commit}
      onkeydown={onKeydown}
      aria-label={fieldLabel}
    />
  </Field>
{:else}
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
{/if}

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
