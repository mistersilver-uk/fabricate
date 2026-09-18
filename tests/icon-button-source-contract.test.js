/** Source contract: the manager's icon-only button is written in ONE place (issue 1422). */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { definePrimitiveSourceContract } from './helpers/primitiveSourceContract.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-icon-button';

/** The class `styles/fabricate.css` roots the control's rules at (issue 1502). */
const ROOT_CLASS = 'fabricate-icon-button';

const PRIMITIVE = 'src/ui/svelte/components/IconButton.svelte';

/**
 * The `.svelte` files under `src/` that may still write the class, each with its reason and the
 * exact number of times it writes it.
 */
const CLASS_EXCEPTIONS = Object.freeze([
  Object.freeze({
    file: PRIMITIVE,
    count: 1,
    why:
      'the primitive itself, which writes the class once so that no call site has to ' +
      'remember it. The count was 2 while a `//` note on the `class` prop naming the token ' +
      'in prose counted alongside the emission; issue 1515 taught the shared reader to blank ' +
      '`//` comments inside `<script>` — quote-aware, and confined to script so a bare URL in ' +
      'markup survives — so the count is now exactly the one place that writes it',
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

/**
 * `component/ComponentIdentityStrip.svelte` WAS the third exemption and is DELIBERATELY GONE,
 * written out rather than deleted so the resolution is legible. Issue 1477 removed the premise
 * rather than doing that work.
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
    // Three tokens, each asserted separately (issue 1502).
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
  // The six deferred sites are not `<IconButton>`s, so they inherit nothing from the primitive
  // (issue 1502).
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

  // Positive control: the clause is only meaningful while the primitive actually turns `ariaLabel`
  // into an `aria-label`.
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
      'it — `design-system/spec.md:173-177` requires the name to be a REQUIRED prop:\n  ' +
      offenders.join('\n  ')
  );
});

test('a tag NAMED in a `//` comment is not read as a call site', () => {
  // THE CONTROL FOR THE CORPUS READER, rather than for the primitive (issue 1515).
  contract.assertCallSitesAlive();

  // NON-VACUITY, and it is the whole clause: read from the RAW tree rather than from the corpus,
  // because the corpus is the thing under test.
  const raw = collectSources(path.join(repoRoot, 'src'), { extensions: ['.svelte'] });
  const prose = Object.keys(raw).filter((file) => /^\s*\/\/.*<IconButton\b/m.test(raw[file]));
  assert.ok(
    prose.length > 0,
    'no component names `<IconButton>` inside a `//` comment any more, so this control is ' +
      'measuring nothing and the reader is unguarded'
  );

  // `<IconButton>` with nothing between the name and the `>` is the shape prose produces and the
  // shape no call site has: a bare one would render an icon button with no glyph and no
  // accessible name. `</IconButton>` does not match — the `/` sits where the `I` would.
  const readAsMarkup = prose.filter((file) => /<IconButton>/.test(contract.components[file]));
  assert.deepEqual(
    readAsMarkup,
    [],
    'the corpus reader is returning comment prose as an opening tag, so every clause stated ' +
      'over `callSiteTags` is now accusing files of what their documentation says:\n  ' +
      readAsMarkup.join('\n  ')
  );
});
