<!--
  The boundary a published component renders in (issue 2426): `component`, its `initial` props,
  `onfault(error)` and `kinds`, the entry's keys that are not `data`. `setProps` replaces the props
  cell, never merges it, and nothing remounts. A `text` key reaches the component as a snippet
  built once per mount, whose one element's `textContent` tracks the string; the string is never
  markup (issue 2451).
-->
<script>
  import { createRawSnippet, untrack } from 'svelte';

  let { component: Published, initial, onfault, kinds } = $props();

  let current = $state.raw(untrack(() => $state.snapshot(initial)));

  // Built from the entry's kinds, not the first props, so a key first passed by `update` draws.
  const textSnippets = untrack(() =>
    Object.keys(kinds)
      .filter((key) => kinds[key] === 'text')
      .map((key) => [key, textSnippet(key)])
  );

  function textSnippet(key) {
    return createRawSnippet(() => ({
      render: () => '<span></span>',
      setup(span) {
        $effect.pre(() => {
          const next = current[key] ?? '';
          if (span.textContent !== next) span.textContent = next;
        });
      },
    }));
  }

  // A `text` key holding nothing or `''` is omitted, so the component's own fallback applies.
  const drawn = $derived.by(() => {
    if (textSnippets.length === 0) return current;
    const props = { ...current };
    for (const [key, snippet] of textSnippets) {
      if (props[key]) props[key] = snippet;
      else delete props[key];
    }
    return props;
  });

  export function setProps(next) {
    untrack(() => {
      current = $state.snapshot(next);
    });
  }
</script>

<svelte:boundary onerror={(error) => onfault(error)}>
  <Published {...drawn} />
</svelte:boundary>
