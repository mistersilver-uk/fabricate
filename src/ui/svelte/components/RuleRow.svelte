<!--
  One condition → effect rule, edited in place: its head states the rule, its field chain edits it,
  and its `RuleSentence` restates it. A rule not yet authored offers its presets instead.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `schema` | `{ head, steps, sentence?, missingClauseKey?, labels }` | `{}` | `head(value)` returns `{ glyph, tone?, title, chip? }`, already localized. `steps` is the field chain in order, each `{ key, legend?, render }` with `render` a snippet taking `(value, change)`; the caller derives it, so each step narrows the next. `sentence(value)` returns a `RuleSentence` sentence. `labels` is `{ remove, expand?, collapse? }`, localized. |
  | `value` | rule object or `null` | `null` | Bindable. `null` is a rule not yet authored, drawn as its presets alone. |
  | `presets` | `{ id, label, icon?, value }[]` | `[]` | Starting points for an unauthored rule; a function `value` is called on choice, so every chosen rule is fresh. |
  | `collapsible` | boolean or `{ open, onToggle(next) }` | `false` | A head that discloses the field chain, which scrolls itself into the nearest view on opening; the object form lets a list keep one rule open. Without it the head, the chain and the remove sit on one line. |

  Callbacks:
  - `onChange(next)` — required; every edit as the whole next rule, `null` when the rule is
    removed, or, from an unauthored row, the chosen preset's rule for the caller to add.

  Rest spread:
  - `{...rest}` lands on the root, written after `class={…}`; it carries the caller's row hook.

  Invariants:
  - Each part carries its own `data-rule-row-*` hook, so a caller addresses a part under its row
    hook — pinned by `tests/components/rule-row-mounted.test.js`.
-->
<script>
  import Button from './Button.svelte';
  import IconButton from './IconButton.svelte';
  import RuleSentence from './RuleSentence.svelte';

  let {
    schema = {},
    value = $bindable(null),
    onChange,
    presets = [],
    collapsible = false,
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const bodyId = `${uid}-body`;
  let ownOpen = $state(false);
  let node = $state(null);

  const controlled = $derived(Boolean(collapsible) && typeof collapsible === 'object');
  const open = $derived(controlled ? collapsible.open === true : Boolean(collapsible) && ownOpen);
  const head = $derived(value == null ? {} : (schema.head?.(value) ?? {}));
  const sentence = $derived(value == null ? null : (schema.sentence?.(value) ?? null));
  const labels = $derived(schema.labels ?? {});
  const classes = $derived(['fabricate-rule-row', open && 'is-expanded', extraClass]);

  $effect(() => {
    if (open && node) node.scrollIntoView?.({ block: 'nearest' });
  });

  function change(next) {
    if (next !== null) value = next;
    onChange(next);
  }

  function toggle() {
    if (controlled) collapsible.onToggle?.(!open);
    else ownOpen = !ownOpen;
  }

  // The unauthored row stays unauthored: its chosen rule is the caller's to add.
  function choose(preset) {
    const rule = typeof preset.value === 'function' ? preset.value() : preset.value;
    if (rule) onChange(rule);
  }
</script>

{#snippet remove()}
  <IconButton
    class="is-danger fabricate-rule-row-remove"
    data-rule-row-remove=""
    ariaLabel={labels.remove}
    onclick={() => change(null)}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
  </IconButton>
{/snippet}

{#if value == null}
  <div class={classes} {...rest}>
    {#each presets as preset (preset.id)}
      <Button role="dashed" data-rule-row-preset={preset.id} onclick={() => choose(preset)}>
        {#if preset.icon}<i class={preset.icon} aria-hidden="true"></i>{/if}
        <span>{preset.label}</span>
      </Button>
    {/each}
  </div>
{:else if collapsible}
  <div class={classes} {...rest} bind:this={node}>
    <div class="fabricate-rule-row-head">
      <!-- The whole head is the disclosure; the remove is its sibling, a button inside a button being invalid. -->
      <button
        type="button"
        data-keyboard-focus="true"
        class="fabricate-rule-row-disclosure"
        data-rule-row-disclosure=""
        aria-expanded={open}
        aria-controls={bodyId}
        onclick={toggle}
      >
        <span class={`fabricate-rule-row-glyph is-${head.tone ?? 'neutral'}`} aria-hidden="true">
          <i class={head.glyph}></i>
        </span>
        <span class="fabricate-rule-row-headline">
          <span class="fabricate-rule-row-title" data-rule-row-title="">{head.title}</span>
          <RuleSentence
            class="fabricate-rule-row-lead"
            {sentence}
            missingClauseKey={schema.missingClauseKey}
          />
        </span>
        {#if head.chip}
          <span class={`fabricate-rule-row-chip is-${head.tone ?? 'neutral'}`} data-rule-row-chip=""
            >{head.chip}</span
          >
        {/if}
        <i
          class={`fas ${open ? 'fa-chevron-up' : 'fa-chevron-down'} fabricate-rule-row-chevron`}
          aria-hidden="true"
        ></i>
        <span class="visually-hidden">{open ? labels.collapse : labels.expand}</span>
      </button>
      {@render remove()}
    </div>
    {#if open}
      <div class="fabricate-rule-row-body" id={bodyId} data-rule-row-body="">
        {#each schema.steps ?? [] as step (step.key)}
          {#if step.legend}<p class="fabricate-rule-row-legend">{step.legend}</p>{/if}
          {@render step.render(value, change)}
        {/each}
        <p class="fabricate-rule-row-quote" data-rule-row-quote="">
          <i class="fas fa-quote-left" aria-hidden="true"></i>
          <RuleSentence {sentence} missingClauseKey={schema.missingClauseKey} />
        </p>
      </div>
    {/if}
  </div>
{:else}
  <div class={classes} {...rest}>
    <header class="fabricate-rule-row-line">
      <span class="fabricate-rule-row-icon"><i class={head.glyph} aria-hidden="true"></i></span>
      <span class="fabricate-rule-row-label" data-rule-row-title="">{head.title}</span>
      {#each schema.steps ?? [] as step (step.key)}
        {@render step.render(value, change)}
      {/each}
      {@render remove()}
    </header>
  </div>
{/if}
