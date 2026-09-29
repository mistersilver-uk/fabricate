<!-- Svelte 5 runes mode -->
<!--
  A character-value expression field with its live reading for the Preview-as actor: the
  roll-under target, and a counting pool's base and threshold (issue 2006), share this one field.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `character` | `{ name, rollData }` \| `null` | `null` | The Preview-as actor the reading resolves against. |
  | `label` | localized string | `''` | The input's accessible name; the field draws no visible caption. |
  | `hook` | string | `''` | Names the hooks: `data-{hook}-expression` on the input, `-expression-hint` and `-resolution` on the lines. |
  | `inputAttrs` | plain object | `{}` | Attributes for the input, such as its `data-validation-target`; never event handlers. |
  | `placeholder` | string | `'@skills.craft.value'` | The input's placeholder. |

  Callbacks:
  - `onChange(expression)` — every keystroke, with the raw text.

  Invariants:
  - The reading never reads a missing path as zero: it names the path, and with no actor it says
    to choose one — `targetValueStatus`, pinned by `tests/components/check-count-authoring-mounted.test.js`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import { targetValueStatus } from './checkTargetStatus.js';

  let {
    value = '',
    character = null,
    label = '',
    hook = '',
    inputAttrs = {},
    placeholder = '@skills.craft.value',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const resolution = $derived(targetValueStatus(value, character, text));
  const uid = $props.id();
  const hintId = `${uid}-value-hint`;
  const resolutionId = `${uid}-value-resolution`;
  const attr = (suffix) => (hook ? { [`data-${hook}${suffix}`]: '' } : {});
</script>

<div class="manager-checks-value-field">
  <RollDataExpressionInput
    sigil={false}
    dataField={hook ? `${hook}-expression` : ''}
    inputAttrs={{
      ...attr('-expression'),
      ...inputAttrs,
      'aria-label': label,
      'aria-describedby': resolution ? `${hintId} ${resolutionId}` : hintId,
    }}
    {value}
    {placeholder}
    {onChange}
  />
  <!-- The path syntax stays the field's description for assistive tech; the prototype draws only
       the live reading beneath the field. -->
  <small class="visually-hidden" id={hintId} {...attr('-expression-hint')}>
    {text(
      'FABRICATE.Admin.Manager.Checks.Evaluation.ValueHint',
      'A character path with its leading @, or arithmetic on paths without dice, such as @skills.craft.value - 2.'
    )}
  </small>
  {#if resolution}
    <small
      class={`manager-checks-value-resolution is-${resolution.tone}`}
      id={resolutionId}
      {...hook ? { [`data-${hook}-resolution`]: resolution.tone } : {}}>{resolution.text}</small
    >
  {/if}
</div>

<style>
  .manager-checks-value-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .manager-checks-value-resolution {
    font-size: 10px;
    font-weight: 500;
    line-height: 1.45;
  }

  .manager-checks-value-resolution.is-muted {
    color: var(--fab-text-subtle);
  }

  .manager-checks-value-resolution.is-resolved {
    color: var(--fab-text-secondary);
  }

  .manager-checks-value-resolution.is-unresolved {
    color: var(--fab-danger-text);
  }
</style>
