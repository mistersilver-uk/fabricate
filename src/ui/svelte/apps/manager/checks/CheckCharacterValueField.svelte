<!-- Svelte 5 runes mode -->
<!--
  A check's character value: the expression field with its reading for the Preview-as actor, and
  the Studio's own line for what that reading cannot say. The roll-under target, and a counting
  pool's base and threshold (issue 2006), share this one field.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `character` | `{ name, rollData, readStored }` \| `null` | `null` | The Preview-as actor the reading resolves against; `null` passes the field no resolver. |
  | `label` | localized string | `''` | The input's accessible name; the field draws no visible caption. |
  | `hooks` | `{ expression, hint, resolution }` | `{}` | Full attribute names for the input, the hint line and the Studio's line, spelled out so each stays greppable. |
  | `validationTarget` | string | `''` | The Validation route's id for the input, written as its `data-validation-target` in either mode. |
  | `placeholder` | string | `'@skills.craft.value'` | The input's placeholder. |
  | `documentPath` | `{ empty, unresolved, overridden }` \| `null` | `null` | Sentences (`{actor}`, `{path}`) that make this a stored-path field, whose reading is the number `character.readStored` gives. |

  Callbacks:
  - `onChange(expression)` — every keystroke, with the raw text.

  Invariants:
  - An expression's reading is the field's: `= {n}` where it reduces for the actor, the
    `Unresolved` statement where it does not, and none with no actor. A resolved value draws no
    line — `tests/components/check-under-authoring-mounted.test.js`.
  - The line never reads a missing path as zero: it names the path, and with no actor it says
    to choose one — `targetValueStatus`, pinned by `tests/components/check-count-authoring-mounted.test.js`.
  - A stored path is read from the document, never roll data: its reading is the stored number,
    and a missing number or one an active effect overrides reads `Unresolved` over the warning
    line — `tests/components/check-additional-dice-fields-mounted.test.js`.
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import { interpolate } from './checksCopy.js';
  import { resolveCharacterValue, targetValueStatus } from './checkTargetStatus.js';

  let {
    value = '',
    character = null,
    label = '',
    hooks = {},
    validationTarget = '',
    placeholder = '@skills.craft.value',
    documentPath = null,
    onChange = () => {},
  } = $props();

  /** The character's stored number at `path`: whether one is stored, and its value unless overridden. */
  function readStoredNumber(path) {
    const read = character?.readStored?.(String(path ?? '').trim()) ?? {};
    const stored = typeof read.value === 'number' && Number.isFinite(read.value);
    return { stored, value: stored && !read.overridden ? read.value : null };
  }

  function storedPathStatus(path, copy) {
    const key = String(path ?? '').trim();
    if (!key) return { tone: 'danger', text: copy.empty };
    if (!character) {
      return {
        tone: 'muted',
        text: localizeOr(
          'FABRICATE.Admin.Manager.Checks.Evaluation.ValueNoActor',
          'Choose a character in Preview as to see what this resolves to.'
        ),
      };
    }
    const { stored, value: number } = readStoredNumber(key);
    if (number !== null) return null;
    const sentence = stored ? copy.overridden : copy.unresolved;
    return { tone: 'warning', text: interpolate(sentence, { actor: character.name, path: key }) };
  }

  const resolution = $derived(
    documentPath
      ? storedPathStatus(value, documentPath)
      : targetValueStatus(value, character, localizeOr)
  );
  const unresolvedLabel = localizeOr(
    'FABRICATE.Admin.Manager.Checks.Evaluation.ReadingUnresolved',
    'Unresolved'
  );
  const resolveExpression = $derived(
    character ? (expression) => resolveCharacterValue(expression, character.rollData) : undefined
  );
  const resolveStored = $derived(character ? (path) => readStoredNumber(path).value : undefined);
  const pathFaulted = $derived(resolution?.tone === 'danger' || resolution?.tone === 'warning');
  const uid = $props.id();
  const hintId = `${uid}-value-hint`;
  const resolutionId = `${uid}-value-resolution`;
  const attr = (name) => (name ? { [name]: '' } : {});
</script>

<div class="manager-checks-value-field">
  {#if documentPath}
    <RollDataExpressionInput
      class={resolution
        ? `manager-checks-value-path is-${resolution.tone}`
        : 'manager-checks-value-path'}
      {...attr(hooks.expression)}
      data-validation-target={validationTarget || undefined}
      aria-label={label || undefined}
      aria-describedby={resolution ? resolutionId : undefined}
      aria-invalid={pathFaulted ? 'true' : 'false'}
      {value}
      {placeholder}
      resolve={resolveStored}
      {unresolvedLabel}
      {onChange}
    />
  {:else}
    <RollDataExpressionInput
      {...attr(hooks.expression)}
      data-validation-target={validationTarget || undefined}
      aria-label={label || undefined}
      aria-describedby={resolution ? `${resolutionId} ${hintId}` : hintId}
      {value}
      {placeholder}
      resolve={resolveExpression}
      {unresolvedLabel}
      {onChange}
    />
    <!-- The path syntax stays the field's description for assistive tech; the prototype draws only
       the live reading beneath the field. -->
    <small class="visually-hidden" id={hintId} {...attr(hooks.hint)}>
      {localizeOr(
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

  .manager-checks-value-field .manager-checks-value-resolution.is-unresolved,
  .manager-checks-value-field .manager-checks-value-resolution.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-checks-value-field .manager-checks-value-resolution.is-warning {
    color: var(--fab-warning-text);
  }

  .manager-checks-value-field :global(.manager-checks-value-path.is-danger[aria-invalid='true']) {
    border-color: var(--fab-danger-border);
  }

  .manager-checks-value-field :global(.manager-checks-value-path.is-warning[aria-invalid='true']) {
    border-color: var(--fab-warning-border);
  }
</style>
