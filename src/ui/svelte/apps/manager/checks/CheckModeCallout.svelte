<!-- Svelte 5 runes mode -->
<!--
  WHAT THIS MODE DOES — the roll section's opening callout: a dice glyph, the mode's name, one
  paragraph on what it does with a roll, and a facts row. MODE-AWARE for every mode the product
  renders, from the pure `checkModeCallout.js`, which is proven exhaustive.

  Not the shared `Callout`, and what still separates the two is the FACT ROW: a run of
  label/value facts is an `InfoStrip`, deferred while it has one qualifying caller, and a
  paragraph plus a fact list under one title is two shapes wearing one name.

  DORMANT modes render the same shape with the shipped dormancy sentence and a clock glyph.
  Props: activity / mode / alchemyCheckMode; outcomeCount, for the `{count} tiers` fact.
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
