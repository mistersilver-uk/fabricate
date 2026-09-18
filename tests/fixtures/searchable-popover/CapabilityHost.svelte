<!-- Svelte 5 runes mode -->
<!--
  A test-only caller for `SearchablePopover`'s two caller-owned snippets (issue 1503). The
  `trigger` snippet's contract is a SPREAD applied last, and the hazard is Svelte's own
  `set_attributes`: a spread `undefined` removes the attribute it lands on and a spread `false`
  overrides the caller's `disabled`. Only a real compiled call site puts the caller's static
  attributes and the primitive's spread through the one `set_attributes` call the rule is about.

  It lives under `tests/fixtures/` rather than `src/` deliberately: every component gate
  enumerates `src/**/*.svelte`, and a fixture must not be counted as a shipped call site.
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
