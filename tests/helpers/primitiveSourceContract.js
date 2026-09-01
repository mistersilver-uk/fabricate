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
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. Its clauses run under the two callers' names.
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
 * @property {{ source: string, otherwise: string }} primitiveEmits A positive control: the
 *   substring the primitive must still contain, and what to say when it does not.
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
    const primitiveSource = components[primitive] ?? '';
    assert.ok(primitiveSource.includes(primitiveEmits.source), primitiveEmits.otherwise);

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

  return { components, callSiteFiles, callSiteTags, assertCallSitesAlive };
}
