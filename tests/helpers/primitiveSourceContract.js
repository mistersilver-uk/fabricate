/**
 * The shared spine of a UI primitive's SOURCE CONTRACT (issues 1422, 1427).
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN TWICE
 * --------------------------------------------
 * `icon-button-source-contract.test.js` and `inspector-card-source-contract.test.js` ask the
 * same four questions about two different primitives: does anything but the primitive write the
 * contract class, does every recorded exemption still EARN itself at the count it was recorded
 * with, does a call site restate something the primitive owns, and does a call site pass a BARE
 * `data-*`. Spelled out twice, those four bodies plus the corpus they are stated over are
 * near-identical: SonarCloud measured 88 duplicated lines across two blocks between the two
 * files, which is the shape its new-code duplication gate fails at >3% and which
 * `sonar.cpd.exclusions` does not relieve for `tests/**`. Note that its detector normalizes
 * string literals, so differing prose and differing class names never stopped the blocks
 * matching — they match by SHAPE.
 *
 * `svelteTagScan.js` is the in-repo precedent, and it gives the second reason, which outlives
 * the gate: two copies drift into disagreeing about what a call site IS. That is not a
 * hypothetical here. These clauses read ATTRIBUTES out of tag text, so a scan or a corpus that
 * differs by one file between the two guards does not fail either of them — it makes one of
 * them report clean over a corpus the other polices.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * Anything true of ONE primitive stays in that primitive's own file as an extra clause stated
 * over the corpus this factory returns. `icon-button-source-contract.test.js`'s accessible-name
 * clause is the live example: it is the clause that earns that file, no card has an equivalent,
 * and folding it in behind a flag with one caller would be a shared helper carrying a private
 * option — the thing extraction is supposed to remove.
 *
 * The per-primitive FACTS that the shared clauses are stated over — the tag, the class, the
 * primitive's own path, the exemption table, the non-vacuity floor, what the primitive must
 * still be seen to emit, and which tokens count as a restatement — arrive as data. Two callers
 * supply every one of them.
 *
 * WHY IT READS THE FILES ITSELF
 * -----------------------------
 * Never by shelling to `grep`, for the reason `manager-button-source-contract.test.js` records:
 * GNU grep classifies a file holding a raw NUL byte as BINARY and omits it from a recursive
 * search with no `-a`, silently. `checks/ChecksView.svelte` is one such file and carries call
 * sites for both primitives. `collectSources` reads the working tree directly — which also
 * matters for a duller reason: a newly added, still-untracked primitive is invisible to
 * `git ls-files`.
 *
 * THE CLOSED-TOKEN FORM
 * ---------------------
 * `defineClosedTokenContract` below is the same spine for the shape issue 1505's primitives are
 * in: a contract class that is a NEW token, written by nothing in the tree but the primitive, so
 * the exemption table is ONE row and has no deferral in it; and a component that exposes no
 * `class`, no `style` and no rest spread, so those two are the pass-throughs a call site must not
 * restate. Both facts produced a byte-parallel preamble in `kicker-source-contract.test.js` and
 * `stat-box-source-contract.test.js` when each stated them itself, which is the block SonarCloud's
 * new-code duplication gate counts — and, again, the thing that drifts: an exemption table and a
 * probe list that are the SAME contract said twice can disagree about what the contract is.
 *
 * WHAT A CALLER'S HEADER SAYS
 * ---------------------------
 * This paragraph, once. A caller's docblock argues what is true of ITS primitive — why the file
 * earns its place, what its own clause is, and why its token was chosen — and points here for the
 * shared clauses rather than restating them. Four files carried a paraphrase of this section
 * before that rule; the two written for issue 1505 carry a two-sentence pointer instead.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. Its clauses run under its callers' names.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { collectSources, repoRoot } from './sourceScan.js';
import { withoutComments } from './stepperSourceContract.js';
import { openingTagsNamed } from './svelteTagScan.js';

/**
 * A component's markup: `<style>` blocks removed as well as comments.
 *
 * The order matters — comments go first, so a `<style>` mentioned inside a docblock cannot open
 * a region that swallows the markup after it. That is not hypothetical: a line-based scan
 * written during issue 1422 did exactly that and mis-filed two real call sites as CSS.
 *
 * Stripping `<style>` at all is a deliberate scope line. Components legitimately name the
 * contract class in a `:global(…)` rule repairing a scoped rule a conversion killed, and
 * several more name it in prose because naming it is how the shell is documented. A gate that
 * counted either would be answered with a file-level allowlist exempting exactly the files it
 * exists to protect. Whether such a rule still REACHES its element is a different question with
 * a different owner: `tests/components/manager-button-scoped-class-reach.test.js`.
 *
 * @param {string} source
 * @returns {string}
 */
function markupOf(source) {
  return withoutComments(source).replace(/<style[\s\S]*?<\/style>/g, '');
}

/**
 * @typedef {object} RestatementProbe
 * @property {string} name What the call site restated, as it appears in the failure list.
 * @property {(tag: string) => boolean} present Whether this opening tag restates it.
 */

/**
 * @typedef {object} PrimitiveContractSpec
 * @property {string} label Names the clauses, e.g. `icon-button`.
 * @property {string} tag The component's tag name, e.g. `IconButton`.
 * @property {string} contractClass The class only the primitive may write.
 * @property {string} primitive Repo-relative POSIX path to the primitive itself.
 * @property {ReadonlyArray<{ file: string, count: number, why: string }>} exemptions Files that
 *   may still write the class, each with its reason and the exact number of times it writes it.
 * @property {number} callSiteFloor The non-vacuity floor, in call-site FILES.
 * @property {{ source: string | readonly string[], otherwise: string }} primitiveEmits A positive
 *   control: the substring — or, since issue 1502, the LIST of substrings — the primitive must
 *   still contain, and what to say when one of them is gone. A list rather than a single string
 *   because a primitive can own more than one emission: `<IconButton>` owns both its root class
 *   and the `data-keyboard-focus="true"` attribute that suppresses Foundry's key bindings while
 *   it holds focus, and a control that pinned only the first would let the second be deleted
 *   silently. Each entry is asserted SEPARATELY, so the failure names the token that went
 *   missing rather than reporting that "the emissions" moved.
 * @property {ReadonlyArray<RestatementProbe>} restatements What a call site may not restate.
 * @property {string} classOnlyRemedy Prose for the class-only clause's failure.
 * @property {string} restatementRemedy Prose for the restatement clause's failure.
 * @property {string} bareDataRemedy Prose for the bare-`data-*` clause's failure.
 */

/**
 * Register the four shared clauses for one primitive, and hand back the corpus they are stated
 * over so the caller can add clauses of its own.
 *
 * @param {PrimitiveContractSpec} spec
 * @returns {{
 *   components: Record<string, string>,
 *   callSiteFiles: string[],
 *   callSiteTags: Array<[string, string]>,
 *   assertCallSitesAlive: () => void,
 * }}
 */
export function definePrimitiveSourceContract(spec) {
  const {
    label,
    tag,
    contractClass,
    primitive,
    exemptions,
    callSiteFloor,
    primitiveEmits,
    restatements,
    classOnlyRemedy,
    restatementRemedy,
    bareDataRemedy,
  } = spec;

  /** `{ path: text }` for every `.svelte` under `src/`, comments and `<style>` blocks removed. */
  const components = Object.fromEntries(
    Object.entries(collectSources(path.join(repoRoot, 'src'), { extensions: ['.svelte'] })).map(
      ([file, source]) => [file, markupOf(source)]
    )
  );

  /** Every component that renders the primitive. The floor below is stated over these. */
  const callSiteFiles = Object.keys(components).filter((file) =>
    components[file].includes(`<${tag}`)
  );

  /** Every `<Tag …>` opening tag in the corpus, as `[file, tagSource]`. */
  const callSiteTags = callSiteFiles.flatMap((file) =>
    openingTagsNamed(components[file], tag).map((tagSource) => [file, tagSource])
  );

  /**
   * The floor every clause below leans on.
   *
   * Stated over CALL SITES rather than over the literal the first clause asserts the absence of,
   * because a floor over that string would be self-contradictory. Each caller sets its own,
   * deliberately below the measured number so that deleting a screen does not red it.
   */
  function assertCallSitesAlive() {
    assert.ok(
      callSiteFiles.length >= callSiteFloor,
      `expected the manager's ${label} call sites to be here, found ${callSiteFiles.length} ` +
        `files rendering <${tag} across ${Object.keys(components).length} components`
    );
  }

  test(`the ${label} class is written only by the primitive`, () => {
    // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check over
    // an empty corpus passes forever and reports itself satisfied. A wrong root, a bad extension
    // filter or a walk that stopped recursing all read as zero here.
    assertCallSitesAlive();

    const exempt = new Set(exemptions.map((entry) => entry.file));
    const offenders = Object.keys(components)
      .filter((file) => !exempt.has(file))
      .filter((file) => components[file].includes(contractClass));

    assert.deepEqual(offenders, [], `${classOnlyRemedy}:\n  ${offenders.join('\n  ')}`);
  });

  test(`every recorded ${label} exemption is still earned, at the count it was recorded with`, () => {
    // An exemption for a file that no longer writes the class is a permission nobody is using,
    // and the next file added to the list gets to lean on the precedent of an unchecked one.
    for (const entry of exemptions) {
      const source = components[entry.file];
      assert.ok(source, `${entry.file} is exempted (${entry.why}) but is not in the corpus`);
      assert.ok(entry.why.length > 40, `${entry.file} is exempted with no stated reason`);
      const found = source.split(contractClass).length - 1;
      assert.equal(
        found,
        entry.count,
        `${entry.file} is exempted for ${entry.count}x \`${contractClass}\` and writes it ` +
          `${found}x. Reason on record: ${entry.why}`
      );
    }
  });

  test(`no ${label} call site restates what the primitive owns`, () => {
    assertCallSitesAlive();

    // Positive control: the clause is only meaningful while the primitive still emits what the
    // call sites are being told not to. If that stops being true, every call site below can stay
    // clean while rendering nothing of the contract, and this clause would keep passing.
    //
    // Asserted one token at a time rather than over the joined list, so a caller pinning several
    // emissions gets told WHICH one is gone. `[…].flat()` accepts the single-string form the two
    // pre-1502 callers were written with, so widening this was backward-compatible.
    const primitiveSource = components[primitive] ?? '';
    const emissions = [primitiveEmits.source].flat();
    assert.ok(emissions.length > 0, `${primitive} pins no emission, so this control is vacuous`);
    for (const emission of emissions) {
      assert.ok(primitiveSource.includes(emission), `${primitiveEmits.otherwise}: \`${emission}\``);
    }

    // Restating any of them would still WORK — the `class` prop appends rather than replaces, and
    // the rest spread lands last and therefore wins — which is exactly why each needs a gate
    // rather than a bug report: the site renders identically and the contract is back to being a
    // convention.
    const offenders = [];
    for (const [file, tagSource] of callSiteTags) {
      const restated = restatements
        .filter((probe) => probe.present(tagSource))
        .map((probe) => probe.name);
      if (restated.length === 0) continue;
      const shown = tagSource.replaceAll(/\s+/g, ' ').slice(0, 120);
      offenders.push(`${file}: restates ${restated.join(', ')} — ${shown}`);
    }

    assert.deepEqual(offenders, [], `${restatementRemedy}:\n  ${offenders.join('\n  ')}`);
  });

  test(`no ${label} call site passes a BARE data-* attribute`, () => {
    assertCallSitesAlive();

    // THE trap of these conversions, and it is silent in both directions that matter. On an
    // ELEMENT, `<section data-x>` renders `data-x=""`. On a COMPONENT, a bare attribute is the
    // boolean `true`, so the rest spread stamps `data-x="true"`. Presence selectors — `[data-x]`,
    // which is what every suite and every smoke step uses — resolve either way, so the DOM
    // changes and nothing reports it.
    const offenders = [];
    for (const [file, tagSource] of callSiteTags) {
      for (const match of tagSource.matchAll(/\s(data-[\w-]+)(?=[\s/>])/g)) {
        offenders.push(`${file}: ${match[1]}`);
      }
    }

    assert.deepEqual(offenders, [], `${bareDataRemedy}:\n  ${offenders.join('\n  ')}`);
  });

  return {
    components,
    callSiteFiles,
    callSiteTags,
    assertCallSitesAlive,

    /**
     * The primitive's own markup, once the corpus has been proved alive.
     *
     * Every clause a caller adds is stated over this, and both halves of the preamble are
     * load-bearing: a clause read off an EMPTY string passes as readily as one read off the
     * component, and a corpus that lost its call sites makes the floor above the only thing that
     * would have said so.
     *
     * @returns {string}
     */
    primitiveMarkup() {
      assertCallSitesAlive();
      const source = components[primitive] ?? '';
      assert.ok(source.length > 0, `${primitive} is not in the corpus`);
      return source;
    },

    /**
     * A list the primitive declares about ITSELF — a host union, a prop set — read out of its
     * source.
     *
     * The `absent` half is what makes it a clause rather than a guess: a declaration whose SHAPE
     * moved (a union that stopped being a literal `Set`, a prop list that stopped being one
     * destructuring) would otherwise yield an EMPTY list, and a caller comparing that against
     * its expected one reports a broken component when what actually broke is this scan.
     *
     * @param {{ declaration: RegExp, member: RegExp, absent: string }} shape
     * @returns {string[]}
     */
    declaredList({ declaration, member, absent }) {
      const declared = declaration.exec(this.primitiveMarkup());
      assert.ok(declared, absent);
      return [...declared[1].matchAll(member)].map(([, name]) => name);
    },

    /**
     * Assert the primitive emits nothing a GM can act on.
     *
     * `design-system/spec.md` routes anything actionable to a control primitive, so an
     * interactive element or a handler inside a label or a figure is a ROUTING error rather than
     * a feature — and it is invisible, because the component photographs identically either way.
     * All three routes it could arrive by are covered, since an element, a handler and a role are
     * each enough on their own.
     *
     * @param {string} why What a failure means for this primitive.
     */
    assertNothingInteractive(why) {
      const source = this.primitiveMarkup();
      const routes = [/<button\b/, /<a\s/, /<input\b/, /<select\b/, /<textarea\b/, /\son[a-z]+=/];
      const found = routes.filter((pattern) => pattern.test(source)).map(String);
      assert.deepEqual(found, [], `${why}: ${found.join(', ')}`);
    },
  };
}

/**
 * The three probes a primitive with no pass-through props is policing.
 *
 * `class` and `style` on a COMPONENT tag are props nothing reads, so Svelte drops them SILENTLY:
 * the site renders, the rule the caller was reaching for never lands, and no gate but this one
 * would notice. The third is the contract class itself, hand-written where the tag should have
 * carried it.
 *
 * @param {string} contractClass
 * @returns {ReadonlyArray<RestatementProbe>}
 */
export function noPassThroughRestatements(contractClass) {
  return Object.freeze([
    Object.freeze({ name: 'class', present: (tag) => /\bclass=/.test(tag) }),
    Object.freeze({ name: 'style', present: (tag) => /\bstyle=/.test(tag) }),
    Object.freeze({ name: contractClass, present: (tag) => tag.includes(contractClass) }),
  ]);
}

/** What the restatement clause says before a caller's own advice about where layout goes. */
const NO_PASS_THROUGH_REMEDY =
  'this primitive exposes no `class`, no `style` and no rest spread, so an attribute the tag ' +
  'does not name is a prop nothing reads and Svelte drops it without a word.';

/** What the bare-`data-*` clause says before a caller's own advice about its hook props. */
const BARE_DATA_REMEDY =
  'a bare `data-*` on a COMPONENT tag is the boolean `true`, not the empty string it is on an ' +
  'element, so it renders `="true"` where the hand-rolled element rendered `=""`. Presence ' +
  'selectors resolve either way, which is exactly why this would not be caught by the suites ' +
  'that read them.';

/** What the positive control says when the primitive stops emitting something it owns. */
const LOST_EMISSION =
  'the primitive no longer emits something it is the single source of, so a clause here is ' +
  'policing a token that reaches nothing';

/**
 * @typedef {object} ClosedTokenContractSpec
 * @property {string} label Names the clauses, e.g. `kicker`.
 * @property {string} tag The component's tag name, e.g. `Kicker`.
 * @property {string} contractClass The NEW token only the primitive may write.
 * @property {string} primitive Repo-relative POSIX path to the primitive itself.
 * @property {number} callSiteFloor The non-vacuity floor, in call-site FILES.
 * @property {string | readonly string[]} emits What the primitive must still be seen to contain.
 * @property {{ count: number, why: string }} primitiveWrites How many times the primitive itself
 *   writes the class, and why that number rather than another — the ONE exemption a new token
 *   leaves, counted rather than merely listed.
 * @property {string} classOnlyRemedy Prose for the class-only clause's failure.
 * @property {string} keepInstead What a call site keeps instead of the attribute it restated.
 * @property {string} hookAdvice How a call site passes a test hook rather than a bare `data-*`.
 */

/**
 * Register the four shared clauses for a primitive whose contract class is a NEW token and whose
 * props are closed.
 *
 * The caller states the FACTS only: its class, its path, its floor, what it emits, the one count
 * its own file writes the class at, and the three pieces of advice its failures should give. The
 * exemption table, the probe list and the two remedy preambles are the same contract for every
 * such primitive, so they are built here rather than restated per file.
 *
 * @param {ClosedTokenContractSpec} spec
 * @returns {ReturnType<typeof definePrimitiveSourceContract>}
 */
export function defineClosedTokenContract(spec) {
  return definePrimitiveSourceContract({
    label: spec.label,
    tag: spec.tag,
    contractClass: spec.contractClass,
    primitive: spec.primitive,
    callSiteFloor: spec.callSiteFloor,
    exemptions: Object.freeze([
      Object.freeze({
        file: spec.primitive,
        count: spec.primitiveWrites.count,
        why: spec.primitiveWrites.why,
      }),
    ]),
    primitiveEmits: { source: spec.emits, otherwise: LOST_EMISSION },
    restatements: noPassThroughRestatements(spec.contractClass),
    classOnlyRemedy: spec.classOnlyRemedy,
    restatementRemedy: `${NO_PASS_THROUGH_REMEDY} ${spec.keepInstead}`,
    bareDataRemedy: `${BARE_DATA_REMEDY} ${spec.hookAdvice}`,
  });
}
