/**
 * Source contract: the at-a-glance figure is written in ONE place (issue 1505).
 *
 * Two screens had each hand-rolled the same box and drifted in two directions at once: the
 * player Shopping list drew an 18px sans numeral over a sentence-case 10px label on a
 * `--fab-surface-soft` card, and the manager's item page drew a 1.15rem sans numeral over a
 * sentence-case 0.7rem label on a `--fab-bg-1` one. Neither is `library.html:237-239`, which
 * draws ONE treatment and composes the label out of the shared kicker.
 *
 * ── THE CLAUSE THAT EARNS THIS FILE ───────────────────────────────────────────────────────
 * `design-system/spec.md` routes a figure a GM can change to a stepper and never to a stat box.
 * That is a rule about what this component may ACCEPT, not about what it looks like, and it is
 * invisible in every frame: a stat box that took an `onChange` and rendered a click target
 * would photograph identically to one that did not. So the extra clause below is stated over
 * the primitive's own prop set — every prop it accepts, pinned by name — rather than over its
 * markup alone.
 *
 * The four hook props are what make that clause exhaustive rather than approximate. They are
 * ATTRIBUTE-ONLY and carry no behaviour, and the second clause below is what keeps them that
 * way: the attribute NAME is caller-supplied and spread onto the element, so a call site that
 * passed `valueDataAttr="onclick"` would install a real handler through a prop whose whole
 * point is that it cannot. Every literal hook name at a call site must therefore start with
 * `data-`.
 *
 * ── THE CONTRACT CLASS ────────────────────────────────────────────────────────────────────
 * `fab-stat-box`, a new token written by nothing else in the tree, measured before it was
 * chosen. The exemption table has ONE entry — the primitive — and no deferral row, which is
 * what a new token buys. The primitive is still in the corpus and still has to write the class:
 * `primitiveSourceContract.js` carries a positive control asserting exactly that, and excluding
 * the primitive from the corpus instead would disable the class-only clause for every other
 * file.
 *
 * ── WHERE THE SHARED CLAUSES LIVE ─────────────────────────────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js`, shared with `icon-button-source-contract.test.js`,
 * `inspector-card-source-contract.test.js` and `kicker-source-contract.test.js`. That file
 * records why: SonarCloud measured 88 duplicated lines between the first two guards while each
 * carried its own copy, `sonar.cpd.exclusions` does not relieve `tests/**`, and two copies
 * drift into disagreeing about what a call site IS. This file supplies the facts those clauses
 * are stated over and adds the two of its own above.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. A NEW token: nothing else in the tree writes it. */
const CONTRACT_CLASS = 'fab-stat-box';

const PRIMITIVE = 'src/ui/svelte/components/StatBox.svelte';

/** Exactly the props the component accepts, in the order it destructures them. */
const DECLARED_PROPS = Object.freeze([
  'value',
  'label',
  'icon',
  'tone',
  'dataAttr',
  'dataValue',
  'valueDataAttr',
  'labelDataAttr',
]);

/** The hook props whose VALUE is an attribute name the component spreads onto an element. */
const HOOK_NAME_PROPS = Object.freeze(['dataAttr', 'valueDataAttr', 'labelDataAttr']);

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and the
 * exact number of times it writes it.
 *
 * ONE entry, and that is what the new token bought. Counted rather than merely listed, and
 * keyed on the class rather than on a line number, which rots on the first edit above it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 3,
    why:
      'the primitive itself, which writes the class so that no call site has to remember it. ' +
      'The count is 3 because the token is also the STEM of the two element classes beneath ' +
      'it — `fab-stat-box-value` and `fab-stat-box-figure` — and the shared clause matches by ' +
      'substring. That is the shape a caller writing any of the three would be caught by, so ' +
      'the stem is deliberately not renamed to make this number 1',
  }),
]);

const contract = definePrimitiveSourceContract({
  label: 'stat-box',
  tag: 'StatBox',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // Exactly 2 files render the primitive as this lands — one player screen and one manager
  // screen — which is the membership bar itself, so the floor is the measurement.
  callSiteFloor: 2,

  primitiveEmits: {
    // Two tokens, asserted separately so the failure names the one that went missing. The class
    // is what the restatement clause polices. The tone attribute is what a mounted suite reads
    // to tell an alerting card from a resting one now that the caller's own `is-alert` class is
    // gone — invisible in the DOM diff, and nothing else would notice its loss.
    source: Object.freeze([`class="${CONTRACT_CLASS}"`, 'data-stat-tone={resolvedTone}']),
    otherwise:
      'the primitive no longer emits something it is the single source of, so a clause here is ' +
      'policing a token that reaches nothing',
  },

  // Three probes. `class` and `style` are the pass-throughs this primitive deliberately does
  // NOT have: on a `<StatBox>` tag they are props nothing reads, so Svelte drops them SILENTLY —
  // the grid still renders and the rule the caller was reaching for never lands.
  restatements: Object.freeze([
    Object.freeze({ name: 'class', present: (tag) => /\bclass=/.test(tag) }),
    Object.freeze({ name: 'style', present: (tag) => /\bstyle=/.test(tag) }),
    Object.freeze({ name: CONTRACT_CLASS, present: (tag) => tag.includes(CONTRACT_CLASS) }),
  ]),

  classOnlyRemedy:
    'an at-a-glance figure is a `<StatBox>`, never a hand-written `class="fab-stat-box"` and ' +
    'never a fresh scoped rule restating the r9 box, the serif numeral and the kicker label. ' +
    "The grid the boxes sit in stays the caller's own element, and a per-site test hook rides " +
    'the named `dataAttr` / `dataValue` / `valueDataAttr` / `labelDataAttr` props — see ' +
    '`StatBox.svelte`',

  restatementRemedy:
    'this primitive exposes no `class`, no `style` and no rest spread, so an attribute the tag ' +
    'does not name is a prop nothing reads and Svelte drops it without a word. Put the layout ' +
    'on the caller-owned grid and pass hooks through the four named props',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
    'element, so it renders `="true"` where the hand-rolled element rendered `=""`. All six ' +
    'hooks these two screens carry were written bare, and every assertion that reads them is a ' +
    'presence selector that resolves either way. Pass the name through a hook prop instead',
});

/**
 * The clause that is this primitive's own: WHAT IT ACCEPTS.
 *
 * `spec.md` — "A number a GM can change is a stepper and never a stat box" — is a rule about the
 * component's surface, and no frame can photograph it. Pinning the prop set by NAME is what
 * makes it checkable: an `onChange`, an `onclick` or a `href` added here would be a routing
 * error that renders identically to the component that has none, and it would arrive as one
 * line inside a destructuring nobody diffs.
 *
 * Pinned as a whole LIST rather than as an absence of handlers, because the absence half alone
 * passes over a component that has quietly grown a `size`, a `unit` or a `warning` tone — the
 * three configurations this component was deliberately shipped without, each of them
 * unreachable by any caller and therefore unphotographable too.
 */
test('the stat box accepts exactly its declared props, none of which is a handler', () => {
  contract.assertCallSitesAlive();

  const source = contract.components[PRIMITIVE] ?? '';
  assert.ok(source.length > 0, `${PRIMITIVE} is not in the corpus`);

  const destructured = /let \{([\s\S]*?)\} = \$props\(\);/.exec(source);
  assert.ok(destructured, 'the primitive no longer destructures its props in one statement');
  const props = [...destructured[1].matchAll(/^\s*(\w+)\s*=/gm)].map(([, name]) => name);

  assert.deepEqual(
    props,
    [...DECLARED_PROPS],
    "the prop set is the component's whole public surface. `size`, `unit`, a `warning` tone " +
      'and an `accent` tone were each withdrawn as unreachable configuration, and a handler of ' +
      'any kind is what `spec.md` routes to a stepper instead'
  );

  const handlers = props.filter((name) => /^on[A-Z]/.test(name) || /^on[a-z]+$/.test(name));
  assert.deepEqual(handlers, [], `a stat box states a figure and takes no action: ${handlers}`);

  // The other half of the same rule: nothing it EMITS may be actionable either. A handler on an
  // element inside the component would be reachable without any prop at all.
  const emitted = [/<button\b/, /<a\s/, /<input\b/, /<select\b/, /\son[a-z]+=/];
  const found = emitted.filter((pattern) => pattern.test(source)).map(String);
  assert.deepEqual(found, [], `the stat box emits an interactive element: ${found.join(', ')}`);
});

/**
 * The second clause: a hook NAME is caller-supplied and spread, so it must be a `data-` name.
 *
 * This is what keeps the clause above exhaustive. `{ [dataAttr]: dataValue }` spread onto an
 * element installs whatever key it is handed — `onclick` included — so "the primitive accepts no
 * handler" is only true while every hook name a call site passes is inert. Stated over LITERAL
 * values only, because an expression (`dataAttr={labelDataAttr}`, which is how `StatBox`
 * forwards the label's hook into the `Kicker` it composes) cannot be read from source text and
 * a clause that guessed at one would be worse than one that says what it covers.
 */
test('every literal hook name a stat-box call site passes is a data- attribute', () => {
  contract.assertCallSitesAlive();

  const offenders = [];
  let literals = 0;
  for (const [file, tagSource] of contract.callSiteTags) {
    for (const prop of HOOK_NAME_PROPS) {
      for (const [, value] of tagSource.matchAll(
        new RegExp(String.raw`\b${prop}="([^"]*)"`, 'g')
      )) {
        literals += 1;
        if (!value.startsWith('data-')) offenders.push(`${file}: ${prop}="${value}"`);
      }
    }
  }

  // Non-vacuity, in the shared clauses' own style: an absence check over no literals at all
  // passes forever, and every call site switching to an expression would read as clean.
  assert.ok(
    literals >= 8,
    `expected the ten literal hook names these two screens carry, found ${literals} across ` +
      `${contract.callSiteTags.length} <StatBox> tags`
  );

  assert.deepEqual(
    offenders,
    [],
    'a hook name is spread onto the element as written, so a name outside the `data-` ' +
      `namespace becomes a real attribute or a real handler:\n  ${offenders.join('\n  ')}`
  );
});
