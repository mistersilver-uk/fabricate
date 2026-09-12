# Component header template

Copy the block below to the top of a `.svelte` file and fill in the angle-bracketed slots.
Drop any slot the component has nothing to say for, and keep the order of the ones that remain.
The comment policy this serves is in `AGENTS.md` under Code Conventions.

```svelte
<!--
  <What this component is and the one job it owns, in one or two sentences.>

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `<name>` | `<type>` or the literal union | `<default>` | <what the caller must guarantee> |

  Snippets:
  - `<name>` — <what it renders and where it lands in the markup>.

  Callbacks:
  - `<onthing(arg)>` — <when it fires and what the caller is expected to do>.

  Rest spread:
  - `{...rest}` lands on `<element>`, written after `class={…}`.
  - `<class and any other forwarded attribute>` are named props, because a rest key would
    replace them instead of extending them.

  Invariants:
  - <invariant> — pinned by `tests/<file>.test.js`.
-->
```
