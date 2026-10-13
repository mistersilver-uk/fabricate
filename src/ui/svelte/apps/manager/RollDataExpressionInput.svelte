<!--
  The design system's `<ExprInput>`: a roll-expression field that shows and writes the stored text
  unchanged, with an optional row of tokens that insert a term at the caret. It states the mono
  face and draws no box; the box is its host's.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `placeholder` | string | `''` | The caller's example, which is where a leading `@` is taught. |
  | `disabled` | boolean | `false` | Disables the input and every token together. |
  | `tokens` | string[] | `[]` | The insertable terms in row order, each a single term; a blank one is dropped. |
  | `tokensLabel` | string | `''` | The row's accessible name, required with `tokens` and never defaulted. |
  | `class` | class string | `''` | An extra class, appended to `fab-expr-input`. |

  Callbacks:
  - `onChange(expression)` — every keystroke with the text as typed, and once for a pressed token
    with the whole expression.

  Rest spread:
  - `{...rest}` lands on the `<input>`, written after `class={…}`: the caller's hook, name,
    description and invalid state.

  Invariants:
  - The input is the first root and nothing wraps it; the one further node is the token row, drawn
    only when a token is left to draw. Nothing adds or strips an `@`.
  - A pressed token replaces a partial selection, and joins the end when the whole expression is
    selected or the caret or an edge of the selection stands inside a term; it then returns focus
    with the caret after it.
  - A caller's `oninput` is not honoured: the component's own follows the spread. All pinned by
    `tests/components/expr-input-mounted.test.js`.
-->
<script>
  import Button from '../../components/Button.svelte';

  let {
    value = '',
    placeholder = '',
    disabled = false,
    tokens = [],
    tokensLabel = '',
    class: extraClass = '',
    onChange = () => {},
    ...rest
  } = $props();

  let input = $state(null);

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
  oninput={(event) => onChange(event.currentTarget.value)}
/>
{#if drawnTokens.length > 0}
  <div class="fab-expr-input-row" role="group" aria-label={tokensLabel || undefined}>
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

<style>
  .fab-expr-input {
    font-family: var(--fab-font-mono);
    font-size: 11.5px;
    font-weight: 500;
  }

  .fab-expr-input-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
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
