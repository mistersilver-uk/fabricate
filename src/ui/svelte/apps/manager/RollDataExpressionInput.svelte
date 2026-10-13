<!--
  The design system's `<ExprInput>`: a roll-expression field that shows and writes the stored text
  unchanged. It states the mono face and draws no box; the box is its host's.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The stored expression, shown byte for byte. |
  | `placeholder` | string | `''` | The caller's example, which is where a leading `@` is taught. |
  | `disabled` | boolean | `false` | Disables the input. |
  | `class` | class string | `''` | An extra class, appended to `fab-expr-input`. |

  Callbacks:
  - `onChange(expression)` — every keystroke, with the text as typed.

  Rest spread:
  - `{...rest}` lands on the `<input>`, which is the root, written after `class={…}`: the caller's
    hook, name, description and invalid state.

  Invariants:
  - The template is the one `<input>`, and nothing adds or strips an `@`.
  - A caller's `oninput` is not honoured: the component's own follows the spread. Both pinned by
    `tests/components/expr-input-mounted.test.js`.
-->
<script>
  let {
    value = '',
    placeholder = '',
    disabled = false,
    class: extraClass = '',
    onChange = () => {},
    ...rest
  } = $props();
</script>

<input
  type="text"
  class={['fab-expr-input', extraClass]}
  value={String(value ?? '')}
  {placeholder}
  {disabled}
  {...rest}
  oninput={(event) => onChange(event.currentTarget.value)}
/>

<style>
  .fab-expr-input {
    font-family: var(--fab-font-mono);
    font-size: 11.5px;
    font-weight: 500;
  }
</style>
