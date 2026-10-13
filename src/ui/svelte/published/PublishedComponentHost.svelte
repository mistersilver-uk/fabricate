<!--
  The boundary a published component renders in (issue 2426): `component`, its `initial` props,
  `onfault(error)`, `kinds` (the entry's keys that are not `data`) and `slots(key)`, the seam's
  element for a requested `slot` key. `setProps` replaces the props cell, never merges it, and
  nothing remounts. A `text` key reaches the component as a snippet built once per mount, whose one
  element's `textContent` tracks the string; the string is never markup. A `slot` key's snippet
  holds the seam's element in a wrapper of its own, and detaches it on teardown (issue 2451).
-->
<script>
  import { createRawSnippet, untrack } from 'svelte';

  let { component: Published, initial, onfault, kinds, slots } = $props();

  let current = $state.raw(untrack(() => $state.snapshot(initial)));

  const slotOf = untrack(() => slots);
  const SNIPPET_OF = { text: textSnippet, slot: slotSnippet };

  // Built from the entry's kinds, not the first props, so a key first passed by `update` draws.
  const contentSnippets = untrack(() =>
    Object.keys(kinds).map((key) => [key, SNIPPET_OF[kinds[key]](key)])
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

  // Svelte tracks the wrapper as the render's node, so the seam's element is its child. A component
  // that replaces the slot's host draws the new wrapper before this teardown, hence the parent check.
  function slotSnippet(key) {
    return createRawSnippet(() => {
      const element = slotOf(key);
      const tag = element.localName;
      return {
        render: () => `<${tag}></${tag}>`,
        setup(wrapper) {
          wrapper.style.display = 'contents';
          wrapper.append(element);
          return () => {
            if (element.parentNode === wrapper) element.remove();
          };
        },
      };
    });
  }

  // A `text` key holding nothing or `''`, and a `slot` key not holding `true`, is omitted, so the
  // component's own fallback applies.
  const drawn = $derived.by(() => {
    if (contentSnippets.length === 0) return current;
    const props = { ...current };
    for (const [key, snippet] of contentSnippets) {
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
