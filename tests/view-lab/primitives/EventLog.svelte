<!--
  The event log: every callback the selected specimen has fired, newest first.

  A row is an `<IconFactRow>` and an empty log is an `<EmptyState>`, because both are exactly what
  those primitives are for — a fact with a glyph, and a nothing-here that says what the nothing
  means rather than "no items".

  The ARGUMENTS are the one part the set cannot express. `<InfoStrip>` would own a mono readout and
  it is UNBUILT; `Chip mono` is the shipped neighbour and covers a scalar and nothing else, while a
  callback's arguments are a tuple of arbitrary shapes. Reading what was actually passed is the
  whole value of the log, so it is rendered as surface 3 of 4 rather than flattened to a string a
  chip could hold.
-->
<script>
  import EmptyState from '../../../src/ui/svelte/apps/manager/EmptyState.svelte';
  import IconFactRow from '../../../src/ui/svelte/apps/manager/IconFactRow.svelte';

  let { events = [] } = $props();

  /**
   * One argument list, as a reader needs to see it.
   *
   * `JSON.stringify` returns `undefined` — the value, not a string — for a function, a symbol and
   * `undefined` itself, and a callback argument is often one of those. Falling back to the type
   * name keeps a row that says what arrived instead of a row that says nothing.
   */
  function formatArguments(args) {
    if (args.length === 0) return '(no arguments)';
    return args
      .map((value, index) => `[${index}] ${JSON.stringify(value) ?? String(typeof value)}`)
      .join('\n');
  }
</script>

{#if events.length === 0}
  <EmptyState
    icon="fas fa-satellite-dish"
    title="No callback has fired yet"
    hint="Drive the specimen on the plinth below. Every prop the catalogue row declares as an event is wired to this log."
    compact
  />
{:else}
  <div class="pl-stack">
    {#each events as event (event.seq)}
      <div class="pl-stack">
        <IconFactRow
          icon="fas fa-bolt"
          title={event.prop}
          subtitle={`#${event.seq} · ${event.args.length} argument${event.args.length === 1 ? '' : 's'}`}
        />
        <!-- SURFACE 3 of 4: a mono readout. `<InfoStrip>` is UNBUILT; see lab.css. -->
        <code class="pl-args" data-pl-surface="InfoStrip">{formatArguments(event.args)}</code>
      </div>
    {/each}
  </div>
{/if}
