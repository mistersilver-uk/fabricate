/**
 * Source contract: the uppercase micro-label is written in ONE place (issue 1505).
 *
 * The eyebrow is the most-restated shape in the product, and it was never a component — it was
 * a set of CSS conventions that had drifted apart from each other. The measured proof is in the
 * conversion this file lands with: SEVEN files in `apps/crafting/detail/` each declared a
 * byte-identical `.crafting-detail-section-title` block, three of them under a comment saying
 * so in terms ("Svelte scopes CSS per component, so the rule is redefined rather than shared"),
 * and two more files in the SAME directory declared the identical treatment under two other
 * names. Nine restatements of six declarations, none of them wrong, none of them shared.
 *
 * ── WHY THIS FILE EARNS ITS PLACE WHEN NOTHING RENDERS WRONG ──────────────────────────────
 * Like the card shell and unlike the icon button's accessible name, a missed kicker is visible:
 * a section label rendered at the body size does not look like an eyebrow. What the convention
 * is NOT self-policing about is the thing this programme exists to fix — that the treatment
 * cannot be corrected in one edit, and that nobody can enumerate its callers. The tracking
 * correction this change carries is the illustration: `.11em` is one line here and would have
 * been nine before.
 *
 * ── THE CONTRACT CLASS IS A NEW TOKEN, DELIBERATELY ───────────────────────────────────────
 * `fab-kicker` is written by nothing else in the tree, which was measured before it was chosen.
 * The obvious alternative, `manager-kicker`, is NOT available: 33 `.svelte` files under `src/`
 * write it 80 times at the hand-rolled manager sites this change deliberately leaves alive, and
 * the class-only clause below scans the whole `src/` corpus by SUBSTRING — so reusing it would
 * have opened this file with a 33-entry deferral table, each entry needing an exact count and a
 * reason, none of which anyone would ever read. A new token buys exactly one thing, and it is
 * the thing worth buying: the exemption table has ONE entry and no deferral row.
 *
 * The primitive is still in the corpus and still has to write the class. `primitiveSourceContract.js`
 * walks every `.svelte` under `src/` and strips only `<style>` blocks and comments, and its
 * restatement clause carries a positive control asserting the primitive still emits what the
 * call sites are told not to. Excluding the primitive from the corpus instead is not an option:
 * that disables the clause for every OTHER file.
 *
 * ── WHERE THE SHARED CLAUSES LIVE ─────────────────────────────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js`, shared with `icon-button-source-contract.test.js`,
 * `inspector-card-source-contract.test.js` and `stat-box-source-contract.test.js`. That file
 * records why: SonarCloud measured 88 duplicated lines between the first two guards while each
 * carried its own copy, `sonar.cpd.exclusions` does not relieve `tests/**`, and two copies drift
 * into disagreeing about what a call site IS. This file supplies the facts those clauses are
 * stated over, and adds ONE clause of its own — the host union, below, which is the question
 * only this primitive raises.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. A NEW token: nothing else in the tree writes it. */
const CONTRACT_CLASS = 'fab-kicker';

const PRIMITIVE = 'src/ui/svelte/components/Kicker.svelte';

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and the
 * exact number of times it writes it.
 *
 * ONE entry, and that is what the new token bought. Counted rather than merely listed, and keyed
 * on the class rather than on a line number, which rots on the first edit above it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 1,
    why:
      'the primitive itself, which writes the class once so that no call site has to remember ' +
      'it. The count is 1 rather than the 2 the card and the icon button record because this ' +
      "component's prop notes live in the leading HTML comment, which `withoutComments` does " +
      'strip, and its accent modifier is a `class:` directive that names a different token',
  }),
]);

const contract = definePrimitiveSourceContract({
  label: 'kicker',
  tag: 'Kicker',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // 11 files render the primitive as this lands — nine in the player crafting detail tree, the
  // manager's recipe-item Overview tab, and `StatBox`, which composes it. 10 is a real floor
  // with headroom.
  callSiteFloor: 10,

  primitiveEmits: {
    // Pinned in its RENDERED form — `class="fab-kicker"` — rather than as a quoted JS literal,
    // because this component writes the token straight onto the element rather than composing a
    // class list. A prose mention in the docblock would not satisfy it: comments are stripped
    // before the corpus is built.
    source: `class="${CONTRACT_CLASS}"`,
    otherwise:
      'the primitive no longer emits the contract class, so the restatement clause is policing ' +
      'a token that reaches nothing',
  },

  // Three probes. The last is the class itself; the first two are the pass-throughs this
  // primitive deliberately does NOT have, and they matter more here than at a component that
  // does: `class` and `style` on a `<Kicker>` tag are props nothing reads, so Svelte drops them
  // SILENTLY. The site renders, the rule it was reaching for never lands, and no gate but this
  // one would notice. A caller that needs layout keeps its own wrapper element instead.
  restatements: Object.freeze([
    Object.freeze({ name: 'class', present: (tag) => /\bclass=/.test(tag) }),
    Object.freeze({ name: 'style', present: (tag) => /\bstyle=/.test(tag) }),
    Object.freeze({ name: CONTRACT_CLASS, present: (tag) => tag.includes(CONTRACT_CLASS) }),
  ]),

  classOnlyRemedy:
    'an uppercase micro-label is a `<Kicker>`, never a hand-written `class="fab-kicker"` and ' +
    'never a fresh scoped rule restating 8.5px / 700 / 0.11em / uppercase / --fab-text-subtle. ' +
    'A site that needs a flex row, an ellipsis or a min-width keeps its OWN wrapper element and ' +
    'nests the kicker inside it, and a per-site test hook rides the named `dataAttr` / ' +
    '`dataValue` props — see `Kicker.svelte`',

  restatementRemedy:
    'this primitive exposes no `class`, no `style` and no rest spread, so an attribute the tag ' +
    'does not name is a prop nothing reads and Svelte drops it without a word. Keep the ' +
    'caller-owned wrapper element and put the layout on that; pass a hook through `dataAttr` ' +
    'and `dataValue`',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
    'element, so it renders `="true"` where the hand-rolled element rendered `=""`. Presence ' +
    'selectors resolve either way, which is exactly why this would not be caught by the suites ' +
    'that read them. Pass the hook as `dataAttr="data-x"` and leave `dataValue` at its default',
});

/**
 * The clause that is this primitive's own: WHAT IT RENDERS, and that none of it is interactive.
 *
 * `Kicker` is the only primitive in this set whose host element is chosen by a caller, and the
 * union is a measured fact rather than a design intention — across `src/ui/svelte/**` the
 * eyebrow's hosts are 62 `<p>`, 3 `<span>` and 1 `<h3>`, and `h2` and `h4` have no caller at
 * all. Two different things could go wrong there and neither would move a frame.
 *
 * The union could WIDEN. `<svelte:element this={host}>` will render whatever it is handed, so
 * an added member is one word, and `spec.md` routes an interactive element away from a label
 * absolutely: a control is a button, a stepper or a toggle, never a micro-label wearing one.
 * A `button` or an `a` in this set would make every kicker on the screen a focus stop.
 *
 * And the union could go UNGUARDED. `host` is what closes it — an unrecognised `as` falls back
 * rather than rendering the caller's string — so a refactor that dropped the guard would make
 * the union advisory while every existing call site went on rendering exactly as before.
 */
test('the kicker renders one of three measured, non-interactive hosts, and nothing else', () => {
  contract.assertCallSitesAlive();

  const source = contract.components[PRIMITIVE] ?? '';
  assert.ok(source.length > 0, `${PRIMITIVE} is not in the corpus`);

  const declared = /const HOSTS = new Set\(\[([^\]]*)\]\)/.exec(source);
  assert.ok(declared, 'the primitive no longer declares its host union as a literal Set');
  const hosts = [...declared[1].matchAll(/'([^']+)'/g)].map(([, host]) => host);

  assert.deepEqual(
    hosts,
    ['p', 'span', 'h3'],
    'the host union is the MEASURED set of eyebrow hosts (62 `<p>`, 3 `<span>`, 1 `<h3>`). ' +
      'Adding a member is a design ruling about what a micro-label may be, and adding an ' +
      'interactive one would make every kicker a focus stop'
  );

  // The guard that makes the union a union rather than a suggestion.
  assert.match(
    source,
    /HOSTS\.has\(as\) \? as : FALLBACK_HOST/,
    'an unrecognised `as` must fall back to the measured default rather than being rendered, ' +
      'or the union above is advisory and this clause is policing a list nothing reads'
  );

  // Nothing interactive, by any of the three routes a presentational primitive could acquire
  // one: an element, a handler, or a role.
  const interactive = [/<button\b/, /<a\s/, /<input\b/, /<select\b/, /<textarea\b/, /\son[a-z]+=/];
  const found = interactive.filter((pattern) => pattern.test(source)).map(String);
  assert.deepEqual(
    found,
    [],
    'a kicker is a LABEL. `design-system/spec.md` routes anything a GM can act on to a control ' +
      'primitive, so an interactive element or a handler here is a routing error rather than a ' +
      `feature: ${found.join(', ')}`
  );
});
