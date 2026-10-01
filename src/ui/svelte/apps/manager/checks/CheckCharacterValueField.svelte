<!-- Svelte 5 runes mode -->
<!--
  A character-value expression field with its live reading for the Preview-as actor: the
  roll-under target, and a counting pool's base and threshold (issue 2006), share this one field.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `character` | `{ name, rollData, readStored }` \| `null` | `null` | The Preview-as actor the reading resolves against. |
  | `label` | localized string | `''` | The input's accessible name; the field draws no visible caption. |
  | `hooks` | `{ expression, hint, resolution }` | `{}` | Full attribute names for the input, the hint line and the reading line, spelled out so each stays greppable. |
  | `inputAttrs` | plain object | `{}` | Attributes for the input, such as its `data-validation-target`; never event handlers. |
  | `placeholder` | string | `'@skills.craft.value'` | The input's placeholder. |
  | `documentPath` | `{ empty, unresolved, overridden }` \| `null` | `null` | Sentences (`{actor}`, `{path}`) that make this a plain stored-path input read through `character.readStored`. |

  Callbacks:
  - `onChange(expression)` — every keystroke, with the raw text.

  Invariants:
  - The reading never reads a missing path as zero: it names the path, and with no actor it says
    to choose one — `targetValueStatus`, pinned by `tests/components/check-count-authoring-mounted.test.js`.
  - A stored path is read from the document, never roll data, so an active effect's value reads as
    overridden — `tests/components/check-additional-dice-fields-mounted.test.js`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import { interpolate } from './checksCopy.js';
  import { targetValueStatus } from './checkTargetStatus.js';

  let {
    value = '',
    character = null,
    label = '',
    hooks = {},
    inputAttrs = {},
    placeholder = '@skills.craft.value',
    documentPath = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function storedPathStatus(path, copy) {
    const key = String(path ?? '').trim();
    if (!key) return { tone: 'danger', text: copy.empty };
    if (!character) {
      return {
        tone: 'muted',
        text: text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.ValueNoActor',
          'Choose a character in Preview as to see what this resolves to.'
        ),
      };
    }
    const read = character.readStored?.(key) ?? {};
    const words = { actor: character.name, path: key };
    if (typeof read.value !== 'number' || !Number.isFinite(read.value)) {
      return { tone: 'warning', text: interpolate(copy.unresolved, words) };
    }
    if (read.overridden) return { tone: 'warning', text: interpolate(copy.overridden, words) };
    const resolved = text(
      'FABRICATE.Admin.Manager.Checks.Evaluation.ValueResolved',
      '{actor} → {value}'
    );
    return { tone: 'resolved', text: interpolate(resolved, { ...words, value: read.value }) };
  }

  const resolution = $derived(
    documentPath ? storedPathStatus(value, documentPath) : targetValueStatus(value, character, text)
  );
  const uid = $props.id();
  const hintId = `${uid}-value-hint`;
  const resolutionId = `${uid}-value-resolution`;
  const attr = (name) => (name ? { [name]: '' } : {});
</script>

<div class="manager-checks-value-field">
  {#if documentPath}
    <input
      type="text"
      class={`manager-checks-value-path is-${resolution.tone}`}
      {...attr(hooks.expression)}
      {...inputAttrs}
      aria-label={label || undefined}
      aria-describedby={resolutionId}
      aria-invalid={resolution.tone === 'danger' || resolution.tone === 'warning'
        ? 'true'
        : 'false'}
      {value}
      {placeholder}
      oninput={(event) => onChange(event.currentTarget.value)}
    />
  {:else}
    <RollDataExpressionInput
      sigil={false}
      dataField={hooks.expression ? hooks.expression.replace(/^data-/u, '') : ''}
      inputAttrs={{
        ...attr(hooks.expression),
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
    <small class="visually-hidden" id={hintId} {...attr(hooks.hint)}>
      {text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.ValueHint',
        'A character path with its leading @, or arithmetic on paths without dice, such as @skills.craft.value - 2.'
      )}
    </small>
  {/if}
  {#if resolution}
    <small
      class={`manager-checks-value-resolution is-${resolution.tone}`}
      id={resolutionId}
      {...hooks.resolution ? { [hooks.resolution]: resolution.tone } : {}}>{resolution.text}</small
    >
  {/if}
</div>

<style>
  .manager-checks-value-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* Ancestor-qualified, so a `Field` around the value field cannot restyle its reading line. */
  .manager-checks-value-field .manager-checks-value-resolution {
    font-size: 10px;
    font-weight: 500;
    line-height: 1.45;
  }

  .manager-checks-value-field .manager-checks-value-resolution.is-muted {
    color: var(--fab-text-subtle);
  }

  .manager-checks-value-field .manager-checks-value-resolution.is-resolved {
    color: var(--fab-text-secondary);
  }

  .manager-checks-value-field .manager-checks-value-resolution.is-unresolved,
  .manager-checks-value-field .manager-checks-value-resolution.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-checks-value-field .manager-checks-value-resolution.is-warning {
    color: var(--fab-warning-text);
  }

  .manager-checks-value-path {
    font-family: var(--fab-font-mono);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-checks-value-field .manager-checks-value-path.is-danger[aria-invalid='true'] {
    border-color: var(--fab-danger-border);
  }

  .manager-checks-value-field .manager-checks-value-path.is-warning[aria-invalid='true'] {
    border-color: var(--fab-warning-border);
  }
</style>
