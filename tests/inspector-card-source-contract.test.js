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
 * ── WHAT THIS DELIBERATELY DOES NOT POLICE ────────────────────────────────────────────────
 * `<style>` blocks are stripped before matching, along with comments. Two components state a
 * `:global(.manager-inspector-card…)` rule as the repair for a scoped rule this conversion
 * killed, and several more name the class in prose because naming it is how the shell is
 * documented. A gate that counted either would be answered with a file-level allowlist exempting
 * exactly the files it exists to protect.
 *
 * Whether a rule in a `<style>` block still REACHES its card is a different question with a
 * different owner: `tests/components/manager-button-scoped-class-reach.test.js`, which covers
 * this primitive as well as `<ManagerButton>` and which caught all three of this conversion's
 * dead rules — including the two `lint:svelte:warnings` cannot see.
 *
 * ── WHY IT READS THE FILES ITSELF ─────────────────────────────────────────────────────────
 * Never by shelling to `grep`, for the reason `manager-button-source-contract.test.js` records:
 * GNU grep classifies a file holding a raw NUL byte as BINARY and omits it from a recursive
 * search with no `-a`, silently. `checks/ChecksView.svelte` was one such file, and it carries
 * seven of this sweep's sites. `collectSources` reads the working tree directly — which also
 * matters for a duller reason: a newly added, still-untracked primitive is invisible to
 * `git ls-files`.
 *
 * ── WHY THE TAG SCAN IS BORROWED RATHER THAN WRITTEN ───────────────────────────────────────
 * `openingTagsNamed` comes from `tests/helpers/svelteTagScan.js`, the scan issue 1422 extracted
 * for the icon-button contract, and NOT from a second one written here. Two clauses below read
 * attributes out of the returned text, and a scan that ends a tag early does not fail them: it
 * makes them report clean over half a tag. The shared scan is the one that gets that right,
 * because it tracks `{}` DEPTH — so neither an inline arrow's `>` nor a COMPARISON inside an
 * expression attribute can terminate a tag, and the second of those is exactly the case a
 * `>`-not-preceded-by-`=` rule misses.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { withoutComments } from './helpers/stepperSourceContract.js';
import { openingTagsNamed } from './helpers/svelteTagScan.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-inspector-card';

const PRIMITIVE = 'src/ui/svelte/components/InspectorCard.svelte';

/**
 * `<style>` blocks removed as well as comments.
 *
 * The order matters: comments go first, so a `<style>` mentioned inside a docblock cannot open a
 * region that swallows the markup after it.
 *
 * @param {string} source
 * @returns {string}
 */
function markupOf(source) {
  return withoutComments(source).replace(/<style[\s\S]*?<\/style>/g, '');
}

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

/** `{ path: text }` for every `.svelte` under `src/`, comments and `<style>` blocks removed. */
const COMPONENTS = Object.fromEntries(
  Object.entries(collectSources(path.join(repoRoot, 'src'), { extensions: ['.svelte'] })).map(
    ([file, source]) => [file, markupOf(source)]
  )
);

/** Every component that renders the primitive. The floor below is stated over these. */
const CALL_SITE_FILES = Object.keys(COMPONENTS).filter((file) =>
  COMPONENTS[file].includes('<InspectorCard')
);

/** Every `<InspectorCard …>` opening tag in the corpus, as `[file, tagSource]`. */
const CALL_SITE_TAGS = CALL_SITE_FILES.flatMap((file) =>
  openingTagsNamed(COMPONENTS[file], 'InspectorCard').map((tag) => [file, tag])
);

/**
 * The floor every clause below leans on.
 *
 * Stated over `<InspectorCard` CALL SITES rather than over the literal the first clause asserts
 * the absence of, because a floor over that string would be self-contradictory. 19 components
 * render the primitive as this lands; 14 is a real floor with headroom, deliberately below the
 * measured number so that deleting a screen does not red this.
 */
function assertCallSitesAlive() {
  assert.ok(
    CALL_SITE_FILES.length >= 14,
    `expected the manager's card call sites to be here, found ${CALL_SITE_FILES.length} files ` +
      `rendering <InspectorCard across ${Object.keys(COMPONENTS).length} components`
  );
}

test('the inspector-card class is written only by the primitive', () => {
  // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check over
  // an empty corpus passes forever and reports itself satisfied. A wrong root, a bad extension
  // filter or a walk that stopped recursing all read as zero here.
  assertCallSitesAlive();

  const exempt = new Set(CLASS_EXCEPTIONS.map((entry) => entry.file));
  const offenders = Object.keys(COMPONENTS)
    .filter((file) => !exempt.has(file))
    .filter((file) => COMPONENTS[file].includes(CONTRACT_CLASS));

  assert.deepEqual(
    offenders,
    [],
    'a manager card is an `<InspectorCard>`, never a hand-written ' +
      '`class="manager-inspector-card"` on a `<section>`. A per-site modifier travels as a ' +
      'pass-through on the `class` prop and a per-site `data-*` hook rides the rest spread — ' +
      'see `InspectorCard.svelte`:\n  ' +
      offenders.join('\n  ')
  );
});

test('every recorded exemption is still earned, at the count it was recorded with', () => {
  // An exemption for a file that no longer writes the class is a permission nobody is using, and
  // the next file added to this list gets to lean on the precedent of an unchecked one.
  for (const entry of CLASS_EXCEPTIONS) {
    const source = COMPONENTS[entry.file];
    assert.ok(source, `${entry.file} is exempted (${entry.why}) but is not in the corpus`);
    assert.ok(entry.why.length > 40, `${entry.file} is exempted with no stated reason`);
    const found = source.split(CONTRACT_CLASS).length - 1;
    assert.equal(
      found,
      entry.count,
      `${entry.file} is exempted for ${entry.count}x \`${CONTRACT_CLASS}\` and writes it ` +
        `${found}x. Reason on record: ${entry.why}`
    );
  }
});

test('no call site restates the class the primitive owns', () => {
  assertCallSitesAlive();

  // Positive control: the clause is only meaningful while the primitive actually emits the class.
  // If that stops being true, every call site below can stay clean and render an unstyled
  // `<section>`, and this clause would keep passing.
  const primitive = COMPONENTS[PRIMITIVE] ?? '';
  assert.ok(
    primitive.includes(`'${CONTRACT_CLASS}'`),
    'the primitive no longer emits the contract class, so this clause is policing a token that ' +
      'reaches nothing'
  );

  // Restating it would WORK — the `class` prop appends rather than replaces, so the section would
  // simply carry the token twice — which is exactly why it needs a gate rather than a bug report.
  const offenders = CALL_SITE_TAGS.filter(([, tag]) => tag.includes(CONTRACT_CLASS)).map(
    ([file, tag]) => `${file}: ${tag.replaceAll(/\s+/g, ' ').slice(0, 120)}`
  );

  assert.deepEqual(
    offenders,
    [],
    'the primitive emits `manager-inspector-card` itself and APPENDS the `class` prop to it, so ' +
      'restating it from a call site emits the token twice and re-opens the convention this ' +
      'component exists to close:\n  ' +
      offenders.join('\n  ')
  );
});

test('no call site passes a BARE data-* attribute', () => {
  assertCallSitesAlive();

  // THE trap of this conversion, and it is silent in both directions that matter. On an ELEMENT,
  // `<section data-x>` renders `data-x=""`. On a COMPONENT, a bare attribute is the boolean
  // `true`, so the rest spread stamps `data-x="true"`. Presence selectors — `[data-x]`, which is
  // what every suite and every smoke step uses — resolve either way, so the DOM changes and
  // nothing reports it. 27 attributes were written bare before this conversion and every one of
  // them is spelled `data-x=""` for this reason.
  const offenders = [];
  for (const [file, tag] of CALL_SITE_TAGS) {
    for (const match of tag.matchAll(/\s(data-[\w-]+)(?=[\s/>])/g)) {
      offenders.push(`${file}: ${match[1]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
      'element, so the rest spread renders `="true"` where the hand-rolled section rendered ' +
      '`=""`. Spell it `data-x=""`:\n  ' +
      offenders.join('\n  ')
  );
});
