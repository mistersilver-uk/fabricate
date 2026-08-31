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
 * ── THE EXEMPTIONS, AND WHY EACH IS ONE ───────────────────────────────────────────────────
 * `IconButton.svelte` is the primitive; it writes the class because writing it is what it is
 * for. `CraftingSystemManagerRoot.svelte` is DEFERRED, not exempt. `ComponentIdentityStrip`
 * is neither: it hands the class to a DIFFERENT primitive's trigger, which is a real
 * structural blocker rather than a postponement. Each is pinned by COUNT, so a later pass
 * that converts some of a file's sites reds here instead of quietly halving a deferral nobody
 * is tracking any more.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT POLICE ────────────────────────────────────────────────
 * `<style>` blocks are stripped before matching. Six player-app components — the recipe
 * browser, three gathering panels, the inventory grid and the journal history list — carry
 * `:global(.manager-icon-button)` rules, because `components/Pagination.svelte` renders two
 * icon buttons and is area-agnostic while the class is painted only under
 * `.fabricate-manager`. Those rules are CORRECT: they style what a child component renders,
 * which is what `:global` is for, and they are the reason the pagination arrows are visible
 * outside the manager at all. A gate that counted them would be answered by exempting the six
 * files it exists to protect.
 *
 * Whether a rule in a `<style>` block still REACHES its button is a different question with a
 * different owner: `tests/components/manager-button-scoped-class-reach.test.js`, which covers
 * this primitive as well as `<ManagerButton>` and which caught both of this conversion's dead
 * rules — including the one `lint:svelte:warnings` cannot see.
 *
 * ── WHY IT READS THE FILES ITSELF ─────────────────────────────────────────────────────────
 * Never by shelling to `grep`, for the reason `manager-button-source-contract.test.js`
 * records: GNU grep classifies a file holding a raw NUL byte as BINARY and omits it from a
 * recursive search with no `-a`, silently. `checks/ChecksView.svelte` was one such file and
 * was absent from three rounds of census. `collectSources` reads the working tree directly —
 * which also matters here for a duller reason: a newly added, still-untracked primitive is
 * invisible to `git ls-files`, and an earlier census of this very change under-reported
 * itself for exactly that reason.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { withoutComments } from './helpers/stepperSourceContract.js';
import { openingTagsNamed } from './helpers/svelteTagScan.js';

/** The class only the primitive may write. */
const CONTRACT_CLASS = 'manager-icon-button';

const PRIMITIVE = 'src/ui/svelte/components/IconButton.svelte';

/**
 * `<style>` blocks removed as well as comments.
 *
 * The order matters: comments go first, so a `<style>` mentioned inside a docblock cannot
 * open a region that swallows the markup after it. That is not hypothetical — a line-based
 * scan written during this change did exactly that and mis-filed two real call sites as CSS.
 */
function markupOf(source) {
  return withoutComments(source).replace(/<style[\s\S]*?<\/style>/g, '');
}

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
      'instead of leaving a fraction of a deferral nobody is tracking.',
  }),
  Object.freeze({
    file: 'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
    count: 1,
    why:
      'NOT a deferral, and not convertible by this change. It writes the class into ' +
      "`SearchablePopover`'s `triggerClass` prop, so the element carrying it is rendered by " +
      'THAT primitive, not here. `triggerClass` has ten callers passing `manager-button`, ' +
      'bespoke classes and this one, so routing it through `<IconButton>` means reworking ' +
      "`SearchablePopover`'s trigger for all ten — a separate change with its own blast " +
      'radius, not a line of this one.',
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
  COMPONENTS[file].includes('<IconButton')
);

/** Every `<IconButton …>` opening tag in the corpus, as `[file, tagSource]`. */
const CALL_SITE_TAGS = CALL_SITE_FILES.flatMap((file) =>
  openingTagsNamed(COMPONENTS[file], 'IconButton').map((tag) => [file, tag])
);

/**
 * The floor every clause below leans on.
 *
 * Stated over `<IconButton` CALL SITES rather than over the literal the first clause asserts
 * the absence of, because a floor over that string would be self-contradictory. 35 components
 * render the primitive as this lands; 28 is a real floor with headroom, deliberately below the
 * measured number so that deleting a screen does not red this.
 */
function assertCallSitesAlive() {
  assert.ok(
    CALL_SITE_FILES.length >= 28,
    `expected the manager's icon-button call sites to be here, found ` +
      `${CALL_SITE_FILES.length} files rendering <IconButton across ` +
      `${Object.keys(COMPONENTS).length} components`
  );
}

test('the icon-button class is written only by the primitive', () => {
  // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check
  // over an empty corpus passes forever and reports itself satisfied. A wrong root, a bad
  // extension filter or a walk that stopped recursing all read as zero here.
  assertCallSitesAlive();

  const exempt = new Set(CLASS_EXCEPTIONS.map((entry) => entry.file));
  const offenders = Object.keys(COMPONENTS)
    .filter((file) => !exempt.has(file))
    .filter((file) => COMPONENTS[file].includes(CONTRACT_CLASS));

  assert.deepEqual(
    offenders,
    [],
    'a manager icon button is an `<IconButton>`, never a hand-written ' +
      '`class="manager-icon-button"`. A per-site modifier travels as a pass-through on the ' +
      '`class` prop, the accessible name is the required `ariaLabel` prop, and a per-site ' +
      '`data-*` hook rides the rest spread — see `IconButton.svelte`:\n  ' +
      offenders.join('\n  ')
  );
});

test('every recorded exemption is still earned, at the count it was recorded with', () => {
  // An exemption for a file that no longer writes the class is a permission nobody is using,
  // and the next file added to this list gets to lean on the precedent of an unchecked one.
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

test('every icon button is given an accessible name', () => {
  assertCallSitesAlive();

  // Positive control: the clause is only meaningful while the primitive actually turns
  // `ariaLabel` into an `aria-label`. If that stops being true, every call site below can
  // carry the prop and announce nothing, and this clause would keep passing.
  const primitive = COMPONENTS[PRIMITIVE] ?? '';
  assert.ok(
    primitive.includes('aria-label={accessibleName}'),
    'the primitive no longer emits `aria-label` from `ariaLabel`, so this clause is ' +
      'measuring a prop that reaches nothing'
  );

  const offenders = CALL_SITE_TAGS.filter(([, tag]) => !/\bariaLabel=/.test(tag)).map(
    ([file, tag]) => `${file}: ${tag.replaceAll(/\s+/g, ' ').slice(0, 120)}`
  );

  assert.deepEqual(
    offenders,
    [],
    'an icon-only control whose accessible name is missing announces itself as "button" and ' +
      'nothing else. It is invisible on screen, so no frame and no geometry probe can catch ' +
      'it — `design-system/spec.md:171-175` requires the name to be a REQUIRED prop:\n  ' +
      offenders.join('\n  ')
  );
});

test('no call site restates what the primitive owns', () => {
  assertCallSitesAlive();

  // `type` and `class="manager-icon-button"` are the primitive's to emit, and `aria-label`
  // is the pre-rename spelling. All three would still WORK from a call site — `type` and
  // `aria-label` ride the rest spread, which lands last and therefore wins — which is exactly
  // why they need a gate: a site that kept the old spelling would bypass the required-prop
  // contract above while rendering identically.
  const offenders = [];
  for (const [file, tag] of CALL_SITE_TAGS) {
    const restated = [
      /\btype=/.test(tag) ? 'type' : '',
      /\baria-label=/.test(tag) ? 'aria-label' : '',
      tag.includes(CONTRACT_CLASS) ? CONTRACT_CLASS : '',
    ].filter(Boolean);
    if (restated.length) offenders.push(`${file}: restates ${restated.join(', ')}`);
  }

  assert.deepEqual(
    offenders,
    [],
    'the primitive emits `type="button"` and `manager-icon-button` itself, and takes the ' +
      'accessible name as `ariaLabel`. Restating any of them from a call site re-opens the ' +
      'convention this component exists to close:\n  ' + offenders.join('\n  ')
  );
});

test('no call site passes a BARE data-* attribute', () => {
  assertCallSitesAlive();

  // THE trap of this conversion, and it is silent in both directions that matter. On an
  // ELEMENT, `<button data-x>` renders `data-x=""`. On a COMPONENT, a bare attribute is the
  // boolean `true`, so the rest spread stamps `data-x="true"`. Presence selectors —
  // `[data-x]`, which is what every suite and every smoke step uses — resolve either way, so
  // the DOM changes and nothing reports it. 17 attributes were written bare before this
  // conversion and every one of them is spelled `data-x=""` for this reason.
  const offenders = [];
  for (const [file, tag] of CALL_SITE_TAGS) {
    for (const match of tag.matchAll(/\s(data-[\w-]+)(?=[\s/>])/g)) {
      offenders.push(`${file}: ${match[1]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on ' +
      'an element, so the rest spread renders `="true"` where the hand-rolled button rendered ' +
      '`=""`. Spell it `data-x=""`:\n  ' + offenders.join('\n  ')
  );
});
