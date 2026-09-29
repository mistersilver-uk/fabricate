<!-- Svelte 5 runes mode -->
<!--
  `What actually gets rolled` for a counting check (issue 2006): the authored pool and threshold
  with each modifier chip on the term it moves, the face clauses, the Preview-as actor's composed
  pool and threshold, and the expected successes beside the kicker. The sum inset's markup and
  chip styling; the text comes from `countInsetModel.js`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `evaluation` / `thresholdMode` | normalized evaluation / `'meet'` \| `'exceed'` | — / `'meet'` | The authored pool. |
  | `character` / `placement` | `{ name, rollData }` / placement plan \| `null` | `null` | The actor line's inputs. |
  | `modifiers` | `[{ id, name, icon }]` | `[]` | The applied modifiers. |
  | `odds` | odds model \| `null` | `null` | The reading shows its expected net, and nothing while it abstains. |
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { countActorLine, countAuthoredTerms, countExpectedReading } from './countInsetModel.js';

  let {
    evaluation,
    thresholdMode = null,
    character = null,
    modifiers = [],
    placement = null,
    odds = null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const DEFAULT_MODIFIER_ICON = 'fas fa-wand-magic-sparkles';
  const authored = $derived(
    countAuthoredTerms(
      { evaluation, thresholdMode, modifiers: Array.isArray(modifiers) ? modifiers : [] },
      text
    )
  );
  const actorLine = $derived(
    countActorLine({ evaluation, thresholdMode, character, placement }, text)
  );
  const reading = $derived(countExpectedReading(odds));
</script>

<div class="manager-checks-formula-resolved is-count" data-check-formula-resolved>
  <i class="fas fa-equals" aria-hidden="true"></i>
  <div class="manager-checks-formula-resolved-body">
    <div class="manager-checks-count-inset-head">
      <p class="manager-checks-formula-kicker">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.ResolvedTitle', 'What actually gets rolled')}
      </p>
      {#if reading}
        <span
          class="manager-checks-formula-average"
          data-check-count-expected={reading.value}
          data-check-count-expected-status={reading.nearlyExact ? 'nearly-exact' : 'exact'}
        >
          {text('FABRICATE.Admin.Manager.Checks.Count.Expected', 'expected successes')}
          <span class="manager-checks-formula-average-value">{reading.value}</span>
          {#if reading.nearlyExact}
            <span class="visually-hidden"
              >{text(
                'FABRICATE.Admin.Manager.Checks.Count.ExpectedNearlyExact',
                'nearly exact'
              )}</span
            >
          {/if}
        </span>
      {/if}
    </div>
    <p class="manager-checks-formula-expression" data-check-count-composed>
      {#each authored.terms as term, index (index)}
        {#if term.kind === 'chip'}
          <span class="manager-checks-formula-chip" data-check-formula-modifier={term.modifier.id}>
            <i class={term.modifier.icon || DEFAULT_MODIFIER_ICON} aria-hidden="true"></i>
            <span>{term.modifier.name}</span>
          </span>
        {:else if term.kind === 'term'}
          <span class="manager-checks-formula-base">{term.text}</span>
        {:else if term.kind === 'word'}
          <span class="manager-checks-formula-comparison">{term.text}</span>
        {:else}
          <span class={`manager-checks-formula-${term.kind}`}>{term.text}</span>
        {/if}
      {/each}
      {#each authored.clauses as clause (clause)}
        <span class="manager-checks-formula-comparison" data-check-count-clause>· {clause}</span>
      {/each}
    </p>
    <p
      class={`manager-checks-formula-rule is-${actorLine.tone}`}
      data-check-count-actor-line={actorLine.tone}
    >
      {actorLine.text}
    </p>
  </div>
</div>

<style>
  .manager-checks-count-inset-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .manager-checks-count-inset-head .manager-checks-formula-average {
    margin-left: auto;
  }

  .manager-checks-formula-comparison {
    color: var(--fab-text-subtle);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-checks-formula-rule.is-unresolved {
    color: var(--fab-danger-text);
  }
</style>
