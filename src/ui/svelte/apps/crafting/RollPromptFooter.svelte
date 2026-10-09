<!--
  The roll prompt's footer: one row of Disadvantage / Roll / Advantage as the offer allows, or one
  Roll, then the note saying why an action is disabled (issue 2008). The root is the modal footer's
  one equal child, so the row's buttons share its width.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `actions` | the view's footer `actions` | none | `{ action, label, note, name, submit }` each, left to right. |
  | `blocked` | `{ disadvantage, normal, advantage }` booleans | all `false` | An action that cannot reach the successes it needs; the single `roll` reads `normal`. |
  | `blockNote` | string | `''` | The localized note under the row while anything is blocked. |
  | `onAction(form, action)` | function | no-op | A non-submit action's click; Roll answers through the form's submit. |

  Invariants:
  - Roll is the form's only submit button, so Enter from any field rolls normally; Disadvantage and
    Advantage are `type="button"` — pinned by `tests/components/roll-prompt-mounted.test.js`.
  - A blocked action stays in place with `aria-disabled`, never the native `disabled`, and names the
    note; the prompt's own `answer()` refuses it.
-->
<script>
  import { noteOverflow } from './noteOverflow.js';

  const UNBLOCKED = { disadvantage: false, normal: false, advantage: false };

  let { actions, blocked = UNBLOCKED, blockNote = '', onAction = () => {} } = $props();
  const instanceId = $props.id();
  const noteId = `${instanceId}-block-note`;
  const isBlocked = (action) => blocked[action === 'roll' ? 'normal' : action] === true;

  // A note earns a `title` only when it clips (see `noteOverflow.js`).
  let truncatedNotes = $state({});
  const markTruncated = (key, clipped) => (truncatedNotes = { ...truncatedNotes, [key]: clipped });
</script>

<div class="prompt-footer" data-roll-prompt-footer>
  <div class="prompt-actions" data-roll-prompt-actions>
    {#each actions as action (action.action)}
      {@const disabled = isBlocked(action.action)}
      <button
        type={action.submit ? 'submit' : 'button'}
        class="prompt-action"
        class:is-primary={action.submit}
        data-action={action.action}
        data-keyboard-focus="true"
        aria-label={action.name}
        aria-disabled={disabled ? 'true' : undefined}
        aria-describedby={disabled && blockNote ? noteId : undefined}
        title={action.note && truncatedNotes[action.action] ? action.note : undefined}
        onclick={action.submit
          ? undefined
          : (event) => onAction(event.currentTarget.form, action.action)}
        ><span>{action.label}</span>{#if action.note}<small
            class="action-note"
            use:noteOverflow={{ key: action.action, onMeasure: markTruncated }}>{action.note}</small
          >{/if}</button
      >
    {/each}
  </div>
  {#if blockNote}
    <p class="block-note" id={noteId} role="status" data-roll-prompt-block-note>{blockNote}</p>
  {/if}
</div>

<style>
  .prompt-footer {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }
  .prompt-actions {
    display: flex;
    gap: var(--fab-space-2);
  }
  .prompt-action {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--fab-space-2xs) / 2);
    min-width: 0;
    box-sizing: border-box;
    height: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0 calc(var(--fab-space-2) + var(--fab-space-2xs));
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    appearance: none;
    -webkit-appearance: none;
    background: var(--fab-bg-1);
    color: var(--fab-text-secondary);
    font-size: 12px;
    font-weight: 700;
    line-height: normal;
    cursor: pointer;
  }
  .prompt-action:not(.is-primary, [aria-disabled='true']):hover {
    border-color: var(--fab-accent-border);
    color: var(--fab-text);
  }
  .prompt-action.is-primary {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }
  .prompt-action[aria-disabled='true'] {
    opacity: 0.45;
    cursor: not-allowed;
  }
  /* One line: the full note is always the button's accessible name, and its `title` too once this
     ellipsis actually clips it (measured in the script above). */
  .action-note {
    display: block;
    max-width: 100%;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-size: 9.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .block-note {
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.5;
  }
</style>
