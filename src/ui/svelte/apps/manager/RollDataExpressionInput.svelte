<!--
  The design system's `<ExprInput>`: a roll-expression field that shows and writes the stored text
  unchanged, with an optional reading of what it resolves to and an optional row of tokens that
  insert a term at the caret. It states the mono face and draws no box; the box is its host's.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `placeholder` | string | `''` | The caller's example, which is where a leading `@` is taught. |
  | `disabled` | boolean | `false` | Disables the input and every token together; the reading stays. |
  | `tokens` | string[] | `[]` | The insertable terms in row order, each a single term; a blank one is dropped. |
  | `tokensLabel` | string | `''` | The token group's accessible name, required with `tokens` and never defaulted. |
  | `resolve` | `(expression) => number \| null` | `undefined` | Synchronous, and absent where no actor is in scope. Never called for a blank expression; a throw, or a result that is not a finite number, reads as `null`. |
  | `unresolvedLabel` | string | `''` | The caller's statement that the expression does not reduce, drawn trimmed; required with `resolve` and never defaulted. |
  | `class` | class string | `''` | An extra class, appended to `fab-expr-input`. |

  Callbacks:
  - `onChange(expression)` — every keystroke with the text as typed, and once for a pressed token
    with the whole expression.

  Rest spread:
  - `{...rest}` lands on the `<input>`, written after `class={…}`: the caller's hook, name,
    description and invalid state.

  Invariants:
  - Three roots and nothing wrapping the input: the input; one row, drawn only while it holds a
    reading or a token; and the status region, mounted with `resolve` and beside the row.
  - The row holds the reading first, then the tokens in a group named by `tokensLabel`; the group
    holds the tokens alone, and the row carries no role and no name.
  - The reading describes the field: its id is written ahead of the caller's `aria-describedby`.
  - The status region speaks the reading once typing has settled, or once focus has returned to
    the field after a pressed token, and only where that edit changed it; a reading that changes
    for any other reason empties the region, as does an edit that settles after the resolver or
    the statement moved the reading under an expression that stood.
  - A caller that echoes the value later than that wait (500ms typed, the focus helper's delay
    pressed) draws the reading, which is then not spoken.
  - A pressed token replaces a partial selection, and joins the end when the whole expression is
    selected or the caret or an edge of the selection stands inside a term; it then returns focus
    with the caret after it. Nothing adds or strips an `@`.
  - A caller's `oninput` is not honoured: the component's own follows the spread. All pinned by
    `tests/components/expr-input-mounted.test.js`.
-->
<script>
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';

  /** How long typing must rest before the reading is spoken. */
  const TYPING_SETTLE_MS = 500;

  let {
    value = '',
    placeholder = '',
    disabled = false,
    tokens = [],
    tokensLabel = '',
    resolve = undefined,
    unresolvedLabel = '',
    class: extraClass = '',
    onChange = () => {},
    ...rest
  } = $props();

  const uid = $props.id();
  const readingId = `${uid}-reading`;

  let input = $state(null);
  let spoken = $state('');
  // Plain, not `$state`: the effect below must re-run for a changed reading or expression alone.
  let heard = '';
  let pending = false;
  let overtaken = false;
  let seen = { expression: '', reading: '' };
  let serial = 0;
  let timer;
  let resolverThrew = false;
  let statementMissed = false;

  const drawnTokens = $derived(
    (Array.isArray(tokens) ? tokens : []).map((token) => String(token ?? '').trim()).filter(Boolean)
  );

  $effect(() => {
    if (drawnTokens.length === 0 || tokensLabel) return;
    console.warn(
      'Fabricate | ExprInput: `tokens` were passed with no `tokensLabel`, so the row of tokens ' +
        'is a group with no accessible name.'
    );
  });

  const statement = $derived(String(unresolvedLabel ?? '').trim());

  $effect(() => {
    if (typeof resolve !== 'function' || statement || statementMissed) return;
    statementMissed = true;
    console.warn(
      'Fabricate | ExprInput: `resolve` was passed with no `unresolvedLabel`, so an expression ' +
        'that does not reduce draws no reading.'
    );
  });

  /** What `resolver` makes of `expression`: a finite number, else `null`, a throw included. */
  function resolvedNumber(resolver, expression) {
    try {
      const answer = resolver(expression);
      return typeof answer === 'number' && Number.isFinite(answer) ? answer : null;
    } catch (error) {
      if (!resolverThrew) {
        resolverThrew = true;
        console.error(
          'Fabricate | ExprInput: `resolve` threw, so the expression reads as unresolved.',
          error
        );
      }
      return null;
    }
  }

  // Over `value` and `resolve` alone, so the resolver is called once per expression.
  const result = $derived.by(() => {
    const expression = String(value ?? '');
    if (typeof resolve !== 'function' || expression.trim() === '') return undefined;
    return resolvedNumber(resolve, expression);
  });
  const reduced = $derived(typeof result === 'number');

  function readingOf(outcome, label) {
    if (outcome === undefined) return '';
    return outcome === null ? label : `= ${outcome}`;
  }

  const readingText = $derived(readingOf(result, statement));

  /** The reading's id, then the caller's own description; `undefined` writes no attribute. */
  function describedBy(own, callers) {
    return `${own} ${callers ?? ''}`.trim() || undefined;
  }

  // A reading no pending edit made is taken as heard, never spoken. One that moves while an edit
  // waits, under an expression that stood, overtook that edit: the resolver or the statement moved
  // it. The resolver's identity says nothing, since a caller may hand a new one with every echo.
  $effect(() => {
    const now = { expression: String(value ?? ''), reading: readingText };
    const moved = now.reading !== seen.reading;
    const edited = now.expression !== seen.expression;
    seen = now;
    if (!moved) return;
    if (!pending) {
      heard = now.reading;
      spoken = '';
    } else if (!edited) {
      overtaken = true;
    }
  });

  $effect(() => () => {
    serial += 1;
    clearTimeout(timer);
  });

  /** Opens an edit and answers its serial: only the latest edit's announcement may speak. */
  function openEdit() {
    pending = true;
    overtaken = false;
    serial += 1;
    clearTimeout(timer);
    return serial;
  }

  /** Speaks the edit's reading; one the resolver or the statement overtook is taken as heard. */
  function speak(mine) {
    if (mine !== serial) return;
    pending = false;
    if (!overtaken && readingText === heard) return;
    heard = readingText;
    spoken = overtaken ? '' : readingText;
  }

  function typed(event) {
    const mine = openEdit();
    // Armed first: a caller whose `onChange` throws must not leave the edit open.
    timer = setTimeout(() => speak(mine), TYPING_SETTLE_MS);
    onChange(event.currentTarget.value);
  }

  /** Whether `character` belongs to a term: anything but whitespace, an operator, a bracket or a comma. */
  function isTermCharacter(character) {
    return Boolean(character) && !/[\s+\-*/%(),]/u.test(character);
  }

  /** Where a token lands: the selection, or the end where no insertion point was placed. */
  function insertionRange(text, start, end) {
    const wholeValue = start === 0 && end === text.length && text.trim() !== '';
    const splits = (index) =>
      isTermCharacter(text[index - 1]) && (isTermCharacter(text[index]) || text[index] === '(');
    const insideTerm = splits(start) || splits(end);
    return wholeValue || insideTerm ? [text.length, text.length] : [start, end];
  }

  function leftJoin(left) {
    if (left === '') return '';
    return /[+\-*/%(,]$/u.test(left) ? ' ' : ' + ';
  }

  function rightJoin(right) {
    if (right === '' || /^[),]/u.test(right)) return '';
    return /^[+\-*/%]/u.test(right) ? ' ' : ' + ';
  }

  function insertToken(token) {
    const mine = openEdit();
    const expression = input.value;
    const [start, end] = insertionRange(expression, input.selectionStart, input.selectionEnd);
    const left = expression.slice(0, start).trim();
    const right = expression.slice(end).trim();
    const head = `${left}${leftJoin(left)}${token}`;
    // Written whole and with explicit indices; the caret is then set, since `'end'` leaves it last.
    input.setRangeText(`${head}${rightJoin(right)}${right}`, 0, expression.length, 'end');
    onChange(input.value);
    input.focus();
    input.setSelectionRange(head.length, head.length);
    announceAfterFocusMove(
      () => document.activeElement === input,
      () => speak(mine)
    );
  }
</script>

<input
  bind:this={input}
  type="text"
  class={['fab-expr-input', extraClass]}
  value={String(value ?? '')}
  {placeholder}
  {disabled}
  {...rest}
  aria-describedby={describedBy(readingText ? readingId : '', rest['aria-describedby'])}
  oninput={typed}
/>
{#if readingText || drawnTokens.length > 0}
  <div class="fab-expr-input-row">
    {#if readingText}
      <Chip
        id={readingId}
        class="fab-expr-input-reading"
        tone={reduced ? 'info' : 'secondary'}
        density="inspector"
        mono={reduced}
        data-expr-input-reading={reduced ? 'resolved' : 'unresolved'}>{readingText}</Chip
      >
    {/if}
    {#if drawnTokens.length > 0}
      <div class="fab-expr-input-tokens" role="group" aria-label={tokensLabel || undefined}>
        {#each drawnTokens as token, index (index)}
          <Button
            role="dashed"
            class="fab-expr-input-token"
            {disabled}
            onclick={() => insertToken(token)}
          >
            <span class="fab-truncate">{token}</span>
          </Button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
{#if typeof resolve === 'function'}
  <span class="visually-hidden" role="status" data-expr-input-status>{spoken}</span>
{/if}

<style>
  .fab-expr-input {
    font-family: var(--fab-font-mono);
    font-size: 11.5px;
    font-weight: 500;
  }

  .fab-expr-input-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* The group is a name around the tokens, never a box: the row stays the one wrapping line. */
  .fab-expr-input-tokens {
    display: contents;
  }

  /* Clears the dashed role's 34px height and 600 weight, which the module sheet states at (0,4,0). */
  .fab-expr-input-row
    :global(.fabricate-button.fabricate-button.fab-manager-button.fab-expr-input-token) {
    flex: 0 1 auto;
    min-width: 0;
    height: 26px;
    min-height: 26px;
    border-radius: 7px;
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 500;
    line-height: normal;
  }
</style>
