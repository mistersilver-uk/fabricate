/**
 * The Primitive Lab's knob engine: catalogue row plus live values in, component props out.
 *
 * ── WHY THIS MODULE IMPORTS NOTHING ───────────────────────────────────────────────────────────
 *
 * Two consumers need it and they run in different places. The lab runs it in Chromium, against
 * Svelte snippets and live event recorders. `tests/design-system-lab-coverage.test.js` runs it
 * under `node --test`, to answer "is every declared prop accounted for" without a browser, a DOM or
 * a Svelte runtime anywhere in reach.
 *
 * So the two things that are environment-shaped are passed IN rather than imported: `resolveSnippet`
 * turns a filler id into a snippet, and `onEvent` receives a fired callback. The module itself is
 * data in, data out, and the gate can exercise the real code path rather than a re-implementation of
 * it — which is the failure this project has already recorded twice, a guard that agrees with a
 * copy of the logic instead of the logic.
 *
 * ── THE KNOB TYPES, AND THE TWO THAT ARE NOT CONTROLS ─────────────────────────────────────────
 *
 *   select   A closed set. `options` is required; the value is one of them.
 *   boolean  A checkbox.
 *   text     A single-line string.
 *   number   A number, or `null` when the field is cleared and the prop admits absence.
 *   colour   A hex string, rendered as a swatch input.
 *   json     Structured data — an option list, a band set, a row array. Edited as JSON text.
 *   snippet  A filler id, resolved through `resolveSnippet` into a real snippet.
 *   event    NOT A CONTROL. It contributes a recorder function to the props and renders as a row in
 *            the event log rather than as an input.
 *
 * ── `writes`, AND WHY A CONTROLLED PRIMITIVE NEEDS IT ─────────────────────────────────────────
 *
 * Almost every interactive primitive here is CONTROLLED: `Stepper` renders `value` and reports
 * `onChange`, `SegmentedControl` renders `value` and reports `onChange`, `SelectionCheckbox`
 * renders `checked` and reports `onChange`. Mount one with a fixed `value` prop and a recorder for
 * `onChange` and it is inert — you can click it, the log fills up, and nothing on screen moves,
 * because the lab never closes the loop the real call site closes.
 *
 * An event knob therefore declares `writes`, naming the knob its argument is written back into, and
 * optionally `arg` when the value is not the first argument. That is what makes the specimen behave
 * like the product rather than like a screenshot, and it is the difference between a page that
 * displays the components and one that lets you test them.
 */

/** Knob types that contribute a value the user edits. Everything else is `event`. */
const VALUE_TYPES = new Set(['select', 'boolean', 'text', 'number', 'colour', 'json', 'snippet']);

/**
 * The starting value of every value-typed knob on a row.
 *
 * A knob with no `value` key starts at the type's own zero rather than at `undefined`, so a props
 * object never carries a key whose value is missing — passing `undefined` for a prop with a default
 * is the one case where Svelte's default DOES apply, and a knob that silently stopped controlling
 * its prop is invisible on screen.
 *
 * @param {object} entry A catalogue row.
 * @returns {Record<string, unknown>} Knob values, keyed on prop name.
 */
export function defaultValues(entry) {
  const values = {};
  for (const knob of entry.knobs ?? []) {
    if (!VALUE_TYPES.has(knob.type)) continue;
    values[knob.prop] = Object.hasOwn(knob, 'value') ? knob.value : zeroFor(knob);
  }
  return values;
}

function zeroFor(knob) {
  switch (knob.type) {
    case 'boolean': {
      return false;
    }
    case 'number': {
      return 0;
    }
    case 'json': {
      return null;
    }
    case 'select': {
      return knob.options?.[0] ?? '';
    }
    default: {
      return '';
    }
  }
}

/**
 * Build the props object a specimen is mounted with.
 *
 * @param {object} options Options.
 * @param {object} options.entry A catalogue row.
 * @param {Record<string, unknown>} options.values Current knob values.
 * @param {(id: string) => unknown} [options.resolveSnippet] Filler id to snippet.
 * @param {(fired: {prop: string, args: unknown[]}) => void} [options.onEvent] Called when the
 *   component invokes one of its callback props.
 * @returns {Record<string, unknown>} Props, ready to spread.
 */
export function buildProps({ entry, values, resolveSnippet, onEvent }) {
  const props = {};
  for (const knob of entry.knobs ?? []) {
    if (knob.type === 'event') {
      props[knob.prop] = (...args) => onEvent?.({ prop: knob.prop, args });
      continue;
    }
    if (!VALUE_TYPES.has(knob.type)) continue;
    const value = values[knob.prop];
    // A snippet knob set to nothing must OMIT the prop rather than pass an empty snippet: several
    // primitives branch on `children === undefined` to decide whether they render a slot at all,
    // and an empty snippet takes the other branch and draws an empty box.
    if (knob.type === 'snippet') {
      if (!value) continue;
      const snippet = resolveSnippet?.(value);
      if (snippet) props[knob.prop] = snippet;
      continue;
    }
    props[knob.prop] = value;
  }
  return { ...props, ...entry.fixedProps };
}

/**
 * Apply one fired event's write-back, returning the knob values that result.
 *
 * Returns a NEW object rather than mutating: the caller holds these in `$state`, and Svelte 5's
 * proxy tracks a replaced object reliably where an in-place write through a stale reference is the
 * failure this project has already recorded — a mutation that never renders, with a passing test
 * beside it.
 *
 * @param {object} options Options.
 * @param {object} options.entry A catalogue row.
 * @param {Record<string, unknown>} options.values Current knob values.
 * @param {string} options.prop The callback prop that fired.
 * @param {unknown[]} options.args Its arguments.
 * @returns {Record<string, unknown>|null} New values, or null when this event writes nothing.
 */
export function applyWriteBack({ entry, values, prop, args }) {
  const knob = (entry.knobs ?? []).find((candidate) => candidate.prop === prop);
  if (!knob?.writes) return null;
  const next = args[knob.arg ?? 0];
  if (values[knob.writes] === next) return null;
  return { ...values, [knob.writes]: next };
}

/**
 * Expand a story's matrix into the concrete value sets it names.
 *
 * A matrix entry's value is either `'*'`, meaning every option the knob declares, or an explicit
 * array. The result is the cartesian product in declaration order, so a two-axis matrix reads left
 * to right across its first axis — the order the library's own specimen rows are drawn in.
 *
 * @param {object} entry A catalogue row.
 * @param {object} story One of its stories.
 * @param {Record<string, unknown>} base The current knob values, which every cell starts from.
 * @returns {{label: string, values: Record<string, unknown>}[]} One entry per cell.
 */
export function expandMatrix(entry, story, base) {
  const axes = Object.entries(story.matrix ?? {}).map(([prop, spec]) => {
    const knob = (entry.knobs ?? []).find((candidate) => candidate.prop === prop);
    const options = spec === '*' ? (knob?.options ?? []) : spec;
    return { prop, options };
  });
  if (axes.length === 0) return [{ label: story.title ?? '', values: { ...base } }];

  let cells = [{ label: [], values: { ...base } }];
  for (const axis of axes) {
    cells = cells.flatMap((cell) =>
      axis.options.map((option) => ({
        label: [...cell.label, `${axis.prop}=${formatScalar(option)}`],
        values: { ...cell.values, [axis.prop]: option },
      }))
    );
  }
  return cells.map((cell) => ({ label: cell.label.join('  ·  '), values: cell.values }));
}

function formatScalar(value) {
  if (typeof value === 'string') return value === '' ? "''" : value;
  return JSON.stringify(value);
}

/**
 * The component tag a call site would write, taken from the FILE rather than from the library name.
 *
 * `library.html` calls `ManagerButton` `<Button>`, which is the right name for the vocabulary and
 * the wrong one for a snippet someone pastes into a component: the import is `ManagerButton`, and
 * there is no `Button.svelte` to import. So the generated invocation names the file and the heading
 * above it names the vocabulary.
 *
 * @param {object} entry A catalogue row.
 * @returns {string} The component's tag name.
 */
export function tagFor(entry) {
  return entry.path.slice(entry.path.lastIndexOf('/') + 1).replace(/\.svelte$/, '');
}

/**
 * Render the current knob values as the Svelte a call site would write.
 *
 * Omits a prop whose value equals the knob's declared default, because a generated snippet that
 * spells out every prop at its default is not what anybody would paste — it buries the two lines
 * that matter under fifteen that do not.
 *
 * @param {object} entry A catalogue row.
 * @param {Record<string, unknown>} values Current knob values.
 * @returns {string} Svelte markup.
 */
export function renderInvocation(entry, values) {
  const tag = tagFor(entry);
  const attributes = [];
  let childContent = null;

  for (const knob of entry.knobs ?? []) {
    if (knob.type === 'event') {
      attributes.push(`${knob.prop}={${handlerName(knob.prop)}}`);
      continue;
    }
    if (!VALUE_TYPES.has(knob.type)) continue;

    const value = values[knob.prop];
    const isDefault = Object.hasOwn(knob, 'value')
      ? sameValue(value, knob.value)
      : sameValue(value, zeroFor(knob));
    if (isDefault) continue;

    if (knob.type === 'snippet') {
      if (knob.prop === 'children') childContent = `  ${describeFiller(value)}`;
      else attributes.push(`{#snippet ${knob.prop}()}…{/snippet}`);
      continue;
    }
    attributes.push(renderAttribute(knob, value));
  }

  const open = attributes.length === 0 ? `<${tag}` : `<${tag}\n  ${attributes.join('\n  ')}\n`;
  if (childContent === null) return `${open}${attributes.length === 0 ? ' ' : ''}/>`;
  return `${open}>\n${childContent}\n</${tag}>`;
}

function renderAttribute(knob, value) {
  // `{${value}}` rather than a literal `{false}`: the lint rule reads a bare `{false}` inside a
  // template literal as a mistyped interpolation, and it is not wrong to — the two are one character
  // apart and only one of them is ever intended.
  if (knob.type === 'boolean') return value ? knob.prop : `${knob.prop}={${value}}`;
  if (knob.type === 'number') return `${knob.prop}={${value === null ? 'null' : value}}`;
  if (knob.type === 'json') return `${knob.prop}={${JSON.stringify(value)}}`;
  return `${knob.prop}=${JSON.stringify(String(value))}`;
}

function describeFiller(id) {
  return id === 'icon' ? '<i class="fas fa-trash"></i>' : 'Save changes';
}

function handlerName(prop) {
  return prop.startsWith('on') ? `handle${prop.slice(2, 3).toUpperCase()}${prop.slice(3)}` : prop;
}

function sameValue(left, right) {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Every prop name a row accounts for, whether by a knob or by an explicit waiver.
 *
 * Used by the coverage gate against `declaredPropNames()`, which is why it returns BOTH halves in
 * one call: the gate compares a set, and assembling that set at the call site is where the two
 * halves drift apart.
 *
 * @param {object} entry A catalogue row.
 * @returns {{knobbed: string[], waived: string[], all: string[]}} Prop names.
 */
export function accountedProps(entry) {
  const knobbed = (entry.knobs ?? []).map((knob) => knob.prop);
  const waived = (entry.unknobbed ?? []).map((waiver) => waiver.prop);
  return { knobbed, waived, all: [...knobbed, ...waived] };
}
