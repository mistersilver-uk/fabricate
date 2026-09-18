/**
 * Source contract: the manager's card shell is written in ONE place (issue 1427).
 * `class="manager-inspector-card"` was a CSS convention, like the `manager-button` one
 * `manager-button-source-contract.test.js` closes.
 */
import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-inspector-card';

const PRIMITIVE = 'src/ui/svelte/components/InspectorCard.svelte';

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and the
 * exact number of times it writes it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 1,
    why:
      'the primitive itself, which writes the class once so that no call site has to remember ' +
      'it. The count was 2 while a `//` note on the `class` prop naming the token in prose ' +
      'counted alongside the emission; issue 1515 taught the shared reader to blank `//` ' +
      'comments inside `<script>` — quote-aware, and confined to script so a bare URL in markup ' +
      'survives — so the count is now exactly the one place that writes it',
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
