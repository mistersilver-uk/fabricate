<!-- Svelte 5 runes mode -->
<!--
  A TEST-ONLY CALLER for `SearchablePopover`'s two caller-owned snippets (issue 1503).

  WHY THIS IS A COMPILED COMPONENT AND NOT A `createRawSnippet` IN THE SUITE
  -------------------------------------------------------------------------
  The `trigger` snippet's whole contract is a SPREAD — the caller writes its own button and
  spreads the primitive's `attributes` onto it LAST — and the hazard the omission rule exists to
  close is a fact about Svelte's own `set_attributes`: a spread value of `undefined` REMOVES the
  attribute it lands on, and a spread value of `false` overrides the caller's `disabled={true}`.
  A snippet built in JavaScript would have to apply those attributes by hand, so the suite would
  be testing its own applier rather than the compiler's. Only a real compiled call site puts the
  caller's static attributes and the primitive's spread through the one `set_attributes` call the
  rule is about.

  It lives under `tests/fixtures/` rather than `src/` deliberately: every component gate in this
  repository (`lint:svelte`, `format:check`, `check-svelte-warnings.mjs`, the source-contract and
  area-scope readers) enumerates `src/**/*.svelte`, and a fixture is not a shipped call site. It
  must not be counted as one.

  The two snippets are declared ONCE and passed as ordinary props, so a suite can mount the
  snippet-bearing shape and the primitive's own shape from the same file without a second copy of
  either markup.
-->
<script>
  import SearchablePopover from '../../../src/ui/svelte/components/SearchablePopover.svelte';

  let {
    useTriggerSnippet = false,
    useOptionSnippet = false,
    // The caller's OWN accessible name, tooltip and disabled state, written on the caller's own
    // button BEFORE the spread. Each is the thing one half of the omission rule protects.
    callerAriaLabel = '',
    callerTitle = '',
    callerDisabled = false,
    ...popover
  } = $props();
</script>

{#snippet callerTrigger({ attributes, open })}
  <button
    class="caller-trigger"
    aria-label={callerAriaLabel || undefined}
    title={callerTitle || undefined}
    disabled={callerDisabled}
    data-caller-open={open ? 'true' : 'false'}
    {...attributes}
  >
    <span class="caller-trigger-label">Caller trigger</span>
  </button>
{/snippet}

{#snippet callerOption(option)}
  <span class="caller-row-tile" aria-hidden="true"><i class={option.icon}></i></span>
  <span class="caller-row-label">{option.label}</span>
{/snippet}

<SearchablePopover
  {...popover}
  trigger={useTriggerSnippet ? callerTrigger : undefined}
  option={useOptionSnippet ? callerOption : undefined}
/>
