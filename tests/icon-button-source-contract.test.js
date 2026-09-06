/**
 * Source contract: the manager's icon-only button is written in ONE place (issue 1422).
 *
 * `class="manager-icon-button"` was a CSS convention, like the `manager-button` one
 * `manager-button-source-contract.test.js` closes and unlike the element-TREE convention
 * `status-toggle-source-contract.test.js` closes. 82 sites across 37 components wrote it out by
 * hand, together with `type="button"` and an `aria-label`.
 *
 * ── WHY THE ACCESSIBLE NAME IS THE CLAUSE THAT EARNS THIS FILE ─────────────────────────────
 * A forgotten modifier class renders the wrong colour, which someone eventually sees. A
 * forgotten `aria-label` on an ICON-ONLY control renders IDENTICALLY: the button is a glyph
 * either way, every `data-*` selector still resolves, every geometry probe still passes, and
 * the only difference is that a screen reader now announces "button" and nothing else. No
 * frame can photograph that. `design-system/spec.md:171-175` makes it normative — WHEN a
 * primitive renders a control whose only visible content is a glyph, THEN its accessible name
 * is a required prop — and `IconButton.svelte` makes it structural by taking `ariaLabel` as a
 * named prop rather than letting it ride the rest spread.
 *
 * All 76 converted sites already passed one, and that is the point rather than a reason to
 * skip the clause: the convention was being honoured by 37 files with nothing anywhere
 * checking it, which is the state every convention in this repository's history was in
 * immediately before it drifted.
 *
 * It is also the clause that is NOT shared. No card has an equivalent, so it is stated here,
 * over the corpus the shared factory returns, rather than folded into that factory behind an
 * option only this caller would ever pass.
 *
 * ── THE EXEMPTIONS, AND WHY EACH IS ONE ───────────────────────────────────────────────────
 * `IconButton.svelte` is the primitive; it writes the class because writing it is what it is
 * for. `CraftingSystemManagerRoot.svelte` is DEFERRED, not exempt. `ComponentIdentityStrip`
 * is neither: it hands the class to a DIFFERENT primitive's trigger, which is a real
 * structural blocker rather than a postponement. Each is pinned by COUNT, so a later pass
 * that converts some of a file's sites reds here instead of quietly halving a deferral nobody
 * is tracking any more.
 *
 * ── WHERE THE SHARED CLAUSES LIVE ─────────────────────────────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js`, shared with `inspector-card-source-contract.test.js`,
 * which asks the same four questions about `<InspectorCard>`. That file records why — SonarCloud
 * measured 88 duplicated lines between the two guards while each carried its own copy, and two
 * copies drift into disagreeing about what a call site IS.
 *
 * The corpus is read from the working tree rather than by shelling to `grep` (a raw NUL byte
 * makes a file BINARY to a recursive grep, and `checks/ChecksView.svelte` was absent from three
 * rounds of census for exactly that reason), `<style>` blocks and comments are stripped before
 * matching — six player-app components carry legitimate `:global(.manager-icon-button)` rules,
 * because `components/Pagination.svelte` renders two icon buttons and is area-agnostic while the
 * sheet's rules for the class were, until issue 1502, rooted at `.fabricate-manager` and painted
 * nothing outside it. Issue 1502 re-rooted them at `fabricate-icon-button`, which the primitive
 * now emits itself, so the control is painted wherever it renders; those six `:global` rules are
 * UNLAYERED and still win at any specificity, which is why they stay and why the six player
 * frames do not move. The tag scan tracks `{}` DEPTH so a COMPARISON inside an expression
 * attribute cannot end a tag early, which is the case that hid `VocabularyPanel.svelte`'s
 * `ariaLabel` from an earlier scan. Each of those is argued where it lives:
 * `helpers/primitiveSourceContract.js` and `helpers/svelteTagScan.js`.
 *
 * ── WHAT THE PRIMITIVE IS PINNED TO EMIT ──────────────────────────────────────────────────
 * Two things, not one, and `primitiveEmits` takes a LIST for that reason (issue 1502): the root
 * class `fabricate-icon-button`, which is what the sheet is rooted at, and
 * `data-keyboard-focus="true"`, which is what stops Foundry's `KeyboardManager` firing its
 * Space/arrow/Tab bindings while this control holds focus. Neither is gated anywhere else, and
 * the attribute in particular is invisible in every frame and every geometry probe — deleting it
 * changes nothing anyone can photograph and breaks every icon button a keyboard reaches.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-icon-button';

/**
 * The class `styles/fabricate.css` roots the control's rules at (issue 1502).
 *
 * Not policed as a class-only contract the way `CONTRACT_CLASS` is — the six deferred carriers in
 * `CraftingSystemManagerRoot.svelte` write it deliberately, which is the whole point of the
 * re-root — but pinned as an EMISSION below, because the sheet paints nothing without it.
 */
const ROOT_CLASS = 'fabricate-icon-button';

const PRIMITIVE = 'src/ui/svelte/components/IconButton.svelte';

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and
 * the exact number of times it writes it.
 *
 * Counted rather than merely listed, and keyed on the class rather than on a line number,
 * which rots on the first edit above it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 2,
    why:
      'the primitive itself, which writes the class once so that no call site has to ' +
      'remember it. The count is 2 rather than 1 because a `//` note on the `class` prop ' +
      'names the token in prose, and `withoutComments` deliberately does not strip `//` ' +
      'comments — a `//` stripper deletes real code wherever a URL appears',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    count: 6,
    why:
      'deferred: root convergence pending. Six hand-rolled icon buttons — the gathering-drop ' +
      'condition modifier adds and the four character-modifier reference deletes — are held ' +
      'out of the sweep because the converging 12k-line root is the wrong place to land its ' +
      'tail. Pinned by count so a later root pass that converts some of the six fails here ' +
      'instead of leaving a fraction of a deferral nobody is tracking. Issue 1502 left the ' +
      'deferral intact and gave each of the six the ROOT class as a literal token instead — ' +
      'one token per site, no composition and no new props — because the sheet is now rooted ' +
      'at it and a carrier without it would have lost its entire paint. That is why the count ' +
      'is still 6: `fabricate-icon-button` does not contain `manager-icon-button`, so adding ' +
      'it moves nothing here.',
  }),
]);

/*
 * `component/ComponentIdentityStrip.svelte` WAS the third exemption and is DELIBERATELY GONE,
 * written out rather than deleted so the resolution is legible.
 *
 * It was recorded at count 1 as "NOT a deferral, and not convertible by this change": it wrote the
 * class into `SearchablePopover`'s `triggerClass`, so the element carrying it was rendered by THAT
 * primitive, and routing that prop through `<IconButton>` would have meant reworking the picker's
 * trigger for all ten of its callers.
 *
 * Issue 1477 removed the premise rather than doing that work. The strip's overflow was never a
 * picker — it is an ACTION MENU, and `SearchablePopover` was announcing its two commands as a
 * listbox of selectable options — so it moved onto `components/ActionMenu.svelte`, whose trigger
 * IS an `<IconButton>`. The strip now passes only its own `manager-component-overflow-trigger`,
 * the primitive writes the shared class, and the rendered `class` attribute is byte-identical.
 * Do not re-add this row.
 */

const contract = definePrimitiveSourceContract({
  label: 'icon-button',
  tag: 'IconButton',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // 35 components render the primitive as this lands; 28 is a real floor with headroom.
  callSiteFloor: 28,

  primitiveEmits: {
    // Three tokens, each asserted separately. The contract class is what the restatement clause
    // below polices; the ROOT class is what `styles/fabricate.css` paints from after issue 1502,
    // and it is pinned in its QUOTED form so it is the array literal in `classes` that satisfies
    // this — a prose mention in the `//` note beside it would not; the attribute is the keyboard
    // contract, which nothing else in the suite would notice the loss of.
    source: Object.freeze([`'${CONTRACT_CLASS}'`, `'${ROOT_CLASS}'`, 'data-keyboard-focus="true"']),
    otherwise:
      'the primitive no longer emits something it is the single source of, so a clause here is ' +
      'policing a token that reaches nothing',
  },

  // Three probes. `type` and `aria-label` would still WORK from a call site — both ride the rest
  // spread, which lands last and therefore wins — which is exactly why they need a gate: a site
  // that kept the old spelling would bypass the required-prop contract below while rendering
  // identically.
  restatements: Object.freeze([
    Object.freeze({ name: 'type', present: (tag) => /\btype=/.test(tag) }),
    Object.freeze({ name: 'aria-label', present: (tag) => /\baria-label=/.test(tag) }),
    Object.freeze({ name: CONTRACT_CLASS, present: (tag) => tag.includes(CONTRACT_CLASS) }),
  ]),

  classOnlyRemedy:
    'a manager icon button is an `<IconButton>`, never a hand-written ' +
    '`class="manager-icon-button"`. A per-site modifier travels as a pass-through on the ' +
    '`class` prop, the accessible name is the required `ariaLabel` prop, and a per-site ' +
    '`data-*` hook rides the rest spread — see `IconButton.svelte`',

  restatementRemedy:
    'the primitive emits `type="button"` and `manager-icon-button` itself, and takes the ' +
    'accessible name as `ariaLabel`. Restating any of them from a call site re-opens the ' +
    'convention this component exists to close',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on ' +
    'an element, so the rest spread renders `="true"` where the hand-rolled button rendered ' +
    '`=""`. 17 attributes were written bare before this conversion; spell it `data-x=""`',
});

test('every deferred hand-rolled carrier writes the root class the sheet paints from', () => {
  // The six deferred sites are not `<IconButton>`s, so they inherit nothing from the primitive.
  // Since issue 1502 the sheet paints this control from `fabricate-icon-button`, so a carrier
  // that writes only the contract class renders as an unstyled native button — while every
  // `data-*` selector and every geometry probe that resolves it keeps passing. The count clause
  // above cannot see that: it counts the OTHER class, which is exactly what such a site would
  // still have.
  //
  // EVERY deferred carrier, iterated rather than the first one `find` returns. There is one
  // today, and a second deferral added later would be skipped in silence: the clause would still
  // pass, and the new carrier would render unpainted with nothing anywhere saying so.
  const carriers = CLASS_EXCEPTIONS.filter((entry) => entry.file !== PRIMITIVE);
  assert.ok(
    carriers.length > 0,
    'the deferred-carrier exemption is gone, so this clause holds over nothing'
  );

  for (const carrier of carriers) {
    const source = contract.components[carrier.file] ?? '';
    assert.ok(source.length > 0, `${carrier.file} is not in the corpus`);

    // TOKEN-AWARE, and ORDER-aware, rather than a leading-substring search over the `class`
    // attribute. Two reasons, and the second is why the prefix form was rejected outright.
    //
    // The order is part of the contract — the root leads, exactly as `IconButton.svelte`
    // composes it — so a token-set check would let the two spellings drift apart between the
    // primitive and its carriers, and a prefix check reads the order but cannot see a third
    // token inserted between them.
    //
    // And a prefix needle is an UNTERMINATED class-attribute literal, which is the shape
    // `searchable-popover-area-scope.test.js`'s fixture-attribute clause reads with
    // `/class="([^"]*)"/g`: its `[^"]*` runs past the end of the line and swallows hundreds of
    // characters, producing a phantom offender in this file that no class could repair. Written
    // as a balanced regex the quote closes on its own line, so this clause costs that gate
    // nothing.
    const attributes = [...source.matchAll(/class="([^"]*)"/g)].map((match) =>
      match[1].split(/\s+/).filter(Boolean)
    );
    const rooted = attributes.filter(
      (tokens) => tokens[0] === ROOT_CLASS && tokens[1] === CONTRACT_CLASS
    ).length;

    assert.equal(
      rooted,
      carrier.count,
      `${carrier.file} holds ${carrier.count} deferred hand-rolled icon buttons and leads ` +
        `${rooted} class attributes with \`${ROOT_CLASS}\` then \`${CONTRACT_CLASS}\`, in ` +
        'that order. Each one must, or it loses every rule in `styles/fabricate.css` that ' +
        'paints it, silently — the control keeps its shape in the DOM and loses it on screen'
    );
  }
});

test('every icon button is given an accessible name', () => {
  contract.assertCallSitesAlive();

  // Positive control: the clause is only meaningful while the primitive actually turns
  // `ariaLabel` into an `aria-label`. If that stops being true, every call site below can
  // carry the prop and announce nothing, and this clause would keep passing.
  const primitive = contract.components[PRIMITIVE] ?? '';
  assert.ok(
    primitive.includes('aria-label={accessibleName}'),
    'the primitive no longer emits `aria-label` from `ariaLabel`, so this clause is ' +
      'measuring a prop that reaches nothing'
  );

  const offenders = contract.callSiteTags
    .filter(([, tag]) => !/\bariaLabel=/.test(tag))
    .map(([file, tag]) => `${file}: ${tag.replaceAll(/\s+/g, ' ').slice(0, 120)}`);

  assert.deepEqual(
    offenders,
    [],
    'an icon-only control whose accessible name is missing announces itself as "button" and ' +
      'nothing else. It is invisible on screen, so no frame and no geometry probe can catch ' +
      'it — `design-system/spec.md:171-175` requires the name to be a REQUIRED prop:\n  ' +
      offenders.join('\n  ')
  );
});
