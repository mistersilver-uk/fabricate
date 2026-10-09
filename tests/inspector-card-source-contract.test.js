/**
 * Source contract: the manager's card shell is written in ONE place (issue 1427).
 * A hand-written card class was a CSS convention, like the hand-written button class
 * `manager-button-source-contract.test.js` closes.
 */
import {
  definePrimitiveSourceContract,
  defineSoleWriterClauses,
} from './helpers/primitiveSourceContract.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'fabricate-card';

const PRIMITIVE = 'src/ui/svelte/components/InspectorCard.svelte';

/**
 * The `.svelte` files under `src/` that may write the class, each with its reason and the exact
 * number of times it writes it. Issue 1777 converted the last 29 deferred cards, which issues 1707
 * and 1721 had relocated into seven inspector files, so the primitive is the only writer.
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
]);

const contract = definePrimitiveSourceContract({
  label: 'inspector-card',
  tag: 'InspectorCard',
  contractClass: CONTRACT_CLASS,
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,

  // 37 components render the primitive at issue 1777 (19 as it landed); 14 is a real floor.
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
    '`class="fabricate-card"` on a `<section>`. A per-site modifier travels as a ' +
    'pass-through on the `class` prop and a per-site `data-*` hook rides the rest spread — ' +
    'see `InspectorCard.svelte`',

  restatementRemedy:
    'the primitive emits `fabricate-card` itself and APPENDS the `class` prop to it, so ' +
    'restating it from a call site emits the token twice and re-opens the convention this ' +
    'component exists to close',

  bareDataRemedy:
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
    'element, so the rest spread renders `="true"` where the hand-rolled section rendered ' +
    '`=""`. 27 attributes were written bare before this conversion; spell it `data-x=""`',
});

defineSoleWriterClauses({
  label: 'inspector-card',
  primitive: PRIMITIVE,
  exemptions: CLASS_EXCEPTIONS,
  components: contract.components,
  tokens: [CONTRACT_CLASS],
});
