<!--
  The boundary a published component renders in (issue 2426): `component`, its `initial` props,
  `onfault(error)`, `kinds` (the entry's keys the host draws), `slots(key)`, the seam's
  element for a requested `slot` key, and `callbacks(key)`, the seam's `{ arity, deliver }` for a
  `callback` key. `setProps` replaces the props cell, never merges it, and nothing remounts. A
  `text` key reaches the component as a snippet built once per mount, whose one element's
  `textContent` tracks the string; the string is never markup. A `slot` key's snippet holds the
  seam's element in a wrapper of its own, and detaches it on teardown (issue 2451). A `callback`
  key reaches it as one forwarder for the life of the mount, which passes the seam a copy of the
  first `arity` arguments under `untrack` (issue 2452). `values` holds each `value` key's value,
  which every drawn props object carries as one stable accessor pair for the life of the mount; a
  write from the component calls the seam's `flush` before and, when the delivery changed the
  value, after its `on<Key>Change` delivery, outside an effect only. `setProps(next, values)` sets
  only the value keys `values` holds, and `getValue(key)` reads one (issue 2453).
  The outer boundary takes what the inner one throws while it tears a faulted component down,
  which Svelte hands to the next boundary up.
-->
<script>
  import { createRawSnippet, untrack } from 'svelte';

  import { keepCurrent } from '../../publishedComponentValues.js';

  let { component: Published, initial, values, onfault, kinds, slots, callbacks, flush } = $props();

  let current = $state.raw(untrack(() => $state.snapshot(initial)));
  let held = $state.raw(untrack(() => ({ ...values })));

  const slotOf = untrack(() => slots);
  const callbackOf = untrack(() => callbacks);
  const flushNow = untrack(() => flush);
  const DRAWN_AS = { text: textSnippet, slot: slotSnippet, callback: callbackForwarder };

  // Built from the entry's kinds, not the first props, so a key first passed by `update` draws.
  const contentValues = untrack(() =>
    Object.keys(kinds).map((key) => [key, DRAWN_AS[kinds[key]](key)])
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

  function callbackForwarder(key) {
    const { arity, deliver } = callbackOf(key);
    return (...args) => {
      untrack(() => deliver(args.slice(0, arity).map((arg) => $state.snapshot(arg))));
    };
  }

  // The flush before delivery draws the write, so a value put back inside the callback differs
  // from what the DOM last drew; an effect's write is drawn by the flush already running it.
  function write(key, deliver, next) {
    const previous = untrack(() => held[key]);
    if (Object.is(next, previous)) return;
    const resync = !$effect.tracking();
    held = { ...untrack(() => held), [key]: next };
    if (resync) flushNow();
    untrack(() => deliver([next, previous]));
    const settled = untrack(() => held[key]);
    if (resync && !Object.is(settled, next)) flushNow();
  }

  // Svelte reads a bound prop's setter once, at the component's init, so each pair closes over
  // `held`, never over the props object it is defined on.
  const accessors = untrack(() =>
    Object.fromEntries(
      Object.keys(values).map((key) => {
        const { deliver } = callbackOf(key);
        const set = (next) => write(key, deliver, next);
        return [key, { enumerable: true, configurable: true, get: () => held[key], set }];
      })
    )
  );

  // A `text` key holding nothing or `''`, and a `slot` or `callback` key not holding `true`, is
  // omitted, so the component's own fallback applies.
  function withContent(props) {
    for (const [key, value] of contentValues) {
      if (props[key]) props[key] = value;
      else delete props[key];
    }
    return props;
  }

  const drawn = $derived.by(() => {
    const props = contentValues.length === 0 ? { ...current } : withContent({ ...current });
    return Object.defineProperties(props, accessors);
  });

  export function setProps(next, nextValues = {}) {
    untrack(() => {
      current = $state.snapshot(next);
      held = keepCurrent(held, nextValues);
    });
  }

  export function getValue(key) {
    return untrack(() => held[key]);
  }
</script>

<svelte:boundary onerror={(error) => onfault(error)}>
  <svelte:boundary onerror={(error) => onfault(error)}>
    <Published {...drawn} />
  </svelte:boundary>
</svelte:boundary>
