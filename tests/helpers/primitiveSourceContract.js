/** The shared spine of a UI primitive's SOURCE CONTRACT (issues 1422, 1427) (issue 1505). */

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { collectSources, repoRoot, stripComments } from './sourceScan.js';
import { withoutComments } from './stepperSourceContract.js';
import { openingTagsNamed } from './svelteTagScan.js';

/** Blank the `//` comments inside a component's `<script>` blocks, and only there (issue 1515). */
function withoutScriptComments(source) {
  return source.replaceAll(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g,
    (_match, open, body, close) => `${open}${stripComments(body)}${close}`
  );
}

/**
 * A component's markup: `<style>` blocks removed as well as comments. Stripping `<style>` at all is
 * a deliberate scope line (issue 1422).
 */
function markupOf(source) {
  return withoutScriptComments(withoutComments(source)).replace(/<style[\s\S]*?<\/style>/g, '');
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
 * Register the four shared clauses for one primitive, and hand back the corpus they are stated over
 * so the caller can add clauses of its own.
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

  /** The floor every clause below leans on. */
  function assertCallSitesAlive() {
    assert.ok(
      callSiteFiles.length >= callSiteFloor,
      `expected the manager's ${label} call sites to be here, found ${callSiteFiles.length} ` +
        `files rendering <${tag} across ${Object.keys(components).length} components`
    );
  }

  test(`the ${label} class is written only by the primitive`, () => {
    // NON-VACUITY, in the precedent's style and for the precedent's reason: an absence check over
    // an empty corpus passes forever and reports itself satisfied.
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

    // Positive control: the clause is only meaningful while the primitive still emits what the call
    // sites are being told not to.
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
    // ELEMENT, `<section data-x>` renders `data-x=""`.
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

    /** The primitive's own markup, once the corpus has been proved alive. */
    primitiveMarkup() {
      assertCallSitesAlive();
      const source = components[primitive] ?? '';
      assert.ok(source.length > 0, `${primitive} is not in the corpus`);
      return source;
    },

    /**
     * A list the primitive declares about ITSELF — a host union, a prop set — read out of its
     * source.
     */
    declaredList({ declaration, member, absent }) {
      const declared = declaration.exec(this.primitiveMarkup());
      assert.ok(declared, absent);
      return [...declared[1].matchAll(member)].map(([, name]) => name);
    },

    /**
     * Assert the primitive emits nothing a GM can act on.
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

/** The three probes a primitive with no pass-through props is policing. */
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
