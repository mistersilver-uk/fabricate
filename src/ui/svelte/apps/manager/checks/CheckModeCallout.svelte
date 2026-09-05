<!-- Svelte 5 runes mode -->
<!--
  WHAT THIS MODE DOES — the roll section's opening callout (issue 1096).

  A dice glyph in a rounded tile, the mode's name as the title, one paragraph explaining what
  the mode does with a roll, and a facts row under it: `Check · Required`, `Outcomes · 5
  tiers`, `Results · Bound to tiers`. The studio used to open straight onto a formula field,
  so nothing on the screen said what the mode chosen elsewhere actually does.

  It is MODE-AWARE for every mode the product renders, not just `routedByCheck`: the copy and
  the three facts come from `checkModeCallout.js`, which is pure and is proven exhaustive
  against the reachable (activity, mode) pairs.

  Not the shared `Callout`, and the reason has narrowed rather than gone (issue 1505). That
  primitive now carries a title and an actions slot, so "one glyph plus one sentence" is no
  longer what separates the two. What still does is the FACT ROW: a run of label/value facts
  is an `InfoStrip`, which is deferred to issue 1521 because it has only one qualifying
  caller in the tree — and a paragraph plus a fact list under one title is still two shapes
  wearing one name. When the strip ships, this block is a `Callout` composing one.

  DORMANT modes (gathering's routed and progressive, disabled pending issue 683) render the
  same shape with the shipped dormancy sentence and a clock glyph, so a GM whose world already
  carries one of those modes is told it is not in use rather than shown a live configuration.

  Props:
   - activity / mode / alchemyCheckMode: what to describe.
   - outcomeCount: authored outcome tiers, for the `{count} tiers` fact.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { interpolate } from './checksCopy.js';
  import { describeCheckMode } from './checkModeCallout.js';

  let { activity = '', mode = '', alchemyCheckMode = '', outcomeCount = 0 } = $props();

  function text(entry) {
    const translated = localize(entry.key);
    return translated && translated !== entry.key ? translated : entry.fallback;
  }

  const described = $derived(describeCheckMode({ activity, mode, alchemyCheckMode, outcomeCount }));
</script>

{#if described}
  <section
    class={`manager-checks-mode-callout ${described.dormant ? 'is-dormant' : ''}`}
    data-checks-mode-callout={described.key}
  >
    <span class="manager-checks-mode-callout-icon">
      <i class={described.icon} aria-hidden="true"></i>
    </span>
    <div class="manager-checks-mode-callout-body">
      <h3 class="manager-checks-mode-callout-title" data-checks-mode-callout-title>
        {text(described.title)}
      </h3>
      <p class="manager-checks-mode-callout-lead">{text(described.body)}</p>
      <ul class="manager-checks-mode-callout-facts">
        {#each described.facts as entry (entry.id)}
          <li class="manager-checks-mode-callout-fact" data-checks-mode-fact={entry.id}>
            <i class={entry.icon} aria-hidden="true"></i>
            <span>{text(entry.label)}</span>
            <b>{interpolate(text(entry.value), entry.data)}</b>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}
