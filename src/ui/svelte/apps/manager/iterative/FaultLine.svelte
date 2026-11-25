<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the app's field-mark text with the iterative editor's readiness codes, shared by its cards rather than offered as a vocabulary member -->
<!--
  The marks beside one field of the Crafting Action editor: one line per fault, each carrying the
  readiness code Validation reports for it as `data-issue-code`. `Field` has no error prop, so the
  line is the caller's, tied to its control through `id` and `aria-describedby`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `faults` | `{ code, reason? }[]` | `[]` | the marks from `iterativeFieldFaults.js`; none draws nothing |
  | `id` | string | `''` | the first line's id, for the control's `aria-describedby` |
  | `sentence` | `(fault) => string \| undefined` | none | a caller's own wording for a fault; `undefined` leaves the shared sentence |
  | `text` | the shell's localizer | — | `(key, fallback)` |
-->
<script>
  import { faultSentence, isWarningFault } from './iterativeFieldFaults.js';

  let {
    faults = [],
    id = '',
    sentence = () => undefined,
    text = (_key, fallback) => fallback,
  } = $props();
</script>

{#each faults as fault, index (`${fault.code}:${fault.reason ?? ''}:${index}`)}
  <p
    class="manager-iterative-fault"
    class:is-warning={isWarningFault(fault)}
    id={index === 0 && id ? id : undefined}
    data-issue-code={fault.code}
  >
    <i
      class={isWarningFault(fault) ? 'fas fa-triangle-exclamation' : 'fas fa-circle-xmark'}
      aria-hidden="true"
    ></i>
    <span>{sentence(fault) ?? faultSentence(fault, text)}</span>
  </p>
{/each}

<style>
  .manager-iterative-fault {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 0.66rem;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .manager-iterative-fault.is-warning {
    color: var(--fab-warning-text);
  }

  .manager-iterative-fault i {
    flex: none;
    margin-top: var(--fab-space-2xs);
  }
</style>
