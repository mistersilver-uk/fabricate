<!-- Svelte 5 runes mode -->
<!--
  A TEST-ONLY CALLER for `<Chip removable>` (issue 1515).

  WHY THIS IS A COMPILED COMPONENT AND NOT A HAND-BUILT DOM ROW
  ------------------------------------------------------------
  Three of the prop's contracts are about a chip's RELATIONSHIP to the chips beside it, and none
  of them can be exercised by mounting one chip on its own:

    - the focus destination after a removal is "the next chip's remove control, else the previous
      chip's", so the suite needs REAL sibling chips rendered by the primitive itself. A row of
      hand-written `<span class="manager-chip">` look-alikes would let the chain pass while the
      primitive emitted a different hook;
    - the third rung is a hook the CALLER puts on its own add trigger, which is a fact about
      markup the chip does not own;
    - the label arrives as a snippet, so a chip with a real label — the thing `removeLabel` names
      and the thing `truncate` clips — only exists inside a call site.

  It also renders the two obligations the specimen books on the caller rather than on the chip:
  the `aria-live="polite"` summary beside the row, and the `data-chip-remove-fallback` trigger.
  A caller that forgets either is the failure mode the specimen is written about, so the fixture
  can be asked to omit them.

  THE MEMBERSHIP SET IS REAL STATE, not a static list, because the focus move happens BEFORE the
  handler runs and the whole point of that ordering is that the node focus lands on survives the
  update. A fixture that never removed anything would assert the chain against a DOM the removal
  had not touched.

  It lives under `tests/fixtures/` rather than `src/` deliberately, on the precedent of
  `tests/fixtures/searchable-popover/CapabilityHost.svelte`: every component gate in this
  repository (`lint:svelte`, `format:check`, `check-svelte-warnings.mjs`, the source-contract and
  area-scope readers) enumerates `src/**/*.svelte`, and a fixture is not a shipped call site.

  THAT PLACEMENT HAS ONE COST, AND IT IS RECORDED RATHER THAN PAID BY SURPRISE. `UI_PATH_PATTERN`
  in `scripts/lib/viewLabCases.js` is UNANCHORED on its extension leg — `\.(svelte|css)$` — so
  `isUiFile` answers true for this path even though it is outside `src/ui/`. A change confined to
  this fixture therefore ARMS the screenshot-evidence gate, and because no case's `sourceMatches`
  names it, the selection falls back to `fabricate-app-shell` — a frame of the player window,
  which contains nothing this file renders. `CapabilityHost.svelte` carries the same property.
  The cost is one irrelevant published frame on a fixture-only diff, which is cheaper than the
  alternatives: anchoring the pattern to `src/` would silently stop selecting the `styles/` and
  root-level `.svelte` files it is there to catch, and moving the fixture into `src/` would put a
  test-only component inside every gate that enumerates shipped call sites. Do not relocate it.
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
