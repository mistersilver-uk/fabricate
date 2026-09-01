/**
 * Source contract: the manager's card shell is written in ONE place (issue 1427).
 *
 * `class="manager-inspector-card"` was a CSS convention, like the `manager-button` one
 * `manager-button-source-contract.test.js` closes. 80 sites across 20 components wrote it out by
 * hand on a `<section>`, and `styles/fabricate.css` turned it into the padding, the hairline
 * border, the 8px radius, the surface fill and the stacked gap.
 *
 * ── WHY THIS FILE EARNS ITS PLACE WHEN NOTHING RENDERS WRONG ──────────────────────────────
 * The icon-button contract has a clause that cannot be photographed — a missing accessible name.
 * This one has no such clause, and that is worth saying rather than papering over: a card written
 * as a bare `<section>` renders visibly wrong, so the convention is self-policing in a way the
 * accessible name is not.
 *
 * What it is NOT self-policing about is enumeration. The whole argument for extracting the shell
 * is that a change to it should be one edit and its callers should be listable; a convention
 * re-established at one new site quietly restores the state where neither is true, and the next
 * reader has no way to know whether 19 callers or 20 exist. The class-only clause is the gate on
 * that. The bare-`data-*` clause is the one with teeth: it catches a real, silent DOM change the
 * conversion itself can make.
 *
 * ── THE EXEMPTIONS, AND WHY EACH IS ONE ───────────────────────────────────────────────────
 * `InspectorCard.svelte` is the primitive; it writes the class because writing it is what it is
 * for. `CraftingSystemManagerRoot.svelte` is DEFERRED, not exempt: its 32 sites are 40% of the
 * whole census, and landing a sweep's tail in a converging 12k-line root is how a refactor
 * collides with everything else in flight. Both are pinned by COUNT, so a later pass that
 * converts SOME of the root's sites reds here instead of quietly halving a deferral nobody is
 * tracking any more.
 *
 * ── WHERE THE CLAUSES THEMSELVES LIVE ─────────────────────────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js`, shared with `icon-button-source-contract.test.js`,
 * which asks the same four questions about `<IconButton>`. That file records why — SonarCloud
 * measured 88 duplicated lines between the two guards while each carried its own copy, and two
 * copies drift into disagreeing about what a call site IS. This file supplies the facts the
 * clauses are stated over; everything below the exemption table is data.
 *
 * The corpus is read from the working tree rather than by shelling to `grep` (a raw NUL byte
 * makes a file BINARY to a recursive grep, and `checks/ChecksView.svelte` carries seven of this
 * sweep's sites), `<style>` blocks and comments are stripped before matching, and the tag scan
 * tracks `{}` DEPTH so an inline arrow's `>` or a COMPARISON inside an expression attribute
 * cannot end a tag early. Each of those is load-bearing and each is argued where it lives:
 * `helpers/primitiveSourceContract.js` and `helpers/svelteTagScan.js`.
 */
import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-inspector-card';

const PRIMITIVE = 'src/ui/svelte/components/InspectorCard.svelte';

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and the
 * exact number of times it writes it.
 *
 * Counted rather than merely listed, and keyed on the class rather than on a line number, which
 * rots on the first edit above it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 2,
    why:
      'the primitive itself, which writes the class once so that no call site has to remember ' +
      'it. The count is 2 rather than 1 because a `//` note on the `class` prop names the token ' +
      'in prose, and `withoutComments` deliberately does not strip `//` comments — a `//` ' +
      'stripper deletes real code wherever a URL appears',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    count: 32,
    why:
      'deferred: root convergence pending. Thirty-two hand-rolled cards — the gathering task, ' +
      'drop, event and travel inspectors, the drop and modifier editors, and the systems ' +
      'feature panels — are held out of the sweep because the converging 12k-line root is the ' +
      'wrong place to land its tail. They are 40% of the whole census, the highest ' +
      'concentration in this programme. Pinned by count so a later root pass that converts ' +
      'some of the 32 fails here instead of leaving a fraction of a deferral nobody is tracking.',
  }),
]);

definePrimitiveSourceContract({
  label: 'inspector-card',
  tag: 'InspectorCard',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // 19 components render the primitive as this lands; 14 is a real floor with headroom.
  callSiteFloor: 14,

  primitiveEmits: {
    source: `'${CONTRACT_CLASS}'`,
    otherwise:
      'the primitive no longer emits the contract class, so the restatement clause is policing ' +
      'a token that reaches nothing',
  },

  // One probe, because the class is the only thing this primitive owns that a call site could
  // take back: the card has no `type`, no required accessible name and no pre-rename spelling.
  restatements: Object.freeze([
    Object.freeze({
      name: CONTRACT_CLASS,
      present: (tag) => tag.includes(CONTRACT_CLASS),
    }),
  ]),

  classOnlyRemedy:
    'a manager card is an `<InspectorCard>`, never a hand-written ' +
    '`class="manager-inspector-card"` on a `<section>`. A per-site modifier travels as a ' +
    'pass-through on the `class` prop and a per-site `data-*` hook rides the rest spread — ' +
    'see `InspectorCard.svelte`',

  restatementRemedy:
    'the primitive emits `manager-inspector-card` itself and APPENDS the `class` prop to it, so ' +
    'restating it from a call site emits the token twice and re-opens the convention this ' +
    'component exists to close',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
    'element, so the rest spread renders `="true"` where the hand-rolled section rendered ' +
    '`=""`. 27 attributes were written bare before this conversion; spell it `data-x=""`',
});
