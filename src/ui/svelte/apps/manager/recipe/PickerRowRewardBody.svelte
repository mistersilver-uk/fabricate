<!-- Svelte 5 runes mode -->
<!--
  What a reward row says beneath itself: a named currency result's naming body, "Call it" and
  "Why they get it" over a closing line stating what the player sees, or a knowledge result's one
  help line. A part of `PickerRow`, drawn only on a result surface's rows.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kind` | `'currency'` \| `'knowledge'` | `'currency'` | Any other kind draws nothing. |
  | `label` / `reason` | strings | `''` | The currency result's stored `label` and `reason`, drawn as stored. |
  | `unitName` | string | `''` | The named unit, which the closing line falls back to. |
  | `disabled` | boolean | `false` | Both fields off. |

  Callbacks:
  - `onChange(patch)` — `{ label }` or `{ reason }` as typed; a blank one removes its key upstream.

  Invariants:
  - Both fields are optional, so a currency row is complete without them. Pinned by
    `tests/components/picker-row-reward-mounted.test.js`.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';

  let {
    kind = 'currency',
    label = '',
    reason = '',
    unitName = '',
    disabled = false,
    onChange = () => {},
  } = $props();

  const named = $derived(String(label || '').trim());
  const why = $derived(String(reason || '').trim());
  const closing = $derived(
    named || why
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.RewardPlayerSees', 'The player sees: {text}', {
          text: [named || unitName, why].filter(Boolean).join(' · '),
        })
      : localizeOr(
          'FABRICATE.Admin.Manager.Recipe.RewardNoDescription',
          'No description — the player just sees {unit}.',
          { unit: unitName }
        )
  );
</script>

{#if kind === 'currency'}
  <div class="manager-recipe-reward-body" data-recipe-reward-body>
    <div class="manager-recipe-reward-fields">
      <Field as="label" class="manager-recipe-reward-label">
        <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.RewardLabel', 'Call it')}</span>
        <input
          type="text"
          data-recipe-reward-label
          value={label || ''}
          placeholder={unitName}
          {disabled}
          oninput={(event) => onChange({ label: event.currentTarget.value })}
        />
      </Field>
      <Field as="label" class="manager-recipe-reward-reason">
        <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.RewardReason', 'Why they get it')}</span>
        <input
          type="text"
          data-recipe-reward-reason
          value={reason || ''}
          {disabled}
          oninput={(event) => onChange({ reason: event.currentTarget.value })}
        />
      </Field>
    </div>
    <p class="manager-muted manager-recipe-reward-closing" data-recipe-reward-closing>{closing}</p>
  </div>
{:else if kind === 'knowledge'}
  <p class="manager-muted manager-recipe-reward-hint" data-recipe-knowledge-hint>
    {localizeOr(
      'FABRICATE.Admin.Manager.Recipe.KnowledgeResultHint',
      'Crafting this teaches the recipe. Players see its name in the results only if they can already see that recipe; otherwise they see “Unknown recipe”.'
    )}
  </p>
{/if}
