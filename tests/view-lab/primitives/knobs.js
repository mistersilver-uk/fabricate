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
 * ── `value` IS WHERE THE KNOB STARTS; `default` IS WHAT THE COMPONENT DECLARES ────────────────
 *
 * They are different facts and conflating them produced a wrong answer on screen. A row that opens
 * on `role: "primary"` because that is the interesting state still has `role = 'neutral'` as the
 * COMPONENT's default, so an invocation that omits every prop equal to its STARTING value pastes
 * `<ManagerButton>` with no `role` — markup that renders a neutral button, under a specimen showing
 * a primary one. Nothing in the generated snippet says so.
 *
 * So `value` seeds the control, `default` (optional, and only where it differs) is the value a call
 * site gets by omission, and {@link renderInvocation} compares against `default`. Where a row
 * declares no `default` the type's own zero stands in, which is right for the many props whose
 * declared default IS the zero and is a knob-authoring error nowhere else — the coverage gate reads
 * both fields, so a `default` that names a value the component cannot take is reportable.
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
    // `<input type="color">` HAS NO EMPTY STATE. Assigning `''` to one is invalid, so the element
    // sanitises it to `#000000` at first paint: the swatch shows black while the knob believes it
    // holds `''`, the generated invocation omits the prop as unset, and the specimen is mounted
    // with a colour string no control on the page is displaying. Starting at the value the input
    // will hold anyway keeps all three in agreement.
    case 'colour': {
      return '#000000';
    }
    default: {
      return '';
    }
  }
}

/**
 * The value a call site gets by OMITTING the prop.
 *
 * See the header for why this is not `knob.value`: that is where the control starts, which a row
 * chooses for interest, and the two are equal only by coincidence.
 *
 * @param {object} knob A knob declaration.
 * @returns {unknown} The component's declared default.
 */
function declaredDefault(knob) {
  return Object.hasOwn(knob, 'default') ? knob.default : zeroFor(knob);
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

  // NOTHING IS WRITTEN BY A CALL THAT CARRIED NOTHING. A callback fired with no arguments, or a
  // row whose `arg` index is past the end of the call, would otherwise write `undefined` — and
  // `undefined` is the one value that does not behave like a value here: `buildProps` sets the prop
  // to it, Svelte's `$props()` fallback fires, and the component silently reverts to its own
  // default. The knob has stopped controlling its prop and nothing on the page says so.
  const index = knob.arg ?? 0;
  if (index >= args.length) return null;
  const next = args[index];
  if (next === undefined) return null;

  // STRUCTURAL COMPARISON, AND A DETACHED COPY. `===` was wrong in both directions and each
  // direction is its own defect:
  //
  //   - An OBJECT argument rebuilt on every call (a `{token, hex}`, an options array) is never
  //     `===` the stored one, so every fire replaced the whole values object and re-rendered the
  //     specimen — a controlled primitive that flickers on each keystroke for no state change.
  //   - An ARRAY the component mutates IN PLACE and hands back IS `===` the stored one, so the
  //     write-back concluded nothing had changed and the specimen never re-rendered at all.
  //
  // `sameValue` fixes the first. The second cannot be fixed by any comparison, because both sides
  // are the same object: the stored value is therefore DETACHED from the caller's, so a later
  // in-place mutation can no longer alias it and the next comparison sees the difference.
  const stored = detachTopLevel(next);
  if (sameValue(values[knob.writes], stored)) return null;
  return { ...values, [knob.writes]: stored };
}

/**
 * A shallow copy of a plain array or object, and anything else untouched.
 *
 * Shallow is the right depth: it is the TOP-LEVEL identity that the write-back compares and that
 * Svelte's proxy tracks, and a deep clone would additionally have to survive a value the lab does
 * not own — a component instance, a DOM node, a snippet — which `structuredClone` throws on.
 *
 * @param {unknown} value A callback argument.
 * @returns {unknown} A value that does not alias `value` when it is plain data.
 */
function detachTopLevel(value) {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === 'object' && isPlainObject(value)) return { ...value };
  return value;
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
    return { prop, options: spec === '*' ? everyValueOf(knob) : spec };
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

/**
 * Every value a knob can take, for a matrix axis written `'*'`.
 *
 * A BOOLEAN knob declares no `options` — its option list is its type. Resolving `'*'` through
 * `options` alone therefore yielded an EMPTY axis, and an empty axis makes the cartesian product
 * empty: the story rendered zero cells, drew nothing, and reported nothing, which reads as a story
 * that has not been written rather than one whose axis silently evaporated.
 *
 * @param {object|undefined} knob The knob the axis names, if the row declares one.
 * @returns {unknown[]} The axis values.
 */
function everyValueOf(knob) {
  if (knob?.type === 'boolean') return [false, true];
  return knob?.options ?? [];
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
 * Omits a prop whose value equals the COMPONENT's declared default (see the header on `value` vs
 * `default`), because a generated snippet that spells out every prop at its default is not what
 * anybody would paste — it buries the two lines that matter under fifteen that do not.
 *
 * ── EVERY SNIPPET PROP IS A CHILD, NOT AN ATTRIBUTE ──────────────────────────────────────────
 *
 * `{#snippet header()}…{/snippet}` inside the attribute list is not Svelte. It is not a subtly
 * unidiomatic spelling of the right thing either: a `{#...}` block in attribute position does not
 * parse, so the six primitives here taking a non-`children` snippet each generated markup that
 * fails to compile the moment it is pasted — which is the one job this output has. Svelte 5 takes
 * a named snippet as a CHILD of the component, and that is where it is emitted.
 *
 * `fixedProps` are emitted for the same reason: `buildProps` spreads them onto the mounted
 * specimen, so markup that leaves them out does not reproduce what is on the screen above it.
 *
 * @param {object} entry A catalogue row.
 * @param {Record<string, unknown>} values Current knob values.
 * @param {object} [options] Options.
 * @param {(id: string) => string} [options.describeFiller] Filler id to the markup it stands for.
 *   Passed in through the same seam as `buildProps`'s `resolveSnippet`, and for the same reason:
 *   the filler set is the browser's, this module is also run by the coverage gate under
 *   `node --test`, and a copy of the descriptions kept here would be a second record of them that
 *   nothing compares. The two-outcome version this replaces knew `icon` from everything else and
 *   reported the other nine fillers as the string "Save changes".
 * @returns {string} Svelte markup.
 */
export function renderInvocation(entry, values, { describeFiller = (id) => id } = {}) {
  const tag = tagFor(entry);
  const attributes = [];
  const children = [];

  for (const knob of entry.knobs ?? []) {
    if (knob.type === 'event') {
      attributes.push(`${knob.prop}={${handlerName(knob.prop)}}`);
      continue;
    }
    if (!VALUE_TYPES.has(knob.type)) continue;

    const value = values[knob.prop];
    if (sameValue(value, declaredDefault(knob))) continue;

    if (knob.type === 'snippet') {
      if (!value) continue;
      const filler = describeFiller(value);
      children.push(
        knob.prop === 'children' ? `  ${filler}` : `  {#snippet ${knob.prop}()}${filler}{/snippet}`
      );
      continue;
    }
    attributes.push(renderAttribute(knob, value));
  }

  for (const [prop, value] of Object.entries(entry.fixedProps ?? {})) {
    attributes.push(renderFixedProp(prop, value));
  }

  const open = attributes.length === 0 ? `<${tag}` : `<${tag}\n  ${attributes.join('\n  ')}\n`;
  if (children.length === 0) return `${open}${attributes.length === 0 ? ' ' : ''}/>`;
  return `${open}>\n${children.join('\n')}\n</${tag}>`;
}

/**
 * One `fixedProps` entry as an attribute.
 *
 * Separate from {@link renderAttribute} because a fixed prop carries no knob and therefore no
 * declared type: the shape has to be read off the value itself.
 *
 * @param {string} prop Prop name.
 * @param {unknown} value The value passed verbatim on every render.
 * @returns {string} One attribute.
 */
function renderFixedProp(prop, value) {
  if (value === true) return prop;
  if (typeof value === 'string') return `${prop}=${JSON.stringify(value)}`;
  return `${prop}={${JSON.stringify(value) ?? 'undefined'}}`;
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
