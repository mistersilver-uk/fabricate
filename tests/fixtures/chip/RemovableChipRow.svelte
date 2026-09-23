<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `<Chip removable>` (issue 1515). Three of the prop's contracts are about
  a chip's RELATIONSHIP to the chips beside it, so the suite needs real sibling chips rendered by
  the primitive, a real snippet label, and a real membership set that removal mutates. It also
  renders the two obligations the specimen books on the caller — the `aria-live` summary and the
  `data-chip-remove-fallback` trigger — so a suite can ask the fixture to omit them.

  It lives under `tests/fixtures/` because every component gate enumerates `src/**/*.svelte` and a
  fixture is not a shipped call site. The cost is recorded: `UI_PATH_PATTERN` in
  `scripts/lib/viewLabCases.js` is unanchored on its extension leg, so a diff confined to this
  file arms the screenshot-evidence gate and falls back to `fabricate-app-shell`. Do not relocate
  it — anchoring the pattern to `src/` would stop it selecting the `styles/` and root-level files
  it exists to catch.
-->
<script>
  import Chip from '../../../src/ui/svelte/components/Chip.svelte';

  let {
    members = [],
    disabled = false,
    truncate = false,
    tag = 'span',
    withFallback = true,
    withStatus = true,
    onRemoved = () => {},
  } = $props();

  let live = $state([...members]);

  function remove(id) {
    onRemoved(id, document.activeElement);
    live = live.filter((member) => member.id !== id);
  }
</script>

<div class="manager-chip-row" data-chip-row>
  {#each live as member (member.id)}
    <Chip
      {tag}
      {disabled}
      {truncate}
      removable
      removeLabel={`Remove ${member.label}`}
      onRemove={() => remove(member.id)}
      data-member={member.id}>{member.label}</Chip>
  {/each}
</div>
{#if withFallback}
  <button
    type="button"
    class="row-add-trigger"
    data-chip-remove-fallback
    data-keyboard-focus="true">Add</button>
{/if}
{#if withStatus}
  <span class="row-status" aria-live="polite">{live.length} selected</span>
{/if}
